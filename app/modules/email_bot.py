"""
Email Bot Module
하이웍스 이메일을 가져와서 AI로 분석하고 자동 답신 초안 생성
5개 카테고리 시스템: A.자료대응, B.영업기획, C.스케줄링, D.정보수집, E.필터링
"""
import poplib
import email
import os
import json
from typing import Dict, List, Optional, Any
from dotenv import load_dotenv
from app.core.ai_selector import ask_claude_long, ask_gemini_json
from app.modules.excel_logger import save_mail_to_excel
from app.utils.logger import setup_logger
from datetime import datetime

load_dotenv()
logger = setup_logger(__name__)

# ─── 5개 카테고리 분류 시스템 프롬프트 ───
CLASSIFICATION_PROMPT = """
당신은 KPROS의 업무 분류 전문가입니다. 수신된 이메일을 아래 5개 기준으로 엄격히 분류하세요.

**분류 기준:**
- A.자료대응: COA, MSDS, 성적서, 카탈로그, 인증서, 기술 자료 요청 건
- B.영업기획: 신규 발주(PO), 견적 문의, 재고 확인, 단가 협의, 구매 의사 건
- C.스케줄링: 물류 입고 일정, 미팅 예약, 수입 스케줄, 배송 추적, 일정 조율 건
- D.정보수집: **업무 관련** 원료 단가 뉴스, 시장 동향, 업계 뉴스레터, 공지사항 (단, 광고성 박람회/세미나 초대는 E)
- E.필터링: 단순 광고, 박람회 초대, 세미나 홍보, 스팸, 내부 시스템 알림, 업무 무관 메일 건

**엄격한 우선순위 규칙:**
1. 서류 요청(COA, MSDS 등) → 무조건 A
2. 발주/견적/구매 의사 → 무조건 B
3. 일정/미팅/물류 날짜 → 무조건 C
4. "[광고]" 태그 또는 박람회/세미나/이벤트 초대 → 무조건 E
5. 시장정보/뉴스/공지 (광고 아님) → D
6. 위 5개에 해당 안되면 → E

**이메일 정보:**
제목: {subject}
발신자: {sender}
본문 일부: {body_preview}

결과는 반드시 다음 JSON 형식을 유지하세요:
{{
  "category": "A/B/C/D/E 중 하나",
  "category_name": "자료대응/영업기획/스케줄링/정보수집/필터링 중 하나",
  "confidence": 0-100 정수,
  "reason": "분류 이유 1-2문장",
  "action_item": "담당 부서에 전달할 구체적 지시사항"
}}

JSON만 출력하세요. 다른 텍스트는 포함하지 마세요.
"""

# ─── 답신 초안 생성 시스템 프롬프트 ───
DRAFT_SYSTEM_PROMPT = """
당신은 KPROS 이사님의 전문 비서입니다.
업무 이메일에 대한 답신 초안을 작성할 때 다음 원칙을 지키세요:

1. 격식 있는 한국어 비즈니스 톤 사용
2. 자료 요청 → "요청하신 자료는 첨부와 같이 송부드립니다"
3. 발주/견적 → "검토 후 견적서/확인서를 회신드리겠습니다"
4. 일정 조율 → "제안하신 일정 확인 후 회신드리겠습니다"
5. 정보 공유 → "유익한 정보 공유 감사드립니다"
6. 필터링 → "(답신 불필요)"

답신은 3-5문장으로 간결하게 작성하세요.
"""


