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
        print(f"[Main] Running in KAGGLE worker mode. Pull-based worker API active at /v1/internal.")
        
    yield
    
    # Shutdown actions
    if settings.WORKER_MODE == "mock":
        print("[Main] Shutting down MockWorker background thread...")
        MockWorker.stop()
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
app.include_router(health.router)
app.include_router(voice_samples.router)
app.include_router(voice_design.router)
app.include_router(tts.router)
app.include_router(jobs.router)
app.include_router(internal_worker.router)
app.include_router(settings_router.router)

