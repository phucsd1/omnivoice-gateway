import os
import json
from app.config import settings

class KaggleNotebookBuilder:
    @staticmethod
    def ensure_worker_dir(worker_dir: str) -> str:
        """Ensures that the kaggle worker directory exists and returns its absolute path."""
        worker_dir_abs = os.path.abspath(worker_dir)
        os.makedirs(worker_dir_abs, exist_ok=True)
        return worker_dir_abs

    @staticmethod
    def generate_metadata(worker_dir: str, username: str, slug: str, title: str, accelerator: str = None) -> str:
        """Generates or updates kernel-metadata.json from configurations."""
        metadata_path = os.path.join(worker_dir, "kernel-metadata.json")
        
        # Build metadata structure
        metadata = {
            "id": f"{username}/{slug}",
            "title": title,
            "code_file": "worker.py",
            "language": "python",
            "kernel_type": "script",
            "is_private": True,
            "enable_gpu": True,
            "enable_internet": True,
            "dataset_sources": [],
            "kernel_sources": [],
            "competition_sources": []
        }
        
        # Map accelerator values to Kaggle API expected format
        mapped_acc = "NvidiaTeslaT4"
        if accelerator:
            acc_lower = accelerator.lower()
            if "p100" in acc_lower:
                mapped_acc = "NvidiaTeslaP100"
            elif "t4" in acc_lower:
                mapped_acc = "NvidiaTeslaT4"
            else:
                mapped_acc = accelerator
        
        metadata["machine_shape"] = mapped_acc
        metadata["accelerator"] = mapped_acc
        
        with open(metadata_path, "w", encoding="utf-8") as f:
            json.dump(metadata, f, indent=2)
            
        print(f"[KaggleNotebookBuilder] Generated metadata at: {metadata_path}")
        return metadata_path

    @staticmethod
    def generate_requirements(worker_dir: str) -> str:
        """Generates or updates the requirements.txt file."""
        req_path = os.path.join(worker_dir, "requirements.txt")
        req_content = "omnivoice\nsoundfile\nrequests\n"
        
        with open(req_path, "w", encoding="utf-8") as f:
            f.write(req_content)
            
        print(f"[KaggleNotebookBuilder] Generated requirements.txt at: {req_path}")
        return req_path

    @staticmethod
    def generate_worker_code(worker_dir: str, public_api_url: str = "", worker_token: str = "", worker_id: str = "") -> str:
        """Generates the worker.py script containing the OmniVoice polling logic."""
        worker_path = os.path.join(worker_dir, "worker.py")
        
        # Fallback values
        if not public_api_url:
            public_api_url = settings.PUBLIC_API_BASE_URL or ""
        if not worker_token:
            worker_token = settings.WORKER_TOKEN or "default_secure_worker_token_12345"
        if not worker_id:
            import uuid
            worker_id = f"kaggle_worker_{uuid.uuid4().hex[:6]}"
            
        # Pull-based worker code template with self-installing dependency checker
        code = """import os
import sys
import time
import uuid
import tempfile
import traceback
import requests

def ensure_dependencies():
    \"\"\"Dynamically checks and installs required packages inside the Kaggle environment if missing.\"\"\"
    missing = []
    try:
        import omnivoice
    except ImportError:
        missing.append("omnivoice")
    try:
        import soundfile
    except ImportError:
        missing.append("soundfile")
        
    if missing:
        import subprocess
        print(f"Installing missing dependencies: {', '.join(missing)}")
        try:
            # Install packages silently
            subprocess.check_call([sys.executable, "-m", "pip", "install", "-q"] + missing)
            print("Dependencies installed successfully.")
        except Exception as e:
            print(f"Failed to install dependencies: {e}")
            sys.exit(1)

# Ensure dependencies are available before anything else runs
ensure_dependencies()

import soundfile as sf

# Load configuration
PUBLIC_API_BASE_URL = os.environ.get("PUBLIC_API_BASE_URL", "").rstrip("/")
WORKER_TOKEN = os.environ.get("WORKER_TOKEN", "default_secure_worker_token_12345")
WORKER_ID = os.environ.get("WORKER_ID", f"kaggle_worker_{uuid.uuid4().hex[:6]}")
IDLE_TIMEOUT = int(os.environ.get("WORKER_IDLE_TIMEOUT_SECONDS", "600"))
POLL_INTERVAL = int(os.environ.get("WORKER_POLL_INTERVAL_SECONDS", "3"))

HEADERS = {
    "Authorization": f"Bearer {WORKER_TOKEN}"
}

def log(msg: str):
    print(f"[{datetime_str()}] [Worker-{WORKER_ID}] {msg}")
    sys.stdout.flush()

def datetime_str() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S")

def make_request(method: str, path: str, **kwargs) -> requests.Response:
    url = f"{PUBLIC_API_BASE_URL}{path}"
    if "headers" in kwargs:
        kwargs["headers"].update(HEADERS)
    else:
        kwargs["headers"] = HEADERS
    return requests.request(method, url, **kwargs)

def main():
    if not PUBLIC_API_BASE_URL:
        print("ERROR: PUBLIC_API_BASE_URL environment variable is not set. Exiting.")
        sys.exit(1)

    log(f"Starting Kaggle Worker. Gateway: {PUBLIC_API_BASE_URL}")
    
    # 1. Register starting
    try:
        make_request(
            "POST", 
            "/v1/internal/workers/register", 
            json={"worker_id": WORKER_ID, "status": "starting", "message": "OmniVoice worker starting up..."}
        )
    except Exception as e:
        print(f"Failed to register startup with gateway: {e}. Check network connection or PUBLIC_API_BASE_URL.")
        sys.exit(1)

    # 2. Load OmniVoice
    log("Loading OmniVoice model into memory...")
    try:
        import torch
        from omnivoice import OmniVoice

        # Send heartbeat reporting loading_model status
        make_request(
            "POST", 
            "/v1/internal/workers/heartbeat", 
            json={"worker_id": WORKER_ID, "status": "loading_model", "message": "Loading model weights..."}
        )

        model = OmniVoice.from_pretrained(
            "k2-fsa/OmniVoice",
            device_map="cuda:0",
            dtype=torch.float16,
            load_asr=True,
        )
        log("OmniVoice model loaded successfully.")
    except Exception as e:
        error_trace = traceback.format_exc()
        log(f"CRITICAL ERROR loading OmniVoice model: {e}")
        try:
            make_request(
                "POST", 
                "/v1/internal/workers/register", 
                json={"worker_id": WORKER_ID, "status": "failed", "message": f"Model load failed: {str(e)}"}
            )
        except Exception:
            pass
        sys.exit(1)

    # Register as Ready
    make_request(
        "POST", 
        "/v1/internal/workers/register", 
        json={"worker_id": WORKER_ID, "status": "ready", "message": "OmniVoice model ready for requests."}
    )

    idle_seconds = 0
    log("Entering job polling loop...")
    
    while True:
        try:
            # Send heartbeat
            make_request(
                "POST",
                "/v1/internal/workers/heartbeat",
                json={"worker_id": WORKER_ID, "status": "idle", "message": f"Worker polling. Idle time: {idle_seconds}s"}
            )

            # Poll for job
            response = make_request("GET", f"/v1/internal/jobs/next?worker_id={WORKER_ID}")
            if response.status_code == 401:
                log("Unauthorized (401). Worker token invalid. Exiting.")
                break
                
            if response.status_code != 200:
                log(f"Warning: Poll returned status code {response.status_code}")
                time.sleep(POLL_INTERVAL)
                idle_seconds += POLL_INTERVAL
                continue

            data = response.json()
            job = data.get("job")

            if not job:
                # No job available
                time.sleep(POLL_INTERVAL)
                idle_seconds += POLL_INTERVAL
                if idle_seconds >= IDLE_TIMEOUT:
                    log(f"Idle timeout of {IDLE_TIMEOUT}s reached. Initiating shutdown.")
                    make_request(
                        "POST", 
                        "/v1/internal/workers/shutdown", 
                        json={"worker_id": WORKER_ID, "reason": "idle_timeout"}
                    )
                    break
                continue

            # Reset idle counter on job receipt
            idle_seconds = 0
            job_id = job["job_id"]
            job_type = job["job_type"]
            log(f"Processing job {job_id} ({job_type})")

            # Report busy status
            make_request(
                "POST",
                "/v1/internal/workers/heartbeat",
                json={"worker_id": WORKER_ID, "status": "busy", "current_job_id": job_id, "message": f"Running {job_type}"}
            )

            # Update job status: loading_model
            make_request(
                "POST",
                f"/v1/internal/jobs/{job_id}/status",
                json={"status": "loading_model", "message": "Đang tải OmniVoice...", "progress": 30}
            )

            # Process job based on type
            try:
                local_ref_path = None
                ref_audio_url = job.get("ref_audio_url")
                
                if job_type == "clone_voice" and ref_audio_url:
                    make_request(
                        "POST",
                        f"/v1/internal/jobs/{job_id}/status",
                        json={"status": "preparing_input", "message": "Đang tải tệp âm thanh tham chiếu...", "progress": 45}
                    )
                    
                    # Securely download voice sample file
                    res = make_request("GET", ref_audio_url.replace(PUBLIC_API_BASE_URL, ""), stream=True)
                    if res.status_code == 200:
                        temp_fd, local_ref_path = tempfile.mkstemp(suffix=".wav")
                        os.close(temp_fd)
                        with open(local_ref_path, "wb") as f:
                            for chunk in res.iter_content(chunk_size=8192):
                                f.write(chunk)
                        log(f"Downloaded reference voice sample to {local_ref_path}")
                    else:
                        raise Exception(f"Failed to download reference audio from gateway: {res.status_code} - {res.text}")

                make_request(
                    "POST",
                    f"/v1/internal/jobs/{job_id}/status",
                    json={"status": "generating_audio", "message": "Đang xử lý âm thanh...", "progress": 70}
                )

                # Execute OmniVoice Generation
                audio_result = None
                if job_type == "clone_voice":
                    log(f"Calling model.generate for clone_voice, ref_audio={local_ref_path}")
                    audio_result = model.generate(
                        text=job["text"],
                        ref_audio=local_ref_path,
                        ref_text=job.get("ref_text"),
                    )
                elif job_type == "voice_design_preview" or job_type == "voice_design_tts":
                    log(f"Calling model.generate for voice_design, instruct={job['instruct']}")
                    audio_result = model.generate(
                        text=job["text"],
                        instruct=job["instruct"],
                    )
                elif job_type == "auto_voice":
                    log("Calling model.generate for auto_voice")
                    audio_result = model.generate(
                        text=job["text"],
                    )
                else:
                    raise Exception(f"Unknown job type: {job_type}")

                # Clean up local ref path if exists
                if local_ref_path and os.path.exists(local_ref_path):
                    os.remove(local_ref_path)

                # Export WAV
                make_request(
                    "POST",
                    f"/v1/internal/jobs/{job_id}/status",
                    json={"status": "exporting_wav", "message": "Đang xuất WAV...", "progress": 90}
                )
                
                temp_out_fd, local_out_path = tempfile.mkstemp(suffix=".wav")
                os.close(temp_out_fd)
                
                sf.write(local_out_path, audio_result[0], 24000)
                log(f"Generated audio saved to {local_out_path}")

                # Upload output WAV
                with open(local_out_path, "rb") as out_file:
                    files = {"file": (f"{job_id}.wav", out_file, "audio/wav")}
                    upload_res = make_request("POST", f"/v1/internal/jobs/{job_id}/output", files=files)
                    
                if upload_res.status_code == 200:
                    log(f"Successfully uploaded job {job_id} output audio.")
                else:
                    raise Exception(f"Failed to upload audio to gateway: {upload_res.status_code} - {upload_res.text}")

                if os.path.exists(local_out_path):
                    os.remove(local_out_path)

            except Exception as inner_e:
                err_str = str(inner_e)
                trace = traceback.format_exc()
                log(f"Error executing job {job_id}: {err_str}\\n{trace}")
                
                make_request(
                    "POST",
                    f"/v1/internal/jobs/{job_id}/status",
                    json={
                        "status": "failed",
                        "message": "Lỗi xử lý âm thanh.",
                        "progress": 100,
                        "error_message": f"{err_str}\\n{trace}"
                    }
                )

        except Exception as e:
            log(f"Network or loop error: {e}")
            time.sleep(POLL_INTERVAL)

    log("Worker execution finished.")

if __name__ == "__main__":
    main()
"""
        # Replace placeholders with resolved values
        code = code.replace(
            'PUBLIC_API_BASE_URL = os.environ.get("PUBLIC_API_BASE_URL", "").rstrip("/")',
            f'PUBLIC_API_BASE_URL = {repr(public_api_url)}.rstrip("/")'
        )
        code = code.replace(
            'WORKER_TOKEN = os.environ.get("WORKER_TOKEN", "default_secure_worker_token_12345")',
            f'WORKER_TOKEN = {repr(worker_token)}'
        )
        code = code.replace(
            'WORKER_ID = os.environ.get("WORKER_ID", f"kaggle_worker_{uuid.uuid4().hex[:6]}")',
            f'WORKER_ID = {repr(worker_id)}'
        )

        with open(worker_path, "w", encoding="utf-8") as f:
            f.write(code)
            
        print(f"[KaggleNotebookBuilder] Generated worker script at: {worker_path}")
        return worker_path

    @staticmethod
    def prepare_all(db=None, public_api_url: str = None) -> str:
        """
        Runs the full prepare pipeline: ensures directory,
        writes requirements.txt, kernel-metadata.json, and worker.py.
        Returns the absolute path of the worker directory.
        """
        # Resolve settings/DB configs
        from app.services.kaggle_orchestrator import KaggleOrchestrator
        username, _, kernel_ref, worker_dir = KaggleOrchestrator.get_credentials(db)
        
        # Resolve public_api_url dynamically if not passed
        if not public_api_url:
            public_api_url = settings.PUBLIC_API_BASE_URL
            
        # Hugging Face Space auto-detection
        if not public_api_url and os.environ.get("SPACE_HOST"):
            public_api_url = f"https://{os.environ.get('SPACE_HOST')}"
            print(f"[KaggleNotebookBuilder] Auto-detected Hugging Face Space Host URL: {public_api_url}")
            
        # Resolve accelerator settings
        accelerator = settings.KAGGLE_ACCELERATOR
        if db:
            from app.models import SystemSetting
            db_acc = db.query(SystemSetting).filter(SystemSetting.key == "kaggle_accelerator").first()
            if db_acc and db_acc.value.strip():
                accelerator = db_acc.value.strip()
        
        # Extract slug from sanitized kernel_ref
        slug = kernel_ref.split("/")[-1] if "/" in kernel_ref else settings.KAGGLE_KERNEL_SLUG
        title = slug.replace("-", " ").title()

        worker_dir_abs = KaggleNotebookBuilder.ensure_worker_dir(worker_dir)
        KaggleNotebookBuilder.generate_requirements(worker_dir_abs)
        KaggleNotebookBuilder.generate_metadata(worker_dir_abs, username, slug, title, accelerator)
        
        # Generate worker script with embedded credentials and API URLs
        import uuid
        worker_id = f"kaggle_worker_{uuid.uuid4().hex[:6]}"
        KaggleNotebookBuilder.generate_worker_code(worker_dir_abs, public_api_url, settings.WORKER_TOKEN, worker_id)
        
        return worker_dir_abs
