"""
Authentication API endpoints
"""
from datetime import timedelta
from typing import Dict
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.database.config import get_db
from app.models.user import User
from app.auth.security import verify_password, get_password_hash, create_access_token, JWT_EXPIRE_MINUTES
from app.auth.dependencies import get_current_active_user, require_admin
from app.auth.schemas import Token, UserCreate, UserResponse, UserLogin
from app.utils.logger import setup_logger

logger = setup_logger(__name__)

router = APIRouter()


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(
    user_data: UserCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin)  # Only admin can create users
):
    """
    Register a new user (Admin only)

    Only administrators can create new user accounts.
    """
    logger.info(f"사용자 등록 시도: {user_data.email}")

    # Check if user already exists
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        logger.warning(f"이미 존재하는 이메일: {user_data.email}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이미 등록된 이메일입니다"
        )

    # Create new user
    hashed_password = get_password_hash(user_data.password)
    new_user = User(
        email=user_data.email,
        password_hash=hashed_password,
        full_name=user_data.full_name,
        role=user_data.role,
        department=user_data.department,
        is_active=True
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    logger.info(f"사용자 등록 완료: {new_user.email} ({new_user.role})")
    return new_user


@router.post("/login", response_model=Token)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """
    User login

    Returns a JWT access token for authentication.
    """
    logger.info(f"로그인 시도: {form_data.username}")

    # Get user by email
    user = db.query(User).filter(User.email == form_data.username).first()

    # Verify user and password
    if not user or not verify_password(form_data.password, user.password_hash):
        logger.warning(f"로그인 실패: {form_data.username}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="이메일 또는 비밀번호가 올바르지 않습니다",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check if user is active
    if not user.is_active:
        logger.warning(f"비활성 사용자 로그인 시도: {form_data.username}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="비활성 사용자입니다"
        )

    # Create access token
    access_token_expires = timedelta(minutes=JWT_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email},
        expires_delta=access_token_expires
    )

    logger.info(f"로그인 성공: {user.email} ({user.role})")
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_active_user)):
    """
    Get current user information

    Returns the currently authenticated user's profile.
    """
    logger.info(f"사용자 정보 조회: {current_user.email}")
    return current_user


@router.post("/logout")
def logout(current_user: User = Depends(get_current_active_user)) -> Dict[str, str]:
    """
    User logout

    Note: JWT tokens are stateless, so actual logout is handled on the client side
    by removing the token. This endpoint is for logging purposes and future token blacklisting.
    """
    logger.info(f"로그아웃: {current_user.email}")
    return {"message": "로그아웃되었습니다"}
