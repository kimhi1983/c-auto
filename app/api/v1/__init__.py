"""
API v1 routes
"""
from fastapi import APIRouter
from app.api.v1 import auth

api_router = APIRouter()

# Include all v1 routers
api_router.include_router(auth.router, prefix="/auth", tags=["인증"])

__all__ = ["api_router"]
