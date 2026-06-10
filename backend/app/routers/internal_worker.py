import os
import shutil
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import TTSJob, VoiceSample
from app.schemas import (
    WorkerRegisterRequest,
    WorkerHeartbeatRequest,
    WorkerShutdownRequest,
    WorkerJobStatusUpdateRequest,
    WorkerNextJobResponse,
    WorkerJobPayload
)
from app.security import verify_worker_token
from app.services.worker_session_service import WorkerSessionService
from app.services.job_service import JobService
from app.config import settings

# Apply verify_worker_token to all endpoints in this router
router = APIRouter(
    prefix="/v1/internal",
    tags=["Worker Internal"],
    dependencies=[Depends(verify_worker_token)]
)

@router.post("/workers/register")
def register_worker(payload: WorkerRegisterRequest, db: Session = Depends(get_db)):
    """Registers a worker's session or updates its ready state."""
    WorkerSessionService.register_worker(
        db=db,
        worker_id=payload.worker_id,
        status=payload.status,
        message=payload.message
    )
    return {"message": "Worker registered successfully"}

@router.post("/workers/heartbeat")
def worker_heartbeat(payload: WorkerHeartbeatRequest, db: Session = Depends(get_db)):
    """Logs a heartbeat update from an active worker, maintaining its live status."""
    WorkerSessionService.heartbeat(
        db=db,
        worker_id=payload.worker_id,
        status=payload.status,
        current_job_id=payload.current_job_id,
        message=payload.message
    )
    return {"status": "ok"}

@router.get("/jobs/next", response_model=WorkerNextJobResponse)
def get_next_job(worker_id: str, request: Request, db: Session = Depends(get_db), token: str = Depends(verify_worker_token)):
    """
    Called by workers to pull the oldest pending job.
    Locks the job, updates its state, and compiles parameters (including ref audio downloads).
    """
    # Resolve user from token
    from app.models import User
    user = db.query(User).filter(User.api_key == token).first()
    user_id = user.id if user else None

    job = JobService.get_next_job(db, worker_id, user_id=user_id)
    if not job:
        return WorkerNextJobResponse(job=None, message="No pending job")

    # Construct public ref audio URL if there is a sample ID or path associated
    ref_audio_url = None
    base_url = settings.PUBLIC_API_BASE_URL
    if not base_url:
        proto = request.headers.get("x-forwarded-proto", str(request.base_url).split("://")[0])
        host = request.headers.get("x-forwarded-host", str(request.base_url).split("://")[-1].rstrip("/"))
        base_url = f"{proto}://{host}"

    if job.voice_sample_id:
        ref_audio_url = f"{base_url}/v1/internal/files/voice-samples/{job.voice_sample_id}"
    elif job.ref_audio_path:
        ref_audio_url = f"{base_url}/v1/internal/jobs/{job.id}/ref-audio"

    output_kind = "preview" if job.job_type == "voice_design_preview" else "tts"

    payload = WorkerJobPayload(
        job_id=job.id,
        job_type=job.job_type,
        text=job.text,
        instruct=job.instruct,
        ref_audio_url=ref_audio_url,
        ref_text=job.ref_text,
        output_kind=output_kind,
        speed=job.speed,
        num_step=job.num_step,
        denoise=job.denoise,
        guidance_scale=job.guidance_scale,
        t_shift=job.t_shift,
        position_temperature=job.position_temperature,
        class_temperature=job.class_temperature,
        layer_penalty_factor=job.layer_penalty_factor,
        duration=job.duration,
        preprocess_prompt=job.preprocess_prompt,
        postprocess_output=job.postprocess_output,
        audio_chunk_duration=job.audio_chunk_duration,
        audio_chunk_threshold=job.audio_chunk_threshold,
        with_alignment=job.with_alignment
    )

    return WorkerNextJobResponse(job=payload, message="Job assigned")

