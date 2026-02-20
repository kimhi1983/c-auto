"""
기록 에이전트 - 모든 처리 결과를 Excel에 저장하고 보고서 생성 담당
"""
import os
import pandas as pd
from typing import Dict, Any, List
from datetime import datetime
from app.agents.base import BaseAgent


class RecordAgent(BaseAgent):
    """
    담당 업무:
    - 오케스트레이터로부터 전체 처리 결과 수집
    - Excel 업무처리_기록부에 저장
    - 처리 완료 보고서 생성
    """

    def __init__(self):
        super().__init__(name="기록에이전트", role="Excel 저장 및 보고서 생성")

    def run(self, context: Dict[str, Any]) -> Dict[str, Any]:
        self._start()
        try:
            emails = context.get("emails", [])
            file_results = context.get("file_results", [])
            inventory_actions = context.get("inventory_actions", [])

            if not emails:
                self._done()
                return self.report("저장할 데이터 없음", {"saved": 0})

            # 파일 결과를 이메일 제목으로 매핑
            file_map = {r["subject"]: r for r in file_results}

            records = []
            for mail in emails:
                subject = mail.get("subject", "")
                file_info = file_map.get(subject, {})

                records.append({
                    "날짜": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    "발신자": mail.get("sender", ""),
                    "제목": subject,
                    "분류": mail.get("category", ""),
                    "요약": mail.get("summary", ""),
                    "자료요청": mail.get("file_request", "무"),
                    "중요도": mail.get("priority", "중"),
                    "키워드": mail.get("keyword", ""),
                    "복사파일수": len(file_info.get("copied", [])),
                    "처리상태": "완료",
                    "답신초안": mail.get("response_draft", ""),
                })

            saved = self._save_to_excel(records)
            report = self._generate_report(emails, file_results, inventory_actions)

            self._done()
            return self.report(
                f"{saved}건 Excel 저장 완료",
                {"saved": saved, "report": report},
            )

        except Exception as e:
            self._error(e)
            return self.report(f"오류: {e}", {"saved": 0})

    def _save_to_excel(self, records: List[Dict]) -> int:
        """Excel 업무처리_기록부에 저장"""
        if not records:
            return 0

        dropbox_path = os.getenv("DROPBOX_PATH", "D:/Dropbox")
        ai_dir = os.getenv("AI_WORK_DIR", "AI 업무폴더")
        ai_folder = os.path.join(dropbox_path, ai_dir)
        os.makedirs(ai_folder, exist_ok=True)

        excel_path = os.path.join(ai_folder, "업무처리_기록부.xlsx")
        new_df = pd.DataFrame(records)

        if os.path.exists(excel_path):
            existing = pd.read_excel(excel_path)
            df = pd.concat([existing, new_df], ignore_index=True)
        else:
            df = new_df

        df.to_excel(excel_path, index=False)
        self.logger.info(f"Excel 저장 완료: {excel_path}")
        return len(records)

    def _generate_report(
        self,
        emails: List[Dict],
        file_results: List[Dict],
        inventory_actions: List[Dict],
    ) -> str:
        """처리 결과 요약 보고서 생성"""
        total = len(emails)
        categories = {}
        for m in emails:
            cat = m.get("category", "기타").strip()
            categories[cat] = categories.get(cat, 0) + 1

        file_count = sum(len(r.get("copied", [])) for r in file_results)
        inv_count = len(inventory_actions)

        cat_str = ", ".join(f"{k} {v}건" for k, v in categories.items())
        lines = [
            f"처리 메일: {total}건 ({cat_str})",
            f"복사된 파일: {file_count}개",
            f"재고 처리: {inv_count}건",
            f"완료 시각: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        ]
        return " | ".join(lines)
