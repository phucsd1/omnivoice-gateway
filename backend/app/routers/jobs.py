from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import TTSJob, User
from app.schemas import JobStatusResponse
from app.utils.auth import get_user_or_api_key

router = APIRouter(prefix="/v1/jobs", tags=["Generic Jobs"])

def _build_job_response(job: TTSJob) -> JobStatusResponse:
    audio_url = None
    if job.status == "completed":
        if job.job_type == "voice_design_preview" and job.preview_id:
            audio_url = f"/v1/voice-design/previews/{job.preview_id}/audio"
        else:
            audio_url = f"/v1/tts/jobs/{job.id}/audio"
            
    import json
    alignment_data = None
    if job.alignment:
        try:
            alignment_data = json.loads(job.alignment)
        except Exception:
            pass

    processing_time = None
    if job.completed_at and job.started_at:
        processing_time = (job.completed_at - job.started_at).total_seconds()
        
    queue_time = None
    if job.started_at:
        queue_time = (job.started_at - job.created_at).total_seconds()
        
    total_time = None
    if job.completed_at:
        total_time = (job.completed_at - job.created_at).total_seconds()

    mode_val = "clone_voice"
    if job.job_type == "auto_voice":
        mode_val = "auto_voice"
    elif job.job_type in ["voice_design_tts", "voice_design_preview"]:
        mode_val = "voice_design"

    params_data = {
        "mode": mode_val,
        "text": job.text,
        "voice_sample_id": job.voice_sample_id,
        "ref_text": job.ref_text,
        "instruct": job.instruct,
        "speed": job.speed,
        "num_step": job.num_step,
        "denoise": job.denoise,
        "guidance_scale": job.guidance_scale,
        "t_shift": job.t_shift,
        "position_temperature": job.position_temperature,
        "class_temperature": job.class_temperature,
        "layer_penalty_factor": job.layer_penalty_factor,
        "duration": job.duration,
        "preprocess_prompt": job.preprocess_prompt,
        "postprocess_output": job.postprocess_output,
        "audio_chunk_duration": job.audio_chunk_duration,
        "audio_chunk_threshold": job.audio_chunk_threshold,
        "with_alignment": job.with_alignment
    }
    params_data = {k: v for k, v in params_data.items() if v is not None}

    return JobStatusResponse(
        job_id=job.id,
        status=job.status,
        message=job.message,
        progress=job.progress,
        audio_url=audio_url,
        error_message=job.error_message,
        job_type=job.job_type,
        text=job.text,
        created_at=job.created_at,
        alignment=alignment_data,
        started_at=job.started_at,
        completed_at=job.completed_at,
        processing_time=processing_time,
        queue_time=queue_time,
        total_time=total_time,
        params=params_data
    )

@router.get("", response_model=list[JobStatusResponse])
def list_jobs(response: Response, db: Session = Depends(get_db), current_user: User = Depends(get_user_or_api_key)):
    """
    Returns list of all jobs belonging to the current user, ordered by creation time descending.
    """
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    jobs = db.query(TTSJob).filter(TTSJob.user_id == current_user.id).order_by(TTSJob.created_at.desc()).all()
    return [_build_job_response(job) for job in jobs]

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
    return _build_job_response(job)
