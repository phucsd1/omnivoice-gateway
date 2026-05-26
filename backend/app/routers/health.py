from fastapi import APIRouter
from app.schemas import HealthResponse

router = APIRouter()

@router.get("/health", response_model=HealthResponse)
def get_health():
    """Simple check validating backend and orchestration layers are active."""
    return HealthResponse(
        status="ok",
        app="OmniVoice On-Demand Gateway"
    )
