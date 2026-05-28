from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import settings

# For SQLite, we need connect_args={"check_same_thread": False}
connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    echo=False
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def migrate_database(db_url: str):
    if not db_url.startswith("sqlite:///"):
        return
    
    import os
    db_path = db_url.replace("sqlite:///", "")
    if not os.path.exists(db_path):
        return
    
    import sqlite3
    print(f"[Migration] Checking database file: {db_path}")
    conn = sqlite3.connect(db_path)
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
            "audio_chunk_threshold": "FLOAT DEFAULT 30.0"
        }
        
        for col, col_type in new_cols.items():
            if col not in columns:
                cursor.execute(f"ALTER TABLE tts_jobs ADD COLUMN {col} {col_type}")
                print(f"[Migration] Added column {col} to tts_jobs table in {db_path}")
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
