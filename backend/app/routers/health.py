import subprocess
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.config import settings

router = APIRouter()

@router.get("/health")
@router.get("/v1/health")
def get_health():
    """Simple check validating backend and orchestration layers are active."""
    git_hash = "unknown"
    try:
        git_hash = subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], text=True).strip()
    except Exception:
        pass
    return {
        "status": "ok",
        "app": "OmniVoice On-Demand Gateway",
        "git_commit": git_hash
    }

@router.get("/health/db")
@router.get("/v1/health/db")
def get_db_health(db: Session = Depends(get_db)):
    """Comprehensive database health, tables check, and storage verification."""
    result = {
        "database_url": settings.DATABASE_URL,
        "storage_dir": settings.STORAGE_DIR,
        "is_sqlite": settings.DATABASE_URL.startswith("sqlite"),
        "engine_session": "ok",
        "tables": {},
        "raw_sqlite": {},
        "writable": False,
        "errors": []
    }
    
    # 1. Query SQLAlchemy session
    try:
        from app.models import User, ApiKey, VoiceSample, TTSJob, WorkerSession, SystemSetting
        result["tables"]["users"] = db.query(User).count()
        result["tables"]["api_keys"] = db.query(ApiKey).count()
        result["tables"]["voice_samples"] = db.query(VoiceSample).count()
        result["tables"]["tts_jobs"] = db.query(TTSJob).count()
        result["tables"]["worker_sessions"] = db.query(WorkerSession).count()
        result["tables"]["system_settings"] = db.query(SystemSetting).count()
        
        # Check admin user
        admin = db.query(User).filter(User.is_admin == True).first()
        result["admin_user"] = {
            "exists": admin is not None,
            "username": admin.username if admin else None,
            "email": admin.email if admin else None,
            "is_verified": admin.is_verified if admin else None,
            "is_approved": admin.is_approved if admin else None
        }
    except Exception as e:
        result["engine_session"] = f"error: {e}"
        result["errors"].append(f"SQLAlchemy query error: {e}")
        
    # 2. Test raw SQLite direct inspection
    try:
        import sqlite3, os
        from app.database import get_sqlite_path
        db_path = get_sqlite_path(settings.DATABASE_URL)
            
        result["db_path"] = db_path
        result["db_file_exists"] = os.path.exists(db_path)
        if os.path.exists(db_path):
            result["db_file_size_bytes"] = os.path.getsize(db_path)
            
            raw_conn = sqlite3.connect(db_path, timeout=5)
            c = raw_conn.cursor()
            c.execute("PRAGMA integrity_check")
            result["raw_sqlite"]["integrity"] = c.fetchone()[0]
            c.execute("PRAGMA journal_mode")
            result["raw_sqlite"]["journal_mode"] = c.fetchone()[0]
            c.execute("SELECT name FROM sqlite_master WHERE type='table'")
            result["raw_sqlite"]["tables"] = [r[0] for r in c.fetchall()]
            raw_conn.close()
            
            # Test write
            test_conn = sqlite3.connect(db_path, timeout=5)
            tc = test_conn.cursor()
            tc.execute("CREATE TABLE IF NOT EXISTS _health_write_test (id INTEGER PRIMARY KEY)")
            tc.execute("INSERT INTO _health_write_test DEFAULT VALUES")
            tc.execute("DROP TABLE _health_write_test")
            test_conn.commit()
            test_conn.close()
            result["writable"] = True
    except Exception as e:
        result["raw_sqlite"]["error"] = str(e)
        result["errors"].append(f"Raw SQLite error: {e}")
        
    return result


