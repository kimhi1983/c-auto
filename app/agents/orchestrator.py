"""
오케스트레이터 - 에이전트 팀의 총괄 지휘자
메일 수신부터 Excel 저장까지 전체 파이프라인을 순서대로 조율
"""
from typing import Dict, Any
from datetime import datetime
from app.agents.base import BaseAgent
from app.agents.email_agent import EmailAgent
from app.agents.file_agent import FileAgent
from app.agents.inventory_agent import InventoryAgent
from app.agents.record_agent import RecordAgent
from app.utils.logger import setup_logger

logger = setup_logger("orchestrator")


class OrchestratorAgent:
    """
    에이전트 팀 총괄 지휘자

    파이프라인:
        [이메일에이전트] → [파일에이전트 + 재고에이전트] → [기록에이전트]

    - 이메일에이전트 결과를 컨텍스트로 만들어 하위 에이전트에 전달
    - 각 에이전트 보고를 수집하여 최종 결과 반환
    """

    def __init__(self):
        self.team: Dict[str, BaseAgent] = {
            "email": EmailAgent(),
            "file": FileAgent(),
            "inventory": InventoryAgent(),
            "record": RecordAgent(),
        }
        self.run_history = []

    def run(self) -> Dict[str, Any]:
        """전체 에이전트 팀 실행"""
        started_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        logger.info("=" * 50)
        logger.info("에이전트 팀 가동 시작")
        logger.info("=" * 50)

        reports = {}

        # Step 1: 이메일 에이전트
        logger.info("[1/4] 이메일에이전트 실행 중...")
        email_report = self.team["email"].run({})
        reports["email"] = email_report
        emails = email_report.get("data", {}).get("emails", [])

        if not emails:
            logger.info("수신 메일 없음 — 파이프라인 종료")
            return self._finalize(started_at, reports, skipped=True)

        # Step 2: 파일에이전트 + 재고에이전트 (이메일 결과 공유)
        email_context = {"emails": emails}

        logger.info("[2/4] 파일에이전트 실행 중...")
        file_report = self.team["file"].run(email_context)
        reports["file"] = file_report

        logger.info("[3/4] 재고에이전트 실행 중...")
        inv_report = self.team["inventory"].run(email_context)
        reports["inventory"] = inv_report

        # Step 3: 기록 에이전트 (전체 결과 취합)
        record_context = {
            "emails": emails,
            "file_results": file_report.get("data", {}).get("file_results", []),
            "inventory_actions": inv_report.get("data", {}).get("actions", []),
        }

        logger.info("[4/4] 기록에이전트 실행 중...")
        record_report = self.team["record"].run(record_context)
        reports["record"] = record_report

        logger.info("에이전트 팀 전체 완료")
        return self._finalize(started_at, reports)

    def status(self) -> Dict[str, Any]:
        """팀 전체 상태 조회"""
        return {
            "team": {
                name: {
                    "role": agent.role,
                    "status": agent.status,
                    "last_run": agent.last_run,
                }
                for name, agent in self.team.items()
            },
            "total_runs": len(self.run_history),
        }

    def _finalize(
        self, started_at: str, reports: Dict, skipped: bool = False
    ) -> Dict[str, Any]:
        finished_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        result = {
            "status": "success",
            "started_at": started_at,
            "finished_at": finished_at,
            "skipped": skipped,
            "reports": reports,
            "summary": self._summary(reports),
        }
        self.run_history.append({"started_at": started_at, "finished_at": finished_at})
        return result

    def _summary(self, reports: Dict) -> str:
        """전체 보고 요약"""
        parts = []
        for name, report in reports.items():
            parts.append(f"[{report.get('agent', name)}] {report.get('message', '')}")
        return " → ".join(parts)
