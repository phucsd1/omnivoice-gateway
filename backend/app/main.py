import os
import time
import asyncio
import signal
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.config import settings
from app.database import engine, Base
from app.services.audio_service import AudioService
from app.services.mock_worker import MockWorker

# Import all routers
from app.routers import health, voice_samples, voice_design, tts, jobs, internal_worker
from app.routers import settings as settings_router

# Auto-shutdown state
last_request_time = time.time()

async def auto_shutdown_monitor():
    global last_request_time
    print("[AutoShutdown] Idle monitor started. Server will shut down if inactive for 5 minutes (300s).")
    while True:
        await asyncio.sleep(10)
        elapsed = time.time() - last_request_time
        if elapsed > 300:  # 5 minutes
            # Double check if there are any active jobs in the database
            from app.database import SessionLocal
            from app.models import TTSJob
            db = SessionLocal()
            try:
                active_job = db.query(TTSJob).filter(
                    TTSJob.status.in_(["starting_worker", "booting_kaggle", "queued_kaggle", "running", "exporting_wav"])
                ).first()
                if active_job:
                    # Reset timer if there is an active job, so we don't shut down while working!
                    last_request_time = time.time()
                    print(f"[AutoShutdown] Active job {active_job.id} is running. Delaying shutdown.")
                    continue
            except Exception as e:
                print(f"[AutoShutdown] Error checking active jobs: {e}")
            finally:
                db.close()
                
            print(f"[AutoShutdown] Server has been idle for {int(elapsed)} seconds. Shutting down process...")
            os.kill(os.getpid(), signal.SIGTERM)
            break

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Reset last request time on startup to avoid immediate shutdown after slow container starts
    global last_request_time
    last_request_time = time.time()

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
        
    # Start auto-shutdown idle monitor
    shutdown_task = asyncio.create_task(auto_shutdown_monitor())
        
    yield
    
    # Shutdown actions
    print("[Main] Shutting down background tasks...")
    shutdown_task.cancel()
    try:
        await shutdown_task
    except asyncio.CancelledError:
        pass

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
    allow_origin_regex="https://.*\\.pages\\.dev",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def update_last_request_time(request: Request, call_next):
    global last_request_time
    path = request.url.path
    # Ignore OPTIONS requests, health checks, documentation pages, and icons
    if (
        request.method != "OPTIONS"
        and not path.startswith("/health")
        and not path.startswith("/docs")
        and not path.startswith("/redoc")
        and not path.endswith("openapi.json")
        and not path.endswith("favicon.ico")
    ):
        last_request_time = time.time()
        print(f"[AutoShutdown] Request to {path} updated last activity time.")
    return await call_next(request)

# Register routers
app.include_router(health.router)
app.include_router(voice_samples.router)
app.include_router(voice_design.router)
app.include_router(tts.router)
app.include_router(jobs.router)
app.include_router(internal_worker.router)
app.include_router(settings_router.router)

