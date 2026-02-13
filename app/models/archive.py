"""
Document Archive models for automated archiving system
"""
from sqlalchemy import Column, Integer, String, Text, BigInteger, DateTime, ForeignKey
from sqlalchemy.sql import func

from app.database.base import Base


class ArchivedDocument(Base):
    """Archived document records"""
    __tablename__ = "archived_documents"

    id = Column(Integer, primary_key=True, index=True)
    email_id = Column(Integer, ForeignKey("emails.id"), nullable=True, index=True)
    document_type = Column(String(20), nullable=False)  # pdf, excel, email, report
    file_name = Column(String(500), nullable=False)
    file_path = Column(String(1000), nullable=False)
    file_size = Column(BigInteger, default=0)
    company_name = Column(String(200), nullable=True, index=True)
    category = Column(String(50), nullable=True)  # 발주, 요청, 견적 etc.
    description = Column(Text, nullable=True)
    archived_date = Column(DateTime(timezone=True), server_default=func.now())
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<ArchivedDocument {self.id}: {self.file_name}>"


class DailyReport(Base):
    """Daily/weekly/monthly report records"""
    __tablename__ = "daily_reports"

    id = Column(Integer, primary_key=True, index=True)
    report_date = Column(DateTime(timezone=True), nullable=False, index=True)
    report_type = Column(String(20), nullable=False)  # daily, weekly, monthly
    file_path = Column(String(1000), nullable=True)
    file_name = Column(String(500), nullable=True)
    generated_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    email_count = Column(Integer, default=0)
    inventory_transactions = Column(Integer, default=0)
    summary_text = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<DailyReport {self.id}: {self.report_type} {self.report_date}>"
