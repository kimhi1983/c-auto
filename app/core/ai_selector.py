"""
AI Selector Module
OpenAI GPT와 Anthropic Claude API를 호출하는 헬퍼 함수
"""
import os
from openai import OpenAI
from anthropic import Anthropic

def ask_gpt(prompt: str, model: str = "gpt-4o") -> str:
    """
    OpenAI GPT 모델에 질문하고 응답 받기
    
    Args:
        prompt: 질문 내용
        model: 사용할 모델 (기본값: gpt-4o)
    
    Returns:
        AI 응답 텍스트
    """
    try:
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7
        )
        return response.choices[0].message.content
    except Exception as e:
        return f"GPT 오류: {str(e)}"

def ask_claude(prompt: str, model: str = "claude-3-5-sonnet-20240620") -> str:
    """
    Anthropic Claude 모델에 질문하고 응답 받기
    
    Args:
        prompt: 질문 내용
        model: 사용할 모델 (기본값: claude-3-5-sonnet-20240620)
    
    Returns:
        AI 응답 텍스트
    """
    try:
        client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        message = client.messages.create(
            model=model,
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}]
        )
        return message.content[0].text
    except Exception as e:
        return f"Claude 오류: {str(e)}"
