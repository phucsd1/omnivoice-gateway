import os
import subprocess
import threading
from app.config import settings

class KaggleOrchestrator:
    @staticmethod
    def get_credentials(db=None, user_id=None) -> tuple[str, str, str, str]:
        """Resolves credentials, checking database override settings then env configurations."""
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
            if user_id:
                from app.models import UserSetting
                db_username = db.query(UserSetting).filter(UserSetting.user_id == user_id, UserSetting.key == "kaggle_username").first()
                db_key = db.query(UserSetting).filter(UserSetting.user_id == user_id, UserSetting.key == "kaggle_key").first()
                db_kernel_ref = db.query(UserSetting).filter(UserSetting.user_id == user_id, UserSetting.key == "kaggle_kernel_ref").first()
                db_worker_dir = db.query(UserSetting).filter(UserSetting.user_id == user_id, UserSetting.key == "kaggle_worker_dir").first()
            else:
                from app.models import SystemSetting
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
    def is_configured(db=None, user_id=None) -> bool:
        """Checks if all necessary Kaggle configuration variables are set."""
        username, key, kernel_ref, worker_dir = KaggleOrchestrator.get_credentials(db, user_id)
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

    _runner_thread = None
    _runner_stop_event = None
    _consecutive_poll_failures = {}
    _unknown_status_count = {}

    @classmethod
    def start_queue_runner(cls):
        """Starts the background queue runner if it is not already running."""
        if settings.WORKER_MODE != "kaggle":
            print("[KaggleOrchestrator] Not in 'kaggle' mode. Queue runner skipped.")
            return

        if cls._runner_thread and cls._runner_thread.is_alive():
            print("[KaggleOrchestrator] Queue runner is already running.")
            return

        print("[KaggleOrchestrator] Starting queue runner background thread...")
        cls._runner_stop_event = threading.Event()
        cls._runner_thread = threading.Thread(target=cls._queue_loop, daemon=True)
        cls._runner_thread.start()
        print("[KaggleOrchestrator] Queue runner background thread started successfully.")

    @classmethod
    def stop_queue_runner(cls):
        """Stops the background queue runner."""
        if cls._runner_stop_event:
            cls._runner_stop_event.set()
        if cls._runner_thread:
            cls._runner_thread.join(timeout=5)
            print("[KaggleOrchestrator] Queue runner background thread stopped.")

    @classmethod
    def _queue_loop(cls):
        import time
        from app.database import SessionLocal
        from app.models import TTSJob, WorkerSession
        from datetime import datetime, timedelta

        print("[KaggleOrchestrator] Entering queue runner loop.")
        while cls._runner_stop_event and not cls._runner_stop_event.is_set():
            db = SessionLocal()
            try:
                # 1. Recover stuck jobs from dead workers (no heartbeat for 120s)
                cutoff = datetime.utcnow() - timedelta(seconds=120)
                dead_sessions = db.query(WorkerSession).filter(
                    WorkerSession.status.in_(["starting", "loading_model", "ready", "busy", "idle"]),
                    WorkerSession.last_heartbeat_at < cutoff
                ).all()
                
                for session in dead_sessions:
                    print(f"[KaggleOrchestrator] Worker {session.worker_id} has died (no heartbeat for 120s). Stopping session.")
                    session.status = "stopped"
                    session.stopped_at = datetime.utcnow()
                    session.message = "Stuck worker detected and stopped by Gateway."
                    
                    # Reset its current job to queued if it was in progress
                    if session.current_job_id:
                        stuck_job = db.query(TTSJob).filter(TTSJob.id == session.current_job_id).first()
                        if stuck_job and stuck_job.status not in ["completed", "failed"]:
                            print(f"[KaggleOrchestrator] Resetting stuck job {stuck_job.id} to 'queued'")
                            stuck_job.status = "queued"
                            stuck_job.message = "Hàng đợi tự động reset do máy chủ xử lý mất kết nối."
                            stuck_job.progress = 0
                            stuck_job.worker_id = None
                    db.commit()

                # 2. Check if there are any jobs currently starting or booting
                booting_job = db.query(TTSJob).filter(
                    TTSJob.status.in_(["starting_worker", "queued_kaggle"])
                ).first()

                if booting_job:
                    # Poll Kaggle to check if the kernel is starting/running
                    cls._poll_booting_worker(db, booting_job)
                else:
                    # No booting job. Find the next queued job.
                    next_job = db.query(TTSJob).filter(
                        TTSJob.status == "queued"
                    ).order_by(TTSJob.created_at.asc()).first()

                    if next_job:
                        # Check if we have a live worker session already
                        if cls.has_live_worker(db):
                            # Yes! The live worker will poll and pick up the job via API.
                            # We don't need to do anything at the gateway.
                            print(f"[KaggleOrchestrator] Live worker detected. Job {next_job.id} is queued and waiting for worker to pull.")
                        else:
                            # No live worker! We need to trigger a new Kaggle worker session.
                            cls._trigger_daemon_worker(db, next_job)
            except Exception as e:
                print(f"[KaggleOrchestrator] Exception in queue loop: {e}")
            finally:
                db.close()

            # Wait 10 seconds before next check
            time.sleep(10)

    @classmethod
    def _trigger_daemon_worker(cls, db, job):
        """Prepares daemon worker code and pushes it to Kaggle."""
        print(f"[KaggleOrchestrator] Triggering daemon worker for job context {job.id}")
        
        # Update status to starting_worker
        job.status = "starting_worker"
        job.message = "Đang chuẩn bị file cấu hình Kaggle..."
        job.progress = 5
        db.commit()
        db.refresh(job)

        # Resolve credentials
        username, key, kernel_ref, worker_dir = cls.get_credentials(db, job.user_id)
        if not username or not key:
            job.status = "failed"
            job.message = "Chưa cấu hình tài khoản Kaggle."
            job.error_message = "Kaggle username or key missing in settings."
            db.commit()
            return

        # Call builder to prepare files
        try:
            from app.services.kaggle_notebook_builder import KaggleNotebookBuilder
            KaggleNotebookBuilder.prepare_all(job=None, db=db, is_daemon=True, user_id=job.user_id)
        except Exception as e:
            job.status = "failed"
            job.message = "Lỗi chuẩn bị mã nguồn."
            job.error_message = str(e)
            db.commit()
            return

        # Prepare CLI environment with credentials
        worker_dir_abs = os.path.abspath(worker_dir)
        env = os.environ.copy()
        env["KAGGLE_USERNAME"] = username
        env["KAGGLE_KEY"] = key
        env["PYTHONUTF8"] = "1"

        # Resolve accelerator and timeout settings
        accelerator = settings.KAGGLE_ACCELERATOR
        timeout = settings.KAGGLE_TIMEOUT_SECONDS
        
        db_acc = None
        db_timeout = None
        if job.user_id:
            from app.models import UserSetting
            db_acc = db.query(UserSetting).filter(UserSetting.user_id == job.user_id, UserSetting.key == "kaggle_accelerator").first()
            db_timeout = db.query(UserSetting).filter(UserSetting.user_id == job.user_id, UserSetting.key == "kaggle_timeout_seconds").first()
        else:
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

        # Map accelerator
        mapped_acc = "NvidiaTeslaT4"
        if accelerator:
            acc_lower = accelerator.lower()
            if "p100" in acc_lower:
                mapped_acc = "NvidiaTeslaP100"
            elif "t4" in acc_lower:
                mapped_acc = "NvidiaTeslaT4"
            else:
                mapped_acc = accelerator

        import sys
        cmd = [
            sys.executable, "-c", "from kaggle.cli import main; main()", 
            "kernels", "push", 
            "-p", worker_dir_abs, 
            "--timeout", str(timeout), 
            "--accelerator", mapped_acc
        ]

        print(f"[KaggleOrchestrator] Pushing daemon worker kernel: {' '.join(cmd)}")
        try:
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
                print(f"[KaggleOrchestrator] Daemon worker kernel pushed successfully. Output: {stdout.strip()}")
                job.status = "queued_kaggle"
                job.message = "Khởi động máy chủ Kaggle. Đang chờ hàng đợi..."
                job.progress = 10
                db.commit()
            else:
                err_msg = stderr.strip() or stdout.strip() or "Unknown error."
                print(f"[KaggleOrchestrator] Daemon pushing failed: {err_msg}")
                job.status = "failed"
                job.message = "Không thể khởi động máy chủ Kaggle."
                job.error_message = err_msg
                db.commit()
        except Exception as e:
            print(f"[KaggleOrchestrator] Exception pushing daemon worker: {e}")
            job.status = "failed"
            job.message = "Lỗi hệ thống khi khởi động máy chủ."
            job.error_message = str(e)
            db.commit()

    @classmethod
    def _poll_booting_worker(cls, db, job):
        """Polls Kaggle for the booting worker's status."""
        username, key, kernel_ref, worker_dir = cls.get_credentials(db, job.user_id)
        if not username or not key:
            job.status = "failed"
            job.message = "Chưa cấu hình tài khoản Kaggle."
            job.error_message = "Kaggle username or key missing during boot poll."
            db.commit()
            return

        env = os.environ.copy()
        env["KAGGLE_USERNAME"] = username
        env["KAGGLE_KEY"] = key
        env["PYTHONUTF8"] = "1"

        import sys
        cmd = [sys.executable, "-c", "from kaggle.cli import main; main()", "kernels", "status", kernel_ref]
        
        try:
            res = subprocess.run(cmd, capture_output=True, env=env, text=True, shell=False)
            if res.returncode != 0:
                err_msg = res.stderr.strip() or res.stdout.strip() or "Kaggle status command failed."
                print(f"[KaggleOrchestrator] Warning: kaggle kernels status CLI failed: {err_msg}")
                # Increment failure count
                cls._consecutive_poll_failures[job.id] = cls._consecutive_poll_failures.get(job.id, 0) + 1
                if cls._consecutive_poll_failures[job.id] >= 10:  # 10 checks * 10s = 100s
                    job.status = "failed"
                    job.message = "Không thể thăm dò trạng thái máy chủ Kaggle."
                    job.error_message = f"Kaggle CLI status failed consecutively: {err_msg}"
                    db.commit()
                    cls._consecutive_poll_failures.pop(job.id, None)
                return

            cls._consecutive_poll_failures[job.id] = 0
            status_output = res.stdout.strip()
            print(f"[KaggleOrchestrator] Kaggle status for booting worker: {status_output}")

            status_lower = status_output.lower()
            
            if "queued" in status_lower:
                cls._unknown_status_count.pop(job.id, None)
                job.status = "queued_kaggle"
                job.message = "Kaggle chưa cấp runtime/GPU, đang xếp hàng..."
                job.progress = 15
                db.commit()
            elif "running" in status_lower:
                cls._unknown_status_count.pop(job.id, None)
                job.status = "starting_worker"
                job.message = "Kaggle Worker đang tải môi trường chạy và mô hình..."
                job.progress = 25
                db.commit()
            elif "error" in status_lower or "failed" in status_lower:
                cls._unknown_status_count.pop(job.id, None)
                job.status = "failed"
                job.message = "Kaggle Worker gặp lỗi khi khởi động."
                job.error_message = f"Kaggle boot error: {status_output}"
                db.commit()
            else:
                print(f"[KaggleOrchestrator] Warning: unknown Kaggle status: {status_output}")
                
        except Exception as e:
            print(f"[KaggleOrchestrator] Exception polling booting worker: {e}")

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
