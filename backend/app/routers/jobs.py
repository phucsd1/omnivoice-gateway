from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import TTSJob, User
from app.schemas import JobStatusResponse
from app.utils.auth import get_user_or_api_key

router = APIRouter(prefix="/v1/jobs", tags=["Generic Jobs"])

@router.get("", response_model=list[JobStatusResponse])
def list_jobs(response: Response, db: Session = Depends(get_db), current_user: User = Depends(get_user_or_api_key)):
    """
    Returns list of all jobs belonging to the current user, ordered by creation time descending.
    """
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    jobs = db.query(TTSJob).filter(TTSJob.user_id == current_user.id).order_by(TTSJob.created_at.desc()).all()
    result = []
    for job in jobs:
        audio_url = None
        if job.status == "completed":
            if job.job_type == "voice_design_preview" and job.preview_id:
                audio_url = f"/v1/voice-design/previews/{job.preview_id}/audio"
            else:
                audio_url = f"/v1/tts/jobs/{job.id}/audio"
        result.append(
            JobStatusResponse(
                job_id=job.id,
                status=job.status,
                message=job.message,
                progress=job.progress,
                audio_url=audio_url,
                error_message=job.error_message,
                job_type=job.job_type,
                text=job.text,
                created_at=job.created_at
            )
        )
    return result

@router.get("/{job_id}", response_model=JobStatusResponse)
def get_job_status(job_id: str, response: Response, db: Session = Depends(get_db), current_user: User = Depends(get_user_or_api_key)):
    """
    Polled generic job status endpoint returning current state, progress rate,
    any error messages, and the resolved audio download URL upon completion for the user's job.
    """
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    job = db.query(TTSJob).filter(TTSJob.id == job_id, TTSJob.user_id == current_user.id).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy Job với ID: {job_id}"
        )
        
    audio_url = None
    if job.status == "completed":
        if job.job_type == "voice_design_preview" and job.preview_id:
            audio_url = f"/v1/voice-design/previews/{job.preview_id}/audio"
        else:
            audio_url = f"/v1/tts/jobs/{job.id}/audio"

    return JobStatusResponse(
        job_id=job.id,
        status=job.status,
        message=job.message,
        progress=job.progress,
        audio_url=audio_url,
        error_message=job.error_message,
        job_type=job.job_type,
        text=job.text,
        created_at=job.created_at
    )
