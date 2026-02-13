"""
File index model for search indexing and AI recommendations
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, BigInteger
from sqlalchemy.sql import func

from app.database.base import Base


class FileIndex(Base):
    """Indexed file for fast search"""
    __tablename__ = "file_index"

    id = Column(Integer, primary_key=True, index=True)
    file_name = Column(String(500), nullable=False, index=True)
    file_path = Column(String(1000), nullable=False, unique=True)
    file_type = Column(String(20), nullable=True)  # extension
    file_size = Column(BigInteger, default=0)
    directory = Column(String(1000), nullable=True)
    last_modified = Column(DateTime(timezone=True), nullable=True)
    is_accessible = Column(Boolean, default=True)
    ai_tags = Column(Text, nullable=True)  # comma-separated tags
    indexed_at = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<FileIndex {self.file_name}>"
