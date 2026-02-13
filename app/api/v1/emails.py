"""
Email Management API endpoints
CRUD, fetch from Hiworks, AI classification, approval workflow
"""
import poplib
import email as email_lib
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import json
import os
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends, Query, Body
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from app.database.config import get_db
from app.models.user import User
from app.models.email import (
    Email, EmailApproval, EmailAttachment,
    EmailCategory, EmailPriority, EmailStatus, ApprovalStatus
)
from app.auth.dependencies import get_current_active_user, require_approver
from app.core.ai_selector import ask_claude, ask_gemini
from app.utils.logger import setup_logger

logger = setup_logger(__name__)
router = APIRouter()


# ==========================================
# Pydantic Schemas
# ==========================================

class EmailListResponse(BaseModel):
    id: int
    subject: str
    sender: str
    category: str
    priority: str
    status: str
    ai_summary: Optional[str] = None
    received_at: Optional[str] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class EmailDetailResponse(BaseModel):
    id: int
    subject: str
    sender: str
    recipient: Optional[str] = None
    body: Optional[str] = None
    category: str
    priority: str
    status: str
    ai_summary: Optional[str] = None
    ai_draft_response: Optional[str] = None
    ai_confidence: int = 0
    draft_response: Optional[str] = None
    draft_subject: Optional[str] = None
    processed_by: Optional[int] = None
    received_at: Optional[str] = None
    processed_at: Optional[str] = None
    sent_at: Optional[str] = None
    created_at: Optional[str] = None
    approvals: list = []

    class Config:
        from_attributes = True


class EmailDraftUpdate(BaseModel):
    draft_response: Optional[str] = None
    draft_subject: Optional[str] = None
    category: Optional[str] = None
    priority: Optional[str] = None


class ApprovalRequest(BaseModel):
    comments: Optional[str] = None


class EmailComposeRequest(BaseModel):
    to: str
    subject: str
    body: str
    email_id: Optional[int] = None  # If replying to an email


# ==========================================
# Helper: AI Classification (8 categories)
# ==========================================

def classify_email_8cat(subject: str, body: str = "") -> dict:
    """
    Classify email into 8 categories using Gemini (fast) + Claude (draft)
    Categories: 발주, 요청, 견적요청, 문의, 공지, 미팅, 클레임, 기타
    """
    content_preview = body[:500] if body else ""

    # Step 1: Fast classification with Gemini
    classify_prompt = f"""다음 이메일을 분석하여 정확히 JSON 형식으로만 응답해. 다른 설명은 절대 하지 마.

제목: {subject}
내용: {content_preview}

분류 기준:
- 발주: 물품/부품/재료 주문, 구매 요청
- 요청: 업무 요청, 자료 요청, 작업 의뢰
- 견적요청: 견적서 요청, 가격 문의, 단가 확인
- 문의: 일반 문의, 질문, 확인 요청
- 공지: 공지사항, 안내, 통보
- 미팅: 회의, 미팅, 스케줄, 일정 조정
- 클레임: 불만, 클레임, 하자, 반품, 교환
- 기타: 위 카테고리에 해당하지 않는 것

JSON 형식:
{{"category": "위 8개 중 하나", "priority": "high/medium/low", "summary": "한 문장 요약", "confidence": 0부터100사이숫자}}"""

    try:
        result_text = ask_gemini(classify_prompt)

        # Parse JSON
        if "```json" in result_text:
            result_text = result_text.split("```json")[1].split("```")[0].strip()
        elif "```" in result_text:
            result_text = result_text.split("```")[1].split("```")[0].strip()

        result = json.loads(result_text)

        # Validate category
        valid_cats = ["발주", "요청", "견적요청", "문의", "공지", "미팅", "클레임", "기타"]
        if result.get("category") not in valid_cats:
            result["category"] = "기타"

        return {
            "category": result.get("category", "기타"),
            "priority": result.get("priority", "medium"),
            "summary": result.get("summary", subject),
            "confidence": min(100, max(0, int(result.get("confidence", 50)))),
        }
    except Exception as e:
        logger.warning(f"AI 분류 실패: {e}")
        return {
            "category": "기타",
            "priority": "medium",
            "summary": subject,
            "confidence": 0,
        }


