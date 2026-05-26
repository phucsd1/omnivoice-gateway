import os
import time
import math
import wave
import struct
import threading
from datetime import datetime
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models import TTSJob, VoiceDesignPreview, VoiceSample
from app.config import settings
from app.services.audio_service import AudioService
from app.services.job_service import JobService

class MockWorker:
    _thread: threading.Thread = None
    _stop_event = threading.Event()

    @staticmethod
    def start():
        """Starts the Mock Worker polling loop in a background thread."""
        if MockWorker._thread is not None and MockWorker._thread.is_alive():
            return
        
        MockWorker._stop_event.clear()
        MockWorker._thread = threading.Thread(target=MockWorker._loop, daemon=True)
        MockWorker._thread.start()
        print("[MockWorker] Background mock worker thread started successfully.")

    @staticmethod
    def stop():
        """Stops the Mock Worker polling loop."""
        MockWorker._stop_event.set()
        if MockWorker._thread:
            MockWorker._thread.join(timeout=5)
            print("[MockWorker] Background mock worker thread stopped.")

    @staticmethod
    def _loop():
        """Polling loop running in the background thread."""
        while not MockWorker._stop_event.is_set():
            db = SessionLocal()
            try:
                # Poll oldest queued or starting_worker jobs
                job = db.query(TTSJob).filter(
                    TTSJob.status.in_(["queued", "starting_worker"])
                ).order_by(TTSJob.created_at.asc()).first()
                
                if job:
                    MockWorker._process_job(db, job)
            except Exception as e:
                print(f"[MockWorker] Error in loop: {e}")
            finally:
                db.close()
            
            # Poll every 2 seconds
            time.sleep(2)

    @staticmethod
    def _process_job(db: Session, job: TTSJob):
        """Simulates processing transitions and output writing for a single job."""
        job_id = job.id
        print(f"[MockWorker] Picked up job {job_id} of type {job.job_type}")
        
        # Step 1: Preparing Input / Booting Worker (10%)
        MockWorker._update_job(db, job_id, "booting_kaggle", "Đang khởi động Kaggle Worker (Giả lập)...", 10)
        time.sleep(1.5)
        
        # Step 2: Loading Model (30%)
        MockWorker._update_job(db, job_id, "loading_model", "Đang tải mô hình OmniVoice (Giả lập)...", 30)
        time.sleep(1.5)
        
        # Step 3: Generating/Cloning Audio (60%)
        msg = "Đang clone giọng nói..." if job.job_type == "clone_voice" else "Đang thiết kế giọng và tạo bản nghe thử..."
        MockWorker._update_job(db, job_id, "generating_audio", msg, 60)
        time.sleep(2.0)
        
        # Step 4: Exporting WAV (90%)
        MockWorker._update_job(db, job_id, "exporting_wav", "Đang kết xuất tệp WAV...", 90)
        time.sleep(1.0)
        
        # Step 5: Completed
        # Prepare output filename and path
        AudioService.ensure_directories()
        
        if job.job_type == "voice_design_preview" and job.preview_id:
            output_path = os.path.abspath(os.path.join(settings.previews_dir, f"{job.preview_id}.wav"))
        else:
            output_path = os.path.abspath(os.path.join(settings.outputs_dir, f"{job_id}.wav"))
            
        try:
            MockWorker._generate_sine_wav(output_path)
            # Register success using JobService
            JobService.complete_job_output(db, job_id, output_path)
            print(f"[MockWorker] Job {job_id} completed successfully. Audio saved to {output_path}")
        except Exception as e:
            error_msg = f"Mock audio generation failed: {e}"
            JobService.update_job_status(db, job_id, "failed", "Lỗi xử lý âm thanh giả lập", 100, error_msg)
            print(f"[MockWorker] Job {job_id} failed: {error_msg}")

    @staticmethod
    def _update_job(db: Session, job_id: str, status: str, message: str, progress: int):
        """Helper to update a job state in a thread-safe manner."""
        # Query again to avoid detached session issues
        JobService.update_job_status(db, job_id, status, message, progress)

    @staticmethod
    def _generate_sine_wav(filepath: str, duration_sec: float = 3.0, sample_rate: int = 24000):
        """Generates a valid playable mono 24000Hz WAV file with a pleasant soft beep."""
        with wave.open(filepath, "wb") as wav_file:
            wav_file.setnchannels(1)  # Mono
            wav_file.setsampwidth(2)   # 16-bit
            wav_file.setframerate(sample_rate)
            
            num_frames = int(duration_sec * sample_rate)
            # Create a 330Hz sine wave (soft tone E4)
            frequency = 330.0
            
            for i in range(num_frames):
                # Apply envelope to prevent clicking (fade-in & fade-out)
                envelope = 1.0
                if i < 2000:
                    envelope = float(i) / 2000.0  # fade-in
                elif i > num_frames - 2000:
                    envelope = float(num_frames - i) / 2000.0  # fade-out
                
                t = float(i) / float(sample_rate)
                # Compute sine value
                val = int(24000.0 * envelope * math.sin(2.0 * math.pi * frequency * t))
                # Pack as 16-bit little endian signed integer
                data = struct.pack("<h", val)
                wav_file.writeframesraw(data)
