import os
import subprocess
import threading
from app.config import settings

class KaggleOrchestrator:
    @staticmethod
    def get_credentials(db=None) -> tuple[str, str, str, str]:
        """Resolves credentials, checking database override settings then env configurations."""
        from app.models import SystemSetting
        
        username = settings.KAGGLE_USERNAME
        key = settings.KAGGLE_KEY
        kernel_ref = settings.KAGGLE_KERNEL_REF
        worker_dir = settings.KAGGLE_WORKER_DIR
        
        own_db = False
        if db is None:
            from app.database import SessionLocal
            db = SessionLocal()
            own_db = True
            
        try:
            db_username = db.query(SystemSetting).filter(SystemSetting.key == "kaggle_username").first()
            db_key = db.query(SystemSetting).filter(SystemSetting.key == "kaggle_key").first()
            db_kernel_ref = db.query(SystemSetting).filter(SystemSetting.key == "kaggle_kernel_ref").first()
            db_worker_dir = db.query(SystemSetting).filter(SystemSetting.key == "kaggle_worker_dir").first()
            
            if db_username and db_username.value.strip():
                username = db_username.value.strip()
            if db_key and db_key.value.strip():
                key = db_key.value.strip()
            if db_kernel_ref and db_kernel_ref.value.strip():
                kernel_ref = db_kernel_ref.value.strip()
            if db_worker_dir and db_worker_dir.value.strip():
                worker_dir = db_worker_dir.value.strip()
        except Exception as e:
            print(f"[KaggleOrchestrator] Error reading settings from DB: {e}")
        finally:
            if own_db:
                db.close()
                
        # Sanitize kernel_ref if it is a URL or construct it
        if kernel_ref:
            if "kaggle.com/code/" in kernel_ref:
                parts = kernel_ref.split("kaggle.com/code/")[-1].strip("/").split("/")
                if len(parts) >= 2:
                    kernel_ref = f"{parts[0]}/{parts[1]}"
        
        if not kernel_ref or "/" not in kernel_ref:
            kernel_ref = f"{username}/omnivoice-worker"
            
        return username, key, kernel_ref, worker_dir

    @staticmethod
    def is_configured(db=None) -> bool:
        """Checks if all necessary Kaggle configuration variables are set."""
        username, key, kernel_ref, worker_dir = KaggleOrchestrator.get_credentials(db)
        return bool(username and key and kernel_ref and worker_dir)

    @staticmethod
    def has_live_worker(db) -> bool:
        """
        Queries the database to check if there is an active worker session 
        that is not stopped or failed and has sent a heartbeat recently.
        """
        from app.models import WorkerSession
        from datetime import datetime, timedelta
        
        # Consider a worker "live" if it is in an active status and has heartbeat within the last 60 seconds
        cutoff = datetime.utcnow() - timedelta(seconds=60)
        
        session = db.query(WorkerSession).filter(
            WorkerSession.status.in_(["starting", "loading_model", "ready", "busy", "idle"]),
            WorkerSession.last_heartbeat_at >= cutoff
        ).first()
        
        return session is not None

    @staticmethod
    def start_worker(db=None, public_api_url: str = None) -> bool:
        """
        Asynchronously starts the Kaggle worker using 'kaggle kernels push'.
        Ensures credentials are set in the environment before invoking.
        """
        if settings.WORKER_MODE == "mock":
            # In mock mode, we don't start a real Kaggle kernel
            return True

        # Call builder to ensure worker folder is prepared
        try:
            from app.services.kaggle_notebook_builder import KaggleNotebookBuilder
            KaggleNotebookBuilder.prepare_all(db, public_api_url)
        except Exception as e:
            print(f"[KaggleOrchestrator] Failed to prepare Kaggle worker files: {e}")
            return False

        if not KaggleOrchestrator.is_configured(db):
            print("[KaggleOrchestrator] Kaggle is not configured. Cannot start worker.")
            return False

        # Run kernel push in a background thread to prevent blocking the API request
        username, key, kernel_ref, worker_dir = KaggleOrchestrator.get_credentials(db)
        
        # Resolve accelerator and timeout settings
        accelerator = settings.KAGGLE_ACCELERATOR
        timeout = settings.KAGGLE_TIMEOUT_SECONDS
        if db:
            from app.models import SystemSetting
            db_acc = db.query(SystemSetting).filter(SystemSetting.key == "kaggle_accelerator").first()
            db_timeout = db.query(SystemSetting).filter(SystemSetting.key == "kaggle_timeout_seconds").first()
            if db_acc and db_acc.value.strip():
                accelerator = db_acc.value.strip()
            if db_timeout and db_timeout.value.strip():
                try:
                    timeout = int(db_timeout.value.strip())
                except ValueError:
                    pass

        thread = threading.Thread(
            target=KaggleOrchestrator._run_kaggle_push,
            args=(username, key, kernel_ref, worker_dir, accelerator, timeout)
        )
        thread.daemon = True
        thread.start()
        return True

    @staticmethod
    def _run_kaggle_push(username, key, kernel_ref, worker_dir, accelerator, timeout):
        """Helper method that executes the CLI command in a background thread."""
        try:
            worker_dir_abs = os.path.abspath(worker_dir)
            print(f"[KaggleOrchestrator] Push starting for Kaggle worker from directory: {worker_dir_abs}")
            
            if not os.path.exists(worker_dir_abs):
                print(f"[KaggleOrchestrator] Error: Worker directory {worker_dir_abs} does not exist.")
                return

            # Prepare the environment with credentials
            env = os.environ.copy()
            env["KAGGLE_USERNAME"] = username
            env["KAGGLE_KEY"] = key
            env["PYTHONUTF8"] = "1"

            import sys
            # Run 'kaggle kernels push' via python -c entrypoint
            cmd = [sys.executable, "-c", "from kaggle.cli import main; main()", "kernels", "push", "-p", worker_dir_abs, "--timeout", str(timeout)]
            if accelerator:
                cmd.extend(["--accelerator", accelerator])
            
            # Executing subprocess
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env=env,
                text=True,
                shell=False
            )
            
            stdout, stderr = process.communicate()
            
            if process.returncode == 0:
                print("[KaggleOrchestrator] Kaggle kernel successfully pushed.")
                print(f"[KaggleOrchestrator] Output: {stdout.strip()}")
                
                # Update status of jobs waiting for worker boot (starting_worker -> booting_kaggle)
                from app.database import SessionLocal
                from app.models import TTSJob
                db = SessionLocal()
                try:
                    jobs = db.query(TTSJob).filter(TTSJob.status == "starting_worker").all()
                    for j in jobs:
                        j.status = "booting_kaggle"
                        j.message = "Kaggle Worker đã đẩy thành công. Đang khởi chạy máy chủ GPU..."
                    db.commit()
                except Exception as db_err:
                    print(f"[KaggleOrchestrator] Error updating job statuses in DB: {db_err}")
                finally:
                    db.close()
            else:
                print(f"[KaggleOrchestrator] Error pushing Kaggle kernel (code {process.returncode}).")
                print(f"[KaggleOrchestrator] Stderr: {stderr.strip()}")
                
                # Update status of jobs to failed
                from app.database import SessionLocal
                from app.models import TTSJob
                db = SessionLocal()
                try:
                    jobs = db.query(TTSJob).filter(TTSJob.status == "starting_worker").all()
                    for j in jobs:
                        j.status = "failed"
                        j.message = "Đẩy Kaggle Worker thất bại."
                        j.error_message = stderr.strip()
                    db.commit()
                except Exception as db_err:
                    print(f"[KaggleOrchestrator] Error updating failed job statuses in DB: {db_err}")
                finally:
                    db.close()
                
        except Exception as e:
            print(f"[KaggleOrchestrator] Exception occurred while pushing Kaggle kernel: {e}")


    @staticmethod
    def get_status(db=None) -> str:
        """Retrieves status of the Kaggle notebook via CLI."""
        if not KaggleOrchestrator.is_configured(db):
            return "Unconfigured"

        try:
            username, key, kernel_ref, _ = KaggleOrchestrator.get_credentials(db)
            env = os.environ.copy()
            env["KAGGLE_USERNAME"] = username
            env["KAGGLE_KEY"] = key
            env["PYTHONUTF8"] = "1"

            import sys
            cmd = [sys.executable, "-c", "from kaggle.cli import main; main()", "kernels", "status", kernel_ref]
            res = subprocess.run(cmd, capture_output=True, env=env, text=True, shell=False)
            if res.returncode == 0:
                return res.stdout.strip()
            return f"Error: {res.stderr.strip()}"
        except Exception as e:
            return f"Exception: {str(e)}"

