"""
Database connection configuration using SQLAlchemy
"""
import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

# Get project root directory (parent of app directory)
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

# Database URL from environment variable
# Format: postgresql://user:password@host:port/database
# Default: SQLite (Render 무료 플랜에서도 외부 DB 없이 동작)
_default_db = f"sqlite:///{PROJECT_ROOT / 'c_auto.db'}"
DATABASE_URL = os.getenv("DATABASE_URL", _default_db)

# Render PostgreSQL URL 호환 (render는 postgres:// 사용, SQLAlchemy는 postgresql:// 필요)
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# If using SQLite, convert to absolute path
if DATABASE_URL.startswith("sqlite:///"):
    db_path = DATABASE_URL.replace("sqlite:///", "")
    if db_path.startswith("./"):
        db_path = db_path[2:]
    absolute_db_path = PROJECT_ROOT / db_path
    DATABASE_URL = f"sqlite:///{absolute_db_path}"

# Create SQLAlchemy engine
# SQLite doesn't support pool_size/max_overflow
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
        echo=False,
    )
else:
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_size=10,
        max_overflow=20,
        echo=False,
    )

# Create sessionmaker
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

def get_db():
    """
    Dependency function to get database session
    Usage in FastAPI endpoints:
        @app.get("/endpoint")
        def endpoint(db: Session = Depends(get_db)):
            ...
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
