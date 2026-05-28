from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.config import settings
from app.database import get_db
from app.models import User

security_scheme = HTTPBearer()

def verify_worker_token(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    db: Session = Depends(get_db)
):
    """Verifies that the provided Bearer token matches the configured WORKER_TOKEN OR a user's API Key."""
    token = credentials.credentials
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing worker token.",
        )
        
    # Check if system worker token
    if settings.WORKER_TOKEN and token == settings.WORKER_TOKEN:
        return token
        
    # Check if it matches a user's API Key
    user = db.query(User).filter(User.api_key == token).first()
    if user:
        return token
        
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid worker token.",
    )
