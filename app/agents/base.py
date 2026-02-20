"""
Base Agent - 모든 에이전트의 공통 기반 클래스
"""
from abc import ABC, abstractmethod
from typing import Dict, Any
from datetime import datetime
from app.utils.logger import setup_logger


class BaseAgent(ABC):
    """모든 에이전트가 상속하는 기반 클래스"""

    def __init__(self, name: str, role: str):
        self.name = name
        self.role = role
        self.logger = setup_logger(f"agent.{name}")
        self.status = "대기중"
        self.last_run: str | None = None

    @abstractmethod
    def run(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """에이전트 실행 - 각 에이전트가 반드시 구현"""
        pass

    def report(self, message: str, data: Dict[str, Any] = None) -> Dict[str, Any]:
        """오케스트레이터에게 보고"""
        self.logger.info(f"[{self.name}] {message}")
        return {
            "agent": self.name,
            "role": self.role,
            "status": self.status,
            "message": message,
            "data": data or {},
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        }

    def _set_status(self, status: str):
        self.status = status
        self.logger.info(f"[{self.name}] 상태 변경: {status}")

    def _start(self):
        self._set_status("실행중")
        self.last_run = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    def _done(self):
        self._set_status("완료")

    def _error(self, e: Exception):
        self._set_status("오류")
        self.logger.error(f"[{self.name}] 오류 발생: {e}", exc_info=True)
