"""
AI Document Generation API
Claude Cowork 수준의 고품질 서류 작성 및 분석 기능
"""
import os
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.database.config import get_db
from app.models.user import User
from app.models.email import Email
from app.models.archive import ArchivedDocument
from app.auth.dependencies import get_current_active_user
from app.core.ai_selector import ask_claude_long, ask_gemini
from app.utils.logger import setup_logger

logger = setup_logger(__name__)
router = APIRouter()

# Archive directory for generated documents
DOC_BASE = os.environ.get("DOC_PATH", os.path.join(os.getcwd(), "generated_docs"))
os.makedirs(DOC_BASE, exist_ok=True)

# ─────────────────────────────────────────────
# 시스템 프롬프트 (Cowork 수준 품질 보장)
# ─────────────────────────────────────────────

SYSTEM_DOCUMENT_WRITER = """당신은 한국 비즈니스 환경에 전문화된 최고급 문서 작성 AI입니다.
다음 원칙을 반드시 준수하세요:

1. **전문성**: 비즈니스 격식에 맞는 정확한 한국어 표현 사용
2. **구조화**: 명확한 제목, 소제목, 번호 매기기로 가독성 확보
3. **완결성**: 빠짐없이 모든 필요 항목을 포함한 완성된 문서
4. **실용성**: 바로 사용할 수 있는 수준의 실무 문서
5. **포맷**: 마크다운 형식으로 깔끔하게 작성

회사명이 주어지면 적절히 반영하고, 날짜는 오늘 날짜를 사용하세요."""

SYSTEM_DOCUMENT_ANALYZER = """당신은 한국 비즈니스 문서를 정밀 분석하는 전문 AI입니다.
다음을 체계적으로 분석하세요:

1. **문서 유형 판별**: 어떤 종류의 문서인지
2. **핵심 내용 요약**: 3-5줄로 핵심 파악
3. **주요 항목 추출**: 금액, 날짜, 당사자, 조건 등
4. **위험 요소**: 주의해야 할 사항이나 불리한 조건
5. **액션 아이템**: 후속 조치가 필요한 항목
6. **개선 제안**: 문서에 보완이 필요한 부분

분석 결과를 구조화된 마크다운 형식으로 출력하세요."""

SYSTEM_BUSINESS_LETTER = """당신은 국제 무역 및 한국 비즈니스 서신 작성 전문가입니다.
다음 원칙을 준수하세요:

1. 수신자의 직급과 관계에 맞는 적절한 경어체 사용
2. 간결하면서도 필요한 정보를 모두 포함
3. 명확한 요청 사항이나 안내 사항 제시
4. 비즈니스 관례에 맞는 인사말과 맺음말
5. 필요시 첨부 파일 언급 및 후속 일정 안내"""


# ─────────────────────────────────────────────
# 문서 생성 템플릿
# ─────────────────────────────────────────────

