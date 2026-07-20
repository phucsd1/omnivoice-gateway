import os
import uuid
import json
import shutil
import zipfile
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, VideoDubbingJob, TTSJob, SystemSetting
from app.schemas import VideoDubbingJobResponse, SubtitleSegment, SubtitleUpdateRequest
from app.utils.auth import get_user_or_api_key
from app.config import settings
from app.services.video_dubbing_service import VideoDubbingService
from app.services.job_service import JobService

from app.database import get_db, SessionLocal

router = APIRouter(prefix="/v1/video-dubbing", tags=["Video Dubbing"])

def run_dubbing_pipeline(job_id: str):
    """Background task to run the video dubbing stages (Download -> Extract Audio -> Separate -> Transcribe -> Translate)."""
    db = SessionLocal()
    try:
        job = db.query(VideoDubbingJob).filter(VideoDubbingJob.id == job_id).first()
        if not job:
            return

        job_dir = os.path.join(settings.dubbing_dir, job_id)
        # Stage 1: Download video if YouTube
        if job.source_type == "youtube":
            job.status = "downloading"
            job.progress = 10
            job.message = "Đang tải video từ YouTube..."
            db.commit()
            
            video_path, title = VideoDubbingService.download_youtube_video(job.source_url, job_dir)
            job.input_file_path = video_path
            db.commit()

        # Stage 2: Extract audio from video
        job.status = "separating_audio"
        job.progress = 25
        job.message = "Đang tách âm thanh gốc..."
        db.commit()
        
        orig_audio_path = os.path.join(job_dir, "original_audio.wav")
        duration = VideoDubbingService.extract_audio_ffmpeg(job.input_file_path, orig_audio_path)
        job.original_audio_path = orig_audio_path
        db.commit()

        # Check worker mode (Mock vs Kaggle)
        worker_mode = db.query(SystemSetting).filter(SystemSetting.key == "worker_mode").first()
        mode_val = worker_mode.value.strip() if worker_mode else settings.WORKER_MODE

        if mode_val == "mock":
            # Mock Audio Separation: copy original audio to vocals and BGM
            vocals_path = os.path.join(job_dir, "vocals.wav")
            bgm_path = os.path.join(job_dir, "bgm.wav")
            shutil.copy2(orig_audio_path, vocals_path)
            shutil.copy2(orig_audio_path, bgm_path)
            job.vocals_audio_path = vocals_path
            job.bgm_audio_path = bgm_path
            db.commit()

            # Mock Transcription (ASR)
            job.status = "transcribing"
            job.progress = 50
            job.message = "Đang dịch băng ghi âm (Nhận dạng giọng nói)..."
            db.commit()
            
            # Create simple mock subtitles spaced out by 5 seconds
            mock_subs = []
            num_segments = max(1, int(duration // 6))
            for i in range(num_segments):
                start = i * 6.0
                end = min(duration, start + 5.0)
                mock_subs.append({
                    "id": i + 1,
                    "start": start,
                    "end": end,
                    "text": f"Đây là phân đoạn phụ đề gốc số {i+1} để kiểm tra thử nghiệm lồng tiếng."
                })
            job.original_subtitles = json.dumps(mock_subs)
            db.commit()

            # Mock Translation
            job.status = "translating"
            job.progress = 75
            job.message = "Đang dịch phụ đề qua ngôn ngữ đích..."
            db.commit()
            
            translated_subs = VideoDubbingService.translate_subtitles_llm(mock_subs, job.target_language, db)
            job.translated_subtitles = json.dumps(translated_subs)
            job.status = "awaiting_review"
            job.progress = 100
            job.message = "Đang chờ người dùng kiểm tra và xác nhận phụ đề dịch."
            db.commit()

        else:
            # Kaggle Worker Mode: Submit job for audio separation
            job.status = "separating_audio"
            job.progress = 30
            job.message = "Đang gửi yêu cầu tách giọng và nhạc nền lên Kaggle GPU..."
            db.commit()

            # We create a special separate_audio job in the queue
            # Set the reference audio url to allow the worker to pull the extracted WAV
            parent_tts_job = TTSJob(
                id=f"sep_{job_id}",
                user_id=job.user_id,
                job_type="separate_audio",
                ref_audio_path=orig_audio_path,
                status="queued",
                progress=0,
                message="Đang chờ Kaggle Worker nhận tác vụ tách nhạc...",
            )
            db.add(parent_tts_job)
            db.commit()

            # We poll or let the worker push separation output.
            # To keep it unified, we monitor state or let the worker completion trigger the next step.
            # For this, we'll implement a state polling check or direct transition in internal_worker.py output upload!
            # So the background task ends here, and the next stages (ASR -> LLM) will be triggered when the worker uploads output for this job.
            
    except Exception as e:
        print(f"[run_dubbing_pipeline] Error in job {job_id}: {e}")
        db.rollback()
        job = db.query(VideoDubbingJob).filter(VideoDubbingJob.id == job_id).first()
        if job:
            job.status = "failed"
            job.progress = 100
            job.error_message = str(e)
            job.message = f"Có lỗi xảy ra: {str(e)[:100]}"
            db.commit()
    finally:
        db.close()

def trigger_transcription_stage(dub_job_id: str, db: Session):
    """Triggers the transcription ASR stage on Kaggle for the separated vocals."""
    job = db.query(VideoDubbingJob).filter(VideoDubbingJob.id == dub_job_id).first()
    if not job or not job.vocals_audio_path:
        return
        
    job.status = "transcribing"
    job.progress = 50
    job.message = "Đang tạo phụ đề tiếng gốc bằng Whisper ASR trên Kaggle..."
    db.commit()
    
    # Create an ASR job
    asr_job = TTSJob(
        id=f"asr_{dub_job_id}",
        user_id=job.user_id,
        job_type="asr",
        ref_audio_path=job.vocals_audio_path,
        status="queued",
        progress=0,
        message="Đang gửi tệp vocals lên Kaggle để nhận diện chữ...",
        with_alignment=True
    )
    db.add(asr_job)
    db.commit()

def trigger_translation_stage(dub_job_id: str, text: str, alignment_str: str, db: Session):
    """Executes translation after ASR finishes and enters review stage."""
    job = db.query(VideoDubbingJob).filter(VideoDubbingJob.id == dub_job_id).first()
    if not job:
        return
        
    job.status = "translating"
    job.progress = 75
    job.message = "Đang dịch phụ đề tự động bằng LLM..."
    db.commit()
    
    # Parse segments from Whisper alignment
    try:
        alignment_data = json.loads(alignment_str) if alignment_str else []
    except Exception:
        alignment_data = []
        
    # Standardize alignment to segments of ~6 seconds
    segments = []
    curr_seg = []
    seg_idx = 1
    
    for word in alignment_data:
        curr_seg.append(word)
        # Split segment if it has 8+ words or ends with a punctuation
        if len(curr_seg) >= 8 or word.get("word", "").endswith((".", "?", "!")):
            start_t = curr_seg[0]["start"]
            end_t = curr_seg[-1]["end"]
            text_str = " ".join([w["word"] for w in curr_seg]).strip()
            segments.append({
                "id": seg_idx,
                "start": start_t,
                "end": end_t,
                "text": text_str
            })
            curr_seg = []
            seg_idx += 1
            
    # Handle leftover words
    if curr_seg:
        start_t = curr_seg[0]["start"]
        end_t = curr_seg[-1]["end"]
        text_str = " ".join([w["word"] for w in curr_seg]).strip()
        segments.append({
            "id": seg_idx,
            "start": start_t,
            "end": end_t,
            "text": text_str
        })
        
    # If no alignments are found, split based on simple punctuation
    if not segments:
        words = text.split()
        for i in range(0, len(words), 8):
            chunk = words[i:i+8]
            duration = float(os.path.getsize(job.original_audio_path)) / (24000 * 2)  # rough estimate
            step = duration / max(1, len(words) // 8)
            segments.append({
                "id": len(segments) + 1,
                "start": i * (step / 8),
                "end": min(duration, (i+8) * (step / 8)),
                "text": " ".join(chunk)
            })

    job.original_subtitles = json.dumps(segments)
    db.commit()
    
    # Call LLM translator
    translated = VideoDubbingService.translate_subtitles_llm(segments, job.target_language, db)
    job.translated_subtitles = json.dumps(translated)
    
    job.status = "awaiting_review"
    job.progress = 100
    job.message = "Đang chờ người dùng kiểm tra và xác nhận phụ đề dịch."
    db.commit()

@router.post("", response_model=VideoDubbingJobResponse)
async def create_dubbing_job(
    background_tasks: BackgroundTasks,
    file: Optional[UploadFile] = File(None),
    youtube_url: Optional[str] = Form(None),
    target_language: str = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_user_or_api_key)
):
    """Tải lên video hoặc dán link YouTube để bắt đầu quy trình lồng tiếng tự động."""
    if not file and not youtube_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bạn cần cung cấp video tải lên hoặc link YouTube."
        )

    job_id = f"vd_{uuid.uuid4().hex[:8]}"
    job_dir = os.path.join(settings.dubbing_dir, job_id)
    os.makedirs(job_dir, exist_ok=True)

    input_file_path = None
    source_type = "youtube" if youtube_url else "upload"

    if file:
        # Save file directly
        filename = file.filename or f"uploaded_video"
        ext = os.path.splitext(filename)[1] or ".mp4"
        input_file_path = os.path.join(job_dir, f"input_video{ext}")
        
        try:
            with open(input_file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Lỗi lưu file video: {e}"
            )

    job = VideoDubbingJob(
        id=job_id,
        user_id=current_user.id,
        status="queued",
        progress=5,
        message="Khởi tạo tác vụ lồng tiếng...",
        source_type=source_type,
        source_url=youtube_url,
        target_language=target_language,
        input_file_path=input_file_path
    )
    db.add(job)
    db.commit()

    # Trigger background execution pipeline
    background_tasks.add_task(run_dubbing_pipeline, job_id)

    return job

@router.get("/jobs/{job_id}", response_model=VideoDubbingJobResponse)
def get_dubbing_job(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_user_or_api_key)
):
    """Lấy thông tin tiến độ và phụ đề của tác vụ lồng tiếng."""
    job = db.query(VideoDubbingJob).filter(VideoDubbingJob.id == job_id, VideoDubbingJob.user_id == current_user.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Không tìm thấy tác vụ lồng tiếng.")
    
    # Parse subtitles JSON into Pydantic models
    orig_subs = []
    if job.original_subtitles:
        try:
            orig_subs = json.loads(job.original_subtitles)
        except Exception:
            pass
            
    trans_subs = []
    if job.translated_subtitles:
        try:
            trans_subs = json.loads(job.translated_subtitles)
        except Exception:
            pass

    output_video_url = f"/v1/video-dubbing/jobs/{job_id}/output" if job.status == "completed" else None

    return VideoDubbingJobResponse(
        id=job.id,
        status=job.status,
        progress=job.progress,
        message=job.message,
        source_type=job.source_type,
        source_url=job.source_url,
        target_language=job.target_language,
        original_subtitles=orig_subs,
        translated_subtitles=trans_subs,
        output_video_url=output_video_url,
        error_message=job.error_message,
        created_at=job.created_at,
        updated_at=job.updated_at
    )

@router.put("/jobs/{job_id}/subtitles", response_model=dict)
def update_dubbing_subtitles(
    job_id: str,
    payload: SubtitleUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_user_or_api_key)
):
    """Cập nhật bản dịch hoặc phụ đề gốc sau khi người dùng chỉnh sửa."""
    job = db.query(VideoDubbingJob).filter(VideoDubbingJob.id == job_id, VideoDubbingJob.user_id == current_user.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Không tìm thấy tác vụ lồng tiếng.")

    if payload.original_subtitles is not None:
        job.original_subtitles = json.dumps([s.dict() for s in payload.original_subtitles])
    if payload.translated_subtitles is not None:
        job.translated_subtitles = json.dumps([s.dict() for s in payload.translated_subtitles])

    db.commit()
    return {"status": "success", "message": "Cập nhật phụ đề thành công."}

@router.post("/jobs/{job_id}/finalize")
def finalize_dubbing_job(
    job_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_user_or_api_key)
):
    """Xác nhận phụ đề và tiến hành lồng tiếng TTS, trộn nhạc nền và xuất video."""
    job = db.query(VideoDubbingJob).filter(VideoDubbingJob.id == job_id, VideoDubbingJob.user_id == current_user.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Không tìm thấy tác vụ lồng tiếng.")

    if job.status not in ["awaiting_review", "failed"]:
        raise HTTPException(status_code=400, detail="Trạng thái tác vụ không hợp lệ để hoàn tất.")

    job.status = "generating_tts"
    job.progress = 10
    job.message = "Bắt đầu lồng tiếng và khớp khung thời gian..."
    db.commit()

    # Trigger finalization background task
    background_tasks.add_task(run_finalization_pipeline, job_id)
    return {"status": "success", "message": "Đang tiến hành lồng tiếng và kết xuất video ở nền."}

def run_finalization_pipeline(job_id: str):
    """Background task to synthesize TTS segments, stitch them, mix with BGM, and mux video."""
    db = SessionLocal()
    try:
        job = db.query(VideoDubbingJob).filter(VideoDubbingJob.id == job_id).first()
        if not job:
            return

        job_dir = os.path.join(settings.dubbing_dir, job_id)
        translated_subs = json.loads(job.translated_subtitles or "[]")

        worker_mode = db.query(SystemSetting).filter(SystemSetting.key == "worker_mode").first()
        mode_val = worker_mode.value.strip() if worker_mode else settings.WORKER_MODE

        if mode_val == "mock":
            # Mock TTS generation: we copy the vocals track directly as the dubbed vocal track
            dubbed_vocal_path = os.path.join(job_dir, "dubbed_vocals.wav")
            shutil.copy2(job.vocals_audio_path, dubbed_vocal_path)
            
            job.status = "mixing_audio"
            job.progress = 60
            job.message = "Đang trộn giọng lồng tiếng mới với nhạc nền..."
            db.commit()

            output_video_path = os.path.join(job_dir, "output_dubbed.mp4")
            try:
                VideoDubbingService.mix_and_mux_video(
                    video_path=job.input_file_path,
                    bgm_path=job.bgm_audio_path,
                    vocal_path=dubbed_vocal_path,
                    output_path=output_video_path
                )
            except Exception as mix_err:
                print(f"[VideoDubbing] mix_and_mux_video failed: {mix_err}. Falling back to copy input file.")
                shutil.copy2(job.input_file_path, output_video_path)
            
            job.output_video_path = output_video_path
            job.status = "completed"
            job.progress = 100
            job.message = "Lồng tiếng video thành công!"
            db.commit()

        else:
            # Kaggle Worker Mode: Submit segment dubbing batch job
            job.status = "generating_tts"
            job.progress = 20
            job.message = "Đang gửi yêu cầu sinh giọng đọc lồng tiếng lên Kaggle GPU..."
            db.commit()

            # We submit a special batch job of type 'dub_segments'
            dub_tts_job = TTSJob(
                id=f"dub_{job_id}",
                user_id=job.user_id,
                job_type="dub_segments",
                text=job.translated_subtitles,  # passing JSON translated subtitles
                voice_sample_id=None,
                # We use the separated vocals WAV as the cloning reference voice
                ref_audio_path=job.vocals_audio_path,
                status="queued",
                progress=0,
                message="Đang chờ Kaggle lồng tiếng..."
            )
            db.add(dub_tts_job)
            db.commit()
            
    except Exception as e:
        print(f"[run_finalization_pipeline] Error in job {job_id}: {e}")
        db.rollback()
        job = db.query(VideoDubbingJob).filter(VideoDubbingJob.id == job_id).first()
        if job:
            job.status = "failed"
            job.progress = 100
            job.error_message = str(e)
            job.message = f"Lỗi hoàn tất: {str(e)[:100]}"
            db.commit()
    finally:
        db.close()

# Endpoints to download assets
@router.get("/jobs/{job_id}/video")
def get_original_video(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_user_or_api_key)
):
    """Tải xuống hoặc stream video gốc."""
    job = db.query(VideoDubbingJob).filter(VideoDubbingJob.id == job_id, VideoDubbingJob.user_id == current_user.id).first()
    if not job or not job.input_file_path or not os.path.exists(job.input_file_path):
        raise HTTPException(status_code=404, detail="Không tìm thấy video gốc.")
    return FileResponse(job.input_file_path, media_type="video/mp4", content_disposition_type="inline")

