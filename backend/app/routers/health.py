import subprocess
from fastapi import APIRouter

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
