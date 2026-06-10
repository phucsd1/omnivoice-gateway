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
        req_content = "omnivoice\nsoundfile\nrequests\nfaster-whisper\n"
        
        with open(req_path, "w", encoding="utf-8") as f:
            f.write(req_content)
            
        print(f"[KaggleNotebookBuilder] Generated requirements.txt at: {req_path}")
        return req_path

    @staticmethod
    def generate_worker_code(worker_dir: str, job=None, public_api_url: str = "", worker_token: str = "", is_daemon: bool = True, db=None) -> str:
        """Generates the omnivoice_worker.py Python script containing the OmniVoice batch or daemon generation logic."""
        worker_path = os.path.join(worker_dir, "omnivoice_worker.py")
        
        if not worker_token:
            worker_token = settings.WORKER_TOKEN or "default_secure_worker_token_12345"

        if is_daemon:
            import uuid
            worker_id = f"kaggle_worker_{uuid.uuid4().hex[:6]}"
            idle_timeout = settings.WORKER_IDLE_TIMEOUT_SECONDS
            if db:
                from app.models import SystemSetting
                db_idle = db.query(SystemSetting).filter(SystemSetting.key == "kaggle_idle_timeout_seconds").first()
                if db_idle and db_idle.value.strip():
                    try:
                        idle_timeout = int(db_idle.value.strip())
                    except ValueError:
                        pass
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
os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "0"
os.environ["HF_HUB_DISABLE_XET"] = "1"
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
        import faster_whisper
    except ImportError:
        missing.append("faster-whisper")
        
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

WHISPER_MODEL = None

def get_whisper_model():
    global WHISPER_MODEL
    if WHISPER_MODEL is None:
        log("Loading Whisper model for word alignment...")
        from faster_whisper import WhisperModel
        import torch
        
        # Try GPU first
        if torch.cuda.is_available():
            try:
                log("Attempting to load WhisperModel on GPU (cuda)...")
                WHISPER_MODEL = WhisperModel("tiny", device="cuda", compute_type="float16")
                log("Whisper model loaded on GPU successfully.")
                return WHISPER_MODEL
            except Exception as gpu_err:
                log(f"Warning: Failed to load WhisperModel on GPU: {{gpu_err}}. Falling back to CPU...")
                
        # Fallback to CPU
        try:
            log("Attempting to load WhisperModel on CPU...")
            WHISPER_MODEL = WhisperModel("tiny", device="cpu", compute_type="int8")
            log("Whisper model loaded on CPU successfully.")
        except Exception as cpu_err:
            log(f"Error: Failed to load WhisperModel on CPU: {{cpu_err}}")
            raise cpu_err
            
    return WHISPER_MODEL

