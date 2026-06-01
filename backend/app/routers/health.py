from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.schemas import HealthResponse
from app.database import get_db

router = APIRouter()

@router.get("/health", response_model=HealthResponse)
def get_health():
    """Simple check validating backend and orchestration layers are active."""
    return HealthResponse(
        status="ok",
        app="OmniVoice On-Demand Gateway"
    )

@router.get("/health/kaggle-logs")
def get_kaggle_logs(db: Session = Depends(get_db)):
    import os
    import sys
    import subprocess
    import tempfile
    from app.services.kaggle_orchestrator import KaggleOrchestrator
    from app.models import User
    
    admin_user = db.query(User).filter(User.username == "admin").first()
    admin_user_id = admin_user.id if admin_user else None
    
    username, key, kernel_ref, _ = KaggleOrchestrator.get_credentials(db, user_id=admin_user_id)
    if not username or not key:
        return {"error": f"Kaggle credentials not configured in backend settings for admin_user_id={admin_user_id}."}
        
    env = os.environ.copy()
    env["KAGGLE_USERNAME"] = username
    env["KAGGLE_KEY"] = key
    env["PYTHONUTF8"] = "1"
    
    temp_dir = tempfile.mkdtemp()
    
    cmd = [sys.executable, "-c", "from kaggle.cli import main; main()", "kernels", "output", kernel_ref, "-p", temp_dir]
    
    try:
        res = subprocess.run(cmd, capture_output=True, env=env, text=True, timeout=30.0)
        files = os.listdir(temp_dir)
        contents = {}
        for f in files:
            file_path = os.path.join(temp_dir, f)
            if os.path.isfile(file_path):
                try:
                    with open(file_path, "r", encoding="utf-8", errors="ignore") as lf:
                        contents[f] = lf.read()[:5000]
                except Exception as ex:
                    contents[f] = f"Error reading: {ex}"
        return {
            "returncode": res.returncode,
            "stdout": res.stdout,
            "stderr": res.stderr,
            "files": files,
            "contents": contents
        }
    except Exception as e:
        return {"error": str(e)}
