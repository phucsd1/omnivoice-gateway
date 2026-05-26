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
    def generate_worker_code(worker_dir: str, job=None, public_api_url: str = "", worker_token: str = "") -> str:
        """Generates the omnivoice_worker.py Python script containing the OmniVoice batch generation logic."""
        worker_path = os.path.join(worker_dir, "omnivoice_worker.py")
        
        # Fallback values for job parameters
        if job:
            job_id = getattr(job, "id", "") or job.get("id", "")
            job_type = getattr(job, "job_type", "") or job.get("job_type", "")
            text = getattr(job, "text", "") or job.get("text", "")
            ref_text = getattr(job, "ref_text", None) or job.get("ref_text", None)
            instruct = getattr(job, "instruct", None) or job.get("instruct", None)
            
            # Resolve ref_audio_url if it has a voice_sample_id
            voice_sample_id = getattr(job, "voice_sample_id", None) or job.get("voice_sample_id", None)
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

        if not worker_token:
            worker_token = settings.WORKER_TOKEN or "default_secure_worker_token_12345"

        # Pure Python batch execution script template
        code = f"""import os
import sys
import time
import requests
import traceback

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
        print(f"Installing missing dependencies: {{', '.join(missing)}}")
        try:
            # Install packages silently
            subprocess.check_call([sys.executable, "-m", "pip", "install", "-q"] + missing)
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
            )
        elif JOB_TYPE in ["voice_design_preview", "voice_design_tts"]:
            print(f"Generating voice design for: {{TEXT}} with instruct: {{INSTRUCT}}")
            audio_result = model.generate(
                text=TEXT,
                instruct=INSTRUCT,
            )
        elif JOB_TYPE == "auto_voice":
            print(f"Generating auto voice for: {{TEXT}}")
            audio_result = model.generate(
                text=TEXT,
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
    def prepare_all(job=None, db=None, public_api_url: str = None) -> str:
        """
        Runs the full prepare pipeline: ensures directory,
        writes requirements.txt, kernel-metadata.json, and omnivoice_worker.py.
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
        KaggleNotebookBuilder.generate_worker_code(worker_dir_abs, job, public_api_url, settings.WORKER_TOKEN)
        
        return worker_dir_abs