def align_words(original_words, transcribed_words, audio_duration):
    n = len(original_words)
    m = len(transcribed_words)
    if n == 0:
        return []
    if m == 0:
        return None
    
    dp = [[0.0] * (m + 1) for _ in range(n + 1)]
    parent = [[None] * (m + 1) for _ in range(n + 1)]
    
    for i in range(1, n + 1):
        dp[i][0] = dp[i-1][0] + 1.0
        parent[i][0] = (i-1, 0, "skip_orig")
    for j in range(1, m + 1):
        dp[0][j] = dp[0][j-1] + 1.0
        parent[0][j] = (0, j-1, "skip_trans")
        
    for i in range(1, n + 1):
        orig_w = original_words[i-1].lower().strip(".,!?\\"'`”“_-;:*()[]{{}}<>")
        for j in range(1, m + 1):
            trans_w = transcribed_words[j-1]["word"].lower().strip(".,!?\\"'`”“_-;:*()[]{{}}<>")
            
            match_cost = 0.0 if orig_w == trans_w else 1.0
            cost_match = dp[i-1][j-1] + match_cost
            cost_skip_orig = dp[i-1][j] + 1.0
            cost_skip_trans = dp[i][j-1] + 1.0
            
            min_cost = min(cost_match, cost_skip_orig, cost_skip_trans)
            dp[i][j] = min_cost
            
            if min_cost == cost_match:
                parent[i][j] = (i-1, j-1, "match")
            elif min_cost == cost_skip_orig:
                parent[i][j] = (i-1, j, "skip_orig")
            else:
                parent[i][j] = (i, j-1, "skip_trans")
                
    i, j = n, m
    matches = dict()
    while i > 0 or j > 0:
        p = parent[i][j]
        if p is None:
            break
        pi, pj, op = p
        if op == "match":
            matches[pi] = pj
        i, j = pi, pj
        
    aligned = []
    matched_times = []
    for idx in range(n):
        if idx in matches:
            t_word = transcribed_words[matches[idx]]
            start = max(0.0, min(t_word["start"], audio_duration))
            end = max(start, min(t_word["end"], audio_duration))
            matched_times.append((idx, start, end))
            
    if not matched_times:
        return None
        
    first_matched_idx, first_start, first_end = matched_times[0]
    last_matched_idx, last_start, last_end = matched_times[-1]
    
    matched_lookup = dict()
    for idx, start, end in matched_times:
        matched_lookup[idx] = (start, end)
        
    for idx in range(n):
        if idx in matched_lookup:
            start, end = matched_lookup[idx]
            aligned.append(dict(
                word=original_words[idx],
                start=round(start, 3),
                end=round(end, 3)
            ))
        elif idx < first_matched_idx:
            word_dur = first_start / first_matched_idx if first_matched_idx > 0 else 0.3
            start = idx * word_dur
            end = start + word_dur
            aligned.append(dict(
                word=original_words[idx],
                start=round(start, 3),
                end=round(end, 3)
            ))
        elif idx > last_matched_idx:
            rem_words = n - 1 - last_matched_idx
            word_dur = (audio_duration - last_end) / rem_words if rem_words > 0 else 0.3
            pos = idx - last_matched_idx - 1
            start = last_end + pos * word_dur
            end = start + word_dur
            aligned.append(dict(
                word=original_words[idx],
                start=round(start, 3),
                end=round(end, 3)
            ))
        else:
            pre_idx = -1
            pre_start = 0.0
            pre_end = 0.0
            for o_idx, start, end in matched_times:
                if o_idx < idx:
                    pre_idx = o_idx
                    pre_start = start
                    pre_end = end
                else:
                    break
                    
            succ_idx = -1
            succ_start = 0.0
            succ_end = 0.0
            for o_idx, start, end in matched_times:
                if o_idx > idx:
                    succ_idx = o_idx
                    succ_start = start
                    succ_end = end
                    break
                    
            gap_words_count = succ_idx - pre_idx - 1
            gap_duration = succ_start - pre_end
            word_dur = gap_duration / (gap_words_count + 1)
            pos = idx - pre_idx - 1
            start = pre_end + pos * word_dur
            end = start + word_dur
            
            aligned.append(dict(
                word=original_words[idx],
                start=round(start, 3),
                end=round(end, 3)
            ))
            
    return aligned

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
            log(f"Processing job {{job_id}} ({{job_type}})")

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

                # Build generate arguments
                generate_args = {{
                    "text": job["text"]
                }}
                
                if job_type == "clone_voice":
                    generate_args["ref_audio"] = local_ref_path
                    if job.get("ref_text"):
                        generate_args["ref_text"] = job["ref_text"]
                elif job_type in ["voice_design_preview", "voice_design_tts"]:
                    generate_args["instruct"] = job.get("instruct")
                elif job_type != "auto_voice":
                    raise Exception(f"Unknown job type: {{job_type}}")
                
                # Check for optional OmniVoice parameters in job payload
                optional_keys = [
                    "num_step", "denoise", "guidance_scale", "t_shift",
                    "position_temperature", "class_temperature", "layer_penalty_factor",
                    "duration", "speed", "preprocess_prompt", "postprocess_output",
                    "audio_chunk_duration", "audio_chunk_threshold"
                ]
                for key in optional_keys:
                    if key in job and job[key] is not None:
                        generate_args[key] = job[key]

                log(f"Calling model.generate with arguments: {{list(generate_args.keys())}}")
                audio_result = model.generate(**generate_args)

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
                
                sf.write(local_out_path, audio_result[0], 24000, format='WAV', subtype='PCM_16')
                log(f"Generated audio saved to {{local_out_path}}")

                # Generate word alignments
                alignment_str = None
                if job.get("with_alignment"):
                    log("Generating word alignment...")
                    alignment_list = None
                    try:
                        log("Attempting precise word alignment using faster-whisper...")
                        w_model = get_whisper_model()
                        log(f"Transcribing audio {{local_out_path}} with word timestamps...")
                        
                        # Dynamic language detection
                        job_text = job.get("text") or ""
                        vi_chars = set("áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđ")
                        is_vi = any(c in vi_chars for c in job_text.lower())
                        lang = "vi" if is_vi else None
                        log(f"Language detection: is_vi={{is_vi}}, using language_param={{lang}}")
                        
                        duration_sec = len(audio_result[0]) / 24000.0
                        
                        segments, info = w_model.transcribe(
                            local_out_path, 
                            word_timestamps=True,
                            language=lang
                        )
                        
                        transcribed_words = []
                        for segment in segments:
                            if segment.words:
                                for w in segment.words:
                                    transcribed_words.append(dict(
                                        word=w.word.strip(),
                                        start=w.start,
                                        end=w.end
                                    ))
                        
                        log(f"Whisper transcribed {{len(transcribed_words)}} words.")
                        
                        original_words = job_text.split()
                        if original_words and transcribed_words:
                            alignment_list = align_words(original_words, transcribed_words, duration_sec)
                            if alignment_list:
                                log(f"Successfully aligned {{len(alignment_list)}} original words with Whisper timestamps.")
                    except Exception as whisper_err:
                        log(f"Warning: Precise alignment failed: {{whisper_err}}. Falling back to proportional spacing.")
                        import traceback
                        log(traceback.format_exc())
                        
                    # Fallback to proportional spacing
                    if not alignment_list:
                        words = (job.get("text") or "").split()
                        if words:
                            duration_sec = len(audio_result[0]) / 24000.0
                            word_dur = duration_sec / len(words)
                            alignment_list = []
                            curr_time = 0.0
                            for w in words:
                                clean_w = w.strip(".,!?\\"'")
                                alignment_list.append(dict(
                                    word=clean_w,
                                    start=round(curr_time, 3),
                                    end=round(curr_time + word_dur, 3)
                                ))
                                curr_time += word_dur
                                
                    if alignment_list:
                        import json
                        alignment_str = json.dumps(alignment_list)
                        log(f"Generated alignment data: {{len(alignment_list)}} words")

                # Upload output WAV along with any alignment data
                data_payload = {{}}
                if alignment_str:
                    data_payload["alignment"] = alignment_str

                with open(local_out_path, "rb") as out_file:
                    files = {{"file": (f"{{job_id}}.wav", out_file, "audio/wav")}}
                    upload_res = make_request(
                        "POST", 
                        f"/v1/internal/jobs/{{job_id}}/output", 
                        files=files,
                        data=data_payload
                    )
                    
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
            # Fallback values for job parameters
            job_params = {
                "id": "test_push",
                "job_type": "auto_voice",
                "text": "Xin chào, đây là bản thử nghiệm đẩy kết nối Kaggle.",
                "ref_text": None,
                "instruct": None,
                "voice_sample_id": None,
                "speed": 1.0,
                "num_step": 32,
                "denoise": True,
                "guidance_scale": 2.0,
                "t_shift": 0.1,
                "position_temperature": 5.0,
                "class_temperature": 0.0,
                "layer_penalty_factor": 5.0,
                "duration": None,
                "preprocess_prompt": True,
                "postprocess_output": True,
                "audio_chunk_duration": 15.0,
                "audio_chunk_threshold": 30.0
            }

            if job:
                if isinstance(job, dict):
                    for k in job_params.keys():
                        if k in job:
                            job_params[k] = job[k]
                else:
                    for k in job_params.keys():
                        attr_val = getattr(job, k if k != "id" else "id", None)
                        if attr_val is not None:
                            job_params[k] = attr_val

            job_id = job_params["id"]
            job_type = job_params["job_type"]
            text = job_params["text"]
            ref_text = job_params["ref_text"]
            instruct = job_params["instruct"]
            voice_sample_id = job_params["voice_sample_id"]
            speed = job_params["speed"]
            num_step = job_params["num_step"]
            denoise = job_params["denoise"]
            guidance_scale = job_params["guidance_scale"]
            t_shift = job_params["t_shift"]
            position_temperature = job_params["position_temperature"]
            class_temperature = job_params["class_temperature"]
            layer_penalty_factor = job_params["layer_penalty_factor"]
            duration = job_params["duration"]
            preprocess_prompt = job_params["preprocess_prompt"]
            postprocess_output = job_params["postprocess_output"]
            audio_chunk_duration = job_params["audio_chunk_duration"]
            audio_chunk_threshold = job_params["audio_chunk_threshold"]

            ref_audio_url = None
            if voice_sample_id:
                base_url = public_api_url or settings.PUBLIC_API_BASE_URL
                ref_audio_url = f"{base_url.rstrip('/')}/v1/internal/files/voice-samples/{voice_sample_id}"

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
os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "0"
os.environ["HF_HUB_DISABLE_XET"] = "1"
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
        import faster_whisper
    except ImportError:
        missing.append("faster-whisper")
        
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
DENOISE = {denoise}
GUIDANCE_SCALE = {guidance_scale}
T_SHIFT = {t_shift}
POSITION_TEMPERATURE = {position_temperature}
CLASS_TEMPERATURE = {class_temperature}
LAYER_PENALTY_FACTOR = {layer_penalty_factor}
DURATION = {duration}
PREPROCESS_PROMPT = {preprocess_prompt}
POSTPROCESS_OUTPUT = {postprocess_output}
AUDIO_CHUNK_DURATION = {audio_chunk_duration}
AUDIO_CHUNK_THRESHOLD = {audio_chunk_threshold}
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
        generate_args = {{
            "text": TEXT
        }}
        
        if JOB_TYPE == "clone_voice":
            if not local_ref_path:
                raise Exception("Missing reference audio path for clone_voice")
            print(f"Generating voice cloning for: {{TEXT}}")
            generate_args["ref_audio"] = local_ref_path
            if REF_TEXT:
                generate_args["ref_text"] = REF_TEXT
        elif JOB_TYPE in ["voice_design_preview", "voice_design_tts"]:
            print(f"Generating voice design for: {{TEXT}} with instruct: {{INSTRUCT}}")
            generate_args["instruct"] = INSTRUCT
        elif JOB_TYPE == "auto_voice":
            print(f"Generating auto voice for: {{TEXT}}")
        else:
            raise Exception(f"Unknown job type: {{JOB_TYPE}}")

        # Add optional parameter inputs if they are not None
        params_map = {{
            "num_step": NUM_STEP,
            "denoise": DENOISE,
            "guidance_scale": GUIDANCE_SCALE,
            "t_shift": T_SHIFT,
            "position_temperature": POSITION_TEMPERATURE,
            "class_temperature": CLASS_TEMPERATURE,
            "layer_penalty_factor": LAYER_PENALTY_FACTOR,
            "duration": DURATION,
            "speed": SPEED,
            "preprocess_prompt": PREPROCESS_PROMPT,
            "postprocess_output": POSTPROCESS_OUTPUT,
            "audio_chunk_duration": AUDIO_CHUNK_DURATION,
            "audio_chunk_threshold": AUDIO_CHUNK_THRESHOLD
        }}
        for key, val in params_map.items():
            if val is not None:
                generate_args[key] = val

        print(f"Calling model.generate with arguments: {{list(generate_args.keys())}}")
        audio_result = model.generate(**generate_args)

        # Save to output.wav in the current directory (which is /kaggle/working/ output folder)
        output_filename = "output.wav"
        sf.write(output_filename, audio_result[0], 24000, format='WAV', subtype='PCM_16')
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
        KaggleNotebookBuilder.generate_worker_code(worker_dir_abs, job, public_api_url, worker_token, is_daemon=is_daemon, db=db)
        
        return worker_dir_abs
