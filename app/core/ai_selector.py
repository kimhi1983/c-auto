"""
AI Selector Module
Claude와 Gemini 두 가지 AI 모델을 호출하는 헬퍼 함수
"""
import os
import json
from typing import Optional
from anthropic import Anthropic
import google.generativeai as genai
from app.utils.logger import setup_logger

logger = setup_logger(__name__)

def ask_claude(prompt: str, model: str = "claude-3-5-sonnet-20241022") -> str:
    """
    Anthropic Claude 모델에 질문하고 응답 받기

    Args:
        prompt: 질문 내용
        model: 사용할 모델 (기본값: claude-3-5-sonnet-20241022)

    Returns:
        str: AI 응답 텍스트
    """
    try:
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            logger.error("ANTHROPIC_API_KEY 환경 변수가 설정되지 않았습니다.")
            return "Claude 오류: API 키가 설정되지 않았습니다."

        client = Anthropic(api_key=api_key)
        logger.debug(f"Claude 호출: 모델={model}, 프롬프트 길이={len(prompt)}")

        message = client.messages.create(
            model=model,
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}]
        )

        answer = message.content[0].text
        logger.debug(f"Claude 응답: {answer[:100]}...")
        return answer

    except Exception as e:
        logger.error(f"Claude API 호출 오류: {e}", exc_info=True)
        return f"Claude 오류: {str(e)}"

def ask_claude_long(prompt: str, system: str = "", model: str = "claude-3-5-sonnet-20241022", max_tokens: int = 4096) -> str:
    """
    Claude 장문 응답용 - 서류 작성, 보고서, 분석 등에 사용
    Cowork 수준의 고품질 출력을 위한 전용 함수

    Args:
        prompt: 질문/요청 내용
        system: 시스템 프롬프트 (역할 설정)
        model: 사용할 모델
        max_tokens: 최대 토큰 수 (기본 4096)

    Returns:
        str: AI 응답 텍스트
    """
    try:
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            logger.error("ANTHROPIC_API_KEY 환경 변수가 설정되지 않았습니다.")
            return "Claude 오류: API 키가 설정되지 않았습니다."

        client = Anthropic(api_key=api_key)
        logger.info(f"Claude 장문 호출: 모델={model}, max_tokens={max_tokens}")

        kwargs = {
            "model": model,
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": prompt}],
        }
        if system:
            kwargs["system"] = system

        message = client.messages.create(**kwargs)

        answer = message.content[0].text
        logger.info(f"Claude 장문 응답 완료: {len(answer)}자")
        return answer

    except Exception as e:
        logger.error(f"Claude 장문 API 호출 오류: {e}", exc_info=True)
        return f"Claude 오류: {str(e)}"


def ask_gemini(prompt: str, model: str = "gemini-2.0-flash") -> str:
    """
    Google Gemini 모델에 질문하고 응답 받기

    Args:
        prompt: 질문 내용
        model: 사용할 모델 (기본값: gemini-2.0-flash - 최신 고속 모델)

    Returns:
        str: AI 응답 텍스트
    """
    try:
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            logger.error("GOOGLE_API_KEY 환경 변수가 설정되지 않았습니다.")
            return "Gemini 오류: API 키가 설정되지 않았습니다."

        genai.configure(api_key=api_key)
        logger.debug(f"Gemini 호출: 모델={model}, 프롬프트 길이={len(prompt)}")

        model_instance = genai.GenerativeModel(model)
        response = model_instance.generate_content(prompt)

        answer = response.text
        logger.debug(f"Gemini 응답: {answer[:100]}...")
        return answer

    except Exception as e:
        logger.error(f"Gemini API 호출 오류: {e}", exc_info=True)
        return f"Gemini 오류: {str(e)}"

def ask_gemini_json(prompt: str, model: str = "gemini-2.0-flash") -> dict:
    """
    Gemini에게 질문하고 JSON 형식으로 응답 받기 (업무 데이터 추출용)

    Args:
        prompt: 질문 내용
        model: 사용할 모델 (기본값: gemini-2.0-flash - 최신 고속 모델)

    Returns:
        dict: 파싱된 JSON 데이터
    """
    try:
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            return {"error": "API 키 미설정"}

        genai.configure(api_key=api_key)
        
        # JSON 출력을 강제하는 시스템 프롬프트 추가
        full_prompt = (
            f"{prompt}\n\n"
            "Output MUST be a valid JSON object. Do not include markdown formatting like ```json."
        )
        
        model_instance = genai.GenerativeModel(model)
        # generation_config={"response_mime_type": "application/json"} 은 최신 버전에서 지원
        response = model_instance.generate_content(full_prompt)
        
        text = response.text.strip()
        # 마크다운 코드 블록 제거
        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
            
        return json.loads(text)
    except Exception as e:
        logger.error(f"Gemini JSON 파싱 오류: {e}", exc_info=True)
        return {"error": str(e), "raw_text": text if 'text' in locals() else ""}
