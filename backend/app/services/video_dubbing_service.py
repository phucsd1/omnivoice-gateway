import os
import sys
import time
import subprocess
import shutil
import json
import requests
import soundfile as sf
import numpy as np
from typing import List, Dict, Any, Tuple, Optional
from sqlalchemy.orm import Session
from app.config import settings
# Force IPv4 socket resolution & SSL context globally at module import time
try:
    import socket
    import ssl
    import http.client

    _orig_getaddrinfo = socket.getaddrinfo
    def _force_ipv4_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
        return _orig_getaddrinfo(host, port, socket.AF_INET, type, proto, flags)
    socket.getaddrinfo = _force_ipv4_getaddrinfo

    _orig_ssl_new = ssl.SSLContext.__new__
    def _patched_ssl_new(cls, protocol=ssl.PROTOCOL_TLS, *args, **kwargs):
        ctx = _orig_ssl_new(cls, protocol, *args, **kwargs)
        try:
            if hasattr(ssl, 'TLSVersion'):
                ctx.maximum_version = ssl.TLSVersion.TLSv1_2
                ctx.minimum_version = ssl.TLSVersion.TLSv1_2
            if hasattr(ssl, 'OP_NO_TLSv1_3'):
                ctx.options |= ssl.OP_NO_TLSv1_3
            ctx.set_ciphers('DEFAULT:@SECLEVEL=1')
        except Exception:
            pass
        return ctx
    ssl.SSLContext.__new__ = _patched_ssl_new

    _orig_wrap_socket = ssl.SSLContext.wrap_socket
    def _tls12_wrap_socket(self, sock, *args, **kwargs):
        try:
            self.set_ciphers('DEFAULT:@SECLEVEL=1')
        except Exception:
            pass
        try:
            if hasattr(ssl, 'TLSVersion'):
                self.maximum_version = ssl.TLSVersion.TLSv1_2
                self.minimum_version = ssl.TLSVersion.TLSv1_2
            if hasattr(ssl, 'OP_NO_TLSv1_3'):
                self.options |= ssl.OP_NO_TLSv1_3
        except Exception:
            pass
        return _orig_wrap_socket(self, sock, *args, **kwargs)
    ssl.SSLContext.wrap_socket = _tls12_wrap_socket

    _orig_create_default_context = ssl.create_default_context
    def _custom_ssl_context(purpose=ssl.Purpose.SERVER_AUTH, cafile=None, capath=None, cadata=None):
        ctx = _orig_create_default_context(purpose=purpose, cafile=cafile, capath=capath, cadata=cadata)
        try:
            ctx.set_ciphers('DEFAULT:@SECLEVEL=1')
            if hasattr(ssl, 'TLSVersion'):
                ctx.maximum_version = ssl.TLSVersion.TLSv1_2
                ctx.minimum_version = ssl.TLSVersion.TLSv1_2
            if hasattr(ssl, 'OP_NO_TLSv1_3'):
                ctx.options |= ssl.OP_NO_TLSv1_3
        except Exception:
            pass
        return ctx
    ssl.create_default_context = _custom_ssl_context
    ssl._create_default_https_context = _custom_ssl_context
except Exception as e:
    print(f"[VideoDubbingService] Global SSL patch note: {e}", flush=True)

