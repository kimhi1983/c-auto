"""
로깅 유틸리티
애플리케이션 전역 로깅 설정
"""
import logging
import sys
from pathlib import Path
from datetime import datetime

def setup_logger(name: str = __name__, level: int = logging.INFO) -> logging.Logger:
    """
    로거 설정 및 반환

    Args:
        name: 로거 이름
        level: 로깅 레벨

    Returns:
        설정된 Logger 인스턴스
    """
    logger = logging.getLogger(name)
    logger.setLevel(level)

    # 이미 핸들러가 있으면 중복 방지
    if logger.handlers:
        return logger

    # 콘솔 핸들러
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(level)

    # 포맷터 설정
    formatter = logging.Formatter(
        '%(asctime)s | %(name)s | %(levelname)s | %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    console_handler.setFormatter(formatter)

    logger.addHandler(console_handler)

    return logger
