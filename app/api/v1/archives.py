"""
Document Archive API endpoints
PDF/Excel generation, organized storage, search
"""
import os
import json
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func as sqlfunc, or_, desc

from app.database.config import get_db
from app.models.user import User
from app.models.email import Email, EmailStatus
from app.models.archive import ArchivedDocument, DailyReport
from app.auth.dependencies import get_current_active_user
from app.core.ai_selector import ask_gemini
from app.utils.logger import setup_logger

logger = setup_logger(__name__)
router = APIRouter()

# Archive base directory
ARCHIVE_BASE = os.environ.get("ARCHIVE_PATH", os.path.join(os.getcwd(), "archives"))


def ensure_archive_dir(sub_path: str = "") -> str:
    """Ensure archive directory exists and return full path"""
    full_path = os.path.join(ARCHIVE_BASE, sub_path)
    os.makedirs(full_path, exist_ok=True)
    return full_path


def get_archive_path(category: str, company: str, date: datetime) -> str:
    """Generate organized archive path: YYYY/MM/Category/Company/"""
    year = date.strftime("%Y")
    month = date.strftime("%m")
    safe_category = category.replace("/", "_").replace("\\", "_") if category else "기타"
    safe_company = company.replace("/", "_").replace("\\", "_") if company else "미분류"
    return os.path.join(year, month, safe_category, safe_company)


