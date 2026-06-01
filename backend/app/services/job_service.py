import os
import shutil
import soundfile as sf
from typing import Optional, List
from sqlalchemy.orm import Session
from datetime import datetime
from app.models import TTSJob, VoiceDesignPreview, VoiceSample
from app.utils.ids import generate_id
from app.config import settings
from app.services.audio_service import AudioService
from app.services.kaggle_orchestrator import KaggleOrchestrator

class JobService:
    @staticmethod
    def map_vietnamese_request_to_instruct(voice_request: str) -> str:
        """
        Maps a Vietnamese voice design description into valid OmniVoice English instruct tags.
        """
        req_lower = voice_request.lower()
        instructs = []

        # Gender
        if "nữ" in req_lower:
            instructs.append("female")
        elif "nam" in req_lower:
            instructs.append("male")

        # Age group
        if "trẻ em" in req_lower or "con nít" in req_lower or "bé" in req_lower:
            instructs.append("child")
        elif "thiếu niên" in req_lower:
            instructs.append("teenager")
        elif "trẻ" in req_lower or "thanh niên" in req_lower:
            instructs.append("young adult")
        elif "trung niên" in req_lower:
            instructs.append("middle-aged")
        elif "già" in req_lower or "lớn tuổi" in req_lower or "lão" in req_lower:
            instructs.append("elderly")

        # Pitch/Tone
        if "trầm" in req_lower or "thấp" in req_lower:
            instructs.append("low pitch")
        elif "cao" in req_lower:
            instructs.append("high pitch")
        elif "vừa" in req_lower or "bình thường" in req_lower:
            instructs.append("moderate pitch")

        # Style
        if "thì thầm" in req_lower or "nhẹ nhàng" in req_lower:
            instructs.append("whisper")

        # Fallback defaults if empty
        if not instructs:
            instructs = ["female", "young adult"]

        return ", ".join(instructs)

    @staticmethod
    def create_voice_design_preview(
        db: Session,
        voice_request: str,
        preview_text: str,
        public_api_url: str = None,
        speed: float = 1.0,
        num_step: int = 32,
        user_id: str = None,
        denoise: bool = True,
        guidance_scale: float = 2.0,
        t_shift: float = 0.1,
        position_temperature: float = 5.0,
        class_temperature: float = 0.0,
        layer_penalty_factor: float = 5.0,
        duration: float = None,
        preprocess_prompt: bool = True,
        postprocess_output: bool = True,
        audio_chunk_duration: float = 15.0,
        audio_chunk_threshold: float = 30.0
    ) -> tuple[VoiceDesignPreview, TTSJob]:
        """Creates a VoiceDesignPreview entry and triggers a background preview TTS job."""
        preview_id = generate_id("vd")
        job_id = generate_id("job")
        
        instruct = JobService.map_vietnamese_request_to_instruct(voice_request)

        # Create VoiceDesignPreview
        db_preview = VoiceDesignPreview(
            id=preview_id,
            user_id=user_id,
            voice_request=voice_request,
            instruct=instruct,
            preview_text=preview_text,
            status="queued"
        )
        db.add(db_preview)

        # Create TTSJob
        db_job = TTSJob(
            id=job_id,
            user_id=user_id,
            job_type="voice_design_preview",
            text=preview_text,
            preview_id=preview_id,
            instruct=instruct,
            speed=speed,
            num_step=num_step,
            denoise=denoise,
            guidance_scale=guidance_scale,
            t_shift=t_shift,
            position_temperature=position_temperature,
            class_temperature=class_temperature,
            layer_penalty_factor=layer_penalty_factor,
            duration=duration,
            preprocess_prompt=preprocess_prompt,
            postprocess_output=postprocess_output,
            audio_chunk_duration=audio_chunk_duration,
            audio_chunk_threshold=audio_chunk_threshold,
            status="queued",
            message="Đã nhận yêu cầu thiết kế giọng."
        )
        db.add(db_job)
        db.commit()
        db.refresh(db_preview)
        db.refresh(db_job)

        return db_preview, db_job

    @staticmethod
    def create_tts_job(
        db: Session,
        mode: str,
        text: str,
        voice_sample_id: str = None,
        instruct: str = None,
        public_api_url: str = None,
        speed: float = 1.0,
        num_step: int = 32,
        user_id: str = None,
        denoise: bool = True,
        guidance_scale: float = 2.0,
        t_shift: float = 0.1,
        position_temperature: float = 5.0,
        class_temperature: float = 0.0,
        layer_penalty_factor: float = 5.0,
        duration: float = None,
        preprocess_prompt: bool = True,
        postprocess_output: bool = True,
        audio_chunk_duration: float = 15.0,
        audio_chunk_threshold: float = 30.0,
        ref_text: str = None,
        with_alignment: bool = False
    ) -> TTSJob:
        """Creates a TTS job based on the chosen mode (clone_voice, auto_voice, voice_design)."""
        job_id = generate_id("job")
        
        ref_audio_path = None
        ref_text_val = None
        job_type = mode

        if mode == "clone_voice":
            if not voice_sample_id:
                raise ValueError("voice_sample_id là bắt buộc trong mode clone_voice")
            
            sample = db.query(VoiceSample).filter(VoiceSample.id == voice_sample_id).first()
            if not sample:
                raise ValueError(f"Không tìm thấy Voice Sample với ID {voice_sample_id}")
            
            ref_audio_path = sample.file_path
            ref_text_val = ref_text if ref_text is not None else sample.ref_text
        elif mode == "auto_voice":
            job_type = "auto_voice"
        elif mode == "voice_design":
            job_type = "voice_design_tts"
            if not instruct:
                instruct = "female, young adult"
        else:
            raise ValueError(f"Chế độ TTS không hợp lệ: {mode}")

        db_job = TTSJob(
            id=job_id,
            user_id=user_id,
            job_type=job_type,
            text=text,
            voice_sample_id=voice_sample_id,
            instruct=instruct,
            ref_audio_path=ref_audio_path,
            ref_text=ref_text_val,
            speed=speed,
            num_step=num_step,
            denoise=denoise,
            guidance_scale=guidance_scale,
            t_shift=t_shift,
            position_temperature=position_temperature,
            class_temperature=class_temperature,
            layer_penalty_factor=layer_penalty_factor,
            duration=duration,
            preprocess_prompt=preprocess_prompt,
            postprocess_output=postprocess_output,
            audio_chunk_duration=audio_chunk_duration,
            audio_chunk_threshold=audio_chunk_threshold,
            with_alignment=with_alignment,
            status="queued",
            message="Đã nhận yêu cầu. Đang chuẩn bị đầu vào..."
        )
        db.add(db_job)
        db.commit()
        db.refresh(db_job)

        return db_job

    @staticmethod
    def get_next_job(db: Session, worker_id: str, user_id: str = None) -> Optional[TTSJob]:
        """Locks the oldest queued job for the requested worker and updates status to preparing_input."""
        # Find queued or starting_worker status jobs
        query = db.query(TTSJob).filter(
            TTSJob.status.in_(["queued", "starting_worker"])
        )
        if user_id:
            query = query.filter(TTSJob.user_id == user_id)
            
        job = query.order_by(TTSJob.created_at.asc()).first()

        if not job:
            return None

        # Lock the job
        job.status = "preparing_input"
        job.worker_id = worker_id
        job.message = "Đang chuẩn bị dữ liệu đầu vào trên Worker..."
        db.commit()
        db.refresh(job)
        return job

    @staticmethod
    def update_job_status(db: Session, job_id: str, status: str, message: str = None, progress: int = 0, error_message: str = None) -> TTSJob:
        """Updates a job's status parameters, synchronizing it with previews if applicable."""
        job = db.query(TTSJob).filter(TTSJob.id == job_id).first()
        if not job:
            raise ValueError(f"Không tìm thấy Job {job_id}")

        job.status = status
        if message:
            job.message = message
        job.progress = progress
        if error_message:
            job.error_message = error_message
        
        # Sync preview status if it's a preview job
        if job.job_type == "voice_design_preview" and job.preview_id:
            preview = db.query(VoiceDesignPreview).filter(VoiceDesignPreview.id == job.preview_id).first()
            if preview:
                if status == "failed":
                    preview.status = "failed"
                elif status == "completed":
                    preview.status = "completed"
                else:
                    preview.status = "processing"

        db.commit()
        db.refresh(job)
        return job

    @staticmethod
    def complete_job_output(db: Session, job_id: str, local_output_path: str, alignment: Optional[str] = None) -> TTSJob:
        """Completes a job, persists output paths, and handles target conversions."""
        job = db.query(TTSJob).filter(TTSJob.id == job_id).first()
        if not job:
            raise ValueError(f"Không tìm thấy Job {job_id}")

        # Update job fields
        job.status = "completed"
        job.message = "Hoàn tất"
        job.progress = 100
        job.output_audio_path = local_output_path
        if alignment:
            job.alignment = alignment
        
        # Sync and copy to preview if it's a voice design preview
        if job.job_type == "voice_design_preview" and job.preview_id:
            preview = db.query(VoiceDesignPreview).filter(VoiceDesignPreview.id == job.preview_id).first()
            if preview:
                preview.status = "completed"
                preview.preview_audio_path = local_output_path
        
        db.commit()
        db.refresh(job)
        return job

    @staticmethod
    def accept_preview(db: Session, preview_id: str, user_id: str = None) -> VoiceSample:
        """Takes a completed preview audio and registers it as a reusable cloned VoiceSample."""
        preview = db.query(VoiceDesignPreview).filter(VoiceDesignPreview.id == preview_id).first()
        if not preview:
            raise ValueError(f"Không tìm thấy Voice Design Preview {preview_id}")

        if preview.status != "completed" or not preview.preview_audio_path or not os.path.exists(preview.preview_audio_path):
            raise ValueError(f"Bản nghe thử {preview_id} chưa sẵn sàng hoặc không tồn tại audio file.")

        # Create new VoiceSample ID
        sample_id = f"vs_from_{preview_id}"
        
        # Determine paths
        AudioService.ensure_directories()
        dest_filename = f"{sample_id}.wav"
        dest_path = os.path.join(settings.voice_samples_dir, dest_filename)

        # Copy WAV file to voice_samples folder
        shutil.copy2(preview.preview_audio_path, dest_path)

        # Read metadata using soundfile if possible
        duration = None
        sample_rate = None
        try:
            info = sf.info(dest_path)
            duration = info.duration
            sample_rate = info.samplerate
        except Exception:
            duration = 5.0
            sample_rate = 24000

        # Save voice sample entry
        sample = VoiceSample(
            id=sample_id,
            user_id=user_id or preview.user_id,
            source_type="voice_design_preview",
            file_path=dest_path,
            ref_text=preview.preview_text,
            duration=duration,
            sample_rate=sample_rate,
            status="ready"
        )
        
        db.add(sample)
        preview.accepted_sample_id = sample_id
        db.commit()
        
        db.refresh(sample)
        db.refresh(preview)
        
        return sample
