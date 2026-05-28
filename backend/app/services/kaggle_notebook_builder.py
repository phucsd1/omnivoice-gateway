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
            "code_file": "omnivoice_worker.py",
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
    def generate_worker_code(worker_dir: str, job=None, public_api_url: str = "", worker_token: str = "", is_daemon: bool = True) -> str:
        """Generates the omnivoice_worker.py Python script containing the OmniVoice batch or daemon generation logic."""
        worker_path = os.path.join(worker_dir, "omnivoice_worker.py")
        
        if not worker_token:
            worker_token = settings.WORKER_TOKEN or "default_secure_worker_token_12345"

        if is_daemon:
            import uuid
            worker_id = f"kaggle_worker_{uuid.uuid4().hex[:6]}"
            idle_timeout = settings.WORKER_IDLE_TIMEOUT_SECONDS
            poll_interval = settings.WORKER_POLL_INTERVAL_SECONDS
            
            # Optimized Daemon script template
            code = f"""import os
import sys
import time
import uuid
import tempfile
import traceback
import requests
import warnings
from urllib.parse import urlparse

os.environ["CUDA_MODULE_LOADING"] = "LAZY"
os.environ["PYTHONWARNINGS"] = "ignore"
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "1"
warnings.filterwarnings("ignore")

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
    try:
        import hf_transfer
    except ImportError:
        missing.append("hf-transfer")
        
    if missing:
        import subprocess
        print(f"Installing missing dependencies: {{', '.join(missing)}}")
        try:
            # Install packages silently with fast flags
            subprocess.check_call([
                sys.executable, "-m", "pip", "install", "-q", 
                "--no-cache-dir", "--prefer-binary", 
                "--no-warn-script-location"
            ] + missing)
            print("Dependencies installed successfully.")
        except Exception as e:
            print(f"Failed to install dependencies: {{e}}")
            sys.exit(1)

# Ensure dependencies are available before anything else runs
ensure_dependencies()

import torch
import soundfile as sf
from omnivoice import OmniVoice

PUBLIC_API_BASE_URL = {repr(public_api_url)}.rstrip("/")
WORKER_TOKEN = {repr(worker_token)}
WORKER_ID = {repr(worker_id)}
IDLE_TIMEOUT = {idle_timeout}
POLL_INTERVAL = {poll_interval}

HEADERS = {{
    "Authorization": f"Bearer {{WORKER_TOKEN}}"
}}

def log(msg: str):
    print(f"[{{time.strftime('%Y-%m-%d %H:%M:%S')}}] [Worker-{{WORKER_ID}}] {{msg}}")
    sys.stdout.flush()

def make_request(method: str, path: str, **kwargs) -> requests.Response:
    url = f"{{PUBLIC_API_BASE_URL}}{{path}}"
    if "headers" in kwargs:
        kwargs["headers"].update(HEADERS)
    else:
        kwargs["headers"] = HEADERS.copy()
    return requests.request(method, url, **kwargs)

def main():
    if not PUBLIC_API_BASE_URL:
        print("ERROR: PUBLIC_API_BASE_URL is not set. Exiting.")
        sys.exit(1)

    log(f"Starting Kaggle Worker Daemon. Gateway: {{PUBLIC_API_BASE_URL}}")
    
    # 1. Register starting
    try:
        make_request(
            "POST", 
            "/v1/internal/workers/register", 
            json={{"worker_id": WORKER_ID, "status": "starting", "message": "OmniVoice worker starting up..."}}
        )
    except Exception as e:
        print(f"Failed to register startup with gateway: {{e}}")
        sys.exit(1)

    # 2. Load OmniVoice
    log("Loading OmniVoice model into memory...")
    try:
        # Send heartbeat reporting loading_model status
        make_request(
            "POST", 
            "/v1/internal/workers/heartbeat", 
            json={{"worker_id": WORKER_ID, "status": "loading_model", "message": "Loading model weights..."}}
        )

        model = OmniVoice.from_pretrained(
            "k2-fsa/OmniVoice",
            device_map="cuda:0",
            dtype=torch.float16,
            load_asr=True,
        )
        log("OmniVoice model loaded successfully.")
    except Exception as e:
        log(f"CRITICAL ERROR loading OmniVoice model: {{e}}")
        try:
            make_request(
                "POST", 
                "/v1/internal/workers/register", 
                json={{"worker_id": WORKER_ID, "status": "failed", "message": f"Model load failed: {{str(e)}}"}}
            )
        except Exception:
            pass
        sys.exit(1)

    # Register as Ready
    make_request(
        "POST", 
        "/v1/internal/workers/register", 
        json={{"worker_id": WORKER_ID, "status": "ready", "message": "OmniVoice model ready for requests."}}
    )

    idle_seconds = 0
    log("Entering job polling loop...")
    
    while True:
        try:
            # Send heartbeat
            make_request(
                "POST",
                "/v1/internal/workers/heartbeat",
                json={{"worker_id": WORKER_ID, "status": "idle", "message": f"Worker polling. Idle time: {{idle_seconds}}s"}}
            )

            # Poll for job
            response = make_request("GET", f"/v1/internal/jobs/next?worker_id={{WORKER_ID}}")
            if response.status_code == 401:
                log("Unauthorized (401). Worker token invalid. Exiting.")
                break
                
            if response.status_code != 200:
                log(f"Warning: Poll returned status code {{response.status_code}}")
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
                    log(f"Idle timeout of {{IDLE_TIMEOUT}}s reached. Initiating shutdown.")
                    make_request(
                        "POST", 
                        "/v1/internal/workers/shutdown", 
                        json={{"worker_id": WORKER_ID, "reason": "idle_timeout"}}
                    )
                    break
                continue

            # Reset idle counter on job receipt
            idle_seconds = 0
            job_id = job["job_id"]
            job_type = job["job_type"]
            job_speed = job.get("speed", 1.0)
            job_num_step = job.get("num_step", 32)
            log(f"Processing job {{job_id}} ({{job_type}}), speed={{job_speed}}, steps={{job_num_step}}")

            # Report busy status
            make_request(
                "POST",
                "/v1/internal/workers/heartbeat",
                json={{"worker_id": WORKER_ID, "status": "busy", "current_job_id": job_id, "message": f"Running {{job_type}}"}}
            )

            # Update job status: loading_model
            make_request(
                "POST",
                f"/v1/internal/jobs/{{job_id}}/status",
                json={{"status": "loading_model", "message": "Đang tải OmniVoice...", "progress": 30}}
            )

            # Process job based on type
            try:
                local_ref_path = None
                ref_audio_url = job.get("ref_audio_url")
                
                if job_type == "clone_voice" and ref_audio_url:
                    make_request(
                        "POST",
                        f"/v1/internal/jobs/{{job_id}}/status",
                        json={{"status": "preparing_input", "message": "Đang tải tệp âm thanh tham chiếu...", "progress": 45}}
                    )
                    
                    # Securely download voice sample file using the parsed URL path
                    parsed_ref = urlparse(ref_audio_url)
                    ref_path = parsed_ref.path
                    if parsed_ref.query:
                        ref_path = ref_path + "?" + parsed_ref.query
                    res = make_request("GET", ref_path, stream=True)
                    if res.status_code == 200:
                        temp_fd, local_ref_path = tempfile.mkstemp(suffix=".wav")
                        os.close(temp_fd)
                        with open(local_ref_path, "wb") as f:
                            for chunk in res.iter_content(chunk_size=8192):
                                f.write(chunk)
                        log(f"Downloaded reference voice sample to {{local_ref_path}}")
                    else:
                        raise Exception(f"Failed to download reference audio from gateway: {{res.status_code}} - {{res.text}}")

                make_request(
                    "POST",
                    f"/v1/internal/jobs/{{job_id}}/status",
                    json={{"status": "generating_audio", "message": "Đang xử lý âm thanh...", "progress": 70}}
                )

                # Execute OmniVoice Generation
                audio_result = None
                if job_type == "clone_voice":
                    log(f"Calling model.generate for clone_voice, ref_audio={{local_ref_path}}")
                    audio_result = model.generate(
                        text=job["text"],
                        ref_audio=local_ref_path,
                        ref_text=job.get("ref_text"),
                        speed=job_speed,
                        num_step=job_num_step,
                    )
                elif job_type in ["voice_design_preview", "voice_design_tts"]:
                    log(f"Calling model.generate for voice_design, instruct={{job['instruct']}}")
                    audio_result = model.generate(
                        text=job["text"],
                        instruct=job["instruct"],
                        speed=job_speed,
                        num_step=job_num_step,
                    )
                elif job_type == "auto_voice":
                    log("Calling model.generate for auto_voice")
                    audio_result = model.generate(
                        text=job["text"],
                        speed=job_speed,
                        num_step=job_num_step,
                    )
                else:
                    raise Exception(f"Unknown job type: {{job_type}}")

                # Clean up local ref path if exists
                if local_ref_path and os.path.exists(local_ref_path):
                    os.remove(local_ref_path)

                # Export WAV
                make_request(
                    "POST",
                    f"/v1/internal/jobs/{{job_id}}/status",
                    json={{"status": "exporting_wav", "message": "Đang xuất WAV...", "progress": 90}}
                )
                
                temp_out_fd, local_out_path = tempfile.mkstemp(suffix=".wav")
                os.close(temp_out_fd)
                
                sf.write(local_out_path, audio_result[0], 24000)
                log(f"Generated audio saved to {{local_out_path}}")

                # Upload output WAV
                with open(local_out_path, "rb") as out_file:
                    files = {{"file": (f"{{job_id}}.wav", out_file, "audio/wav")}}
                    upload_res = make_request("POST", f"/v1/internal/jobs/{{job_id}}/output", files=files)
                    
                if upload_res.status_code == 200:
                    log(f"Successfully uploaded job {{job_id}} output audio.")
                else:
                    raise Exception(f"Failed to upload audio to gateway: {{upload_res.status_code}} - {{upload_res.text}}")

                if os.path.exists(local_out_path):
                    os.remove(local_out_path)

            except Exception as inner_e:
                err_str = str(inner_e)
                trace = traceback.format_exc()
                log(f"Error executing job {{job_id}}: {{err_str}}\\n{{trace}}")
                
                make_request(
                    "POST",
                    f"/v1/internal/jobs/{{job_id}}/status",
                    json={{
                        "status": "failed",
                        "message": "Lỗi xử lý âm thanh.",
                        "progress": 100,
                        "error_message": f"{{err_str}}\\n{{trace}}"
                    }}
                )

        except Exception as e:
            log(f"Network or loop error: {{e}}")
            time.sleep(POLL_INTERVAL)

    log("Worker execution finished.")

if __name__ == '__main__':
    main()
"""
        else:
            # Fallback values for job parameters
            if job:
                if isinstance(job, dict):
                    job_id = job.get("id", "")
                    job_type = job.get("job_type", "")
                    text = job.get("text", "")
                    ref_text = job.get("ref_text", None)
                    instruct = job.get("instruct", None)
                    voice_sample_id = job.get("voice_sample_id", None)
                    speed = job.get("speed", 1.0)
                    num_step = job.get("num_step", 32)
                else:
                    job_id = getattr(job, "id", "") or ""
                    job_type = getattr(job, "job_type", "") or ""
                    text = getattr(job, "text", "") or ""
                    ref_text = getattr(job, "ref_text", None)
                    instruct = getattr(job, "instruct", None)
                    voice_sample_id = getattr(job, "voice_sample_id", None)
                    speed = getattr(job, "speed", 1.0) or 1.0
                    num_step = getattr(job, "num_step", 32) or 32
                
                # Resolve ref_audio_url if it has a voice_sample_id
                ref_audio_url = None
                if voice_sample_id:
                    base_url = public_api_url or settings.PUBLIC_API_BASE_URL
                    ref_audio_url = f"{base_url.rstrip('/')}/v1/internal/files/voice-samples/{voice_sample_id}"
            else:
                job_id = "test_push"
                job_type = "auto_voice"
                text = "Xin chào, đây là bản thử nghiệm đẩy kết nối Kaggle."
                ref_audio_url = None
                ref_text = None
                instruct = None
                speed = 1.0
                num_step = 32

            # Pure Python batch execution script template
            code = f"""import os
import sys
import time
import requests
import traceback
import warnings

os.environ["CUDA_MODULE_LOADING"] = "LAZY"
os.environ["PYTHONWARNINGS"] = "ignore"
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "1"
warnings.filterwarnings("ignore")

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
    try:
        import hf_transfer
    except ImportError:
        missing.append("hf-transfer")
        
    if missing:
        import subprocess
        print(f"Installing missing dependencies: {{', '.join(missing)}}")
        try:
            # Install packages silently with fast flags
            subprocess.check_call([
                sys.executable, "-m", "pip", "install", "-q", 
                "--no-cache-dir", "--prefer-binary", 
                "--no-warn-script-location"
            ] + missing)
            print("Dependencies installed successfully.")
        except Exception as e:
            print(f"Failed to install dependencies: {{e}}")
            sys.exit(1)

# Ensure dependencies are available before anything else runs
ensure_dependencies()

import torch
import soundfile as sf
from omnivoice import OmniVoice

JOB_ID = {repr(job_id)}
JOB_TYPE = {repr(job_type)}
TEXT = {repr(text)}
REF_AUDIO_URL = {repr(ref_audio_url)}
REF_TEXT = {repr(ref_text)}
INSTRUCT = {repr(instruct)}
SPEED = {speed}
NUM_STEP = {num_step}
WORKER_TOKEN = {repr(worker_token)}

def main():
    print(f"Starting Kaggle Batch Worker for Job {{JOB_ID}} ({{JOB_TYPE}})")
    sys.stdout.flush()
    
    local_ref_path = None
    if JOB_TYPE == "clone_voice" and REF_AUDIO_URL:
        print(f"Downloading reference voice sample from {{REF_AUDIO_URL}}...")
        sys.stdout.flush()
        headers = {{}}
        if WORKER_TOKEN:
            headers["Authorization"] = f"Bearer {{WORKER_TOKEN}}"
        
        try:
            res = requests.get(REF_AUDIO_URL, headers=headers, stream=True)
            if res.status_code == 200:
                local_ref_path = "ref_audio.wav"
                with open(local_ref_path, "wb") as f:
                    for chunk in res.iter_content(chunk_size=8192):
                        f.write(chunk)
                print(f"Downloaded reference voice sample successfully to {{local_ref_path}}")
            else:
                print(f"Failed to download reference audio: {{res.status_code}} - {{res.text}}")
                sys.exit(1)
        except Exception as e:
            print(f"Error downloading reference audio: {{e}}")
            sys.exit(1)

    print("Loading OmniVoice model...")
    sys.stdout.flush()
    try:
        model = OmniVoice.from_pretrained(
            "k2-fsa/OmniVoice",
            device_map="cuda:0",
            dtype=torch.float16,
            load_asr=True,
        )
        print("OmniVoice model loaded successfully.")
    except Exception as e:
        print(f"CRITICAL ERROR loading OmniVoice model: {{e}}")
        sys.stdout.flush()
        sys.exit(1)

    print("Generating audio...")
    sys.stdout.flush()
    try:
        audio_result = None
        if JOB_TYPE == "clone_voice":
            if not local_ref_path:
                raise Exception("Missing reference audio path for clone_voice")
            print(f"Generating voice cloning for: {{TEXT}}")
            audio_result = model.generate(
                text=TEXT,
                ref_audio=local_ref_path,
                ref_text=REF_TEXT,
                speed=SPEED,
                num_step=NUM_STEP,
            )
        elif JOB_TYPE in ["voice_design_preview", "voice_design_tts"]:
            print(f"Generating voice design for: {{TEXT}} with instruct: {{INSTRUCT}}")
            audio_result = model.generate(
                text=TEXT,
                instruct=INSTRUCT,
                speed=SPEED,
                num_step=NUM_STEP,
            )
        elif JOB_TYPE == "auto_voice":
            print(f"Generating auto voice for: {{TEXT}}")
            audio_result = model.generate(
                text=TEXT,
                speed=SPEED,
                num_step=NUM_STEP,
            )
        else:
            raise Exception(f"Unknown job type: {{JOB_TYPE}}")

        # Save to output.wav in the current directory (which is /kaggle/working/ output folder)
        output_filename = "output.wav"
        sf.write(output_filename, audio_result[0], 24000)
        print(f"Generated audio saved successfully to {{output_filename}}")
        sys.stdout.flush()

    except Exception as e:
        error_trace = traceback.format_exc()
        print(f"Generation failed: {{e}}\\n{{error_trace}}")
        sys.stdout.flush()
        sys.exit(1)

if __name__ == '__main__':
    main()
"""

        with open(worker_path, "w", encoding="utf-8") as f:
            f.write(code)
            
        print(f"[KaggleNotebookBuilder] Generated worker script at: {worker_path}")
        return worker_path

    @staticmethod
    def prepare_all(job=None, db=None, public_api_url: str = None, is_daemon: bool = True, user_id: str = None) -> str:
        """
        Runs the full prepare pipeline: ensures directory,
        writes requirements.txt, kernel-metadata.json, and omnivoice_worker.py.
        Returns the absolute path of the worker directory.
        """
        if not user_id and job:
            if isinstance(job, dict):
                user_id = job.get("user_id")
            else:
                user_id = getattr(job, "user_id", None)

        # Resolve settings/DB configs
        from app.services.kaggle_orchestrator import KaggleOrchestrator
        username, _, kernel_ref, worker_dir = KaggleOrchestrator.get_credentials(db, user_id)
        
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
            if user_id:
                from app.models import UserSetting
                db_acc = db.query(UserSetting).filter(UserSetting.user_id == user_id, UserSetting.key == "kaggle_accelerator").first()
            else:
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
        
        # Resolve worker token as user API key if applicable
        worker_token = settings.WORKER_TOKEN
        if user_id and db:
            from app.models import User
            user = db.query(User).filter(User.id == user_id).first()
            if user and user.api_key:
                worker_token = user.api_key

        # Generate worker script with embedded credentials and API URLs
        KaggleNotebookBuilder.generate_worker_code(worker_dir_abs, job, public_api_url, worker_token, is_daemon=is_daemon)
        
        return worker_dir_abs