DOCUMENT_TEMPLATES = {
    "work_instruction": {
        "name": "업무지시서",
        "description": "이메일이나 요청 기반 업무지시서 작성",
        "prompt_template": """다음 정보를 바탕으로 공식 업무지시서를 작성하세요.

[입력 정보]
{context}

[업무지시서 포함 항목]
1. 문서번호 (WI-{date}-001 형식)
2. 작성일자
3. 수신: 담당자/부서
4. 발신: 관리자
5. 제목
6. 배경 및 목적
7. 지시 사항 (세부 항목별 번호 매기기)
8. 기한 및 일정
9. 주의 사항
10. 보고 요구 사항

실제 사용 가능한 공식 문서 수준으로 작성하세요."""
    },
    "business_report": {
        "name": "업무보고서",
        "description": "업무 현황 보고서 작성",
        "prompt_template": """다음 정보를 바탕으로 업무보고서를 작성하세요.

[입력 정보]
{context}

[보고서 포함 항목]
1. 보고서 제목
2. 보고일자: {today}
3. 보고자
4. 보고 대상 기간
5. 주요 업무 수행 내역 (항목별 상세)
6. 성과 및 실적
7. 이슈 및 문제점
8. 향후 계획
9. 건의 사항
10. 첨부 자료 목록

경영진에게 보고하기 적합한 수준으로 작성하세요."""
    },
    "meeting_minutes": {
        "name": "회의록",
        "description": "회의 내용 정리 및 회의록 작성",
        "prompt_template": """다음 회의 내용을 바탕으로 공식 회의록을 작성하세요.

[회의 내용]
{context}

[회의록 포함 항목]
1. 회의 제목
2. 일시 / 장소
3. 참석자
4. 회의 안건
5. 논의 내용 (안건별 상세 기록)
6. 결정 사항
7. 액션 아이템 (담당자, 기한 포함)
8. 차기 회의 일정
9. 기타 사항

정확하고 빠짐없이 기록하세요."""
    },
    "quotation": {
        "name": "견적서",
        "description": "견적서/견적 회신 작성",
        "prompt_template": """다음 정보를 바탕으로 견적서를 작성하세요.

[견적 정보]
{context}

[견적서 포함 항목]
1. 견적번호 (QT-{date}-001 형식)
2. 견적일자: {today}
3. 수신 회사명 및 담당자
4. 발신 회사명
5. 품목 목록 (품명, 규격, 수량, 단가, 금액)
6. 합계 금액 (부가세 별도/포함 명시)
7. 납기 조건
8. 결제 조건
9. 유효 기간
10. 비고 (특이사항)

실제 거래에 사용 가능한 수준으로 작성하세요."""
    },
    "business_letter": {
        "name": "비즈니스 서신",
        "description": "공식 비즈니스 레터 작성",
        "prompt_template": """다음 요청에 맞는 공식 비즈니스 서신을 작성하세요.

[요청 내용]
{context}

격식 있는 한국어 비즈니스 서신 형식으로 작성하되, 수신자에 대한 존칭과 적절한 인사말을 포함하세요.
발송일: {today}"""
    },
    "contract_review": {
        "name": "계약서 검토",
        "description": "계약서 내용 분석 및 검토 의견서 작성",
        "prompt_template": """다음 계약서 내용을 검토하고 분석 의견서를 작성하세요.

[계약서 내용]
{context}

[검토 항목]
1. 계약 개요 (당사자, 목적, 기간)
2. 주요 조건 요약
3. 유리한 조건 분석
4. 불리한 조건/위험 요소
5. 누락된 조항
6. 수정 권고 사항
7. 종합 의견
8. 체결 권고 여부

법률 전문가 수준의 분석을 제공하세요."""
    },
    "email_summary": {
        "name": "이메일 종합분석",
        "description": "이메일 내용 종합 분석 및 대응 방안",
        "prompt_template": """다음 이메일을 종합 분석하고 대응 방안을 제시하세요.

[이메일 정보]
{context}

[분석 항목]
1. 발신자 의도 분석
2. 핵심 요청/요구 사항
3. 긴급도 및 중요도 평가
4. 관련 부서/담당자
5. 필요한 자료/정보
6. 권장 대응 방안 (3가지 옵션)
7. 답신 초안 (각 옵션별)
8. 후속 조치 체크리스트

실무 의사결정에 도움되는 수준으로 작성하세요."""
    },
}


@router.get("/templates")
async def list_templates(
    current_user: User = Depends(get_current_active_user),
):
    """사용 가능한 문서 템플릿 목록"""
    return {
        "status": "success",
        "templates": [
            {
                "id": key,
                "name": tpl["name"],
                "description": tpl["description"],
            }
            for key, tpl in DOCUMENT_TEMPLATES.items()
        ],
    }