def classify_email_with_ai(subject: str, sender: str, body_preview: str) -> Dict[str, Any]:
    """
    Gemini를 사용하여 이메일을 5개 카테고리로 분류

    Args:
        subject: 이메일 제목
        sender: 발신자
        body_preview: 본문 미리보기 (최대 500자)

    Returns:
        Dict[str, Any]: 분류 결과 JSON
            {
                "category": "A/B/C/D/E",
                "category_name": "카테고리명",
                "confidence": 0-100,
                "reason": "분류 이유",
                "action_item": "부서 지시사항"
            }
    """
    try:
        # 프롬프트 생성
        prompt = CLASSIFICATION_PROMPT.format(
            subject=subject,
            sender=sender,
            body_preview=body_preview[:500]
        )

        logger.info(f"AI 분류 시작: {subject[:50]}...")

        # Gemini JSON 모드로 호출
        result = ask_gemini_json(prompt)

        # 에러 체크
        if "error" in result:
            logger.error(f"Gemini 분류 실패: {result['error']}")
            # Fallback: 기본 E 카테고리
            return {
                "category": "E",
                "category_name": "필터링",
                "confidence": 50,
                "reason": f"AI 분류 실패 (오류: {result['error']})",
                "action_item": "수동 검토 필요"
            }

        # 필수 필드 검증
        required_fields = ["category", "category_name", "confidence", "reason", "action_item"]
        for field in required_fields:
            if field not in result:
                logger.warning(f"분류 결과에 {field} 필드 누락")
                result[field] = "Unknown"

        # 카테고리 검증 (A/B/C/D/E만 허용)
        if result["category"] not in ["A", "B", "C", "D", "E"]:
            logger.warning(f"잘못된 카테고리: {result['category']} → E로 변경")
            result["category"] = "E"
            result["category_name"] = "필터링"

        logger.info(f"분류 완료: {result['category']}.{result['category_name']} (신뢰도 {result['confidence']}%)")
        return result

    except Exception as e:
        logger.error(f"이메일 분류 중 오류: {e}", exc_info=True)
        # Fallback
        return {
            "category": "E",
            "category_name": "필터링",
            "confidence": 0,
            "reason": f"분류 오류: {str(e)}",
            "action_item": "수동 검토 필요"
        }


def generate_draft_reply(subject: str, body_preview: str, category: str) -> str:
    """
    Claude를 사용하여 답신 초안 생성

    Args:
        subject: 이메일 제목
        body_preview: 본문 미리보기
        category: 분류된 카테고리 (A/B/C/D/E)

    Returns:
        str: 답신 초안 텍스트
    """
    try:
        # 카테고리별 컨텍스트 힌트
        category_hints = {
            "A": "기술 자료 요청에 대한 회신입니다.",
            "B": "발주/견적 문의에 대한 회신입니다.",
            "C": "일정 조율 요청에 대한 회신입니다.",
            "D": "정보 공유에 대한 감사 인사입니다.",
            "E": "(답신 불필요 - 광고/시스템 메일)"
        }

        hint = category_hints.get(category, "일반 업무 메일입니다.")

        # E 카테고리는 답신 생성 스킵
        if category == "E":
            return "(답신 불필요 - 광고/시스템 메일)"

        prompt = f"""
다음 이메일에 대한 답신 초안을 작성해주세요.

{hint}

**이메일 제목:** {subject}
**본문 일부:** {body_preview[:300]}

**요구사항:**
- 3-5문장으로 간결하게
- 격식 있는 비즈니스 톤
- 구체적인 날짜나 금액은 "검토 후 회신" 등으로 표현
"""

        logger.info(f"답신 초안 생성 시작: 카테고리 {category}")
        draft = ask_claude_long(prompt, system=DRAFT_SYSTEM_PROMPT, max_tokens=512)

        logger.debug(f"답신 초안 완료: {draft[:50]}...")
        return draft

    except Exception as e:
        logger.error(f"답신 초안 생성 중 오류: {e}", exc_info=True)
        return f"(답신 초안 생성 실패: {str(e)})"


