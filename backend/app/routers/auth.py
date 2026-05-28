import secrets
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

from app.database import get_db
from app.models import User
from app.utils.ids import generate_id
from app.utils.auth import (
    get_password_hash,
    verify_password,
    create_access_token,
    get_current_user,
)

router = APIRouter(prefix="/v1/auth", tags=["Authentication"])

class UserRegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6, max_length=100)

class UserLoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

class UserMeResponse(BaseModel):
    id: str
    username: str
    has_api_key: bool
    api_key: Optional[str] = None
    created_at: datetime

@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(payload: UserRegisterRequest, db: Session = Depends(get_db)):
    # Check if username exists
    existing_user = db.query(User).filter(User.username == payload.username).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tên tài khoản đã tồn tại trên hệ thống."
        )
        
    hashed_pwd = get_password_hash(payload.password)
    user_id = generate_id("usr")
    
    # Auto-generate API Key on registration
    api_key = f"ovg_live_{secrets.token_hex(24)}"
    
    new_user = User(
        id=user_id,
        username=payload.username,
        hashed_password=hashed_pwd,
        api_key=api_key
    )
    db.add(new_user)
    db.commit()
    return {"status": "success", "message": "Đăng ký tài khoản thành công."}

@router.post("/login", response_model=TokenResponse)
def login(payload: UserLoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == payload.username).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tài khoản hoặc mật khẩu không chính xác."
        )
        
    access_token = create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/me", response_model=UserMeResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return UserMeResponse(
        id=current_user.id,
        username=current_user.username,
        has_api_key=current_user.api_key is not None,
        api_key=current_user.api_key,
        created_at=current_user.created_at
    )

@router.post("/apikey", response_model=dict)
def generate_api_key(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    new_key = f"ovg_live_{secrets.token_hex(24)}"
    current_user.api_key = new_key
    db.commit()
    return {
        "status": "success",
        "message": "Tạo khóa API mới thành công.",
        "api_key": new_key
    }

@router.delete("/apikey", response_model=dict)
def revoke_api_key(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    current_user.api_key = None
    db.commit()
    return {
        "status": "success",
        "message": "Đã thu hồi khóa API thành công."
    }
