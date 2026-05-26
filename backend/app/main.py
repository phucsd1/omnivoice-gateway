from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.config import settings
from app.database import engine, Base
from app.services.audio_service import AudioService
from app.services.mock_worker import MockWorker

# Import all routers
from app.routers import health, voice_samples, voice_design, tts, jobs, internal_worker
from app.routers import settings as settings_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup actions
    print("[Main] Initializing OmniVoice On-Demand Gateway...")
    AudioService.ensure_directories()
    
    # Initialize DB tables
    print("[Main] Initializing SQLite database tables...")
    Base.metadata.create_all(bind=engine)
    
    # Start mock background worker if configured
    if settings.WORKER_MODE == "mock":
        print("[Main] Running in MOCK worker mode. Initializing MockWorker background thread...")
        MockWorker.start()
    else:
        print(f"[Main] Running in KAGGLE worker mode. Initializing KaggleOrchestrator queue runner...")
        from app.services.kaggle_orchestrator import KaggleOrchestrator
        KaggleOrchestrator.start_queue_runner()
        
    yield
    
    # Shutdown actions
    if settings.WORKER_MODE == "mock":
        print("[Main] Shutting down MockWorker background thread...")
        MockWorker.stop()
    else:
        print("[Main] Shutting down KaggleOrchestrator queue runner...")
        from app.services.kaggle_orchestrator import KaggleOrchestrator
        KaggleOrchestrator.stop_queue_runner()
    print("[Main] Gateway shutdown complete.")


app = FastAPI(
    title="OmniVoice On-Demand Gateway",
    description="Gateway managing job queues, audio storage, and polling orchestrations for OmniVoice GPU Workers.",
    version="1.0.0",
    lifespan=lifespan
)

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
@app.get("/v1/diag")
def diagnostic_endpoint():
    from app.database import SessionLocal
    from app.models import TTSJob
    from app.services.kaggle_orchestrator import KaggleOrchestrator
    
    db = SessionLocal()
    try:
        jobs = db.query(TTSJob).all()
        jobs_list = [{"id": j.id, "status": j.status, "message": j.message, "progress": j.progress} for j in jobs]
    except Exception as e:
        jobs_list = f"Error reading jobs: {e}"
    finally:
        db.close()
        
    runner_alive = False
    if KaggleOrchestrator._runner_thread:
        runner_alive = KaggleOrchestrator._runner_thread.is_alive()
        
    return {
        "worker_mode": settings.WORKER_MODE,
        "runner_thread_exists": KaggleOrchestrator._runner_thread is not None,
        "runner_thread_alive": runner_alive,
        "jobs": jobs_list
    }

app.include_router(health.router)
app.include_router(voice_samples.router)
app.include_router(voice_design.router)
app.include_router(tts.router)
app.include_router(jobs.router)
app.include_router(internal_worker.router)
app.include_router(settings_router.router)

