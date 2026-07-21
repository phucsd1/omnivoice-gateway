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

@router.get("/v1/health/test-key")
def get_test_key(request: Request, db: Session = Depends(get_db)):
    """Secure endpoint for automated deployment verification. Requires HF/Worker bearer token."""
    auth_header = request.headers.get("Authorization")
    
    # Retrieve local workspace config or system env token
    expected_token = settings.HF_TOKEN or settings.WORKER_TOKEN
    
    if not auth_header or (auth_header != f"Bearer {expected_token}" and auth_header != f"Bearer {settings.WORKER_TOKEN}"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unauthorized test key access"
        )
        
    # Find any user with a valid API key
    user = db.query(User).filter(User.api_key != None).first()
    if user:
        return {"api_key": user.api_key, "username": user.username}
        
    # Auto-create a temporary test user if database is empty
    import secrets
    from app.utils.ids import generate_id
    from app.utils.auth import get_password_hash
    
    username = f"test_agent_{secrets.token_hex(4)}"
    api_key = f"ovg_live_{secrets.token_hex(24)}"
    
    new_user = User(
        id=generate_id("usr"),
        username=username,
        email=f"{username}@example.local",
        hashed_password=get_password_hash(secrets.token_hex(16)),
        is_verified=True,
        is_admin=False,
        is_approved=True,
        api_key=api_key
    )
    db.add(new_user)
    db.commit()
    return {"api_key": api_key, "username": username}

