from fastapi import APIRouter, Depends, HTTPException, status, Query, Response
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timedelta

from app.database import get_db
from app.models import User, ApiUsageLog, TTSJob, ApiKey, SystemSetting
from app.utils.auth import get_current_user, get_password_hash
from app.config import settings

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
    is_approved: bool
    is_admin: bool
    oauth_provider: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True

class UserCreateRequest(BaseModel):
    username: str
    email: str
    password: str
    is_verified: Optional[bool] = False
    is_approved: Optional[bool] = True
    is_admin: Optional[bool] = False

class UserUpdateRequest(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    is_verified: Optional[bool] = None
    is_approved: Optional[bool] = None
    is_admin: Optional[bool] = None

class AdminApiKeyResponse(BaseModel):
    id: str
    user_id: str
    name: str
    key: str
    created_at: datetime
    last_used_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class AdminApiKeyCreateRequest(BaseModel):
    name: str

class SystemSettingsResponse(BaseModel):
    worker_mode: str
    require_admin_approval: bool
    smtp_host: str
    smtp_port: int
    smtp_username: str
    smtp_password: str
    smtp_from: str
    kaggle_username: str
    kaggle_key: str
    kaggle_kernel_ref: str
    kaggle_kernel_slug: str
    kaggle_kernel_title: str
    kaggle_accelerator: str
    kaggle_timeout_seconds: int
    kaggle_idle_timeout_seconds: int
    kaggle_worker_dir: str
    ui_layout: str

class SystemSettingsUpdateRequest(BaseModel):
    worker_mode: Optional[str] = None
    require_admin_approval: Optional[bool] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_from: Optional[str] = None
    kaggle_username: Optional[str] = None
    kaggle_key: Optional[str] = None
    kaggle_kernel_ref: Optional[str] = None
    kaggle_kernel_slug: Optional[str] = None
    kaggle_kernel_title: Optional[str] = None
    kaggle_accelerator: Optional[str] = None
    kaggle_timeout_seconds: Optional[int] = None
    kaggle_idle_timeout_seconds: Optional[int] = None
    kaggle_worker_dir: Optional[str] = None
    ui_layout: Optional[str] = None

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

@router.post("/users", response_model=UserAdminResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreateRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user)
):
    """Allows Admin to create a user account directly."""
    # Check uniqueness
    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(status_code=400, detail="Tên tài khoản đã tồn tại.")
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="Địa chỉ email đã được đăng ký.")

    from app.utils.ids import generate_id
    import secrets

    hashed_pwd = get_password_hash(payload.password)
    user_id = generate_id("usr")
    api_key = f"ovg_live_{secrets.token_hex(24)}"

    new_user = User(
        id=user_id,
        username=payload.username,
        email=payload.email,
        hashed_password=hashed_pwd,
        is_verified=payload.is_verified if payload.is_verified is not None else False,
        is_approved=payload.is_approved if payload.is_approved is not None else True,
        is_admin=payload.is_admin if payload.is_admin is not None else False,
        api_key=api_key
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.put("/users/{user_id}", response_model=UserAdminResponse)
def update_user(
    user_id: str,
    payload: UserUpdateRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user)
):
    """Updates user status (verification state, approval, password, admin role). Cannot demote yourself."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng.")
        
    if payload.username is not None:
        # Check uniqueness
        dup = db.query(User).filter(User.username == payload.username, User.id != user_id).first()
        if dup:
            raise HTTPException(status_code=400, detail="Tên tài khoản đã tồn tại.")
        user.username = payload.username
        
    if payload.email is not None:
        # Check uniqueness
        dup = db.query(User).filter(User.email == payload.email, User.id != user_id).first()
        if dup:
            raise HTTPException(status_code=400, detail="Địa chỉ email đã tồn tại.")
        user.email = payload.email

    if payload.password is not None and payload.password.strip():
        user.hashed_password = get_password_hash(payload.password)

    if payload.is_verified is not None:
        user.is_verified = payload.is_verified
        
    if payload.is_approved is not None:
        user.is_approved = payload.is_approved
        
    if payload.is_admin is not None:
        if user.id == admin.id and payload.is_admin is False:
            raise HTTPException(status_code=400, detail="Bạn không thể tự bỏ quyền admin của chính mình.")
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

# User API Key Management for Admin
@router.get("/users/{user_id}/apikeys", response_model=List[AdminApiKeyResponse])
def list_user_apikeys_admin(
    user_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user)
):
    """Lists all API Keys for a specific user (Admin only)."""
    keys = db.query(ApiKey).filter(ApiKey.user_id == user_id).order_by(ApiKey.created_at.desc()).all()
    return keys

@router.post("/users/{user_id}/apikeys", response_model=AdminApiKeyResponse, status_code=status.HTTP_201_CREATED)
def create_user_apikey_admin(
    user_id: str,
    payload: AdminApiKeyCreateRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user)
):
    """Generates a named API Key for a specific user (Admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng.")

    from app.utils.ids import generate_id
    import secrets

    new_key = f"ovg_live_{secrets.token_hex(24)}"
    key_entry = ApiKey(
        id=generate_id("ak"),
        user_id=user_id,
        name=payload.name,
        key=new_key
    )
    db.add(key_entry)
    db.commit()
    db.refresh(key_entry)
    return key_entry

@router.delete("/apikeys/{key_id}", response_model=dict)
def delete_apikey_admin(
    key_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user)
):
    """Admin revokes any API Key."""
    key_entry = db.query(ApiKey).filter(ApiKey.id == key_id).first()
    if not key_entry:
        raise HTTPException(status_code=404, detail="Không tìm thấy Khóa API.")
    db.delete(key_entry)
    db.commit()
    return {"status": "success", "message": "Thu hồi khóa API thành công."}