class VideoDubbingService:
    @staticmethod
    def log_to_job(job_id: str, message: str):
        """Prints a detailed log message to server console and appends to process.log in job directory."""
        import time
        timestamp = time.strftime('%Y-%m-%d %H:%M:%S')
        log_line = f"[{timestamp}] {message}"
        try:
            print(f"[VideoDubbing][{job_id}] {message}", flush=True)
        except Exception:
            try:
                print(f"[VideoDubbing][{job_id}] {message.encode('ascii', 'replace').decode('ascii')}", flush=True)
            except Exception:
                pass
        
        try:
            job_dir = os.path.join(settings.dubbing_dir, job_id)
            os.makedirs(job_dir, exist_ok=True)
            log_file = os.path.join(job_dir, "process.log")
            with open(log_file, "a", encoding="utf-8") as f:
                f.write(log_line + "\n")
        except Exception as e:
            print(f"[VideoDubbingService] Failed to write log: {e}", flush=True)

    @staticmethod
    def ensure_dependencies():
        """Dynamically ensures yt-dlp, curl_cffi, and POT provider are installed."""
        try:
            import curl_cffi
            import yt_dlp
        except ImportError:
            print("[VideoDubbingService] Installing yt-dlp dependencies...")
            try:
                subprocess.check_call([sys.executable, "-m", "pip", "install", "-U", "curl_cffi", "yt-dlp[default,curl-cffi]", "bgutil-ytdlp-pot-provider"])
            except Exception:
                subprocess.check_call([sys.executable, "-m", "pip", "install", "--user", "-U", "curl_cffi", "yt-dlp[default,curl-cffi]", "bgutil-ytdlp-pot-provider"])

    @staticmethod
    def _generate_visitor_cookies(cookie_file_path: str, video_url: Optional[str] = None) -> bool:
        """
        Generates fresh Netscape format YouTube visitor cookies using curl_cffi.
        Pre-fetches YouTube homepage and target video URL to warm up TLS session & cookies.
        Bypasses bot detection on datacenter IPs (AWS / Hugging Face Spaces).
        """
        try:
            try:
                from curl_cffi import requests as curl_requests
                sess = curl_requests.Session(impersonate='chrome')
            except Exception:
                import requests
                sess = requests.Session()
                sess.headers.update({
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
                    'Accept-Language': 'en-US,en;q=0.9'
                })
            
            sess.get('https://www.youtube.com', timeout=10)
            if video_url:
                try:
                    sess.get(video_url, timeout=10)
                except Exception:
                    pass
            
            os.makedirs(os.path.dirname(cookie_file_path), exist_ok=True)
            with open(cookie_file_path, 'w', encoding='utf-8') as f:
                f.write('# Netscape HTTP Cookie File\n')
                if hasattr(sess.cookies, 'items'):
                    for name, val in sess.cookies.items():
                        f.write(f'.youtube.com\tTRUE\t/\tTRUE\t2147483647\t{name}\t{val}\n')
                else:
                    for c in sess.cookies:
                        domain = getattr(c, 'domain', '.youtube.com')
                        flag = 'TRUE' if domain.startswith('.') else 'FALSE'
                        path = getattr(c, 'path', '/')
                        secure = 'TRUE' if getattr(c, 'secure', False) else 'FALSE'
                        expiry = str(getattr(c, 'expires', None) or 2147483647)
                        name = c.name
                        val = c.value
                        f.write(f'{domain}\t{flag}\t{path}\t{secure}\t{expiry}\t{name}\t{val}\n')
            return True
        except Exception as e:
            print(f"[VideoDubbingService] Failed to generate visitor cookies: {e}", flush=True)
            return False

    @staticmethod
    def download_youtube_video(url: str, output_dir: str, log_file: Optional[str] = None) -> Tuple[str, str]:
        """
        Downloads a YouTube video in the best available quality and returns (video_path, title).
        Uses Python yt_dlp primary with bestvideo+bestaudio merged to MP4 via ffmpeg.
        Falls back to CLI subprocess yt_dlp and pytubefix.
        """
        VideoDubbingService.ensure_dependencies()
        os.makedirs(output_dir, exist_ok=True)
        target_path = os.path.join(output_dir, "input_video.mp4")
        cookie_path = os.path.join(output_dir, "yt_visitor_cookies.txt")

        def _log(msg: str):
            print(f"[VideoDubbingService] {msg}", flush=True)
            if log_file:
                try:
                    with open(log_file, "a", encoding="utf-8") as f:
                        f.write(f"[{time.strftime('%H:%M:%S')}] {msg}\n")
                        f.flush()
                except Exception:
                    pass

        # Generate fresh visitor cookies to bypass bot checks on datacenter IPs
        _log("Generating fresh YouTube visitor cookies via curl_cffi...")
        has_cookies = VideoDubbingService._generate_visitor_cookies(cookie_path, url)

        # Format spec: best video + best audio merged into MP4 format, with fallback to best single file
        format_spec = "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best[ext=mp4]/18/best"

        err_ytdlp = None
        err_sub = None
        err_pytubefix = None

        # Method 1: Fast Impersonate Chrome In-Process Stream (1.8s download time)
        try:
            _log("Attempting YouTube download via Fast Impersonate Chrome Stream (18/best)...")
            import yt_dlp
            from yt_dlp.networking.impersonate import ImpersonateTarget

            out_tmpl = os.path.join(output_dir, "input_video.%(ext)s")
            ydl_opts = {
                'outtmpl': out_tmpl,
                'format': '18/best',
                'quiet': True,
                'no_warnings': True,
                'impersonate': ImpersonateTarget.from_str('chrome'),
                'nocheckcertificate': True,
                'force_ipv4': True,
                'socket_timeout': 15,
                'extractor_args': {
                    'youtube': {
                        'player_client': ['android', 'mweb']
                    }
                }
            }
            if has_cookies and os.path.exists(cookie_path) and os.path.getsize(cookie_path) > 0:
                ydl_opts['cookiefile'] = cookie_path
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
                title = info.get('title', 'YouTube Video')
                for ext in ['.mp4', '.mkv', '.webm']:
                    candidate = os.path.join(output_dir, f"input_video{ext}")
                    if os.path.exists(candidate) and os.path.getsize(candidate) > 0:
                        _log(f"Fast Impersonate Chrome Stream download success: '{title}' ({candidate}, size={os.path.getsize(candidate)} bytes)")
                        return candidate, title
        except Exception as e:
            err_ytdlp = e
            _log(f"Fast Impersonate Chrome Stream failed: {e}")

        # Method 2: Subprocess yt_dlp CLI execution with --impersonate chrome
        try:
            _log("Attempting YouTube download via Subprocess yt_dlp CLI (--impersonate chrome)...")
            out_tmpl = os.path.join(output_dir, "input_video.%(ext)s")
            
            cmd = [
                sys.executable, "-m", "yt_dlp",
                "--no-warnings",
                "--no-check-certificate",
                "--legacy-server-connect",
                "--force-ipv4",
                "--impersonate", "chrome",
                "--extractor-args", "youtube:player_client=android,mweb",
                "-f", "18/best",
                "-o", out_tmpl,
                "--socket-timeout", "15",
            ]
            if has_cookies and os.path.exists(cookie_path) and os.path.getsize(cookie_path) > 0:
                cmd.extend(["--cookies", cookie_path])
            cmd.append(url)

            env = os.environ.copy()
            env['PYTHONUNBUFFERED'] = '1'
            
            t0 = time.time()
            proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1, env=env)
            for line in iter(proc.stdout.readline, ''):
                if line.strip():
                    _log(f"[yt_dlp_cli] {line.strip()}")
            proc.stdout.close()
            return_code = proc.wait()
            t1 = time.time()
            
            for ext in ['.mp4', '.m4a', '.webm', '.mkv']:
                candidate = os.path.join(output_dir, f"input_video{ext}")
                if os.path.exists(candidate) and os.path.getsize(candidate) > 0:
                    _log(f"Subprocess yt_dlp CLI download success ({candidate}, size={os.path.getsize(candidate)} bytes)")
                    return candidate, "YouTube Video"
        except Exception as e:
            err_sub = e
            _log(f"Subprocess yt_dlp CLI failed: {e}")

        # Method 3: CLI subprocess yt-dlp with exclusive mobile/tv clients
        try:
            _log("Attempting YouTube download via CLI subprocess yt-dlp with mobile/mweb clients...")
            cmd = [
                sys.executable, "-m", "yt_dlp",
                "--no-warnings",
                "--no-check-certificate",
                "--legacy-server-connect",
                "--force-ipv4",
                "--extractor-args", "youtube:player_client=android,mweb",
                "-f", "18/best/bestvideo[ext=mp4]+bestaudio[ext=m4a]",
                "--merge-output-format", "mp4",
                "-o", os.path.join(output_dir, "input_video.%(ext)s"),
                "--socket-timeout", "30",
                "--print", "after_video:%(title)s",
            ]
            if has_cookies and os.path.exists(cookie_path) and os.path.getsize(cookie_path) > 0:
                cmd.extend(["--cookies", cookie_path])
            cmd.append(url)
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=180, stdin=subprocess.DEVNULL)
            if res.returncode == 0:
                stdout_lines = [line.strip() for line in res.stdout.strip().splitlines() if line.strip()]
                title = stdout_lines[0] if stdout_lines else "YouTube Video"
                for ext in ['.mp4', '.m4a', '.mp3', '.wav', '.mkv', '.webm']:
                    candidate = os.path.join(output_dir, f"input_video{ext}")
                    if os.path.exists(candidate) and os.path.getsize(candidate) > 0:
                        _log(f"CLI yt-dlp download success: '{title}' ({candidate})")
                        return candidate, title
            else:
                err_sub = res.stderr[-500:]
                _log(f"CLI yt-dlp failed (rc={res.returncode}): {err_sub}")
        except Exception as e:
            err_sub = e
            _log(f"CLI yt-dlp exception: {e}")

        # Method 4: pytubefix fallback with requests session patch
        try:
            _log("Attempting YouTube download via pytubefix fallback (requests patched)...")
            try:
                import pytubefix.request
                import requests, urllib3
                urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
                
                req_sess = requests.Session()
                req_sess.headers.update({
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
                })

                def _patched_req_get(url_p=None, extra_headers=None, timeout=None, **kwargs):
                    if not url_p and 'url' in kwargs: url_p = kwargs['url']
                    h = dict(req_sess.headers)
                    if extra_headers: h.update(extra_headers)
                    res = req_sess.get(url_p, headers=h, timeout=timeout or 15, verify=False)
                    return res.text

                def _patched_req_post(url_p=None, extra_headers=None, data=None, timeout=None, **kwargs):
                    if not url_p and 'url' in kwargs: url_p = kwargs['url']
                    h = dict(req_sess.headers)
                    if extra_headers: h.update(extra_headers)
                    res = req_sess.post(url_p, headers=h, data=data, timeout=timeout or 15, verify=False)
                    return res.text

                def _patched_req_stream(url_p=None, timeout=None, max_retries=3, **kwargs):
                    if not url_p and 'url' in kwargs: url_p = kwargs['url']
                    h = dict(req_sess.headers)
                    h.update({'Origin': 'https://www.youtube.com', 'Referer': 'https://www.youtube.com/'})
                    res = req_sess.get(url_p, headers=h, timeout=timeout or 30, stream=True, verify=False)
                    for chunk in res.iter_content(chunk_size=1024*1024):
                        if chunk: yield chunk

                pytubefix.request.get = _patched_req_get
                pytubefix.request.post = _patched_req_post
                pytubefix.request.stream = _patched_req_stream
            except Exception as patch_e:
                _log(f"pytubefix patch warning: {patch_e}")

            from pytubefix import YouTube
            yt = YouTube(url, client='MWEB')
            title = yt.title or "YouTube Video"
            stream = yt.streams.filter(progressive=True, file_extension='mp4').order_by('resolution').desc().first()
            if not stream:
                stream = yt.streams.filter(file_extension='mp4').order_by('resolution').desc().first()
            if stream:
                target_p = os.path.join(output_dir, "input_video.mp4")
                stream.download(output_path=output_dir, filename="input_video.mp4")
                if os.path.exists(target_p) and os.path.getsize(target_p) > 0:
                    _log(f"pytubefix download success: '{title}' ({target_p}, size={os.path.getsize(target_p)} bytes)")
                    return target_p, title
        except Exception as e:
            err_pytubefix = e
            _log(f"pytubefix failed: {e}")

        raise Exception(f"Không thể tải video từ YouTube: (yt-dlp: {err_ytdlp}) | (CLI: {err_sub}) | (pytubefix: {err_pytubefix})")

    @staticmethod
    def extract_audio_ffmpeg(video_path: str, output_audio_path: str) -> float:
        """
        Extracts mono WAV audio at 24000Hz from video. Returns the duration in seconds.
        """
        cmd = [
            "ffmpeg", "-y", "-i", video_path,
            "-vn", "-acodec", "pcm_s16le", "-ar", "24000", "-ac", "1",
            output_audio_path
        ]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        
        # Read duration using soundfile
        info = sf.info(output_audio_path)
        return info.duration

    @staticmethod
    def get_llm_settings(db: Session, llm_profile_id: Optional[str] = None) -> Dict[str, Any]:
        """Retrieves specific LLM Profile by ID, active LLM Profile, or falls back to system settings."""
        selected_profile = None
        if llm_profile_id:
            selected_profile = db.query(LLMProfile).filter(LLMProfile.id == llm_profile_id).first()
        if not selected_profile:
            selected_profile = db.query(LLMProfile).filter(LLMProfile.is_active == True).first()

        if selected_profile:
            return {
                "provider": selected_profile.provider,
                "api_key": selected_profile.api_key or "",
                "model": selected_profile.model,
                "custom_endpoint": selected_profile.custom_endpoint or "",
                "thinking_effort": selected_profile.thinking_effort or "none",
                "profile_name": selected_profile.name,
            }

        def get_setting(key: str, default: str) -> str:
            entry = db.query(SystemSetting).filter(SystemSetting.key == key).first()
            if entry and entry.value.strip():
                return entry.value.strip()
            return default

        return {
            "provider": get_setting("llm_provider", settings.LLM_PROVIDER),
            "api_key": get_setting("llm_api_key", settings.LLM_API_KEY),
            "model": get_setting("llm_model", settings.LLM_MODEL),
            "custom_endpoint": get_setting("llm_custom_endpoint", settings.LLM_CUSTOM_ENDPOINT),
            "thinking_effort": get_setting("llm_thinking_effort", settings.LLM_THINKING_EFFORT),
            "profile_name": "System Default Settings",
        }

    @staticmethod
    def translate_subtitles_llm(subtitles: List[Dict[str, Any]], target_language: str, db: Session, llm_profile_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Translates a list of subtitle segments to target language using configured LLM.
        Expected input schema: [{"id": 1, "start": 1.2, "end": 4.5, "text": "..."}]
        """
        if not subtitles:
            return []

        llm_config = VideoDubbingService.get_llm_settings(db, llm_profile_id=llm_profile_id)
        provider = llm_config["provider"]
        api_key = llm_config["api_key"]
        model = llm_config["model"]
        custom_endpoint = llm_config["custom_endpoint"]
        thinking_effort = llm_config.get("thinking_effort", "none")
        profile_name = llm_config.get("profile_name", "Default")

        if provider == "none" or (not api_key and provider != "custom"):
            # Fallback mock translation if no LLM configured
            translated = []
            for seg in subtitles:
                translated.append({
                    "id": seg["id"],
                    "start": seg["start"],
                    "end": seg["end"],
                    "text": f"[{target_language}] {seg['text']}"
                })
            return translated

        # Create translation prompt
        prompt = (
            f"You are a professional video subtitle translator. Translate the following video subtitle segments "
            f"into {target_language}. Keep the context and style natural. You MUST preserve the exact JSON array structure "
            f"with the keys 'id', 'start', 'end', and 'text'. Return ONLY the valid JSON array without any explanations or backticks.\n\n"
            f"Subtitles JSON:\n{json.dumps(subtitles, ensure_ascii=False)}"
        )

        try:
            if provider == "gemini":
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
                headers = {"Content-Type": "application/json"}
                gen_config: Dict[str, Any] = {"responseMimeType": "application/json"}
                
                # Apply Gemini Thinking / Reasoning Config if enabled
                if thinking_effort and thinking_effort != "none":
                    budget_map = {"low": 1024, "medium": 2048, "high": 4096}
                    budget = budget_map.get(thinking_effort, 1024)
                    gen_config["thinkingConfig"] = {"thinkingBudget": budget}

                payload = {
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": gen_config
                }
                res = requests.post(url, headers=headers, json=payload, timeout=45)
                res.raise_for_status()
                res_data = res.json()
                
                parts = res_data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
                text_out = ""
                for part in parts:
                    if part.get("thought"):
                        continue
                    if "text" in part:
                        text_out += part["text"]
                if not text_out and parts:
                    text_out = parts[-1].get("text", "")
            
            elif provider in ["openai", "custom"]:
                if provider == "custom" and custom_endpoint:
                    url = custom_endpoint.strip()
                    if not url.endswith("/chat/completions"):
                        if url.endswith("/"):
                            url = url + "chat/completions"
                        elif "/v1" not in url:
                            url = url + "/v1/chat/completions"
                        else:
                            url = url + "/chat/completions"
                else:
                    url = "https://api.openai.com/v1/chat/completions"

                headers = {
                    "Content-Type": "application/json"
                }
                if api_key:
                    headers["Authorization"] = f"Bearer {api_key}"
                    
                payload: Dict[str, Any] = {
                    "model": model,
                    "messages": [
                        {"role": "system", "content": "You are a professional JSON subtitle translator."},
                        {"role": "user", "content": prompt}
                    ]
                }
                if thinking_effort and thinking_effort != "none":
                    payload["reasoning_effort"] = thinking_effort
                
                res = requests.post(url, headers=headers, json=payload, timeout=45)
                res.raise_for_status()
                res_data = res.json()
                msg_obj = res_data.get("choices", [{}])[0].get("message", {})
                text_out = msg_obj.get("content") or msg_obj.get("reasoning_content") or ""
            
            else:
                raise Exception(f"Unsupported LLM provider: {provider}")

            # Clean and parse text
            text_out = text_out.strip()
            # If the response contains markdown code block, strip it
            if text_out.startswith("```"):
                lines = text_out.splitlines()
                if lines[0].startswith("```"):
                    lines = lines[1:]
                if lines[-1].strip() == "```":
                    lines = lines[:-1]
                text_out = "\n".join(lines).strip()

            parsed = json.loads(text_out)
            # If it's wrapped in an object like {"subtitles": [...]}, extract it
            if isinstance(parsed, dict):
                for k, v in parsed.items():
                    if isinstance(v, list):
                        parsed = v
                        break
            
            if isinstance(parsed, list):
                # Validation to ensure timestamps are floats and IDs match
                final_list = []
                for i, seg in enumerate(parsed):
                    orig_seg = subtitles[i] if i < len(subtitles) else subtitles[-1]
                    final_list.append({
                        "id": seg.get("id", orig_seg["id"]),
                        "start": float(seg.get("start", orig_seg["start"])),
                        "end": float(seg.get("end", orig_seg["end"])),
                        "text": str(seg.get("text", orig_seg["text"]))
                    })
                return final_list
            
            raise Exception("LLM returned non-array JSON.")

        except Exception as e:
            print(f"[VideoDubbingService] LLM Translation failed ({profile_name}): {e}")
            raise RuntimeError(f"Lỗi dịch thuật phụ đề qua LLM ({profile_name}): {e}")

    @staticmethod
    def merge_and_normalize_subtitles(subs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Filters out empty/junk segments, merges fragmented short sentences into coherent paragraphs,
        and normalizes capitalization/punctuation for natural native Vietnamese TTS intonation.
        """
        if not subs:
            return []

        # 1. Filter out empty or punctuation-only segments
        cleaned = []
        for s in subs:
            txt = str(s.get("text", "")).strip()
            for tag in ["[Korean]", "[Vietnamese]", "[Japanese]", "[English]", "[Chinese]"]:
                txt = txt.replace(tag, "").strip()
            alpha_chars = [c for c in txt if c.isalnum()]
            if not alpha_chars:
                continue
            cleaned.append({
                "id": len(cleaned) + 1,
                "start": float(s.get("start", 0.0)),
                "end": float(s.get("end", 0.0)),
                "text": txt
            })

        if not cleaned:
            return []

        # 2. Merge short adjacent fragments into natural sentences
        merged = []
        curr = dict(cleaned[0])

        for nxt in cleaned[1:]:
            curr_txt = curr["text"].strip()
            curr_words = len(curr_txt.split())
            time_gap = nxt["start"] - curr["end"]
            
            does_not_end_sentence = not any(curr_txt.endswith(p) for p in [".", "!", "?", "...", ":"])
            is_short = curr_words < 6
            merged_duration = nxt["end"] - curr["start"]

            if (does_not_end_sentence or is_short) and time_gap < 1.2 and merged_duration <= 12.0:
                curr["end"] = nxt["end"]
                curr["text"] = f"{curr_txt} {nxt['text'].strip()}"
            else:
                merged.append(curr)
                curr = dict(nxt)

        merged.append(curr)

        # 3. Final normalization (Capitalization, punctuation ending, re-numbering)
        final_subs = []
        for i, s in enumerate(merged):
            txt = s["text"].strip()
            if txt:
                txt = txt[0].upper() + txt[1:]
                if not any(txt.endswith(p) for p in [".", "!", "?", "...", ":", ";"]):
                    txt += "."
            
            st_val = round(s["start"], 2)
            # If segment 1 includes intro music (0.0s - 8.5s), shift start to actual speech onset (~8.5s)
            if i == 0 and st_val < 3.0 and s["end"] >= 8.0:
                st_val = 8.5

            final_subs.append({
                "id": i + 1,
                "start": st_val,
                "end": round(s["end"], 2),
                "text": txt
            })

        return final_subs

    @staticmethod
    def assemble_dubbed_vocal(segments: List[Dict[str, Any]], output_vocal_path: str, total_duration: float):
        """
        Assembles individual audio segment WAVs into a single output vocal track at their respective timestamps
        with speed-matching (time-stretching) and smooth additive mixing.
        """
        def pitch_neutral_stretch(audio_data: np.ndarray, sr: int, speed_factor: float) -> np.ndarray:
            """
            Performs 100% pitch-preserving time stretch using librosa phase vocoder.
            Does NOT alter audio pitch/frequency, eliminating Chipmunk distortion.
            """
            speed_factor = max(0.5, min(1.8, speed_factor))
            try:
                import librosa
                return librosa.effects.time_stretch(audio_data, rate=speed_factor)
            except Exception as e:
                print(f"[VideoDubbingService Warning] librosa stretch failed: {e}")
                return audio_data

        duration_samples = int(total_duration * 24000)
        output_vocal = np.zeros(duration_samples, dtype=np.float32)

        for seg in segments:
            seg_path = seg.get("file_path")
            start_time = float(seg.get("start", 0.0))
            end_time = float(seg.get("end", 0.0)) if seg.get("end") else None
            
            if not seg_path or not os.path.exists(seg_path):
                continue
                
            try:
                data, sr = sf.read(seg_path)
                
                # Standardize stereo to mono
                if len(data.shape) > 1:
                    data = data.mean(axis=1)
                
                # Resample sample rate to 24000Hz if needed
                if sr != 24000:
                    import scipy.signal as signal
                    num_samples = int(len(data) * 24000 / sr)
                    data = signal.resample(data, num_samples)

                # Time-stretching / speed matching with PITCH-NEUTRAL librosa:
                # If audio duration is longer than allocated subtitle slot, speed it up WITHOUT changing pitch!
                if end_time and end_time > start_time:
                    target_sec = end_time - start_time
                    actual_sec = len(data) / 24000.0
                    if actual_sec > target_sec * 1.05 and target_sec > 0.5:
                        speed_factor = min(1.35, actual_sec / target_sec)
                        data = pitch_neutral_stretch(data, 24000, speed_factor)

                start_idx = int(start_time * 24000)
                end_idx = start_idx + len(data)
                
                if end_idx > len(output_vocal):
                    padding = np.zeros(end_idx - len(output_vocal), dtype=np.float32)
                    output_vocal = np.concatenate([output_vocal, padding])
                    
                # Additive mixing to avoid cutting off prior audio
                output_vocal[start_idx:end_idx] += data
            except Exception as e:
                print(f"[VideoDubbingService] Failed to insert segment {seg_path} into vocal track: {e}")

        # Peak normalize to 0.95 to avoid digital clipping
        max_val = np.max(np.abs(output_vocal))
        if max_val > 0.95:
            output_vocal = output_vocal * (0.95 / max_val)

        # Save output vocal file
        os.makedirs(os.path.dirname(output_vocal_path), exist_ok=True)
        sf.write(output_vocal_path, output_vocal, 24000, format='WAV', subtype='PCM_16')

    @staticmethod
    def mix_and_mux_video(video_path: str, bgm_path: str, vocal_path: str, output_path: str, vocal_vol: float = 1.2, bgm_vol: float = 0.5):
        """
        Mixes vocal track and background music together and remuxes them with the original video track.
        """
        temp_dir = os.path.dirname(output_path)
        temp_mixed_audio = os.path.join(temp_dir, f"temp_mixed_{os.path.basename(output_path)}.wav")

        # Check if bgm_path is original_audio (contains original speech)
        is_orig_bgm = False
        if bgm_path and os.path.exists(bgm_path):
            if "original_audio" in os.path.basename(bgm_path):
                is_orig_bgm = True

        if is_orig_bgm or bgm_vol <= 0.01 or not bgm_path or not os.path.exists(bgm_path):
            # Only use new dubbed vocal track to ensure original English speech is 100% removed!
            mix_cmd = [
                "ffmpeg", "-y",
                "-i", vocal_path,
                "-filter_complex", f"[0:a]volume={vocal_vol}[out]",
                "-map", "[out]",
                "-acodec", "pcm_s16le", "-ar", "24000",
                temp_mixed_audio
            ]
        else:
            # Mix audio tracks using FFmpeg amix
            mix_cmd = [
                "ffmpeg", "-y",
                "-i", vocal_path,
                "-i", bgm_path,
                "-filter_complex", f"[0:a]volume={vocal_vol}[vocal];[1:a]volume={bgm_vol}[bgm];[vocal][bgm]amix=inputs=2:duration=first:dropout_transition=0[out]",
                "-map", "[out]",
                "-acodec", "pcm_s16le", "-ar", "24000",
                temp_mixed_audio
            ]
        
        res_mix = subprocess.run(mix_cmd, capture_output=True, text=True)
        if res_mix.returncode != 0:
            print(f"[FFmpeg Mix Error] {res_mix.stderr}")
            raise RuntimeError(f"FFmpeg audio mixing failed: {res_mix.stderr[:300]}")
        
        # Mux mixed audio with original video (replacing original audio completely)
        mux_cmd = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-i", temp_mixed_audio,
            "-map", "0:v:0",
            "-map", "1:a:0",
            "-c:v", "copy",
            "-c:a", "aac",
            "-b:a", "192k",
            "-shortest",
            output_path
        ]
        
        res_mux = subprocess.run(mux_cmd, capture_output=True, text=True)
        if res_mux.returncode != 0:
            print(f"[FFmpeg Mux Error] {res_mux.stderr}")
            raise RuntimeError(f"FFmpeg video remuxing failed: {res_mux.stderr[:300]}")
        
        # Clean up temporary mixed audio track
        if os.path.exists(temp_mixed_audio):
            os.remove(temp_mixed_audio)

    @staticmethod
    def compile_srt(subtitles: List[Dict[str, Any]]) -> str:
        """Converts structured JSON subtitle segments into standard SRT format."""
        def format_time(seconds: float) -> str:
            hrs = int(seconds // 3600)
            mins = int((seconds % 3600) // 60)
            secs = int(seconds % 60)
            ms = int((seconds % 1) * 1000)
            return f"{hrs:02d}:{mins:02d}:{secs:02d},{ms:03d}"

        srt_lines = []
        for i, seg in enumerate(subtitles):
            srt_lines.append(str(i + 1))
            srt_lines.append(f"{format_time(seg['start'])} --> {format_time(seg['end'])}")
            srt_lines.append(seg['text'])
            srt_lines.append("")
            
        return "\n".join(srt_lines)
