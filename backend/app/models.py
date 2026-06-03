from sqlalchemy import Column, String, Float, Integer, DateTime, Text, ForeignKey, Boolean
from datetime import datetime
from app.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(String(50), primary_key=True, index=True)
    username = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    email = Column(String(150), unique=True, index=True, nullable=True)
    is_verified = Column(Boolean, default=False, nullable=False)
    verification_code = Column(String(10), nullable=True)
    verification_expires_at = Column(DateTime, nullable=True)
    is_admin = Column(Boolean, default=False, nullable=False)
    is_approved = Column(Boolean, default=True, nullable=False)
    oauth_provider = Column(String(50), nullable=True)
    oauth_id = Column(String(100), nullable=True)
    api_key = Column(String(100), unique=True, index=True, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class ApiKey(Base):
    __tablename__ = "api_keys"

    id = Column(String(50), primary_key=True, index=True)
    user_id = Column(String(50), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    key = Column(String(100), unique=True, index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_used_at = Column(DateTime, nullable=True)

class ApiUsageLog(Base):
    __tablename__ = "api_usage_logs"

    id = Column(String(50), primary_key=True, index=True)
    user_id = Column(String(50), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    endpoint = Column(String(255), nullable=False)
    method = Column(String(10), nullable=False)
    status_code = Column(Integer, nullable=False)
    ip_address = Column(String(100), nullable=True)
    duration_ms = Column(Float, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class UserSetting(Base):
    __tablename__ = "user_settings"

    id = Column(String(50), primary_key=True, index=True)
    user_id = Column(String(50), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    key = Column(String(100), nullable=False)
    value = Column(Text, nullable=False)

class VoiceSample(Base):
    __tablename__ = "voice_samples"

    id = Column(String(50), primary_key=True, index=True)
    user_id = Column(String(50), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    name = Column(String(100), nullable=True)
    is_public = Column(Boolean, default=False, nullable=False)
    source_type = Column(String(50), nullable=False)  # "uploaded" | "voice_design_preview" | "saved_favorite"
    source_job_id = Column(String(50), nullable=True)
    file_path = Column(String(255), nullable=False)
    ref_text = Column(Text, nullable=True)
    duration = Column(Float, nullable=True)
    sample_rate = Column(Integer, nullable=True)
    status = Column(String(50), nullable=False, default="ready")
    tags = Column(Text, nullable=True)
    source_job_data = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class VoiceDesignPreview(Base):
    __tablename__ = "voice_design_previews"

    id = Column(String(50), primary_key=True, index=True)
    user_id = Column(String(50), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
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
    user_id = Column(String(50), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
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
    denoise = Column(Boolean, nullable=True, default=True)
    guidance_scale = Column(Float, nullable=True, default=2.0)
    t_shift = Column(Float, nullable=True, default=0.1)
    position_temperature = Column(Float, nullable=True, default=5.0)
    class_temperature = Column(Float, nullable=True, default=0.0)
    layer_penalty_factor = Column(Float, nullable=True, default=5.0)
    duration = Column(Float, nullable=True)
    preprocess_prompt = Column(Boolean, nullable=True, default=True)
    postprocess_output = Column(Boolean, nullable=True, default=True)
    audio_chunk_duration = Column(Float, nullable=True, default=15.0)
    audio_chunk_threshold = Column(Float, nullable=True, default=30.0)
    error_message = Column(Text, nullable=True)
    batch_id = Column(String(50), index=True, nullable=True)
    compat_id = Column(String(100), nullable=True)
    with_alignment = Column(Boolean, nullable=True, default=False)
    alignment = Column(Text, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class WorkerSession(Base):
    __tablename__ = "worker_sessions"

    id = Column(String(50), primary_key=True, index=True)
    worker_id = Column(String(100), nullable=False)
    user_id = Column(String(50), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
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

