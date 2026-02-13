"""
Pydantic schemas for authentication
"""
from typing import Optional
from pydantic import BaseModel, EmailStr, Field
from app.models.user import UserRole


class Token(BaseModel):
    """Token response schema"""
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    """Token data schema"""
    email: Optional[str] = None


class UserLogin(BaseModel):
    """User login request schema"""
    email: EmailStr
    password: str


class UserCreate(BaseModel):
    """User registration/creation schema"""
    email: EmailStr
    password: str = Field(..., min_length=8, description="최소 8자 이상")
    full_name: str = Field(..., min_length=2, max_length=100)
    role: UserRole = UserRole.STAFF
    department: Optional[str] = Field(None, max_length=50)


class UserUpdate(BaseModel):
    """User update schema"""
    full_name: Optional[str] = Field(None, min_length=2, max_length=100)
    department: Optional[str] = Field(None, max_length=50)
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None


class UserResponse(BaseModel):
    """User response schema (without password)"""
    id: int
    email: str
    full_name: str
    role: UserRole
    department: Optional[str]
    is_active: bool

    class Config:
        from_attributes = True
