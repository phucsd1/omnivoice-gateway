from sqlalchemy import Column, String, Float, Integer, DateTime, Text
from datetime import datetime
from app.database import Base

class VoiceSample(Base):
    __tablename__ = "voice_samples"

    id = Column(String(50), primary_key=True, index=True)
    source_type = Column(String(50), nullable=False)  # "uploaded" | "voice_design_preview"
    file_path = Column(String(255), nullable=False)
    ref_text = Column(Text, nullable=True)
    duration = Column(Float, nullable=True)
    sample_rate = Column(Integer, nullable=True)
    status = Column(String(50), nullable=False, default="ready")
    created_at = Column(DateTime, default=datetime.utcnow)

class VoiceDesignPreview(Base):
    __tablename__ = "voice_design_previews"

    id = Column(String(50), primary_key=True, index=True)
    voice_request = Column(Text, nullable=False)
    instruct = Column(Text, nullable=False)
    preview_text = Column(Text, nullable=False)
    preview_audio_path = Column(String(255), nullable=True)
    accepted_sample_id = Column(String(50), nullable=True)
    status = Column(String(50), nullable=False, default="queued")
    created_at = Column(DateTime, default=datetime.utcnow)

class TTSJob(Base):
    __tablename__ = "tts_jobs"

    id = Column(String(50), primary_key=True, index=True)
    job_type = Column(String(50), nullable=False)  # "clone_voice" | "voice_design_preview" | "auto_voice" | "voice_design_tts"
    text = Column(Text, nullable=True)
    voice_sample_id = Column(String(50), nullable=True)
    preview_id = Column(String(50), nullable=True)
    instruct = Column(Text, nullable=True)
    ref_audio_path = Column(String(255), nullable=True)
    ref_text = Column(Text, nullable=True)
    worker_id = Column(String(100), nullable=True)
    status = Column(String(50), nullable=False, default="queued")
    message = Column(Text, nullable=True)
    progress = Column(Integer, default=0)
    output_audio_path = Column(String(255), nullable=True)
    speed = Column(Float, nullable=True, default=1.0)
    num_step = Column(Integer, nullable=True, default=32)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class WorkerSession(Base):
    __tablename__ = "worker_sessions"

    id = Column(String(50), primary_key=True, index=True)
    worker_id = Column(String(100), nullable=False)
    status = Column(String(50), nullable=False)  # "starting" | "loading_model" | "ready" | "busy" | "idle" | "stopped" | "failed"
    last_heartbeat_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime, default=datetime.utcnow)
    stopped_at = Column(DateTime, nullable=True)
    current_job_id = Column(String(50), nullable=True)
    message = Column(Text, nullable=True)

class SystemSetting(Base):
    __tablename__ = "system_settings"

    key = Column(String(100), primary_key=True, index=True)
    value = Column(Text, nullable=False)