@router.post("/generate")
async def generate_document(
    template_id: str = Query(..., description="문서 템플릿 ID"),
    context: str = Body(..., embed=True, description="문서 작성에 필요한 입력 내용"),
    title: Optional[str] = Body(None, embed=True, description="문서 제목 (선택)"),
    save: bool = Query(True, description="아카이브에 저장 여부"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    AI 기반 고품질 문서 생성 (Cowork 수준)
    Claude API를 사용하여 전문 비즈니스 문서를 생성합니다.
    """
    if template_id not in DOCUMENT_TEMPLATES:
        raise HTTPException(status_code=400, detail=f"유효하지 않은 템플릿: {template_id}")

    template = DOCUMENT_TEMPLATES[template_id]
    today = datetime.now().strftime("%Y년 %m월 %d일")
    date_short = datetime.now().strftime("%Y%m%d")

    # Build prompt
    prompt = template["prompt_template"].format(
        context=context,
        today=today,
        date=date_short,
    )

    logger.info(f"AI 문서 생성 시작: {template['name']} (사용자: {current_user.email})")

    try:
        # Use Claude long for high quality output
        system_prompt = SYSTEM_DOCUMENT_WRITER
        if template_id == "contract_review":
            system_prompt = SYSTEM_DOCUMENT_ANALYZER
        elif template_id == "business_letter":
            system_prompt = SYSTEM_BUSINESS_LETTER

        result = ask_claude_long(prompt, system=system_prompt, max_tokens=4096)

        if result.startswith("Claude 오류"):
            raise HTTPException(status_code=502, detail=result)

        # Save to file if requested
        saved_path = None
        archive_id = None
        if save:
            doc_dir = os.path.join(DOC_BASE, datetime.now().strftime("%Y/%m"))
            os.makedirs(doc_dir, exist_ok=True)

            safe_title = title or template["name"]
            safe_title = "".join(c for c in safe_title[:40] if c.isalnum() or c in " _-가-힣").strip()
            file_name = f"{date_short}_{safe_title}.md"
            saved_path = os.path.join(doc_dir, file_name)

            with open(saved_path, "w", encoding="utf-8") as f:
                f.write(result)

            # Save to archive DB
            archive = ArchivedDocument(
                document_type="ai_document",
                file_name=file_name,
                file_path=saved_path,
                file_size=len(result.encode("utf-8")),
                category=template["name"],
                description=f"AI 생성 문서: {safe_title}",
                created_by=current_user.id,
            )
            db.add(archive)
            db.commit()
            db.refresh(archive)
            archive_id = archive.id

        logger.info(f"AI 문서 생성 완료: {template['name']} ({len(result)}자)")

        return {
            "status": "success",
            "data": {
                "template": template["name"],
                "content": result,
                "char_count": len(result),
                "saved_path": saved_path,
                "archive_id": archive_id,
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"AI 문서 생성 실패: {e}")
        raise HTTPException(status_code=500, detail=f"문서 생성 실패: {str(e)}")


@router.post("/generate-from-email/{email_id}")
async def generate_document_from_email(
    email_id: int,
    template_id: str = Query("email_summary", description="문서 템플릿 ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """이메일을 기반으로 문서 자동 생성"""
    email = db.query(Email).filter(Email.id == email_id).first()
    if not email:
        raise HTTPException(status_code=404, detail="이메일을 찾을 수 없습니다")

    context = f"""제목: {email.subject}
발신자: {email.sender}
수신자: {email.recipient or 'N/A'}
수신일: {email.received_at.strftime('%Y-%m-%d %H:%M') if email.received_at else 'N/A'}
분류: {email.category or 'N/A'}
우선순위: {email.priority or 'N/A'}

[본문]
{email.body or '(본문 없음)'}"""

    if email.ai_summary:
        context += f"\n\n[AI 요약]\n{email.ai_summary}"

    template = DOCUMENT_TEMPLATES.get(template_id)
    if not template:
        raise HTTPException(status_code=400, detail=f"유효하지 않은 템플릿: {template_id}")

    today = datetime.now().strftime("%Y년 %m월 %d일")
    date_short = datetime.now().strftime("%Y%m%d")
    prompt = template["prompt_template"].format(context=context, today=today, date=date_short)

    system_prompt = SYSTEM_DOCUMENT_WRITER
    if template_id in ("contract_review", "email_summary"):
        system_prompt = SYSTEM_DOCUMENT_ANALYZER

    try:
        result = ask_claude_long(prompt, system=system_prompt, max_tokens=4096)

        if result.startswith("Claude 오류"):
            raise HTTPException(status_code=502, detail=result)

        # Save
        doc_dir = os.path.join(DOC_BASE, datetime.now().strftime("%Y/%m"))
        os.makedirs(doc_dir, exist_ok=True)

        safe_subject = "".join(c for c in (email.subject or "email")[:30] if c.isalnum() or c in " _-가-힣").strip()
        file_name = f"{date_short}_{template['name']}_{safe_subject}.md"
        saved_path = os.path.join(doc_dir, file_name)

        with open(saved_path, "w", encoding="utf-8") as f:
            f.write(result)

        archive = ArchivedDocument(
            email_id=email.id,
            document_type="ai_document",
            file_name=file_name,
            file_path=saved_path,
            file_size=len(result.encode("utf-8")),
            category=template["name"],
            description=f"이메일 기반 {template['name']}: {email.subject[:80]}",
            created_by=current_user.id,
        )
        db.add(archive)
        db.commit()
        db.refresh(archive)

        return {
            "status": "success",
            "data": {
                "template": template["name"],
                "email_subject": email.subject,
                "content": result,
                "char_count": len(result),
                "archive_id": archive.id,
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"이메일 기반 문서 생성 실패: {e}")
        raise HTTPException(status_code=500, detail=f"문서 생성 실패: {str(e)}")


@router.post("/analyze")
async def analyze_document(
    content: str = Body(..., embed=True, description="분석할 문서 내용"),
    analysis_type: str = Body("general", embed=True, description="분석 유형: general, contract, financial, risk"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    AI 문서 분석 (Cowork 수준)
    업로드된 텍스트 내용을 정밀 분석합니다.
    """
    analysis_prompts = {
        "general": f"""다음 문서를 종합적으로 분석하세요.

[문서 내용]
{content}

분석 결과를 다음 구조로 작성하세요:
1. 문서 유형 및 목적
2. 핵심 내용 요약 (5줄 이내)
3. 주요 항목/데이터 추출 (표 형식)
4. 관련 당사자 및 역할
5. 주요 일정/기한
6. 특이사항 및 주의점
7. 권장 후속 조치""",

        "contract": f"""다음 계약서/약정서를 법률적 관점에서 검토하세요.

[문서 내용]
{content}

검토 결과를 다음 구조로 작성하세요:
1. 계약 개요 (당사자, 목적, 기간, 금액)
2. 핵심 조건 요약 (표 형식)
3. 당사 유리 조건
4. 당사 불리 조건/위험 요소
5. 누락 조항 점검
6. 조항별 수정 권고
7. 종합 리스크 평가 (상/중/하)
8. 체결 권고 의견""",

        "financial": f"""다음 문서의 재무/금전 관련 내용을 분석하세요.

[문서 내용]
{content}

분석 결과를 다음 구조로 작성하세요:
1. 거래 개요
2. 금액 정보 정리 (항목별 표)
3. 결제/지급 조건
4. 세금/부가세 관련
5. 환율 리스크 (해당 시)
6. 예상 현금흐름 영향
7. 비용 절감 가능 항목
8. 재무 리스크 평가""",

        "risk": f"""다음 문서의 리스크 요소를 전면 분석하세요.

[문서 내용]
{content}

리스크 분석 결과를 다음 구조로 작성하세요:
1. 식별된 리스크 목록 (위험도 상/중/하)
2. 각 리스크별 상세 설명
3. 발생 가능성 평가
4. 영향도 평가
5. 리스크 대응 방안 (리스크별)
6. 모니터링 포인트
7. 종합 리스크 등급
8. 의사결정 권고""",
    }

    prompt = analysis_prompts.get(analysis_type, analysis_prompts["general"])

    try:
        result = ask_claude_long(prompt, system=SYSTEM_DOCUMENT_ANALYZER, max_tokens=4096)

        if result.startswith("Claude 오류"):
            raise HTTPException(status_code=502, detail=result)

        logger.info(f"문서 분석 완료: {analysis_type} ({len(result)}자)")

        return {
            "status": "success",
            "data": {
                "analysis_type": analysis_type,
                "content": result,
                "char_count": len(result),
                "input_length": len(content),
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"문서 분석 실패: {e}")
        raise HTTPException(status_code=500, detail=f"문서 분석 실패: {str(e)}")


@router.post("/rewrite")
async def rewrite_document(
    content: str = Body(..., embed=True, description="수정할 문서 내용"),
    instructions: str = Body(..., embed=True, description="수정 지시사항"),
    current_user: User = Depends(get_current_active_user),
):
    """
    AI 문서 수정/개선
    기존 문서를 지시사항에 따라 수정합니다.
    """
    prompt = f"""다음 문서를 아래 지시사항에 따라 수정/개선하세요.

[원본 문서]
{content}

[수정 지시사항]
{instructions}

수정된 문서 전체를 출력하세요. 변경된 부분이 자연스럽게 통합되어야 합니다."""

    try:
        result = ask_claude_long(prompt, system=SYSTEM_DOCUMENT_WRITER, max_tokens=4096)

        if result.startswith("Claude 오류"):
            raise HTTPException(status_code=502, detail=result)

        return {
            "status": "success",
            "data": {
                "content": result,
                "char_count": len(result),
            },
        }

    except Exception as e:
        logger.error(f"문서 수정 실패: {e}")
        raise HTTPException(status_code=500, detail=f"문서 수정 실패: {str(e)}")


@router.get("/history")
async def document_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """AI 생성 문서 히스토리"""
    query = db.query(ArchivedDocument).filter(ArchivedDocument.document_type == "ai_document")
    total = query.count()
    docs = (
        query.order_by(desc(ArchivedDocument.created_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return {
        "status": "success",
        "total": total,
        "documents": [
            {
                "id": d.id,
                "file_name": d.file_name,
                "category": d.category,
                "description": d.description,
                "file_size": d.file_size,
                "created_at": d.created_at.isoformat() if d.created_at else None,
            }
            for d in docs
        ],
    }
