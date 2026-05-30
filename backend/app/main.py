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
from app.routers import health, voice_samples, voice_design, tts, jobs, internal_worker, auth, admin, audio, compat
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
    
    # Run SQLite migration for any added columns
    from app.database import migrate_database
    migrate_database(settings.DATABASE_URL)
    
    # Seed default admin account
    print("[Main] Seeding default admin account if not present...")
    from app.database import SessionLocal
    from app.models import User
    from app.utils.auth import get_password_hash
    import secrets
    db = SessionLocal()
    try:
        admin_user = db.query(User).filter(User.username == "admin").first()
        if not admin_user:
            from app.utils.ids import generate_id
            hashed_pwd = get_password_hash("admin_password_2026")
            api_key = f"ovg_live_{secrets.token_hex(24)}"
            admin_user = User(
                id=generate_id("usr"),
                username="admin",
                email="admin@omnivoice.local",
                hashed_password=hashed_pwd,
                is_verified=True,
                is_admin=True,
                api_key=api_key
            )
            db.add(admin_user)
            db.commit()
            print("[Main] Default admin account successfully created (admin / admin_password_2026).")
        else:
            print("[Main] Default admin account already exists.")
    except Exception as e:
        print(f"[Main ERROR] Failed to seed default admin: {e}")
    finally:
        db.close()
        
    # Start mock background worker if configured
    if settings.WORKER_MODE == "mock":
        print("[Main] Running in MOCK worker mode. Initializing MockWorker background thread...")
        MockWorker.start()
    else:
        print(f"[Main] Running in KAGGLE worker mode. Initializing KaggleOrchestrator queue runner...")
        from app.services.kaggle_orchestrator import KaggleOrchestrator
        KaggleOrchestrator.start_queue_runner()
        
    # Start auto-shutdown idle monitor (only if NOT running on HF Spaces)
    # HF Spaces has its own gcTimeout, so self-termination causes "Runtime error: Exit code 0"
    shutdown_task = None
    if not os.environ.get("SPACE_ID"):
        shutdown_task = asyncio.create_task(auto_shutdown_monitor())
        print("[Main] Auto-shutdown monitor started (not on HF Spaces).")
    else:
        print("[Main] Running on HF Spaces — auto-shutdown disabled (HF manages lifecycle).")
        
    yield
    
    # Shutdown actions
    print("[Main] Shutting down background tasks...")
    if shutdown_task:
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
async def log_api_usage(request: Request, call_next):
    path = request.url.path
    
    # Exclude high-frequency polling and worker endpoints from DB logging
    is_polling = (
        path.startswith("/v1/internal/worker")
        or path.startswith("/v1/auth/me")
        or (request.method == "GET" and (
            (path.startswith("/v1/tts/jobs/") and len(path) > 13)
            or (path.startswith("/v1/voice-design/previews/") and len(path) > 26)
        ))
    )
    
    is_loggable = (
        request.method != "OPTIONS"
        and not is_polling
        and not path.startswith("/health")
        and not path.startswith("/docs")
        and not path.startswith("/redoc")
        and not path.endswith("openapi.json")
        and not path.endswith("favicon.ico")
    )
    
    if not is_loggable:
        return await call_next(request)
        
    start_time = time.time()
    response = await call_next(request)
    duration_ms = (time.time() - start_time) * 1000
    
    # Try resolving user from Authorization header token
    user_id = None
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        from app.database import SessionLocal
        from app.models import User, ApiKey
        from jose import jwt
        db = SessionLocal()
        try:
            # 1. Try new ApiKey table
            api_key_obj = db.query(ApiKey).filter(ApiKey.key == token).first()
            if api_key_obj:
                user_id = api_key_obj.user_id
            else:
                # Fallback to old User.api_key
                user = db.query(User).filter(User.api_key == token).first()
                if user:
                    user_id = user.id
                else:
                    # 2. Try JWT
                    try:
                        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
                        username = payload.get("sub")
                        if username:
                            user = db.query(User).filter(User.username == username).first()
                            if user:
                                user_id = user.id
                    except Exception:
                        pass
        except Exception as e:
            print(f"[Middleware API Logger] Database error: {e}")
        finally:
            db.close()
            
    # Save log entry
    from app.database import SessionLocal
    from app.models import ApiUsageLog
    from app.utils.ids import generate_id
    db = SessionLocal()
    try:
        log_entry = ApiUsageLog(
            id=generate_id("log"),
            user_id=user_id,
            endpoint=path,
            method=request.method,
            status_code=response.status_code,
            ip_address=request.client.host if request.client else None,
            duration_ms=duration_ms
        )
        db.add(log_entry)
        db.commit()
    except Exception as e:
        print(f"[Middleware API Logger] Failed to save log: {e}")
    finally:
        db.close()
        
    return response

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
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(voice_samples.router)
app.include_router(voice_design.router)
app.include_router(tts.router)
app.include_router(jobs.router)
app.include_router(internal_worker.router)
app.include_router(settings_router.router)
app.include_router(audio.router)
app.include_router(compat.router)

