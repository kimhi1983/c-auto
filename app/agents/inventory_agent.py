"""
재고 에이전트 - 이메일 내용을 바탕으로 재고 현황 파악 및 입출고 처리 담당
"""
import os
from typing import Dict, Any
from app.agents.base import BaseAgent
from app.core.ai_selector import ask_gemini


class InventoryAgent(BaseAgent):
    """
    담당 업무:
    - 이메일 분석 결과에서 재고/발주 관련 항목 감지
    - 현재 재고 현황 조회
    - AI로 입출고 처리 필요 여부 판단
    - 필요 시 재고 변동 사항 기록
    """

    def __init__(self):
        super().__init__(name="재고에이전트", role="재고 현황 파악 및 입출고 처리")

    def run(self, context: Dict[str, Any]) -> Dict[str, Any]:
        self._start()
        try:
            emails = context.get("emails", [])
            actions = []

            for mail in emails:
                category = mail.get("category", "")
                if category.strip() in ["재고", "발주"]:
                    self.logger.info(f"재고/발주 메일 감지: {mail.get('subject', '')}")
                    action = self._process_inventory_mail(mail)
                    actions.append(action)

            if not actions:
                self._done()
                return self.report("재고/발주 관련 메일 없음", {"actions": []})

            self._done()
            return self.report(
                f"{len(actions)}건 재고 처리 완료",
                {"actions": actions},
            )

        except Exception as e:
            self._error(e)
            return self.report(f"오류: {e}", {"actions": []})

    def _process_inventory_mail(self, mail: Dict[str, Any]) -> Dict[str, Any]:
        """재고 관련 메일 처리"""
        subject = mail.get("subject", "")
        summary = mail.get("summary", "")

        # Gemini로 입출고 여부 판단
        decision = ask_gemini(
            f"다음 메일 요약을 보고 '입고', '출고', '조회', '해당없음' 중 하나만 답하세요:\n{summary}"
        ).strip()

        self.logger.info(f"재고 판단: {decision}")

        inventory_status = self._get_inventory_summary()

        return {
            "subject": subject,
            "category": mail.get("category", ""),
            "decision": decision,
            "inventory_snapshot": inventory_status,
            "note": f"AI 판단: {decision}",
        }

    def _get_inventory_summary(self) -> str:
        """재고 현황 요약 (Excel 파일 기반)"""
        try:
            import pandas as pd
            dropbox_path = os.getenv("DROPBOX_PATH", "D:/Dropbox")
            inventory_file = os.path.join(dropbox_path, "재고 폴더", "실시간_재고현황.xlsx")

            if not os.path.exists(inventory_file):
                return "재고 파일 없음"

            df = pd.read_excel(inventory_file)
            if df.empty:
                return "재고 데이터 없음"

            lines = []
            for _, row in df.iterrows():
                lines.append(f"{row.get('품목명', '')} {row.get('현재고', 0)} {row.get('단위', '')}")
            return " / ".join(lines[:5])  # 상위 5개만 요약

        except Exception as e:
            self.logger.warning(f"재고 파일 읽기 실패: {e}")
            return "재고 조회 불가"
