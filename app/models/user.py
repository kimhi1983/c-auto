"""
User model for authentication and authorization
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum
from sqlalchemy.sql import func
import enum

from app.database.base import Base


class UserRole(str, enum.Enum):
    """User roles for role-based access control"""
    ADMIN = "admin"  # 관리자: 모든 권한
    APPROVER = "approver"  # 승인권자: 답신 승인, 팀 관리
    STAFF = "staff"  # 담당자: 업무 처리, 답신 작성
    VIEWER = "viewer"  # 열람자: 읽기 전용


class User(Base):
    """
    User table for authentication and authorization

    Roles:
    - admin: Full access, user management, system settings
    - approver: Approve emails, manage team, view reports
    - staff: Process emails, create drafts, search files
    - viewer: Read-only access to dashboard and reports
    """
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(100), nullable=False)
    role = Column(Enum(UserRole), default=UserRole.STAFF, nullable=False)
    department = Column(String(50), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    def __repr__(self):
        return f"<User {self.email} ({self.role})>"

    @property
    def is_admin(self) -> bool:
        """Check if user is admin"""
        return self.role == UserRole.ADMIN

    @property
    def is_approver(self) -> bool:
        """Check if user is approver or admin"""
        return self.role in [UserRole.ADMIN, UserRole.APPROVER]

    @property
    def can_approve(self) -> bool:
        """Check if user can approve emails"""
        return self.role in [UserRole.ADMIN, UserRole.APPROVER]

    @property
    def can_edit(self) -> bool:
        """Check if user can edit (not viewer)"""
        return self.role != UserRole.VIEWER
