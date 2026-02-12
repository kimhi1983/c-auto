"""
API 응답 표준 모델
Pydantic 기반 응답 스키마
"""
from typing import Optional, Any, List, Dict
from pydantic import BaseModel, Field

class BaseResponse(BaseModel):
    """기본 응답 모델"""
    status: str = Field(..., description="응답 상태 (success/error)")
    message: Optional[str] = Field(None, description="응답 메시지")

class ErrorResponse(BaseResponse):
    """에러 응답 모델"""
    status: str = "error"
    error: Optional[str] = Field(None, description="에러 상세")

class EmailAnalysis(BaseModel):
    """이메일 분석 결과"""
    subject: str = Field(..., description="이메일 제목")
    category: str = Field(..., description="이메일 분류")
    response_draft: str = Field(..., description="답신 초안")
    total_emails: int = Field(..., description="전체 이메일 수")

class EmailResponse(BaseResponse):
    """이메일 분석 응답"""
    status: str = "success"
    count: int = Field(0, description="처리된 이메일 수")
    data: Optional[EmailAnalysis] = None

class FileInfo(BaseModel):
    """파일 정보"""
    name: str = Field(..., description="파일명")
    path: str = Field(..., description="파일 경로")
    size: int = Field(..., description="파일 크기(bytes)")
    size_mb: float = Field(..., description="파일 크기(MB)")

class FileSearchResponse(BaseResponse):
    """파일 검색 응답"""
    status: str = "success"
    keyword: str = Field(..., description="검색 키워드")
    total_found: int = Field(..., description="검색된 파일 수")
    files: List[FileInfo] = Field(default_factory=list, description="파일 목록")

class InventoryItem(BaseModel):
    """재고 항목"""
    품목명: str = Field(..., description="품목명")
    현재고: int = Field(..., description="현재 재고 수량")
    단위: str = Field(..., description="단위")

class InventoryResponse(BaseResponse):
    """재고 조회 응답"""
    status: str = "success"
    data: List[InventoryItem] = Field(default_factory=list, description="재고 목록")

class InventoryTransactionRequest(BaseModel):
    """재고 입출고 요청"""
    item_name: str = Field(..., description="품목명")
    quantity: int = Field(..., gt=0, description="수량")
    transaction_type: str = Field(..., description="입고 또는 출고")
    note: str = Field("", description="비고")

class AIQueryRequest(BaseModel):
    """AI 질의 요청"""
    query: str = Field(..., min_length=1, description="질문 내용")

class AIQueryResponse(BaseResponse):
    """AI 질의 응답"""
    status: str = "success"
    answer: str = Field(..., description="AI 답변")
