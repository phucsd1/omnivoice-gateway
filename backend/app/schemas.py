from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Any
from datetime import datetime

class HealthResponse(BaseModel):
    status: str
    app: str

class VoiceSampleUploadResponse(BaseModel):
    voice_sample_id: str
    status: str
    message: str

class VoiceSampleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: str
    source_type: str
    ref_text: Optional[str] = None
    duration: Optional[float] = None
    sample_rate: Optional[int] = None
    status: str
    created_at: datetime

class VoiceDesignPreviewCreate(BaseModel):
    voice_request: str
    preview_text: str

class VoiceDesignPreviewResponse(BaseModel):
    preview_id: str
    job_id: str
    status: str
    message: str

class VoiceDesignPreviewDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: str
    voice_request: str
    instruct: str
    preview_text: str
    preview_audio_path: Optional[str] = None
    accepted_sample_id: Optional[str] = None
    status: str
    created_at: datetime

class AcceptPreviewResponse(BaseModel):
    voice_sample_id: str
    status: str
    message: str

class TTSJobCreate(BaseModel):
    mode: str  # "clone_voice" | "auto_voice" | "voice_design"
    text: str
    voice_sample_id: Optional[str] = None
    instruct: Optional[str] = None

class TTSJobResponse(BaseModel):
    job_id: str
    status: str
    message: str

class JobStatusResponse(BaseModel):
    job_id: str
    status: str
    message: Optional[str] = None
    progress: int
    audio_url: Optional[str] = None
    error_message: Optional[str] = None

# Worker related schemas
class WorkerRegisterRequest(BaseModel):
    worker_id: str
    status: str
    message: Optional[str] = None

class WorkerHeartbeatRequest(BaseModel):
    worker_id: str
    status: str
    current_job_id: Optional[str] = None
    message: Optional[str] = None

class WorkerShutdownRequest(BaseModel):
    worker_id: str
    reason: str

class WorkerJobStatusUpdateRequest(BaseModel):
    status: str
    message: Optional[str] = None
    progress: int = 0
    error_message: Optional[str] = None

class WorkerJobPayload(BaseModel):
    job_id: str
    job_type: str
    text: Optional[str] = None
    instruct: Optional[str] = None
    ref_audio_url: Optional[str] = None
    ref_text: Optional[str] = None
    output_kind: str  # "preview" or "tts"

class WorkerNextJobResponse(BaseModel):
    job: Optional[WorkerJobPayload] = None
    message: str
