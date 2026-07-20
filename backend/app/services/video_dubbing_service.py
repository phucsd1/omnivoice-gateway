import os
import sys
import subprocess
import shutil
import json
import requests
import soundfile as sf
import numpy as np
from typing import List, Dict, Any, Tuple
from sqlalchemy.orm import Session
from app.config import settings
from app.models import SystemSetting, LLMProfile

class VideoDubbingService:
    @staticmethod
    def ensure_dependencies():
        """Dynamically ensures yt-dlp is installed and up-to-date for downloading YouTube videos."""
        try:
            import yt_dlp
        except ImportError:
            print("[VideoDubbingService] Installing yt-dlp dynamically...")
            try:
                subprocess.check_call([sys.executable, "-m", "pip", "install", "-U", "-q", "yt-dlp"])
            except Exception:
                subprocess.check_call([sys.executable, "-m", "pip", "install", "--user", "-U", "-q", "yt-dlp"])

    @staticmethod
    def download_youtube_video(url: str, output_dir: str) -> Tuple[str, str]:
        """
        Downloads a YouTube video and returns (video_path, title).
        Uses pytubefix first (fast progressive MP4 stream), falls back to yt-dlp format 18.
        """
        import ssl
        import socket
        try:
            ssl._create_default_https_context = ssl._create_unverified_context
            socket.setdefaulttimeout(120)
        except Exception:
            pass

        os.makedirs(output_dir, exist_ok=True)
        target_path = os.path.join(output_dir, "input_video.mp4")

        err_ytdlp = None
        err_pytubefix = None

        # Method 1: yt-dlp (Fastest, uses android_vr player client, downloads in 2s)
        try:
            print("[VideoDubbingService] Attempting YouTube download via yt-dlp...")
            VideoDubbingService.ensure_dependencies()
            import yt_dlp
            outtmpl = os.path.join(output_dir, "input_video.%(ext)s")
            ydl_opts = {
                'format': '18/best[height<=720]/best',
                'outtmpl': outtmpl,
                'quiet': True,
                'no_warnings': True,
                'nocheckcertificate': True,
                'legacy_server_connect': True,
                'socket_timeout': 30,
                'retries': 3,
                'fragment_retries': 3,
                'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'extractor_args': {
                    'youtube': {
                        'player_client': ['android_vr', 'web_embedded', 'tv']
                    }
                }
            }
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
                video_title = info.get('title', 'YouTube Video')
                filename = ydl.prepare_filename(info)
                base, _ = os.path.splitext(filename)
                for ext in ['.mp4', '.mkv', '.webm']:
                    if os.path.exists(base + ext) and os.path.getsize(base + ext) > 0:
                        print(f"[VideoDubbingService] yt-dlp download success: {video_title}")
                        return base + ext, video_title
                if os.path.exists(filename) and os.path.getsize(filename) > 0:
                    print(f"[VideoDubbingService] yt-dlp download success: {video_title}")
                    return filename, video_title
        except Exception as e:
            err_ytdlp = e
            print(f"[VideoDubbingService] yt-dlp download failed ({e}), trying pytubefix fallback...")

        # Method 2: pytubefix fallback
        try:
            print("[VideoDubbingService] Attempting YouTube download via pytubefix fallback...")
            try:
                from pytubefix import YouTube
            except ImportError:
                subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "pytubefix"])
                from pytubefix import YouTube
            
            yt = YouTube(url)
            title = yt.title or "YouTube Video"
            stream = yt.streams.filter(progressive=True, file_extension='mp4').first()
            if not stream:
                stream = yt.streams.filter(file_extension='mp4').first()
            
            if stream:
                stream.download(output_path=output_dir, filename="input_video.mp4")
                if os.path.exists(target_path) and os.path.getsize(target_path) > 0:
                    print(f"[VideoDubbingService] pytubefix download success: {title}")
                    return target_path, title
        except Exception as e:
            err_pytubefix = e
            print(f"[VideoDubbingService] pytubefix download failed: {e}")

        raise Exception(f"Không thể tải video từ YouTube: (yt-dlp: {err_ytdlp}) | (pytubefix: {err_pytubefix})")

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
    def get_llm_settings(db: Session) -> Dict[str, Any]:
        """Retrieves active LLM Profile or falls back to system settings."""
        active_profile = db.query(LLMProfile).filter(LLMProfile.is_active == True).first()
        if active_profile:
            return {
                "provider": active_profile.provider,
                "api_key": active_profile.api_key or "",
                "model": active_profile.model,
                "custom_endpoint": active_profile.custom_endpoint or "",
                "thinking_effort": active_profile.thinking_effort or "none",
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
        }

    @staticmethod
    def translate_subtitles_llm(subtitles: List[Dict[str, Any]], target_language: str, db: Session) -> List[Dict[str, Any]]:
        """
        Translates a list of subtitle segments to target language using configured LLM.
        Expected input schema: [{"id": 1, "start": 1.2, "end": 4.5, "text": "..."}]
        """
        if not subtitles:
            return []

        llm_config = VideoDubbingService.get_llm_settings(db)
        provider = llm_config["provider"]
        api_key = llm_config["api_key"]
        model = llm_config["model"]
        custom_endpoint = llm_config["custom_endpoint"]
        thinking_effort = llm_config.get("thinking_effort", "none")

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
            print(f"[VideoDubbingService] LLM Translation failed: {e}. Falling back to mock translation.")
            # Fallback
            translated = []
            for seg in subtitles:
                translated.append({
                    "id": seg["id"],
                    "start": seg["start"],
                    "end": seg["end"],
                    "text": f"[{target_language}] {seg['text']}"
                })
            return translated

    @staticmethod
    def assemble_dubbed_vocal(segments: List[Dict[str, Any]], output_vocal_path: str, total_duration: float):
        """
        Assembles individual audio segment WAVs into a single output vocal track at their respective timestamps.
        segments schema: [{"start": 1.2, "file_path": "/path/to/segment.wav"}]
        """
        # Initialize an empty array of zeros at 24000Hz
        duration_samples = int(total_duration * 24000)
        output_vocal = np.zeros(duration_samples, dtype=np.float32)

        for seg in segments:
            seg_path = seg.get("file_path")
            start_time = seg.get("start", 0.0)
            
            if not seg_path or not os.path.exists(seg_path):
                continue
                
            try:
                data, sr = sf.read(seg_path)
                
                # Standardize stereo to mono
                if len(data.shape) > 1:
                    data = data.mean(axis=1)
                
                # Simple resampling if sample rate isn't 24000 (though worker output is 24000)
                if sr != 24000:
                    import scipy.signal as signal
                    num_samples = int(len(data) * 24000 / sr)
                    data = signal.resample(data, num_samples)

                start_idx = int(start_time * 24000)
                end_idx = start_idx + len(data)
                
                if end_idx > len(output_vocal):
                    padding = np.zeros(end_idx - len(output_vocal), dtype=np.float32)
                    output_vocal = np.concatenate([output_vocal, padding])
                    
                output_vocal[start_idx:end_idx] = data
            except Exception as e:
                print(f"[VideoDubbingService] Failed to insert segment {seg_path} into vocal track: {e}")

        # Save output vocal file
        os.makedirs(os.path.dirname(output_vocal_path), exist_ok=True)
        sf.write(output_vocal_path, output_vocal, 24000, format='WAV', subtype='PCM_16')

    @staticmethod
    def mix_and_mux_video(video_path: str, bgm_path: str, vocal_path: str, output_path: str, vocal_vol: float = 1.2, bgm_vol: float = 0.5):
        """
        Mixes vocal track and background music together and remuxes them with the original video track.
        """
        # Create a temp file for the mixed audio track
        temp_dir = os.path.dirname(output_path)
        temp_mixed_audio = os.path.join(temp_dir, f"temp_mixed_{os.path.basename(output_path)}.wav")
        
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
        
        subprocess.run(mix_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        
        # Mux mixed audio with original video
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
        
        subprocess.run(mux_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        
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
