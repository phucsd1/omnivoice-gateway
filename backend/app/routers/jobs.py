from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import TTSJob
from app.schemas import JobStatusResponse

router = APIRouter(prefix="/v1/jobs", tags=["Generic Jobs"])

@router.get("/{job_id}", response_model=JobStatusResponse)
def get_job_status(job_id: str, db: Session = Depends(get_db)):
    """
    Polled generic job status endpoint returning current state, progress rate,
    any error messages, and the resolved audio download URL upon completion.
    """
    job = db.query(TTSJob).filter(TTSJob.id == job_id).first()
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
        error_message=job.error_message
    )