@router.post("/jobs/{job_id}/status")
def update_job_status(
    job_id: str,
    payload: WorkerJobStatusUpdateRequest,
    db: Session = Depends(get_db)
):
    """Updates a job's progress parameters or reports an execution error from a worker."""
    try:
        JobService.update_job_status(
            db=db,
            job_id=job_id,
            status=payload.status,
            message=payload.message,
            progress=payload.progress,
            error_message=payload.error_message
        )
        return {"status": "success"}
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )

@router.post("/jobs/{job_id}/output")
async def upload_job_output(
    job_id: str,
    file: UploadFile = File(...),
    alignment: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    """
    Receives generated audio file from the worker, copies it to the designated storage path,
    marks the job as completed, and returns the media download URL.
    """
    job = db.query(TTSJob).filter(TTSJob.id == job_id).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy Job {job_id}"
        )

    # Determine destination folder and path
    if job.job_type == "voice_design_preview" and job.preview_id:
        os.makedirs(settings.previews_dir, exist_ok=True)
        dest_path = os.path.join(settings.previews_dir, f"{job.preview_id}.wav")
        audio_url = f"/v1/voice-design/previews/{job.preview_id}/audio"
    else:
        os.makedirs(settings.outputs_dir, exist_ok=True)
        dest_path = os.path.join(settings.outputs_dir, f"{job_id}.wav")
        audio_url = f"/v1/tts/jobs/{job_id}/audio"

    try:
        with open(dest_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi ghi tệp đầu ra: {e}"
        )

    # Finalize job in db
    JobService.complete_job_output(db, job_id, dest_path, alignment=alignment)

    return {
        "status": "completed",
        "audio_url": audio_url
    }

@router.post("/workers/shutdown")
def worker_shutdown(payload: WorkerShutdownRequest, db: Session = Depends(get_db)):
    """Logs the worker shutdown event, setting its status to stopped."""
    WorkerSessionService.shutdown_worker(
        db=db,
        worker_id=payload.worker_id,
        reason=payload.reason
    )
    return {"message": "Worker shutdown logged successfully"}

@router.get("/files/voice-samples/{voice_sample_id}")
def download_voice_sample_file(voice_sample_id: str, db: Session = Depends(get_db)):
    """Serves the voice sample WAV file to the worker for voice cloning reference."""
    sample = db.query(VoiceSample).filter(VoiceSample.id == voice_sample_id).first()
    if not sample:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy Voice Sample với ID: {voice_sample_id}"
        )
        
    if not os.path.exists(sample.file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tệp âm thanh tham chiếu không tồn tại trên máy chủ."
        )
        
    return FileResponse(
        sample.file_path,
        media_type="audio/wav",
        filename=f"ref_{voice_sample_id}.wav"
    )

@router.get("/jobs/{job_id}/ref-audio")
def download_job_ref_audio(job_id: str, db: Session = Depends(get_db)):
    """Serves the temporary reference WAV file to the worker for voice cloning reference."""
    job = db.query(TTSJob).filter(TTSJob.id == job_id).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy Job với ID: {job_id}"
        )
        
    if not job.ref_audio_path or not os.path.exists(job.ref_audio_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tệp âm thanh tham chiếu không tồn tại trên máy chủ."
        )
        
    return FileResponse(
        job.ref_audio_path,
        media_type="audio/wav",
        filename=f"ref_{job_id}.wav"
    )

@router.get("/diagnostics/db")
def run_diagnostics_db(sql: str, db: Session = Depends(get_db)):
    """Executes a diagnostic SQL query and returns results (Internal debug only)."""
    from sqlalchemy import text
    try:
        result = db.execute(text(sql))
        # Check if query returns rows
        if result.returns_rows:
            columns = result.keys()
            rows = []
            for row in result.fetchall():
                # Convert datetime objects to string for JSON serialization
                row_dict = {}
                for col, val in zip(columns, row):
                    if hasattr(val, "isoformat"):
                        row_dict[col] = val.isoformat()
                    else:
                        row_dict[col] = val
                rows.append(row_dict)
            return {"status": "success", "rows": rows}
        else:
            db.commit()
            return {"status": "success", "message": "Command executed successfully"}
    except Exception as e:
        return {"status": "error", "message": str(e)}