# Global System Settings
@router.get("/settings", response_model=SystemSettingsResponse)
def get_system_settings_admin(
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user)
):
    """Retrieves all global system settings (Admin only)."""
    def get_setting(key: str, default_val):
        entry = db.query(SystemSetting).filter(SystemSetting.key == key).first()
        if entry and entry.value.strip():
            return entry.value.strip()
        return default_val

    worker_mode = get_setting("worker_mode", settings.WORKER_MODE)
    
    req_approval_str = get_setting("require_admin_approval", "false")
    require_admin_approval = req_approval_str.lower() == "true"
    
    smtp_host = get_setting("smtp_host", settings.SMTP_HOST)
    
    smtp_port_str = get_setting("smtp_port", str(settings.SMTP_PORT))
    try:
        smtp_port = int(smtp_port_str)
    except ValueError:
        smtp_port = settings.SMTP_PORT
        
    smtp_username = get_setting("smtp_username", settings.SMTP_USERNAME)
    smtp_password = get_setting("smtp_password", settings.SMTP_PASSWORD)
    smtp_from = get_setting("smtp_from", settings.SMTP_FROM)
    
    kaggle_username = get_setting("kaggle_username", settings.KAGGLE_USERNAME)
    kaggle_key = get_setting("kaggle_key", settings.KAGGLE_KEY)
    kaggle_kernel_ref = get_setting("kaggle_kernel_ref", settings.KAGGLE_KERNEL_REF)
    kaggle_kernel_slug = get_setting("kaggle_kernel_slug", settings.KAGGLE_KERNEL_SLUG)
    kaggle_kernel_title = get_setting("kaggle_kernel_title", settings.KAGGLE_KERNEL_TITLE)
    kaggle_accelerator = get_setting("kaggle_accelerator", settings.KAGGLE_ACCELERATOR)
    
    kaggle_timeout_str = get_setting("kaggle_timeout_seconds", str(settings.KAGGLE_TIMEOUT_SECONDS))
    try:
        kaggle_timeout_seconds = int(kaggle_timeout_str)
    except ValueError:
        kaggle_timeout_seconds = settings.KAGGLE_TIMEOUT_SECONDS
        
    kaggle_idle_timeout_str = get_setting("kaggle_idle_timeout_seconds", str(settings.WORKER_IDLE_TIMEOUT_SECONDS))
    try:
        kaggle_idle_timeout_seconds = int(kaggle_idle_timeout_str)
    except ValueError:
        kaggle_idle_timeout_seconds = settings.WORKER_IDLE_TIMEOUT_SECONDS

    kaggle_worker_dir = get_setting("kaggle_worker_dir", settings.KAGGLE_WORKER_DIR)
    ui_layout = get_setting("ui_layout", "modern")

    return SystemSettingsResponse(
        worker_mode=worker_mode,
        require_admin_approval=require_admin_approval,
        smtp_host=smtp_host,
        smtp_port=smtp_port,
        smtp_username=smtp_username,
        smtp_password=smtp_password,
        smtp_from=smtp_from,
        kaggle_username=kaggle_username,
        kaggle_key=kaggle_key,
        kaggle_kernel_ref=kaggle_kernel_ref,
        kaggle_kernel_slug=kaggle_kernel_slug,
        kaggle_kernel_title=kaggle_kernel_title,
        kaggle_accelerator=kaggle_accelerator,
        kaggle_timeout_seconds=kaggle_timeout_seconds,
        kaggle_idle_timeout_seconds=kaggle_idle_timeout_seconds,
        kaggle_worker_dir=kaggle_worker_dir,
        ui_layout=ui_layout
    )