def fetch_hiworks_emails() -> Dict[str, Any]:
    """
    하이웍스 POP3 서버에서 이메일을 가져와 AI로 분석 (5개 카테고리 시스템)

    Returns:
        Dict[str, Any]: 분석 결과 딕셔너리
    """
    try:
        # 1. 하이웍스 POP3 서버 연결
        imap_server = os.getenv("IMAP_SERVER")
        imap_port = os.getenv("IMAP_PORT")
        email_user = os.getenv("EMAIL_USER")
        email_pass = os.getenv("EMAIL_PASS")

        if not all([imap_server, imap_port, email_user, email_pass]):
            logger.error("이메일 환경 변수가 설정되지 않았습니다.")
            return {"error": "이메일 환경 변수가 설정되지 않았습니다."}

        server = poplib.POP3_SSL(imap_server, int(imap_port))
        server.user(email_user)
        server.pass_(email_pass)

        # 메일 개수 확인
        num_messages = len(server.list()[1])
        logger.info(f"연결 성공! 새로운 메일 {num_messages}개가 있습니다.")

        # 가장 최근 메일 1개 가져오기 테스트
        if num_messages > 0:
            _, lines, _ = server.retr(num_messages)
            msg_content = b'\n'.join(lines).decode('utf-8', errors='ignore')
            msg = email.message_from_string(msg_content)

            subject = msg.get("Subject", "(제목 없음)")
            sender = msg.get("From", "(발신자 없음)")

            # 본문 추출
            body = ""
            if msg.is_multipart():
                for part in msg.walk():
                    if part.get_content_type() == "text/plain":
                        body = part.get_payload(decode=True).decode('utf-8', errors='ignore')
                        break
            else:
                body = msg.get_payload(decode=True).decode('utf-8', errors='ignore') if msg.get_payload() else ""

            body_preview = body[:500] if body else "(본문 없음)"

            logger.info(f"읽은 메일 제목: {subject}")

            # 2. AI 분석 시작 (5개 카테고리 시스템)
            classification = classify_email_with_ai(subject, sender, body_preview)

            # 3. 답신 초안 생성 (Claude 사용)
            draft = generate_draft_reply(subject, body_preview, classification["category"])

            server.quit()

            return {
                "total_emails": num_messages,
                "subject": subject,
                "sender": sender,
                "classification": classification,
                "response_draft": draft,
                "body_preview": body_preview[:200]
            }

        server.quit()
        logger.info("메일이 없습니다.")
        return {"total_emails": num_messages, "message": "메일이 없습니다."}

    except Exception as e:
        logger.error(f"이메일 수신 중 오류 발생: {e}", exc_info=True)
        return {"error": str(e)}


def fetch_and_record_emails(max_emails: int = 5) -> Dict[str, Any]:
    """
    하이웍스 메일을 가져와 분석하고 엑셀에 기록 (5개 카테고리 시스템)

    Args:
        max_emails: 처리할 최대 메일 개수 (기본값: 5)

    Returns:
        Dict[str, Any]: 처리 결과 딕셔너리
    """
    try:
        # 1. 하이웍스 메일 접속
        imap_server = os.getenv("IMAP_SERVER")
        imap_port = os.getenv("IMAP_PORT")
        email_user = os.getenv("EMAIL_USER")
        email_pass = os.getenv("EMAIL_PASS")

        if not all([imap_server, imap_port, email_user, email_pass]):
            logger.error("이메일 환경 변수가 설정되지 않았습니다.")
            return {"count": 0, "message": "이메일 환경 변수가 설정되지 않았습니다."}

        server = poplib.POP3_SSL(imap_server, int(imap_port))
        server.user(email_user)
        server.pass_(email_pass)

        num_messages = len(server.list()[1])
        if num_messages == 0:
            logger.info("새로운 메일이 없습니다.")
            server.quit()
            return {"count": 0, "message": "새로운 메일이 없습니다."}

        processed_data: List[Dict[str, str]] = []

        # 최신 메일부터 max_emails개 분석
        start = max(1, num_messages - max_emails + 1)
        for i in range(num_messages, start - 1, -1):
            try:
                _, lines, _ = server.retr(i)
                msg_content = b'\n'.join(lines).decode('utf-8', errors='ignore')
                msg = email.message_from_string(msg_content)

                subject = msg.get("Subject", "(제목 없음)")
                sender = msg.get("From", "(발신자 없음)")

                # 본문 추출
                body = ""
                if msg.is_multipart():
                    for part in msg.walk():
                        if part.get_content_type() == "text/plain":
                            body = part.get_payload(decode=True).decode('utf-8', errors='ignore')
                            break
                else:
                    body = msg.get_payload(decode=True).decode('utf-8', errors='ignore') if msg.get_payload() else ""

                body_preview = body[:500] if body else "(본문 없음)"

                logger.info(f"메일 분석 중 ({i}/{num_messages}): {subject[:50]}...")

                # 2. AI 분류 (5개 카테고리)
                classification = classify_email_with_ai(subject, sender, body_preview)

                # 3. 답신 초안 생성
                draft = generate_draft_reply(subject, body_preview, classification["category"])

                record = {
                    "날짜": datetime.now().strftime("%Y-%m-%d %H:%M"),
                    "발신자": sender,
                    "제목": subject,
                    "카테고리": f"{classification['category']}.{classification['category_name']}",
                    "신뢰도": f"{classification['confidence']}%",
                    "분류이유": classification["reason"],
                    "부서지시": classification["action_item"],
                    "답신초안": draft[:200] + "..." if len(draft) > 200 else draft,
                    "상태": "완료"
                }
                processed_data.append(record)

            except Exception as e:
                logger.error(f"메일 {i} 처리 중 오류: {e}")
                continue

        # 4. 엑셀 저장 실행
        if processed_data:
            save_mail_to_excel(processed_data)
            logger.info(f"{len(processed_data)}개 메일 처리 완료 → 엑셀 저장")

        server.quit()

        return {
            "count": len(processed_data),
            "data": processed_data,
            "summary": {
                "A": sum(1 for r in processed_data if r["카테고리"].startswith("A")),
                "B": sum(1 for r in processed_data if r["카테고리"].startswith("B")),
                "C": sum(1 for r in processed_data if r["카테고리"].startswith("C")),
                "D": sum(1 for r in processed_data if r["카테고리"].startswith("D")),
                "E": sum(1 for r in processed_data if r["카테고리"].startswith("E")),
            }
        }
    except Exception as e:
        logger.error(f"메일 처리 중 오류 발생: {e}", exc_info=True)
        return {"count": 0, "message": f"오류 발생: {str(e)}"}


