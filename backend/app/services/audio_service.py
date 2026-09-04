import os
import shutil
import soundfile as sf
from typing import Tuple, Optional
from app.config import settings

class AudioService:
    @staticmethod
    def ensure_directories():
        """Creates the storage directories if they do not exist."""
        os.makedirs(settings.uploads_dir, exist_ok=True)
        os.makedirs(settings.voice_samples_dir, exist_ok=True)
        os.makedirs(settings.previews_dir, exist_ok=True)
        os.makedirs(settings.outputs_dir, exist_ok=True)
        os.makedirs(settings.dubbing_dir, exist_ok=True)

    @staticmethod
    def process_and_save_upload(temp_file_path: str, target_filename: str) -> Tuple[str, float, int]:
        """
        Attempts to read the uploaded audio file, normalize it, and save it as a standard WAV file.
        Falls back to a simple copy if soundfile doesn't support the format on the host.
        Returns (saved_file_path, duration, sample_rate).
        """
        AudioService.ensure_directories()
        destination_path = os.path.join(settings.voice_samples_dir, target_filename)
        
        duration = 0.0
        sample_rate = 24000
        
        try:
            # Try to read with soundfile
            data, sr = sf.read(temp_file_path)
            
            # Calculate duration
            if len(data.shape) > 1:
                # Convert stereo to mono by averaging channels
                data = data.mean(axis=1)
            
            duration = float(len(data)) / float(sr)
            sample_rate = sr
            
            # Save as 24000Hz mono WAV (OmniVoice preference)
            # If the source rate matches 24000, write directly.
            # Otherwise we can write it at its original sample rate, or do a simple resample if we want.
            # For MVP, writing it back at its read rate or copying is completely fine.
            sf.write(destination_path, data, sr, format='WAV', subtype='PCM_16')
            
        except Exception as e:
            # Fallback: Simple binary copy
            print(f"[AudioService] Soundfile processing failed ({e}). Falling back to copying file directly.")
            shutil.copy2(temp_file_path, destination_path)
            
            # Try to read length from copy if possible, otherwise default values
            try:
                info = sf.info(destination_path)
                duration = info.duration
                sample_rate = info.samplerate
            except Exception:
                duration = 5.0  # mock fallback duration
                sample_rate = 24000
                
        return destination_path, duration, sample_rate

    @staticmethod
    def copy_audio_file(source_path: str, destination_path: str) -> bool:
        """Copies an audio file from source to destination."""
        try:
            AudioService.ensure_directories()
            shutil.copy2(source_path, destination_path)
            return True
        except Exception as e:
            print(f"[AudioService] Failed to copy audio file from {source_path} to {destination_path}: {e}")
            return False

    @staticmethod
    def generate_mock_wav(filepath: str, duration: float = 3.0, freq: float = 440.0, sample_rate: int = 24000):
        """Generates a simple sine wave WAV file for mock testing and fallbacks."""
        import numpy as np
        duration = max(0.1, float(duration))
        t = np.linspace(0, duration, int(sample_rate * duration), False)
        audio = 0.5 * np.sin(2 * np.pi * freq * t)
        fade_len = min(len(audio) // 4, int(sample_rate * 0.01))
        if fade_len > 0 and len(audio) > 2 * fade_len:
            audio[:fade_len] *= np.linspace(0, 1, fade_len)
            audio[-fade_len:] *= np.linspace(1, 0, fade_len)
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        sf.write(filepath, audio, sample_rate, format='WAV', subtype='PCM_16')
