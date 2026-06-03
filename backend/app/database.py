import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.event import listens_for
from app.config import settings

# Cleanup stale SQLite WAL/SHM lock files on start to prevent disk I/O errors on network drives
if settings.DATABASE_URL.startswith("sqlite"):
    db_path = settings.DATABASE_URL
    if db_path.startswith("sqlite:///"):
        db_path = db_path[10:]
    elif db_path.startswith("sqlite://"):
        db_path = db_path[9:]
    elif db_path.startswith("sqlite:"):
        db_path = db_path[7:]
    if "?" in db_path:
        db_path = db_path.split("?")[0]
        
    for suffix in ["-shm", "-wal"]:
        lock_file = db_path + suffix
        if os.path.exists(lock_file):
            try:
                os.remove(lock_file)
                print(f"[Database] Removed stale lock file: {lock_file}")
            except Exception as e:
                print(f"[Database Error] Failed to remove lock file {lock_file}: {e}")

# For SQLite, we need connect_args={"check_same_thread": False, "timeout": 30, "uri": True}
connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args = {
        "check_same_thread": False,
        "timeout": 30,
        "uri": True
    }

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    echo=False
)

# Apply performance and lock-avoidance pragmas to SQLite connections
@listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    if settings.DATABASE_URL.startswith("sqlite"):
        try:
            cursor = dbapi_connection.cursor()
            # Force DELETE journal mode to avoid .shm / .wal lock files on NFS
            cursor.execute("PRAGMA journal_mode=DELETE")
            cursor.execute("PRAGMA synchronous=NORMAL")
            cursor.close()
        except Exception as e:
            print(f"[Database Pragma] Failed to set SQLite pragmas: {e}")

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def migrate_database(db_url: str):
    if not db_url.startswith("sqlite"):
        return
    
    import os
    # Clean up prefix and query params to get raw file path
    db_path = db_url
    if db_path.startswith("sqlite:///"):
        db_path = db_path[10:]
    elif db_path.startswith("sqlite://"):
        db_path = db_path[9:]
    elif db_path.startswith("sqlite:"):
        db_path = db_path[7:]
        
    if "?" in db_path:
        db_path = db_path.split("?")[0]
        
    if not os.path.exists(db_path):
        return
    
    import sqlite3
    print(f"[Migration] Checking database file: {db_path}")
    conn = sqlite3.connect(db_path, timeout=30)
    cursor = conn.cursor()
    
    try:
        # Check if tts_jobs table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='tts_jobs'")
        if not cursor.fetchone():
            conn.close()
            return
            
        cursor.execute("PRAGMA table_info(tts_jobs)")
        columns = [row[1] for row in cursor.fetchall()]
        
        new_cols = {
            "denoise": "BOOLEAN DEFAULT 1",
            "guidance_scale": "FLOAT DEFAULT 2.0",
            "t_shift": "FLOAT DEFAULT 0.1",
            "position_temperature": "FLOAT DEFAULT 5.0",
            "class_temperature": "FLOAT DEFAULT 0.0",
            "layer_penalty_factor": "FLOAT DEFAULT 5.0",
            "duration": "FLOAT",
            "preprocess_prompt": "BOOLEAN DEFAULT 1",
            "postprocess_output": "BOOLEAN DEFAULT 1",
            "audio_chunk_duration": "FLOAT DEFAULT 15.0",
            "audio_chunk_threshold": "FLOAT DEFAULT 30.0",
            "batch_id": "VARCHAR(50)",
            "compat_id": "VARCHAR(100)",
            "with_alignment": "BOOLEAN DEFAULT 0",
            "alignment": "TEXT",
            "started_at": "DATETIME",
            "completed_at": "DATETIME"
        }
        
        for col, col_type in new_cols.items():
            if col not in columns:
                cursor.execute(f"ALTER TABLE tts_jobs ADD COLUMN {col} {col_type}")
                print(f"[Migration] Added column {col} to tts_jobs table in {db_path}")
        
        # Check and migrate voice_samples table
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='voice_samples'")
        if cursor.fetchone():
            cursor.execute("PRAGMA table_info(voice_samples)")
            vs_columns = [row[1] for row in cursor.fetchall()]
            
            vs_new_cols = {
                "name": "VARCHAR(100)",
                "is_public": "BOOLEAN DEFAULT 0",
                "source_job_id": "VARCHAR(50)"
            }
            for col, col_type in vs_new_cols.items():
                if col not in vs_columns:
                    cursor.execute(f"ALTER TABLE voice_samples ADD COLUMN {col} {col_type}")
                    print(f"[Migration] Added column {col} to voice_samples table in {db_path}")
                    
        # Check and migrate worker_sessions table
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='worker_sessions'")
        if cursor.fetchone():
            cursor.execute("PRAGMA table_info(worker_sessions)")
            ws_columns = [row[1] for row in cursor.fetchall()]
            
            ws_new_cols = {
                "user_id": "VARCHAR(50)"
            }
            for col, col_type in ws_new_cols.items():
                if col not in ws_columns:
                    cursor.execute(f"ALTER TABLE worker_sessions ADD COLUMN {col} {col_type}")
                    print(f"[Migration] Added column {col} to worker_sessions table in {db_path}")
                    
        conn.commit()
    except Exception as e:
        print(f"[Migration Error] Failed to migrate database {db_path}: {e}")
    finally:
        conn.close()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
