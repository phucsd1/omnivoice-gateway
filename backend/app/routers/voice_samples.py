import os
import shutil
from typing import Optional
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import VoiceSample
from app.schemas import VoiceSampleUploadResponse, VoiceSampleResponse
from app.utils.ids import generate_id
from app.services.audio_service import AudioService
from app.config import settings


router = APIRouter(prefix="/v1/voice-samples", tags=["Voice Samples"])

@router.post("", response_model=VoiceSampleUploadResponse)
async def upload_voice_sample(
    file: UploadFile = File(...),
    ref_text: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    """
    Uploads a raw voice audio file (wav/mp3/flac), saves the upload,
    standardizes it to mono WAV format, and registers it as a Voice Sample.
    """
    AudioService.ensure_directories()
    
    # Generate unique ID
    sample_id = generate_id("vs")
    
    # Save the original upload first
    filename = file.filename or f"{sample_id}_raw"
    ext = os.path.splitext(filename)[1] or ".bin"
    upload_temp_path = os.path.join(settings.uploads_dir, f"{sample_id}_raw{ext}")
    
    try:
        with open(upload_temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Không thể lưu file tải lên: {e}"
        )
    
    # Standardize and save into voice_samples
    target_filename = f"{sample_id}.wav"
    try:
        saved_path, duration, sample_rate = AudioService.process_and_save_upload(
            upload_temp_path, target_filename
        )
    except Exception as e:
        # If standardizer fails, cleanup and return 500
        if os.path.exists(upload_temp_path):
            os.remove(upload_temp_path)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Định dạng tệp âm thanh không hợp lệ hoặc lỗi xử lý: {e}"
        )

    # Save details to database
    db_sample = VoiceSample(
        id=sample_id,
        source_type="uploaded",
        file_path=saved_path,
        ref_text=ref_text,
        duration=duration,
        sample_rate=sample_rate,
        status="ready"
    )
    
    db.add(db_sample)
    db.commit()
    db.refresh(db_sample)
    
    return VoiceSampleUploadResponse(
        voice_sample_id=sample_id,
        status="ready",
        message="Đã nhận voice sample."
    )

@router.get("/{voice_sample_id}", response_model=VoiceSampleResponse)
def get_voice_sample(voice_sample_id: str, db: Session = Depends(get_db)):
    """Retrieves full details of an uploaded or generated voice sample."""
    sample = db.query(VoiceSample).filter(VoiceSample.id == voice_sample_id).first()
    if not sample:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy Voice Sample với ID: {voice_sample_id}"
        )
    return sample
