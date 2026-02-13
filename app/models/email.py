"""
Email models for email management and approval workflow
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, Enum, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import enum

from app.database.base import Base


class EmailCategory(str, enum.Enum):
    """8-category email classification"""
    ORDER = "발주"          # 발주 (Purchase Order)
    REQUEST = "요청"        # 요청 (Request)
    QUOTE = "견적요청"      # 견적요청 (Quote Request)
    INQUIRY = "문의"        # 문의 (Inquiry)
    NOTICE = "공지"         # 공지 (Notice/Announcement)
    MEETING = "미팅"        # 미팅 (Meeting)
    CLAIM = "클레임"        # 클레임 (Claim/Complaint)
    OTHER = "기타"          # 기타 (Other)


class EmailPriority(str, enum.Enum):
    """Email priority levels"""
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class EmailStatus(str, enum.Enum):
    """Email processing status"""
    UNREAD = "unread"           # 미확인
    READ = "read"               # 확인됨
    DRAFT = "draft"             # 답신 초안 작성됨
    IN_REVIEW = "in_review"     # 검토 중
    APPROVED = "approved"       # 승인됨
    REJECTED = "rejected"       # 반려됨
    SENT = "sent"               # 발송 완료
    ARCHIVED = "archived"       # 보관됨


class ApprovalStatus(str, enum.Enum):
    """Approval stage status"""
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class Email(Base):
    """Email table for storing and managing emails"""
    __tablename__ = "emails"

    id = Column(Integer, primary_key=True, index=True)
    external_id = Column(String(255), unique=True, nullable=True)  # POP3 message ID
    subject = Column(String(500), nullable=False)
    sender = Column(String(255), nullable=False)
    recipient = Column(String(255), nullable=True)
    body = Column(Text, nullable=True)
    body_html = Column(Text, nullable=True)

    # AI classification
    category = Column(String(20), default=EmailCategory.OTHER.value)
    priority = Column(String(10), default=EmailPriority.MEDIUM.value)
    ai_summary = Column(Text, nullable=True)
    ai_draft_response = Column(Text, nullable=True)
    ai_confidence = Column(Integer, default=0)  # 0-100

    # Workflow status
    status = Column(String(20), default=EmailStatus.UNREAD.value, index=True)

    # User draft (edited by staff)
    draft_response = Column(Text, nullable=True)
    draft_subject = Column(String(500), nullable=True)

    # Tracking
    processed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    received_at = Column(DateTime(timezone=True), nullable=True)
    processed_at = Column(DateTime(timezone=True), nullable=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    approvals = relationship("EmailApproval", back_populates="email", cascade="all, delete-orphan")
    attachments = relationship("EmailAttachment", back_populates="email", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Email {self.id}: {self.subject[:30]}>"


class EmailApproval(Base):
    """Email approval workflow tracking"""
    __tablename__ = "email_approvals"

    id = Column(Integer, primary_key=True, index=True)
    email_id = Column(Integer, ForeignKey("emails.id"), nullable=False, index=True)
    stage = Column(String(20), nullable=False)  # draft, review, approval, send
    approver_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(String(20), default=ApprovalStatus.PENDING.value)
    comments = Column(Text, nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    email = relationship("Email", back_populates="approvals")

    def __repr__(self):
        return f"<EmailApproval {self.id}: email={self.email_id} stage={self.stage}>"


class EmailAttachment(Base):
    """Email attachment tracking"""
    __tablename__ = "email_attachments"

    id = Column(Integer, primary_key=True, index=True)
    email_id = Column(Integer, ForeignKey("emails.id"), nullable=False, index=True)
    file_name = Column(String(500), nullable=False)
    file_path = Column(String(1000), nullable=True)
    file_size = Column(Integer, default=0)
    content_type = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    email = relationship("Email", back_populates="attachments")

    def __repr__(self):
        return f"<EmailAttachment {self.id}: {self.file_name}>"
