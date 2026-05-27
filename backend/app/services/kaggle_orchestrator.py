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
        from app.models import TTSJob

        print("[KaggleOrchestrator] Entering queue runner loop.")
        while cls._runner_stop_event and not cls._runner_stop_event.is_set():
            db = SessionLocal()
            try:
                # 1. Check if there is an active job currently processing on Kaggle
                active_job = db.query(TTSJob).filter(
                    TTSJob.status.in_(["starting_worker", "booting_kaggle", "queued_kaggle", "running", "exporting_wav"])
                ).first()

                if active_job:
                    # Poll Kaggle for this job's status
                    cls._poll_active_job(db, active_job)
                else:
                    # No active job. Find the next queued job to push.
                    next_job = db.query(TTSJob).filter(
                        TTSJob.status == "queued"
                    ).order_by(TTSJob.created_at.asc()).first()

                    if next_job:
                        cls._trigger_batch_job(db, next_job)
            except Exception as e:
                print(f"[KaggleOrchestrator] Exception in queue loop: {e}")
            finally:
                db.close()

            # Wait 10 seconds before next check
            time.sleep(10)

    @classmethod
    def _trigger_batch_job(cls, db, job):
        """Prepares metadata/code and pushes the batch job to Kaggle."""
        print(f"[KaggleOrchestrator] Triggering batch job {job.id} ({job.job_type})")
        
        # Update status to starting_worker
        job.status = "starting_worker"
        job.message = "Đang chuẩn bị file cấu hình Kaggle..."
        job.progress = 5
        db.commit()
        db.refresh(job)

        # Resolve credentials
        username, key, kernel_ref, worker_dir = cls.get_credentials(db)
        if not username or not key:
            job.status = "failed"
            job.message = "Chưa cấu hình tài khoản Kaggle."
            job.error_message = "Kaggle username or key missing in settings."
            db.commit()
            return

        # Call builder to prepare files
        try:
            from app.services.kaggle_notebook_builder import KaggleNotebookBuilder
            KaggleNotebookBuilder.prepare_all(job=job, db=db)
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
        # Push command: kaggle kernels push -p ./kaggle_omnivoice_worker --accelerator NvidiaTeslaT4 --timeout 32400
        cmd = [
            sys.executable, "-c", "from kaggle.cli import main; main()", 
            "kernels", "push", 
            "-p", worker_dir_abs, 
            "--timeout", str(timeout), 
            "--accelerator", mapped_acc
        ]

        print(f"[KaggleOrchestrator] Pushing batch kernel: {' '.join(cmd)}")
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
                print(f"[KaggleOrchestrator] Kernel successfully pushed. Output: {stdout.strip()}")
                job.status = "queued_kaggle"
                job.message = "Đẩy job lên Kaggle thành công. Đang chờ hàng đợi..."
                job.progress = 10
                db.commit()
            else:
                err_msg = stderr.strip() or stdout.strip() or "Unknown error."
                print(f"[KaggleOrchestrator] Pushing failed: {err_msg}")
                job.status = "failed"
                job.message = "Không thể gửi yêu cầu lên Kaggle."
                job.error_message = err_msg
                db.commit()
        except Exception as e:
            print(f"[KaggleOrchestrator] Exception pushing kernel: {e}")
            job.status = "failed"
            job.message = "Lỗi hệ thống khi gửi yêu cầu."
            job.error_message = str(e)
            db.commit()

    @classmethod
    def _poll_active_job(cls, db, job):
        """Polls Kaggle for the active job's kernel status and handles the result."""
        username, key, kernel_ref, worker_dir = cls.get_credentials(db)
        if not username or not key:
            job.status = "failed"
            job.message = "Chưa cấu hình tài khoản Kaggle."
            job.error_message = "Kaggle username or key missing during status poll."
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

            # Reset consecutive poll failure counter on success
            cls._consecutive_poll_failures[job.id] = 0

            status_output = res.stdout.strip()
            print(f"[KaggleOrchestrator] Kaggle status for {kernel_ref}: {status_output}")

            status_lower = status_output.lower()
            
            if "queued" in status_lower:
                cls._unknown_status_count.pop(job.id, None)
                job.status = "queued_kaggle"
                job.message = "Kaggle chưa cấp runtime/GPU, đang xếp hàng..."
                job.progress = 15
                db.commit()
            elif "running" in status_lower:
                cls._unknown_status_count.pop(job.id, None)
                job.status = "running"
                job.message = "Kaggle Worker đang xử lý tạo âm thanh..."
                job.progress = 50
                db.commit()
            elif "complete" in status_lower:
                cls._unknown_status_count.pop(job.id, None)
                print(f"[KaggleOrchestrator] Kernel run completed. Downloading output...")
                cls._download_and_complete_job(db, job, kernel_ref, env)
            elif "error" in status_lower or "failed" in status_lower:
                cls._unknown_status_count.pop(job.id, None)
                job.status = "failed"
                job.message = "Kaggle Worker gặp lỗi khi tạo âm thanh."
                job.error_message = f"Kaggle run error: {status_output}"
                db.commit()
            else:
                print(f"[KaggleOrchestrator] Warning: unknown Kaggle status: {status_output}")
                cls._unknown_status_count[job.id] = cls._unknown_status_count.get(job.id, 0) + 1
                if cls._unknown_status_count[job.id] >= 10:  # 100 seconds
                    job.status = "failed"
                    job.message = "Kaggle Worker trả về trạng thái không xác định."
                    job.error_message = f"Unknown Kaggle status output: {status_output}"
                    db.commit()
                    cls._unknown_status_count.pop(job.id, None)
                
        except Exception as e:
            print(f"[KaggleOrchestrator] Exception polling job status: {e}")


    @classmethod
    def _download_and_complete_job(cls, db, job, kernel_ref, env):
        import shutil
        temp_dir = os.path.abspath("./outputs_temp")
        os.makedirs(temp_dir, exist_ok=True)

        job.status = "exporting_wav"
        job.message = "Đang tải file âm thanh kết quả..."
        job.progress = 85
        db.commit()

        import sys
        cmd = [sys.executable, "-c", "from kaggle.cli import main; main()", "kernels", "output", kernel_ref, "-p", temp_dir, "-o"]
        print(f"[KaggleOrchestrator] Downloading output using: {' '.join(cmd)}")

        try:
            res = subprocess.run(cmd, capture_output=True, env=env, text=True, shell=False)
            if res.returncode != 0:
                err_msg = res.stderr.strip()
                print(f"[KaggleOrchestrator] Downloader CLI failed: {err_msg}")
                job.status = "failed"
                job.message = "Không thể tải file âm thanh kết quả."
                job.error_message = f"Kaggle output download error: {err_msg}"
                db.commit()
                return

            downloaded_file = os.path.join(temp_dir, "output.wav")
            if os.path.exists(downloaded_file):
                # Resolve final destination
                if job.job_type == "voice_design_preview" and job.preview_id:
                    os.makedirs(settings.previews_dir, exist_ok=True)
                    dest_path = os.path.join(settings.previews_dir, f"{job.preview_id}.wav")
                else:
                    os.makedirs(settings.outputs_dir, exist_ok=True)
                    dest_path = os.path.join(settings.outputs_dir, f"{job.id}.wav")

                dest_path_abs = os.path.abspath(dest_path)
                shutil.move(downloaded_file, dest_path_abs)
                print(f"[KaggleOrchestrator] Moved downloaded audio to {dest_path_abs}")

                # Complete the job using JobService
                from app.services.job_service import JobService
                JobService.complete_job_output(db, job.id, dest_path_abs)
                print(f"[KaggleOrchestrator] Job {job.id} completed successfully.")
            else:
                print(f"[KaggleOrchestrator] Error: output.wav not found in downloaded folder.")
                job.status = "failed"
                job.message = "Lỗi: Không tìm thấy file audio kết quả."
                job.error_message = f"Downloaded output files: {os.listdir(temp_dir)}"
                db.commit()
        except Exception as e:
            print(f"[KaggleOrchestrator] Exception downloading and completing job: {e}")
            job.status = "failed"
            job.message = "Lỗi xử lý file kết quả."
            job.error_message = str(e)
            db.commit()
        finally:
            if os.path.exists(temp_dir):
                shutil.rmtree(temp_dir, ignore_errors=True)

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


