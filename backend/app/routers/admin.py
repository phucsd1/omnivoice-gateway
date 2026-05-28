from fastapi import APIRouter, Depends, HTTPException, status, Query, Response
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timedelta

from app.database import get_db
from app.models import User, ApiUsageLog, TTSJob
from app.utils.auth import get_current_user

router = APIRouter(prefix="/v1/admin", tags=["Admin Portal"])

def get_admin_user(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền truy cập trang quản trị."
        )
    return current_user

class UserAdminResponse(BaseModel):
    id: str
    username: str
    email: Optional[str]
    is_verified: bool
    is_admin: bool
    oauth_provider: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True

class UserUpdateRequest(BaseModel):
    is_verified: Optional[bool] = None
    is_admin: Optional[bool] = None

class AdminStatsResponse(BaseModel):
    total_users: int
    verified_users: int
    active_jobs: int
    completed_jobs: int
    failed_jobs: int
    total_api_calls: int

class ApiLogResponse(BaseModel):
    id: str
    user_id: Optional[str]
    username: Optional[str]
    endpoint: str
    method: str
    status_code: int
    ip_address: Optional[str]
    duration_ms: float
    created_at: datetime

@router.get("/users", response_model=List[UserAdminResponse])
def list_users(
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100)
):
    """Lists all users in the system (Admin only)."""
    users = db.query(User).order_by(User.created_at.desc()).offset(skip).limit(limit).all()
    return users

@router.put("/users/{user_id}", response_model=UserAdminResponse)
def update_user(
    user_id: str,
    payload: UserUpdateRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user)
):
    """Updates user status (verification state, admin role). Cannot demote yourself."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng.")
        
    if user.id == admin.id and payload.is_admin is False:
        raise HTTPException(status_code=400, detail="Bạn không thể tự bỏ quyền admin của chính mình.")

    if payload.is_verified is not None:
        user.is_verified = payload.is_verified
    if payload.is_admin is not None:
        user.is_admin = payload.is_admin
        
    db.commit()
    db.refresh(user)
    return user

@router.delete("/users/{user_id}", response_model=dict)
def delete_user(
    user_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user)
):
    """Deletes a user account from the system (Admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng.")
        
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Bạn không thể tự xóa tài khoản của chính mình.")
        
    db.delete(user)
    db.commit()
    return {"status": "success", "message": "Xóa người dùng thành công."}

@router.get("/stats", response_model=AdminStatsResponse)
def get_stats(
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user)
):
    """Aggregates system-wide usage statistics (Admin only)."""
    total_users = db.query(User).count()
    verified_users = db.query(User).filter(User.is_verified == True).count()
    
    active_jobs = db.query(TTSJob).filter(
        TTSJob.status.in_(["queued", "starting_worker", "booting_kaggle", "queued_kaggle", "running", "preparing_input", "generating_audio", "exporting_wav"])
    ).count()
    completed_jobs = db.query(TTSJob).filter(TTSJob.status == "completed").count()
    failed_jobs = db.query(TTSJob).filter(TTSJob.status == "failed").count()
    
    total_api_calls = db.query(ApiUsageLog).count()
    
    return AdminStatsResponse(
        total_users=total_users,
        verified_users=verified_users,
        active_jobs=active_jobs,
        completed_jobs=completed_jobs,
        failed_jobs=failed_jobs,
        total_api_calls=total_api_calls
    )

@router.get("/logs", response_model=List[ApiLogResponse])
def list_logs(
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    status_code: Optional[int] = Query(None)
):
    """Lists recent API usage logs with username resolution (Admin only)."""
    query = db.query(ApiUsageLog)
    
    if status_code is not None:
        query = query.filter(ApiUsageLog.status_code == status_code)
        
    logs = query.order_by(ApiUsageLog.created_at.desc()).offset(skip).limit(limit).all()
    
    # Batch resolve usernames to reduce SQL queries
    user_ids = {log.user_id for log in logs if log.user_id}
    users_map = {}
    if user_ids:
        users = db.query(User).filter(User.id.in_(user_ids)).all()
        users_map = {u.id: u.username for u in users}
        
    result = []
    for log in logs:
        result.append(
            ApiLogResponse(
                id=log.id,
                user_id=log.user_id,
                username=users_map.get(log.user_id) if log.user_id else "Anonymous",
                endpoint=log.endpoint,
                method=log.method,
                status_code=log.status_code,
                ip_address=log.ip_address,
                duration_ms=log.duration_ms,
                created_at=log.created_at
            )
        )
        
    return result