# ─── 테스트 함수 ───
def test_classification():
    """
    분류 시스템 테스트 (실제 이메일 없이 샘플 데이터로)
    """
    print("\n" + "="*60)
    print("KPROS C-Auto 5개 카테고리 분류 시스템 테스트")
    print("="*60 + "\n")

    # 테스트 케이스
    test_cases = [
        {
            "subject": "Re: COA 요청드립니다 - Glycerine 99.5%",
            "sender": "customer@example.com",
            "body": "안녕하세요. Glycerine 99.5% 제품의 COA를 요청드립니다.",
            "expected": "A"
        },
        {
            "subject": "견적 문의 - PEG 400 20kg",
            "sender": "buyer@company.com",
            "body": "PEG 400 제품 20kg 견적 부탁드립니다.",
            "expected": "B"
        },
        {
            "subject": "수입 스케줄 확인 - 3월 입고 예정",
            "sender": "logistics@shipping.com",
            "body": "3월 15일 입고 예정인 컨테이너 스케줄 확인 부탁드립니다.",
            "expected": "C"
        },
        {
            "subject": "[뉴스레터] 2025년 2월 원료 단가 동향",
            "sender": "newsletter@market.com",
            "body": "이번 달 주요 원료 단가 변동 사항을 안내드립니다.",
            "expected": "D"
        },
        {
            "subject": "[광고] 신규 화장품 원료 박람회 안내",
            "sender": "ad@promo.com",
            "body": "2025 K-Beauty 박람회에 초대합니다.",
            "expected": "E"
        },
    ]

    results = []
    for i, case in enumerate(test_cases, 1):
        print(f"\n[테스트 {i}] {case['subject']}")
        print(f"예상 카테고리: {case['expected']}")

        result = classify_email_with_ai(
            subject=case["subject"],
            sender=case["sender"],
            body_preview=case["body"]
        )

        actual = result["category"]
        passed = "[PASS]" if actual == case["expected"] else "[FAIL]"

        print(f"실제 카테고리: {actual}.{result['category_name']} (신뢰도: {result['confidence']}%)")
        print(f"분류 이유: {result['reason']}")
        print(f"부서 지시: {result['action_item']}")
        print(f"결과: {passed}")

        results.append({
            "subject": case["subject"],
            "expected": case["expected"],
            "actual": actual,
            "passed": actual == case["expected"]
        })

    # 결과 요약
    print("\n" + "="*60)
    print("테스트 결과 요약")
    print("="*60)
    passed_count = sum(1 for r in results if r["passed"])
    total_count = len(results)
    print(f"통과: {passed_count}/{total_count} ({passed_count/total_count*100:.1f}%)")

    if passed_count < total_count:
        print("\n실패한 테스트:")
        for r in results:
            if not r["passed"]:
                print(f"  - {r['subject']}: 예상 {r['expected']}, 실제 {r['actual']}")


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "test":
        # 테스트 모드
        test_classification()
    elif len(sys.argv) > 1 and sys.argv[1] == "record":
        # 실제 메일 가져와서 엑셀 기록
        result = fetch_and_record_emails(max_emails=5)
        print("\n처리 결과:")
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        # 기본: 최신 메일 1개 분석
        result = fetch_hiworks_emails()
        print("\n분석 결과:")
        print(json.dumps(result, indent=2, ensure_ascii=False))