def generate_draft_response(subject: str, body: str = "", category: str = "기타") -> str:
    """Generate AI draft response using Claude"""
    content_preview = body[:800] if body else ""

    draft_prompt = f"""당신은 무역회사 비서입니다. 다음 이메일에 대한 전문적인 답신 초안을 작성하세요.

분류: {category}
제목: {subject}
내용: {content_preview}

답신 조건:
- 정중하고 전문적인 한국어 비즈니스 이메일 형식
- 인사말로 시작
- 핵심 내용에 대한 답변
- 마무리 인사
- 200자 이내로 간결하게"""

    try:
        return ask_claude(draft_prompt)
    except Exception as e:
        logger.warning(f"답신 초안 생성 실패: {e}")
        return ""


# ==========================================
# API Endpoints
# ==========================================

@router.get("/")
async def list_emails(
    status: Optional[str] = None,
    category: Optional[str] = None,
    priority: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """List emails with filters"""
    query = db.query(Email).order_by(Email.created_at.desc())

    if status:
        query = query.filter(Email.status == status)
    if category:
        query = query.filter(Email.category == category)
    if priority:
        query = query.filter(Email.priority == priority)
    if search:
        query = query.filter(
            (Email.subject.contains(search)) | (Email.sender.contains(search))
        )

    total = query.count()
    emails = query.offset(skip).limit(limit).all()

    return {
        "status": "success",
        "data": [
            {
                "id": e.id,
                "subject": e.subject,
                "sender": e.sender,
                "category": e.category,
                "priority": e.priority,
                "status": e.status,
                "ai_summary": e.ai_summary,
                "received_at": e.received_at.isoformat() if e.received_at else None,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in emails
        ],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.get("/stats")
async def email_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get email statistics"""
    total = db.query(Email).count()
    unread = db.query(Email).filter(Email.status == EmailStatus.UNREAD.value).count()
    in_review = db.query(Email).filter(Email.status == EmailStatus.IN_REVIEW.value).count()
    approved = db.query(Email).filter(Email.status == EmailStatus.APPROVED.value).count()
    sent = db.query(Email).filter(Email.status == EmailStatus.SENT.value).count()

    # Category breakdown
    categories = {}
    for cat in EmailCategory:
        count = db.query(Email).filter(Email.category == cat.value).count()
        if count > 0:
            categories[cat.value] = count

    return {
        "status": "success",
        "data": {
            "total": total,
            "unread": unread,
            "in_review": in_review,
            "approved": approved,
            "sent": sent,
            "categories": categories,
        },
    }


@router.get("/{email_id}")
async def get_email(
    email_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get email detail with approvals"""
    email_obj = db.query(Email).filter(Email.id == email_id).first()
    if not email_obj:
        raise HTTPException(status_code=404, detail="이메일을 찾을 수 없습니다")

    # Mark as read if unread
    if email_obj.status == EmailStatus.UNREAD.value:
        email_obj.status = EmailStatus.READ.value
        db.commit()

    approvals = [
        {
            "id": a.id,
            "stage": a.stage,
            "approver_id": a.approver_id,
            "status": a.status,
            "comments": a.comments,
            "approved_at": a.approved_at.isoformat() if a.approved_at else None,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in email_obj.approvals
    ]

    attachments = [
        {
            "id": att.id,
            "file_name": att.file_name,
            "file_size": att.file_size,
            "content_type": att.content_type,
        }
        for att in email_obj.attachments
    ]

    return {
        "status": "success",
        "data": {
            "id": email_obj.id,
            "subject": email_obj.subject,
            "sender": email_obj.sender,
            "recipient": email_obj.recipient,
            "body": email_obj.body,
            "category": email_obj.category,
            "priority": email_obj.priority,
            "status": email_obj.status,
            "ai_summary": email_obj.ai_summary,
            "ai_draft_response": email_obj.ai_draft_response,
            "ai_confidence": email_obj.ai_confidence,
            "draft_response": email_obj.draft_response,
            "draft_subject": email_obj.draft_subject,
            "processed_by": email_obj.processed_by,
            "received_at": email_obj.received_at.isoformat() if email_obj.received_at else None,
            "processed_at": email_obj.processed_at.isoformat() if email_obj.processed_at else None,
            "sent_at": email_obj.sent_at.isoformat() if email_obj.sent_at else None,
            "created_at": email_obj.created_at.isoformat() if email_obj.created_at else None,
            "approvals": approvals,
            "attachments": attachments,
        },
    }


@router.post("/fetch")
async def fetch_emails(
    max_count: int = Query(5, ge=1, le=20),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Fetch new emails from Hiworks POP3 and classify with AI.
    Stores results in database.
    """
    imap_server = os.getenv("IMAP_SERVER")
    imap_port = os.getenv("IMAP_PORT")
    email_user = os.getenv("EMAIL_USER")
    email_pass = os.getenv("EMAIL_PASS")

    if not all([imap_server, imap_port, email_user, email_pass]):
        raise HTTPException(status_code=500, detail="이메일 서버 설정이 없습니다")

    try:
        server = poplib.POP3_SSL(imap_server, int(imap_port))
        server.user(email_user)
        server.pass_(email_pass)

        num_messages = len(server.list()[1])
        if num_messages == 0:
            server.quit()
            return {"status": "success", "message": "새로운 메일이 없습니다", "count": 0}

        processed = []
        start_idx = max(1, num_messages - max_count + 1)

        for i in range(num_messages, start_idx - 1, -1):
            try:
                _, lines, _ = server.retr(i)
                msg_content = b'\n'.join(lines).decode('utf-8', errors='ignore')
                msg = email_lib.message_from_string(msg_content)

                msg_id = msg.get("Message-ID", f"pop3-{i}-{datetime.now().timestamp()}")
                subject = msg.get("Subject", "(제목 없음)")
                sender = msg.get("From", "unknown")
                recipient = msg.get("To", email_user)
                date_str = msg.get("Date", "")

                # Check if already exists
                existing = db.query(Email).filter(Email.external_id == msg_id).first()
                if existing:
                    continue

                # Extract body
                body_text = ""
                if msg.is_multipart():
                    for part in msg.walk():
                        if part.get_content_type() == "text/plain":
                            payload = part.get_payload(decode=True)
                            if payload:
                                body_text = payload.decode('utf-8', errors='ignore')
                                break
                else:
                    payload = msg.get_payload(decode=True)
                    if payload:
                        body_text = payload.decode('utf-8', errors='ignore')

                # AI Classification (8 categories)
                classification = classify_email_8cat(subject, body_text)

                # AI Draft Response
                draft = generate_draft_response(subject, body_text, classification["category"])

                # Parse received date
                received_dt = None
                if date_str:
                    try:
                        from email.utils import parsedate_to_datetime
                        received_dt = parsedate_to_datetime(date_str)
                    except Exception:
                        received_dt = datetime.now()

                # Save to database
                new_email = Email(
                    external_id=msg_id,
                    subject=subject,
                    sender=sender,
                    recipient=recipient,
                    body=body_text[:10000],  # Limit body size
                    category=classification["category"],
                    priority=classification["priority"],
                    ai_summary=classification["summary"],
                    ai_draft_response=draft,
                    ai_confidence=classification["confidence"],
                    status=EmailStatus.UNREAD.value,
                    processed_by=current_user.id,
                    received_at=received_dt,
                    processed_at=datetime.now(),
                )
                db.add(new_email)
                db.flush()

                processed.append({
                    "id": new_email.id,
                    "subject": subject,
                    "sender": sender,
                    "category": classification["category"],
                    "priority": classification["priority"],
                    "ai_summary": classification["summary"],
                })

                logger.info(f"이메일 처리 완료: {subject} -> {classification['category']}")

            except Exception as e:
                logger.error(f"메일 {i} 처리 오류: {e}")
                continue

        db.commit()
        server.quit()

        return {
            "status": "success",
            "message": f"{len(processed)}개 이메일 처리 완료",
            "count": len(processed),
            "data": processed,
        }

    except Exception as e:
        logger.error(f"이메일 가져오기 실패: {e}")
        raise HTTPException(status_code=500, detail=f"이메일 가져오기 실패: {str(e)}")


@router.patch("/{email_id}")
async def update_email_draft(
    email_id: int,
    update: EmailDraftUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Update email draft response or metadata"""
    email_obj = db.query(Email).filter(Email.id == email_id).first()
    if not email_obj:
        raise HTTPException(status_code=404, detail="이메일을 찾을 수 없습니다")

    if update.draft_response is not None:
        email_obj.draft_response = update.draft_response
    if update.draft_subject is not None:
        email_obj.draft_subject = update.draft_subject
    if update.category is not None:
        email_obj.category = update.category
    if update.priority is not None:
        email_obj.priority = update.priority

    if email_obj.status == EmailStatus.READ.value:
        email_obj.status = EmailStatus.DRAFT.value

    email_obj.processed_by = current_user.id
    db.commit()

    return {"status": "success", "message": "이메일 수정 완료"}


# ==========================================
# Approval Workflow
# ==========================================

@router.post("/{email_id}/submit")
async def submit_for_review(
    email_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Submit email draft for approval (Staff -> Approver)"""
    email_obj = db.query(Email).filter(Email.id == email_id).first()
    if not email_obj:
        raise HTTPException(status_code=404, detail="이메일을 찾을 수 없습니다")

    if email_obj.status not in [EmailStatus.READ.value, EmailStatus.DRAFT.value, EmailStatus.REJECTED.value]:
        raise HTTPException(status_code=400, detail=f"현재 상태({email_obj.status})에서는 제출할 수 없습니다")

    if not email_obj.draft_response and not email_obj.ai_draft_response:
        raise HTTPException(status_code=400, detail="답신 초안이 없습니다. 먼저 답신을 작성하세요.")

    # Create approval record
    approval = EmailApproval(
        email_id=email_id,
        stage="review",
        approver_id=current_user.id,
        status=ApprovalStatus.PENDING.value,
    )
    db.add(approval)

    email_obj.status = EmailStatus.IN_REVIEW.value
    email_obj.processed_by = current_user.id
    db.commit()

    logger.info(f"이메일 #{email_id} 검토 제출 by {current_user.email}")

    return {"status": "success", "message": "검토 요청이 제출되었습니다"}


@router.post("/{email_id}/approve")
async def approve_email(
    email_id: int,
    body: ApprovalRequest = Body(default=ApprovalRequest()),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_approver),
):
    """Approve email for sending (Approver/Admin only)"""
    email_obj = db.query(Email).filter(Email.id == email_id).first()
    if not email_obj:
        raise HTTPException(status_code=404, detail="이메일을 찾을 수 없습니다")

    if email_obj.status != EmailStatus.IN_REVIEW.value:
        raise HTTPException(status_code=400, detail="검토 중인 이메일만 승인할 수 있습니다")

    # Update latest pending approval
    pending_approval = (
        db.query(EmailApproval)
        .filter(
            EmailApproval.email_id == email_id,
            EmailApproval.status == ApprovalStatus.PENDING.value,
        )
        .order_by(EmailApproval.created_at.desc())
        .first()
    )

    if pending_approval:
        pending_approval.status = ApprovalStatus.APPROVED.value
        pending_approval.approver_id = current_user.id
        pending_approval.comments = body.comments
        pending_approval.approved_at = datetime.now()

    # Create approval stage record
    approval = EmailApproval(
        email_id=email_id,
        stage="approval",
        approver_id=current_user.id,
        status=ApprovalStatus.APPROVED.value,
        comments=body.comments,
        approved_at=datetime.now(),
    )
    db.add(approval)

    email_obj.status = EmailStatus.APPROVED.value
    db.commit()

    logger.info(f"이메일 #{email_id} 승인 by {current_user.email}")

    return {"status": "success", "message": "이메일이 승인되었습니다. 발송 가능합니다."}


@router.post("/{email_id}/reject")
async def reject_email(
    email_id: int,
    body: ApprovalRequest = Body(default=ApprovalRequest()),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_approver),
):
    """Reject email (Approver/Admin only)"""
    email_obj = db.query(Email).filter(Email.id == email_id).first()
    if not email_obj:
        raise HTTPException(status_code=404, detail="이메일을 찾을 수 없습니다")

    if email_obj.status != EmailStatus.IN_REVIEW.value:
        raise HTTPException(status_code=400, detail="검토 중인 이메일만 반려할 수 있습니다")

    # Update pending approval
    pending_approval = (
        db.query(EmailApproval)
        .filter(
            EmailApproval.email_id == email_id,
            EmailApproval.status == ApprovalStatus.PENDING.value,
        )
        .order_by(EmailApproval.created_at.desc())
        .first()
    )

    if pending_approval:
        pending_approval.status = ApprovalStatus.REJECTED.value
        pending_approval.approver_id = current_user.id
        pending_approval.comments = body.comments
        pending_approval.approved_at = datetime.now()

    email_obj.status = EmailStatus.REJECTED.value
    db.commit()

    logger.info(f"이메일 #{email_id} 반려 by {current_user.email}")

    return {"status": "success", "message": "이메일이 반려되었습니다"}


@router.post("/{email_id}/send")
async def send_email(
    email_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Send approved email via SMTP"""
    email_obj = db.query(Email).filter(Email.id == email_id).first()
    if not email_obj:
        raise HTTPException(status_code=404, detail="이메일을 찾을 수 없습니다")

    if email_obj.status != EmailStatus.APPROVED.value:
        raise HTTPException(status_code=400, detail="승인된 이메일만 발송할 수 있습니다")

    # Get SMTP settings
    smtp_server = os.getenv("SMTP_SERVER", os.getenv("IMAP_SERVER", "").replace("pop.", "smtp."))
    smtp_port = int(os.getenv("SMTP_PORT", "465"))
    email_user = os.getenv("EMAIL_USER")
    email_pass = os.getenv("EMAIL_PASS")

    if not all([smtp_server, email_user, email_pass]):
        raise HTTPException(status_code=500, detail="SMTP 서버 설정이 없습니다")

    response_text = email_obj.draft_response or email_obj.ai_draft_response
    response_subject = email_obj.draft_subject or f"Re: {email_obj.subject}"

    if not response_text:
        raise HTTPException(status_code=400, detail="발송할 답신 내용이 없습니다")

    try:
        # Build email
        msg = MIMEMultipart()
        msg["From"] = email_user
        msg["To"] = email_obj.sender
        msg["Subject"] = response_subject
        msg.attach(MIMEText(response_text, "plain", "utf-8"))

        # Send via SMTP SSL
        with smtplib.SMTP_SSL(smtp_server, smtp_port) as server:
            server.login(email_user, email_pass)
            server.send_message(msg)

        # Update status
        email_obj.status = EmailStatus.SENT.value
        email_obj.sent_at = datetime.now()

        # Record send approval
        send_approval = EmailApproval(
            email_id=email_id,
            stage="send",
            approver_id=current_user.id,
            status=ApprovalStatus.APPROVED.value,
            comments="발송 완료",
            approved_at=datetime.now(),
        )
        db.add(send_approval)
        db.commit()

        logger.info(f"이메일 #{email_id} 발송 완료 to {email_obj.sender}")

        return {"status": "success", "message": f"이메일이 {email_obj.sender}에게 발송되었습니다"}

    except Exception as e:
        logger.error(f"이메일 발송 실패: {e}")
        raise HTTPException(status_code=500, detail=f"이메일 발송 실패: {str(e)}")


@router.post("/{email_id}/reclassify")
async def reclassify_email(
    email_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Re-run AI classification on an email"""
    email_obj = db.query(Email).filter(Email.id == email_id).first()
    if not email_obj:
        raise HTTPException(status_code=404, detail="이메일을 찾을 수 없습니다")

    classification = classify_email_8cat(email_obj.subject, email_obj.body or "")
    draft = generate_draft_response(email_obj.subject, email_obj.body or "", classification["category"])

    email_obj.category = classification["category"]
    email_obj.priority = classification["priority"]
    email_obj.ai_summary = classification["summary"]
    email_obj.ai_draft_response = draft
    email_obj.ai_confidence = classification["confidence"]
    email_obj.processed_at = datetime.now()
    email_obj.processed_by = current_user.id
    db.commit()

    return {
        "status": "success",
        "message": "AI 재분류 완료",
        "data": classification,
    }


@router.delete("/{email_id}")
async def delete_email(
    email_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Delete an email (soft archive)"""
    email_obj = db.query(Email).filter(Email.id == email_id).first()
    if not email_obj:
        raise HTTPException(status_code=404, detail="이메일을 찾을 수 없습니다")

    email_obj.status = EmailStatus.ARCHIVED.value
    db.commit()

    return {"status": "success", "message": "이메일이 보관 처리되었습니다"}
