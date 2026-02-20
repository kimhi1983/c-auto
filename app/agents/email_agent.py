"""
이메일 에이전트 - 메일 수신, AI 분석, 답신 초안 생성 담당
"""
import poplib
import email
import os
from email.header import decode_header
from typing import Dict, Any, List
from app.agents.base import BaseAgent
from app.core.ai_selector import ask_claude, ask_gemini


def _decode_mime(value: str) -> str:
    """MIME 인코딩된 헤더를 사람이 읽을 수 있는 문자열로 변환"""
    if not value:
        return ""
    parts = decode_header(value)
    decoded = []
    for text, charset in parts:
        if isinstance(text, bytes):
            decoded.append(text.decode(charset or "utf-8", errors="ignore"))
        else:
            decoded.append(text)
    return " ".join(decoded)


class EmailAgent(BaseAgent):
    """
    담당 업무:
    - HiWorks POP3에서 이메일 수신
    - Gemini로 카테고리 분류
    - Claude로 정밀 분석 및 답신 초안 작성
    - 분석 결과를 오케스트레이터에게 전달
    """

    def __init__(self):
        super().__init__(name="이메일에이전트", role="메일 수신 및 AI 분석")

    def run(self, context: Dict[str, Any]) -> Dict[str, Any]:
        self._start()
        try:
            emails = self._fetch_emails()
            if not emails:
                self._done()
                return self.report("수신된 메일이 없습니다.", {"emails": []})

            analyzed = []
            for mail in emails:
                result = self._analyze(mail)
                analyzed.append(result)
                self.logger.info(f"분석 완료: {result['subject']}")

            self._done()
            return self.report(
                f"{len(analyzed)}개 메일 분석 완료",
                {"emails": analyzed, "count": len(analyzed)},
            )

        except Exception as e:
            self._error(e)
            return self.report(f"오류: {e}", {"emails": []})

    def _fetch_emails(self, max_count: int = 3) -> List[Dict[str, str]]:
        """POP3에서 최신 메일 가져오기"""
        server_addr = os.getenv("IMAP_SERVER")
        port = int(os.getenv("IMAP_PORT", 995))
        user = os.getenv("EMAIL_USER")
        password = os.getenv("EMAIL_PASS")

        if not all([server_addr, user, password]):
            self.logger.error("이메일 환경 변수가 설정되지 않았습니다.")
            return []

        server = poplib.POP3_SSL(server_addr, port)
        server.user(user)
        server.pass_(password)

        total = len(server.list()[1])
        self.logger.info(f"총 {total}개 메일 확인")

        results = []
        for i in range(total, max(0, total - max_count), -1):
            _, lines, _ = server.retr(i)
            raw = b"\n".join(lines).decode("utf-8", errors="ignore")
            msg = email.message_from_string(raw)

            body = self._extract_body(msg)
            results.append({
                "subject": _decode_mime(msg.get("Subject", "(제목 없음)")),
                "sender": _decode_mime(msg.get("From", "")),
                "date": msg.get("Date", ""),
                "body": body[:1000],
            })

        server.quit()
        return results

    def _extract_body(self, msg) -> str:
        """메일 본문 추출"""
        if msg.is_multipart():
            for part in msg.walk():
                if part.get_content_type() == "text/plain":
                    return part.get_payload(decode=True).decode("utf-8", errors="ignore")
        else:
            payload = msg.get_payload(decode=True)
            if payload:
                return payload.decode("utf-8", errors="ignore")
        return ""

    def _analyze(self, mail: Dict[str, str]) -> Dict[str, Any]:
        """Gemini 분류 + Claude 정밀 분석"""
        subject = mail["subject"]
        body = mail["body"]

        category = ask_gemini(
            f"이 메일을 [재고, 발주, 문의, 기타] 중 하나로만 분류해줘. 답변은 분류 단어만:\n제목: {subject}"
        )

        analysis_prompt = f"""다음 메일을 분석하고 JSON으로만 답하세요:
제목: {subject}
내용: {body[:500]}

형식:
{{
  "요약": "한 줄 요약",
  "자료요청": "유/무",
  "키워드": "파일 검색 키워드",
  "중요도": "상/중/하",
  "답신초안": "답신 초안 2-3줄"
}}"""

        raw_analysis = ask_claude(analysis_prompt)

        # JSON 파싱 시도
        import json, re
        analysis = {}
        try:
            match = re.search(r"\{.*\}", raw_analysis, re.DOTALL)
            if match:
                analysis = json.loads(match.group())
        except Exception:
            analysis = {"답신초안": raw_analysis}

        return {
            "subject": subject,
            "sender": mail["sender"],
            "date": mail["date"],
            "category": category.strip(),
            "summary": analysis.get("요약", ""),
            "file_request": analysis.get("자료요청", "무"),
            "keyword": analysis.get("키워드", ""),
            "priority": analysis.get("중요도", "중"),
            "response_draft": analysis.get("답신초안", ""),
        }
