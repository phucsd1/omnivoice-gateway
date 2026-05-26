from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.config import settings

security_scheme = HTTPBearer()

def verify_worker_token(credentials: HTTPAuthorizationCredentials = Depends(security_scheme)):
    """Verifies that the provided Bearer token matches the configured WORKER_TOKEN."""
    token = credentials.credentials
    if not settings.WORKER_TOKEN:
        # If token is empty in config, block by default
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Worker token verification disabled, configuration missing.",
        )
    if token != settings.WORKER_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid worker token.",
        )
    return token
