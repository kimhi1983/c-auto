"""
API v1 routes
"""
from fastapi import APIRouter
from app.api.v1 import auth, users, exchange_rates, emails, files, archives, inventory, ai_documents

api_router = APIRouter(redirect_slashes=False)

# Include all v1 routers
api_router.include_router(auth.router, prefix="/auth", tags=["인증"])
api_router.include_router(users.router, prefix="/users", tags=["사용자 관리"])
api_router.include_router(exchange_rates.router, prefix="/exchange-rates", tags=["환율"])
api_router.include_router(emails.router, prefix="/emails", tags=["이메일 관리"])
api_router.include_router(files.router, prefix="/files", tags=["파일 관리"])
api_router.include_router(archives.router, prefix="/archives", tags=["아카이브"])
api_router.include_router(inventory.router, prefix="/inventory", tags=["재고 관리"])
api_router.include_router(ai_documents.router, prefix="/ai-docs", tags=["AI 문서 작업"])

__all__ = ["api_router"]