@router.post("/settings", response_model=dict)
def update_system_settings_admin(
    payload: SystemSettingsUpdateRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user)
):
    """Updates global system settings (Admin only)."""
    def save_setting(key: str, val):
        if val is None:
            return
        entry = db.query(SystemSetting).filter(SystemSetting.key == key).first()
        if not entry:
            entry = SystemSetting(key=key, value=str(val))
            db.add(entry)
        else:
            entry.value = str(val)

    try:
        if payload.worker_mode is not None:
            if payload.worker_mode not in ["mock", "kaggle"]:
                raise HTTPException(status_code=400, detail="worker_mode phải là 'mock' hoặc 'kaggle'.")
            save_setting("worker_mode", payload.worker_mode)
            
        if payload.ui_layout is not None:
            if payload.ui_layout not in ["classic", "modern"]:
                raise HTTPException(status_code=400, detail="ui_layout phải là 'classic' hoặc 'modern'.")
            save_setting("ui_layout", payload.ui_layout)
            
        if payload.require_admin_approval is not None:
            save_setting("require_admin_approval", "true" if payload.require_admin_approval else "false")
            
        if payload.smtp_host is not None:
            save_setting("smtp_host", payload.smtp_host)
        if payload.smtp_port is not None:
            save_setting("smtp_port", payload.smtp_port)
        if payload.smtp_username is not None:
            save_setting("smtp_username", payload.smtp_username)
        if payload.smtp_password is not None:
            save_setting("smtp_password", payload.smtp_password)
        if payload.smtp_from is not None:
            save_setting("smtp_from", payload.smtp_from)
            
        if payload.kaggle_username is not None:
            save_setting("kaggle_username", payload.kaggle_username)
        if payload.kaggle_key is not None:
            save_setting("kaggle_key", payload.kaggle_key)
        if payload.kaggle_kernel_ref is not None:
            save_setting("kaggle_kernel_ref", payload.kaggle_kernel_ref)
        if payload.kaggle_kernel_slug is not None:
            save_setting("kaggle_kernel_slug", payload.kaggle_kernel_slug)
        if payload.kaggle_kernel_title is not None:
            save_setting("kaggle_kernel_title", payload.kaggle_kernel_title)
        if payload.kaggle_accelerator is not None:
            save_setting("kaggle_accelerator", payload.kaggle_accelerator)
        if payload.kaggle_timeout_seconds is not None:
            save_setting("kaggle_timeout_seconds", payload.kaggle_timeout_seconds)
        if payload.kaggle_idle_timeout_seconds is not None:
            save_setting("kaggle_idle_timeout_seconds", payload.kaggle_idle_timeout_seconds)
        if payload.kaggle_worker_dir is not None:
            save_setting("kaggle_worker_dir", payload.kaggle_worker_dir)
        
        db.commit()
        return {"status": "success", "message": "Cập nhật cấu hình hệ thống thành công."}
    except Exception as e:
        db.rollback()
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi ghi cấu hình hệ thống: {e}"
        )

# Stats & Logs
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