@router.get("/")
async def list_archives(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    document_type: Optional[str] = None,
    category: Optional[str] = None,
    company: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """List archived documents with filtering and pagination"""
    query = db.query(ArchivedDocument)

    if document_type:
        query = query.filter(ArchivedDocument.document_type == document_type)
    if category:
        query = query.filter(ArchivedDocument.category == category)
    if company:
        query = query.filter(ArchivedDocument.company_name.contains(company))
    if search:
        query = query.filter(
            or_(
                ArchivedDocument.file_name.contains(search),
                ArchivedDocument.description.contains(search),
                ArchivedDocument.company_name.contains(search),
            )
        )

    total = query.count()
    archives = (
        query.order_by(desc(ArchivedDocument.archived_date))
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return {
        "status": "success",
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
        "archives": [
            {
                "id": a.id,
                "email_id": a.email_id,
                "document_type": a.document_type,
                "file_name": a.file_name,
                "file_path": a.file_path,
                "file_size": a.file_size,
                "company_name": a.company_name,
                "category": a.category,
                "description": a.description,
                "archived_date": a.archived_date.isoformat() if a.archived_date else None,
            }
            for a in archives
        ],
    }


@router.get("/stats")
async def archive_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get archive statistics"""
    total = db.query(ArchivedDocument).count()

    # By type
    type_counts = (
        db.query(ArchivedDocument.document_type, sqlfunc.count(ArchivedDocument.id))
        .group_by(ArchivedDocument.document_type)
        .all()
    )

    # By category
    category_counts = (
        db.query(ArchivedDocument.category, sqlfunc.count(ArchivedDocument.id))
        .filter(ArchivedDocument.category.isnot(None))
        .group_by(ArchivedDocument.category)
        .all()
    )

    # Recent 7 days count
    week_ago = datetime.now() - timedelta(days=7)
    recent_count = (
        db.query(ArchivedDocument)
        .filter(ArchivedDocument.archived_date >= week_ago)
        .count()
    )

    # Total file size
    total_size = db.query(sqlfunc.sum(ArchivedDocument.file_size)).scalar() or 0

    # Reports count
    total_reports = db.query(DailyReport).count()

    return {
        "status": "success",
        "data": {
            "total_archives": total,
            "recent_7days": recent_count,
            "total_size_bytes": total_size,
            "total_size_mb": round(total_size / (1024 * 1024), 2) if total_size else 0,
            "total_reports": total_reports,
            "by_type": {t: c for t, c in type_counts},
            "by_category": {cat: c for cat, c in category_counts if cat},
        },
    }


@router.post("/generate-from-email/{email_id}")
async def generate_archive_from_email(
    email_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Generate archive document from an email.
    Creates a text-based archive file with email content and AI analysis.
    """
    email = db.query(Email).filter(Email.id == email_id).first()
    if not email:
        raise HTTPException(status_code=404, detail="이메일을 찾을 수 없습니다")

    try:
        # Extract company name from sender using AI
        company_name = "미분류"
        try:
            company_prompt = f"다음 이메일 발신자에서 회사명만 추출해줘. 회사명만 출력하고 다른 설명은 하지 마. 모르면 '미분류'라고 해.\n발신자: {email.sender}"
            company_name = ask_gemini(company_prompt).strip().strip('"').strip("'")
            if not company_name or len(company_name) > 50:
                company_name = "미분류"
        except Exception:
            pass

        # Generate archive path
        archive_date = email.received_at or email.created_at or datetime.now()
        sub_path = get_archive_path(email.category or "기타", company_name, archive_date)
        archive_dir = ensure_archive_dir(sub_path)

        # Create archive document
        timestamp = archive_date.strftime("%Y%m%d_%H%M%S")
        safe_subject = "".join(c for c in (email.subject or "no_subject")[:50] if c.isalnum() or c in " _-가-힣").strip()
        file_name = f"{timestamp}_{safe_subject}.txt"
        file_path = os.path.join(archive_dir, file_name)

        # Build archive content
        content_lines = [
            "=" * 60,
            f"C-Auto 이메일 아카이브",
            f"생성일시: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            "=" * 60,
            "",
            f"[기본 정보]",
            f"제목: {email.subject}",
            f"발신자: {email.sender}",
            f"수신자: {email.recipient or 'N/A'}",
            f"수신일: {email.received_at.strftime('%Y-%m-%d %H:%M:%S') if email.received_at else 'N/A'}",
            "",
            f"[AI 분석]",
            f"분류: {email.category or 'N/A'}",
            f"우선순위: {email.priority or 'N/A'}",
            f"신뢰도: {email.ai_confidence or 0}%",
            f"요약: {email.ai_summary or 'N/A'}",
            "",
            f"[처리 현황]",
            f"상태: {email.status}",
            f"처리일: {email.processed_at.strftime('%Y-%m-%d %H:%M:%S') if email.processed_at else 'N/A'}",
            f"발송일: {email.sent_at.strftime('%Y-%m-%d %H:%M:%S') if email.sent_at else 'N/A'}",
            "",
            "-" * 60,
            "[이메일 본문]",
            "-" * 60,
            email.body or "(본문 없음)",
            "",
        ]

        if email.ai_draft_response:
            content_lines.extend([
                "-" * 60,
                "[AI 답신 초안]",
                "-" * 60,
                email.ai_draft_response,
                "",
            ])

        if email.draft_response:
            content_lines.extend([
                "-" * 60,
                "[수정된 답신]",
                "-" * 60,
                email.draft_response,
                "",
            ])

        content_lines.append("=" * 60)
        content_lines.append("C-Auto 자동 아카이브 시스템")
        content_lines.append("=" * 60)

        content = "\n".join(content_lines)

        # Write archive file
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)

        file_size = os.path.getsize(file_path)

        # Save record to DB
        archive = ArchivedDocument(
            email_id=email.id,
            document_type="email",
            file_name=file_name,
            file_path=file_path,
            file_size=file_size,
            company_name=company_name,
            category=email.category,
            description=f"이메일 아카이브: {email.subject[:100]}",
            created_by=current_user.id,
        )
        db.add(archive)
        db.commit()
        db.refresh(archive)

        logger.info(f"이메일 아카이브 생성: {file_name} ({company_name})")

        return {
            "status": "success",
            "message": "아카이브 생성 완료",
            "data": {
                "id": archive.id,
                "file_name": file_name,
                "file_path": file_path,
                "file_size": file_size,
                "company_name": company_name,
                "category": email.category,
            },
        }

    except Exception as e:
        logger.error(f"아카이브 생성 실패: {e}")
        raise HTTPException(status_code=500, detail=f"아카이브 생성 실패: {str(e)}")


@router.post("/generate-report")
async def generate_daily_report(
    report_type: str = Query("daily", pattern="^(daily|weekly|monthly)$"),
    report_date: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Generate daily/weekly/monthly summary report
    """
    try:
        if report_date:
            target_date = datetime.strptime(report_date, "%Y-%m-%d")
        else:
            target_date = datetime.now()

        # Determine date range
        if report_type == "daily":
            start_date = target_date.replace(hour=0, minute=0, second=0, microsecond=0)
            end_date = start_date + timedelta(days=1)
            period_label = target_date.strftime("%Y년 %m월 %d일")
        elif report_type == "weekly":
            start_date = target_date - timedelta(days=target_date.weekday())
            start_date = start_date.replace(hour=0, minute=0, second=0, microsecond=0)
            end_date = start_date + timedelta(days=7)
            period_label = f"{start_date.strftime('%Y.%m.%d')} ~ {end_date.strftime('%Y.%m.%d')}"
        else:  # monthly
            start_date = target_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            if start_date.month == 12:
                end_date = start_date.replace(year=start_date.year + 1, month=1)
            else:
                end_date = start_date.replace(month=start_date.month + 1)
            period_label = target_date.strftime("%Y년 %m월")

        # Gather email statistics
        email_query = db.query(Email).filter(
            Email.created_at >= start_date,
            Email.created_at < end_date,
        )
        total_emails = email_query.count()
        sent_emails = email_query.filter(Email.status == EmailStatus.SENT.value).count()
        approved_emails = email_query.filter(Email.status == EmailStatus.APPROVED.value).count()

        # Category breakdown
        category_stats = (
            db.query(Email.category, sqlfunc.count(Email.id))
            .filter(Email.created_at >= start_date, Email.created_at < end_date)
            .group_by(Email.category)
            .all()
        )

        # Archive stats for period
        archive_count = (
            db.query(ArchivedDocument)
            .filter(
                ArchivedDocument.archived_date >= start_date,
                ArchivedDocument.archived_date < end_date,
            )
            .count()
        )

        # Generate report content
        report_lines = [
            "=" * 60,
            f"C-Auto {report_type.upper()} 리포트",
            f"기간: {period_label}",
            f"생성일시: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            "=" * 60,
            "",
            "[이메일 처리 현황]",
            f"  총 수신: {total_emails}건",
            f"  발송 완료: {sent_emails}건",
            f"  승인 완료: {approved_emails}건",
            "",
            "[카테고리별 분류]",
        ]

        for cat, count in category_stats:
            report_lines.append(f"  {cat or '미분류'}: {count}건")

        report_lines.extend([
            "",
            "[아카이브]",
            f"  신규 아카이브: {archive_count}건",
            "",
            "=" * 60,
        ])

        report_content = "\n".join(report_lines)

        # Save report file
        report_dir = ensure_archive_dir(os.path.join("reports", target_date.strftime("%Y"), target_date.strftime("%m")))
        report_filename = f"{report_type}_report_{target_date.strftime('%Y%m%d')}.txt"
        report_path = os.path.join(report_dir, report_filename)

        with open(report_path, "w", encoding="utf-8") as f:
            f.write(report_content)

        file_size = os.path.getsize(report_path)

        # Save report record
        report = DailyReport(
            report_date=target_date,
            report_type=report_type,
            file_path=report_path,
            file_name=report_filename,
            generated_by=current_user.id,
            email_count=total_emails,
            inventory_transactions=0,
            summary_text=report_content,
        )
        db.add(report)
        db.commit()
        db.refresh(report)

        logger.info(f"리포트 생성 완료: {report_filename}")

        return {
            "status": "success",
            "message": f"{report_type} 리포트 생성 완료",
            "data": {
                "id": report.id,
                "report_type": report_type,
                "period": period_label,
                "file_name": report_filename,
                "file_path": report_path,
                "stats": {
                    "total_emails": total_emails,
                    "sent_emails": sent_emails,
                    "approved_emails": approved_emails,
                    "categories": {cat or "미분류": c for cat, c in category_stats},
                    "archives": archive_count,
                },
            },
        }

    except Exception as e:
        logger.error(f"리포트 생성 실패: {e}")
        raise HTTPException(status_code=500, detail=f"리포트 생성 실패: {str(e)}")


@router.get("/reports")
async def list_reports(
    report_type: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """List generated reports"""
    query = db.query(DailyReport)
    if report_type:
        query = query.filter(DailyReport.report_type == report_type)

    total = query.count()
    reports = (
        query.order_by(desc(DailyReport.report_date))
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return {
        "status": "success",
        "total": total,
        "page": page,
        "reports": [
            {
                "id": r.id,
                "report_date": r.report_date.isoformat() if r.report_date else None,
                "report_type": r.report_type,
                "file_name": r.file_name,
                "email_count": r.email_count,
                "summary": r.summary_text[:200] if r.summary_text else None,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in reports
        ],
    }


@router.get("/{archive_id}")
async def get_archive_detail(
    archive_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get archive document detail"""
    archive = db.query(ArchivedDocument).filter(ArchivedDocument.id == archive_id).first()
    if not archive:
        raise HTTPException(status_code=404, detail="아카이브를 찾을 수 없습니다")

    # Try to read file content
    content = None
    if archive.file_path and os.path.exists(archive.file_path):
        try:
            with open(archive.file_path, "r", encoding="utf-8") as f:
                content = f.read()
        except Exception:
            content = "(파일 읽기 실패)"

    return {
        "status": "success",
        "data": {
            "id": archive.id,
            "email_id": archive.email_id,
            "document_type": archive.document_type,
            "file_name": archive.file_name,
            "file_path": archive.file_path,
            "file_size": archive.file_size,
            "company_name": archive.company_name,
            "category": archive.category,
            "description": archive.description,
            "archived_date": archive.archived_date.isoformat() if archive.archived_date else None,
            "content": content,
        },
    }


@router.delete("/{archive_id}")
async def delete_archive(
    archive_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Delete an archive document"""
    archive = db.query(ArchivedDocument).filter(ArchivedDocument.id == archive_id).first()
    if not archive:
        raise HTTPException(status_code=404, detail="아카이브를 찾을 수 없습니다")

    # Delete file if exists
    if archive.file_path and os.path.exists(archive.file_path):
        try:
            os.remove(archive.file_path)
        except Exception as e:
            logger.warning(f"아카이브 파일 삭제 실패: {e}")

    db.delete(archive)
    db.commit()

    logger.info(f"아카이브 삭제: {archive.file_name}")

    return {"status": "success", "message": "아카이브 삭제 완료"}


@router.post("/bulk-archive-emails")
async def bulk_archive_emails(
    status_filter: str = Query("sent", description="아카이브할 이메일 상태 (sent, archived 등)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Bulk archive all emails with a given status"""
    emails = db.query(Email).filter(Email.status == status_filter).all()

    if not emails:
        return {"status": "success", "message": "아카이브할 이메일이 없습니다", "archived_count": 0}

    archived_count = 0
    errors = 0

    for email in emails:
        try:
            # Check if already archived
            existing = (
                db.query(ArchivedDocument)
                .filter(ArchivedDocument.email_id == email.id)
                .first()
            )
            if existing:
                continue

            # Extract company name
            company_name = "미분류"
            try:
                if "@" in (email.sender or ""):
                    domain = email.sender.split("@")[1].split(".")[0]
                    company_name = domain.capitalize()
            except Exception:
                pass

            # Generate archive
            archive_date = email.received_at or email.created_at or datetime.now()
            sub_path = get_archive_path(email.category or "기타", company_name, archive_date)
            archive_dir = ensure_archive_dir(sub_path)

            timestamp = archive_date.strftime("%Y%m%d_%H%M%S")
            safe_subject = "".join(c for c in (email.subject or "no_subject")[:50] if c.isalnum() or c in " _-").strip()
            file_name = f"{timestamp}_{safe_subject}.txt"
            file_path = os.path.join(archive_dir, file_name)

            content = f"제목: {email.subject}\n발신자: {email.sender}\n분류: {email.category}\n\n{email.body or ''}"

            with open(file_path, "w", encoding="utf-8") as f:
                f.write(content)

            archive = ArchivedDocument(
                email_id=email.id,
                document_type="email",
                file_name=file_name,
                file_path=file_path,
                file_size=os.path.getsize(file_path),
                company_name=company_name,
                category=email.category,
                description=f"일괄 아카이브: {email.subject[:100]}",
                created_by=current_user.id,
            )
            db.add(archive)

            # Update email status to archived
            email.status = EmailStatus.ARCHIVED.value
            archived_count += 1

        except Exception as e:
            errors += 1
            logger.error(f"이메일 아카이브 실패 (ID: {email.id}): {e}")
            continue

    db.commit()
    logger.info(f"일괄 아카이브 완료: {archived_count}건 처리, {errors}건 오류")

    return {
        "status": "success",
        "message": f"일괄 아카이브 완료",
        "data": {
            "archived_count": archived_count,
            "errors": errors,
            "total_processed": len(emails),
        },
    }
