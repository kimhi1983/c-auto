"""
Database models
"""
# Import all models here for Alembic to detect them
from app.models.user import User, UserRole

__all__ = ["User", "UserRole"]
