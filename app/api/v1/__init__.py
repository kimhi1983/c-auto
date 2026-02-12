"""
API v1 routes
"""
from fastapi import APIRouter
from app.api.v1 import auth, users, exchange_rates

api_router = APIRouter()

# Include all v1 routers
api_router.include_router(auth.router, prefix="/auth", tags=["인증"])
api_router.include_router(users.router, prefix="/users", tags=["사용자 관리"])
api_router.include_router(exchange_rates.router, prefix="/exchange-rates", tags=["환율"])

__all__ = ["api_router"]