@router.get("/jobs/{job_id}/vocals")
def get_separated_vocals(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_user_or_api_key)
):
    """Tải xuống hoặc nghe track giọng nói gốc sau khi tách."""
    job = db.query(VideoDubbingJob).filter(VideoDubbingJob.id == job_id, VideoDubbingJob.user_id == current_user.id).first()
    if not job or not job.vocals_audio_path or not os.path.exists(job.vocals_audio_path):
        raise HTTPException(status_code=404, detail="Không tìm thấy tệp giọng nói gốc.")
    return FileResponse(job.vocals_audio_path, media_type="audio/wav", content_disposition_type="inline")

@router.get("/jobs/{job_id}/bgm")
def get_separated_bgm(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_user_or_api_key)
):
    """Tải xuống hoặc nghe track nhạc nền gốc sau khi tách."""
    job = db.query(VideoDubbingJob).filter(VideoDubbingJob.id == job_id, VideoDubbingJob.user_id == current_user.id).first()
    if not job or not job.bgm_audio_path or not os.path.exists(job.bgm_audio_path):
        raise HTTPException(status_code=404, detail="Không tìm thấy tệp nhạc nền gốc.")
    return FileResponse(job.bgm_audio_path, media_type="audio/wav", content_disposition_type="inline")

@router.get("/jobs/{job_id}/output")
def get_dubbed_video(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_user_or_api_key)
):
    """Tải xuống hoặc stream video lồng tiếng thành phẩm."""
    job = db.query(VideoDubbingJob).filter(VideoDubbingJob.id == job_id, VideoDubbingJob.user_id == current_user.id).first()
    if not job or not job.output_video_path or not os.path.exists(job.output_video_path):
        raise HTTPException(status_code=404, detail="Không tìm thấy video lồng tiếng thành phẩm.")
    return FileResponse(job.output_video_path, media_type="video/mp4", filename=f"dubbed_{job_id}.mp4", content_disposition_type="inline")
