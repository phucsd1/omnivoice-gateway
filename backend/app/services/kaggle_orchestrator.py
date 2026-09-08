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

            if user_id:
                from app.models import UserSetting
                u_username = db.query(UserSetting).filter(UserSetting.user_id == user_id, UserSetting.key == "kaggle_username").first()
                u_key = db.query(UserSetting).filter(UserSetting.user_id == user_id, UserSetting.key == "kaggle_key").first()
                u_kernel_ref = db.query(UserSetting).filter(UserSetting.user_id == user_id, UserSetting.key == "kaggle_kernel_ref").first()
                u_worker_dir = db.query(UserSetting).filter(UserSetting.user_id == user_id, UserSetting.key == "kaggle_worker_dir").first()
                
                if u_username and u_username.value.strip():
                    username = u_username.value.strip()
                if u_key and u_key.value.strip():
                    key = u_key.value.strip()
                if u_kernel_ref and u_kernel_ref.value.strip():
                    kernel_ref = u_kernel_ref.value.strip()
                if u_worker_dir and u_worker_dir.value.strip():
                    worker_dir = u_worker_dir.value.strip()
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
        
        # Consider a worker "live" if it is in an active status and has heartbeat within the last 180 seconds
        cutoff = datetime.utcnow() - timedelta(seconds=180)
        
        session = db.query(WorkerSession).filter(
            WorkerSession.status.in_(["starting", "loading_model", "ready", "busy", "idle"]),
            WorkerSession.last_heartbeat_at >= cutoff
        ).first()
        
        return session is not None

    _runner_thread = None
    _runner_stop_event = None
    _consecutive_poll_failures = {}
    _unknown_status_count = {}
    _complete_grace_count = {}
    _boot_attempts = {}

    @classmethod
    def _cleanup_job_tracking(cls, job_id: str):
        """Cleans up in-memory tracking states for a finished or departed job."""
        cls._consecutive_poll_failures.pop(job_id, None)
        cls._unknown_status_count.pop(job_id, None)
        cls._complete_grace_count.pop(job_id, None)
        cls._boot_attempts.pop(job_id, None)

    @classmethod
    def ensure_worker_running(cls, db=None):
        """Ensures background queue runner is active."""
        cls.start_queue_runner()

    @classmethod
    def _failover_or_retry_worker(cls, db, job, status_output: str, reason_label: str):
        """
        Handles worker failures (COMPLETE after grace, ERROR, CANCELLED, push failure)
        by shutting down the failed worker session, failing over to the alternate worker slot,
        and re-triggering the daemon worker without marking the client job as failed.
        """
        from app.services.worker_session_service import WorkerSessionService

        old_worker_id = job.worker_id or "worker_1"
        WorkerSessionService.shutdown_worker(db, old_worker_id, f"{reason_label}: {status_output}")

        cls._complete_grace_count.pop(job.id, None)
        cls._unknown_status_count.pop(job.id, None)
        cls._consecutive_poll_failures.pop(job.id, None)

        attempts = cls._boot_attempts.get(job.id, 0)
        max_attempts = 4  # Allows alternating worker_1 <-> worker_2 up to 2 rounds

        if attempts < max_attempts:
            new_worker_id = "worker_2" if old_worker_id == "worker_1" else "worker_1"
            print(f"[KaggleOrchestrator] Worker {old_worker_id} {reason_label} ('{status_output}'). Failing over to {new_worker_id} for job {job.id} (attempt {attempts + 1}/{max_attempts})...")

            job.worker_id = new_worker_id
            job.status = "starting_worker"
            job.message = f"Máy chủ {old_worker_id} ({reason_label}). Đang tự động chuyển sang máy chủ dự phòng ({new_worker_id}) và tạo GPU mới..."
            job.progress = 10
            db.commit()
            db.refresh(job)

            cls._trigger_daemon_worker(db, job)
        else:
            print(f"[KaggleOrchestrator] Job {job.id} exceeded max boot attempts ({max_attempts}). Failing job.")
            job.status = "failed"
            job.message = "Không thể khởi động Kaggle Worker sau nhiều lần thử lại trên cả worker-1 và worker-2."
            job.error_message = f"Kaggle boot error after {max_attempts} attempts: {status_output}"
            db.commit()
            cls._cleanup_job_tracking(job.id)

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
                # 1. Recover stuck jobs from dead workers (no heartbeat for 180s)
                cutoff = datetime.utcnow() - timedelta(seconds=180)
                dead_sessions = db.query(WorkerSession).filter(
                    WorkerSession.status.in_(["starting", "loading_model", "ready", "busy", "idle"]),
                    WorkerSession.last_heartbeat_at < cutoff
                ).all()
                
                for session in dead_sessions:
                    print(f"[KaggleOrchestrator] Worker {session.worker_id} has died (no heartbeat for 180s). Stopping session.")
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

                # 2. Count active/live worker sessions
                active_sessions = db.query(WorkerSession).filter(
                    WorkerSession.status.in_(["starting", "loading_model", "ready", "busy", "idle"]),
                    WorkerSession.last_heartbeat_at >= cutoff
                ).all()
                active_worker_ids = {s.worker_id for s in active_sessions}

                # 3. Find and check booting jobs
                booting_jobs = db.query(TTSJob).filter(
                    TTSJob.status.in_(["starting_worker", "queued_kaggle"])
                ).all()

                # Poll status for each booting job
                for b_job in booting_jobs:
                    cls._poll_booting_worker(db, b_job)

                # Clean up any tracking for jobs that have left the booting states
                booting_job_ids = {j.id for j in booting_jobs}
                tracked_job_ids = set(cls._boot_attempts.keys()) | set(cls._complete_grace_count.keys()) | set(cls._consecutive_poll_failures.keys()) | set(cls._unknown_status_count.keys())
                for j_id in (tracked_job_ids - booting_job_ids):
                    cls._cleanup_job_tracking(j_id)

                # Determine active or booting worker IDs
                booting_worker_ids = {j.worker_id for j in booting_jobs if j.worker_id}
                total_active_or_booting = active_worker_ids.union(booting_worker_ids)

                # If we have less than 2 active/booting workers, trigger a new one if there are queued jobs
                if len(total_active_or_booting) < 2:
                    next_job = db.query(TTSJob).filter(
                        TTSJob.status == "queued"
                    ).order_by(TTSJob.created_at.asc()).first()

                    if next_job:
                        # Decide which worker slot to assign
                        assigned_worker_id = "worker_1"
                        if "worker_1" in total_active_or_booting:
                            assigned_worker_id = "worker_2"
                        elif "worker_2" in total_active_or_booting:
                            assigned_worker_id = "worker_1"
                        
                        print(f"[KaggleOrchestrator] Queued job {next_job.id} found. Active/booting workers: {total_active_or_booting}. Triggering slot {assigned_worker_id}...")
                        next_job.worker_id = assigned_worker_id
                        db.commit()
                        db.refresh(next_job)
                        
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
        cls._boot_attempts[job.id] = cls._boot_attempts.get(job.id, 0) + 1
        current_attempt = cls._boot_attempts[job.id]
        print(f"[KaggleOrchestrator] Triggering daemon worker for job context {job.id} on slot {job.worker_id} (attempt {current_attempt}/4)")
        
        # Update status to starting_worker
        job.status = "starting_worker"
        job.message = f"Đang chuẩn bị khởi động máy chủ Kaggle ({job.worker_id})..."
        job.progress = 5
        db.commit()
        db.refresh(job)

        # Register or update worker session in DB to immediately mark it as starting
        from app.services.worker_session_service import WorkerSessionService
        WorkerSessionService.register_worker(db, job.worker_id, "starting", f"Kaggle kernel is being pushed (attempt {current_attempt})...")

        # Resolve credentials
        username, key, default_kernel_ref, default_worker_dir = cls.get_credentials(db, job.user_id)
        if not username or not key:
            job.status = "failed"
            job.message = "Chưa cấu hình tài khoản Kaggle."
            job.error_message = "Kaggle username or key missing in settings."
            db.commit()
            return

        # Resolve dynamic slot slug and directory
        if job.worker_id == "worker_2":
            kernel_ref = f"{username}/omnivoice-worker-2"
            worker_dir_path = f"{default_worker_dir}-2"
        else:
            kernel_ref = f"{username}/omnivoice-worker-1"
            worker_dir_path = f"{default_worker_dir}-1"

        worker_dir_abs = os.path.abspath(worker_dir_path)

        # Call builder to prepare files
        try:
            from app.services.kaggle_notebook_builder import KaggleNotebookBuilder
            KaggleNotebookBuilder.prepare_all(job=job, db=db, is_daemon=True, user_id=job.user_id)
        except Exception as e:
            err_str = str(e)
            print(f"[KaggleOrchestrator] Builder failed for {job.worker_id}: {err_str}")
            cls._failover_or_retry_worker(db, job, err_str, "Builder Error")
            return

        # Prepare CLI environment with credentials
        env = os.environ.copy()
        env["KAGGLE_USERNAME"] = username
        env["KAGGLE_KEY"] = key
        env["KAGGLE_API_TOKEN"] = key
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
                print(f"[KaggleOrchestrator] Daemon worker kernel pushed successfully on {job.worker_id}. Output: {stdout.strip()}")
                job.status = "queued_kaggle"
                job.message = f"Khởi động máy chủ Kaggle ({job.worker_id}). Đang chờ hàng đợi..."
                job.progress = 10
                db.commit()
            else:
                err_msg = stderr.strip() or stdout.strip() or "Unknown error."
                print(f"[KaggleOrchestrator] Daemon pushing failed on {job.worker_id}: {err_msg}")
                cls._failover_or_retry_worker(db, job, err_msg, "Push failed")
        except Exception as e:
            print(f"[KaggleOrchestrator] Exception pushing daemon worker on {job.worker_id}: {e}")
            cls._failover_or_retry_worker(db, job, str(e), "Exception pushing")

    @classmethod
    def _poll_booting_worker(cls, db, job):
        """Polls Kaggle for the booting worker's status."""
        username, key, default_kernel_ref, default_worker_dir = cls.get_credentials(db, job.user_id)
        if not username or not key:
            job.status = "failed"
            job.message = "Chưa cấu hình tài khoản Kaggle."
            job.error_message = "Kaggle username or key missing during boot poll."
            db.commit()
            return

        if job.worker_id == "worker_2":
            kernel_ref = f"{username}/omnivoice-worker-2"
        else:
            kernel_ref = f"{username}/omnivoice-worker-1"

        env = os.environ.copy()
        env["KAGGLE_USERNAME"] = username
        env["KAGGLE_KEY"] = key
        env["KAGGLE_API_TOKEN"] = key
        env["PYTHONUTF8"] = "1"

        import sys
        cmd = [sys.executable, "-c", "from kaggle.cli import main; main()", "kernels", "status", kernel_ref]
        
        try:
            res = subprocess.run(cmd, capture_output=True, env=env, text=True, shell=False)
            if res.returncode != 0:
                err_msg = res.stderr.strip() or res.stdout.strip() or "Kaggle status command failed."
                print(f"[KaggleOrchestrator] Warning: kaggle kernels status CLI failed for {job.worker_id}: {err_msg}")
                # Increment failure count
                cls._consecutive_poll_failures[job.id] = cls._consecutive_poll_failures.get(job.id, 0) + 1
                if cls._consecutive_poll_failures[job.id] >= 15:  # 15 checks * 10s = 150s
                    cls._failover_or_retry_worker(db, job, err_msg, "Status check failed")
                return

            cls._consecutive_poll_failures[job.id] = 0
            status_output = res.stdout.strip()
            print(f"[KaggleOrchestrator] Kaggle status for booting worker ({job.worker_id}): {status_output}")

            status_lower = status_output.lower()
            
            if "queued" in status_lower:
                cls._unknown_status_count.pop(job.id, None)
                cls._complete_grace_count.pop(job.id, None)
                job.status = "queued_kaggle"
                job.message = f"Kaggle ({job.worker_id}) chưa cấp runtime/GPU, đang xếp hàng..."
                job.progress = 15
                db.commit()
            elif "running" in status_lower:
                cls._unknown_status_count.pop(job.id, None)
                cls._complete_grace_count.pop(job.id, None)
                job.status = "starting_worker"
                job.message = f"Kaggle Worker ({job.worker_id}) đang tải môi trường chạy và mô hình..."
                job.progress = 25
                db.commit()
            elif "error" in status_lower or "failed" in status_lower:
                cls._unknown_status_count.pop(job.id, None)
                cls._complete_grace_count.pop(job.id, None)
                print(f"[KaggleOrchestrator] Worker {job.worker_id} reported ERROR/FAILED: {status_output}")
                cls._failover_or_retry_worker(db, job, status_output, "Worker Error")
            elif "complete" in status_lower:
                cls._unknown_status_count.pop(job.id, None)
                # Kaggle API may report 'complete' from previous session for 20-30s after kernel push.
                # Allow a grace period (e.g. 4 checks = 40s) before treating it as a true termination.
                cls._complete_grace_count[job.id] = cls._complete_grace_count.get(job.id, 0) + 1
                if cls._complete_grace_count[job.id] < 4:
                    print(f"[KaggleOrchestrator] Worker {job.worker_id} status is 'complete' (likely stale from prior session). Grace check {cls._complete_grace_count[job.id]}/4, waiting for Kaggle transition...")
                    job.message = f"Đang chờ Kaggle ({job.worker_id}) hoàn tất cấp phát container GPU mới..."
                    db.commit()
                else:
                    print(f"[KaggleOrchestrator] Worker {job.worker_id} status remained 'complete' after grace period. Triggering failover/re-push...")
                    cls._failover_or_retry_worker(db, job, status_output, "Worker Complete without restart")
            elif "cancel" in status_lower or "stop" in status_lower:
                cls._unknown_status_count.pop(job.id, None)
                cls._complete_grace_count.pop(job.id, None)
                print(f"[KaggleOrchestrator] Worker {job.worker_id} reported CANCELLED/STOPPED: {status_output}")
                cls._failover_or_retry_worker(db, job, status_output, "Worker Stopped/Cancelled")
            else:
                print(f"[KaggleOrchestrator] Warning: unknown Kaggle status: {status_output}")
                cls._unknown_status_count[job.id] = cls._unknown_status_count.get(job.id, 0) + 1
                if cls._unknown_status_count[job.id] >= 20:  # 20 checks * 10s = 200s
                    cls._failover_or_retry_worker(db, job, status_output, "Unknown status timeout")
                
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
            env["KAGGLE_API_TOKEN"] = key
            env["PYTHONUTF8"] = "1"

            import sys
            cmd = [sys.executable, "-c", "from kaggle.cli import main; main()", "kernels", "status", kernel_ref]
            res = subprocess.run(cmd, capture_output=True, env=env, text=True, shell=False)
            if res.returncode == 0:
                return res.stdout.strip()
            return f"Error: {res.stderr.strip()}"
        except Exception as e:
            return f"Exception: {str(e)}"
