"""
C-Auto Main Application
FastAPI 기반 웹 서버
"""
from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any
import uvicorn
import os
from datetime import datetime

from app.modules.email_bot import fetch_hiworks_emails, fetch_and_record_emails
from app.modules.file_search import (
    search_files_with_permission,
    save_to_ai_folder,
    get_ai_folder_contents,
    initialize_ai_folder
)
from app.modules.excel_logger import save_mail_to_excel, get_work_log
from app.modules.inventory import get_current_inventory, record_inventory_transaction
from app.core.ai_selector import ask_claude, ask_gpt
from app.utils.logger import setup_logger
from app.utils.response_models import (
    BaseResponse,
    ErrorResponse,
    EmailResponse,
    FileSearchResponse,
    InventoryResponse,
    InventoryTransactionRequest,
    AIQueryResponse
)

# 로거 설정
logger = setup_logger(__name__)

# FastAPI 앱 초기화
app = FastAPI(
    title="C-Auto 이사님 업무지원 시스템",
    description="AI 기반 업무 자동화 플랫폼",
    version="2.0.0"
)

# CORS 설정 (필요시)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 정적 파일 서빙 (프론트엔드)
app.mount("/static", StaticFiles(directory="frontend"), name="static")


@app.get("/", include_in_schema=False)
def read_root():
    """루트 경로를 대시보드로 리다이렉트"""
    logger.info("루트 경로 접근 - 대시보드로 리다이렉트")
    return RedirectResponse(url="/static/index.html")


@app.get("/api/status", response_model=BaseResponse, tags=["시스템"])
def api_status() -> Dict[str, str]:
    """API 상태 확인"""
    logger.info("API 상태 확인 요청")
    return {"status": "success", "message": "이사님, 시스템이 정상 작동 중입니다."}


@app.get("/check-emails", tags=["이메일"])
async def check_emails_api() -> Dict[str, Any]:
    """
    하이웍스 이메일을 가져와 AI로 분석하고 엑셀에 기록
    """
    logger.info("이메일 확인 요청")

    try:
        result = fetch_and_record_emails()

        # 웹 화면(JavaScript)이 인식할 수 있는 명확한 구조로 반환
        response = {
            "status": "success" if result.get("count", 0) > 0 else "info",
            "count": result.get("count", 0),
            "subject": result.get("data", {}).get("제목", "N/A"),
            "category": result.get("data", {}).get("분류", "N/A"),
            "draft": result.get("data", {}).get("답신초안", "N/A")
        }

        logger.info(f"이메일 확인 완료: {result.get('count', 0)}개 처리")
        return response

    except Exception as e:
        logger.error(f"이메일 확인 중 오류: {e}", exc_info=True)
        return {"status": "error", "message": str(e)}


@app.get("/ai-chat", tags=["AI"])
def ai_chat(query: str = Query(..., description="AI에게 질문할 내용")) -> Dict[str, str]:
    """
    Claude AI에게 질문하고 답변 받기
    """
    logger.info(f"AI 채팅 요청: {query[:50]}...")

    try:
        answer = ask_claude(query)
        logger.info("AI 채팅 응답 완료")
        return {"status": "success", "answer": answer}
    except Exception as e:
        logger.error(f"AI 채팅 오류: {e}", exc_info=True)
        return {"status": "error", "answer": f"오류 발생: {str(e)}"}


@app.get("/search-files", tags=["파일"])
def search_files(
    keyword: str = Query(..., description="검색할 키워드"),
    max_results: int = Query(50, description="최대 결과 수")
) -> Dict[str, Any]:
    """
    Dropbox에서 파일 검색 (보안 폴더 제외)
    """
    logger.info(f"파일 검색 요청: keyword={keyword}, max_results={max_results}")

    try:
        result = search_files_with_permission(keyword, max_results)
        logger.info(f"파일 검색 완료: {result.get('total_found', 0)}개 발견")
        return result
    except Exception as e:
        logger.error(f"파일 검색 오류: {e}", exc_info=True)
        return {"error": f"파일 검색 중 오류 발생: {str(e)}"}


@app.post("/save-to-ai-folder", tags=["파일"])
def save_file(file_path: str = Query(..., description="복사할 파일 경로")) -> Dict[str, Any]:
    """
    파일을 AI 업무폴더로 복사
    """
    logger.info(f"파일 저장 요청: {file_path}")

    try:
        result = save_to_ai_folder(file_path)
        return result
    except Exception as e:
        logger.error(f"파일 저장 오류: {e}", exc_info=True)
        return {"error": f"파일 저장 중 오류 발생: {str(e)}"}


@app.get("/ai-folder-contents", tags=["파일"])
def ai_folder_contents() -> Dict[str, Any]:
    """
    AI 업무폴더의 내용 조회
    """
    logger.info("AI 업무폴더 조회 요청")

    try:
        result = get_ai_folder_contents()
        return result
    except Exception as e:
        logger.error(f"AI 업무폴더 조회 오류: {e}", exc_info=True)
        return {"error": f"폴더 조회 중 오류 발생: {str(e)}"}


@app.get("/work-log", tags=["업무 기록"])
def work_log() -> Dict[str, Any]:
    """
    업무 처리 기록 조회
    """
    logger.info("업무 처리 기록 조회 요청")

    try:
        result = get_work_log()
        return result
    except Exception as e:
        logger.error(f"업무 기록 조회 오류: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
            "message": f"기록 조회 중 오류 발생: {str(e)}"
        }


@app.get("/api/inventory", tags=["재고 관리"])
def get_inventory() -> Dict[str, Any]:
    """
    현재 재고 현황 조회
    """
    logger.info("재고 현황 조회 요청")

    try:
        inventory = get_current_inventory()
        if inventory is None:
            logger.warning("재고 파일을 찾을 수 없습니다.")
            return {"status": "error", "message": "재고 파일을 찾을 수 없습니다."}

        logger.info(f"재고 조회 완료: {len(inventory)}개 품목")
        return {"status": "success", "data": inventory}

    except Exception as e:
        logger.error(f"재고 조회 오류: {e}", exc_info=True)
        return {"status": "error", "message": str(e)}


@app.post("/api/inventory/transaction", tags=["재고 관리"])
def add_inventory_transaction(
    item_name: str = Query(..., description="품목명"),
    quantity: int = Query(..., gt=0, description="수량"),
    transaction_type: str = Query(..., description="입고 또는 출고"),
    note: str = Query("", description="비고")
) -> Dict[str, Any]:
    """
    재고 입출고 기록

    Args:
        item_name: 품목명
        quantity: 수량
        transaction_type: '입고' 또는 '출고'
        note: 비고 (선택)
    """
    logger.info(f"재고 입출고 기록 요청: {item_name} {quantity} {transaction_type}")

    if transaction_type not in ['입고', '출고']:
        logger.warning(f"잘못된 transaction_type: {transaction_type}")
        return {"status": "error", "message": "transaction_type은 '입고' 또는 '출고'여야 합니다."}

    try:
        success = record_inventory_transaction(item_name, quantity, transaction_type, note)

        if success:
            logger.info(f"재고 입출고 기록 완료: {item_name} {quantity} {transaction_type}")
            return {
                "status": "success",
                "message": f"{item_name} {quantity}개 {transaction_type} 처리 완료"
            }
        else:
            logger.error("재고 입출고 기록 실패")
            return {"status": "error", "message": "입출고 기록 실패"}

    except Exception as e:
        logger.error(f"재고 입출고 기록 오류: {e}", exc_info=True)
        return {"status": "error", "message": str(e)}


@app.get("/inventory-status", tags=["재고 관리"])
async def inventory_status() -> Dict[str, Any]:
    """
    재고 현황 조회 (추가 엔드포인트)
    """
    logger.info("재고 현황 조회 요청 (추가)")

    try:
        data = get_current_inventory()
        if data:
            return {"status": "success", "data": data}
        return {"status": "error", "message": "재고 파일을 찾을 수 없습니다."}
    except Exception as e:
        logger.error(f"재고 현황 조회 오류: {e}", exc_info=True)
        return {"status": "error", "message": str(e)}


@app.post("/run-integration", tags=["통합 자동화"])
async def run_integration() -> Dict[str, Any]:
    """
    통합 워크플로우: 이메일 수신 → AI 분석 → 파일 검색 → AI 폴더 저장 → Excel 기록

    프로세스:
    1. 하이웍스 메일 수신
    2. GPT를 통한 정밀 분석 (JSON 형식)
    3. Dropbox 내 보안 검색 (회사 자료 폴더 제외)
    4. 검색된 파일을 'AI 업무폴더'로 안전하게 복사 저장
    5. Excel에 업무 처리 기록 저장
    """
    logger.info("통합 자동화 프로세스 시작")

    try:
        # 1. 하이웍스 메일 수신
        email_data = fetch_hiworks_emails()

        if not email_data or not email_data.get('subject'):
            logger.info("새로운 메일이 없습니다.")
            return {"status": "success", "message": "새로운 메일이 없습니다."}

        initialize_ai_folder()  # AI 업무폴더 준비

        # 단일 이메일 처리 (현재 fetch_hiworks_emails는 최신 1개만 반환)
        mail = email_data

        # 2. GPT를 사용한 정밀 분석 (JSON 형식)
        import json

        analysis_query = f"""
다음 이메일을 분석해서 정확히 JSON 형식으로만 답해줘. 다른 설명은 하지 말고 오직 JSON만 출력해.
제목: {mail.get('subject', '')}
내용: {mail.get('response_draft', '')[:300]}

형식:
{{
    "분류": "재고/발주/문의/기타 중 하나",
    "요약": "이메일 내용을 한 문장으로 요약",
    "자료요청": "파일이나 자료 요청이 있으면 '유', 없으면 '무'",
    "키워드": "자료 요청이 있다면 파일명 추측 키워드, 없으면 'None'",
    "중요도": "상/중/하 중 하나"
}}
"""

        logger.info("AI 분석 시작")
        analysis_text = ask_gpt(analysis_query)

        # JSON 파싱 시도
        try:
            # JSON 블록 추출 (```json ... ``` 형식 처리)
            if "```json" in analysis_text:
                analysis_text = analysis_text.split("```json")[1].split("```")[0].strip()
            elif "```" in analysis_text:
                analysis_text = analysis_text.split("```")[1].split("```")[0].strip()

            analysis = json.loads(analysis_text)
            logger.info(f"AI 분석 완료: {analysis}")
        except:
            # JSON 파싱 실패 시 기본값
            logger.warning("JSON 파싱 실패, 기본값 사용")
            analysis = {
                "분류": "기타",
                "요약": mail.get('subject', ''),
                "자료요청": "무",
                "키워드": "None",
                "중요도": "중"
            }

        keyword = analysis.get('키워드', 'None')

        report = {
            "subject": mail.get('subject', ''),
            "category": analysis.get('분류', '기타'),
            "summary": analysis.get('요약', ''),
            "file_request": analysis.get('자료요청', '무'),
            "keyword": keyword,
            "priority": analysis.get('중요도', '중'),
            "action": "분석 완료"
        }

        # 3. Dropbox 내 보안 검색 (자료 요청이 있을 경우만)
        if keyword and keyword != "None" and analysis.get('자료요청') == '유':
            logger.info(f"파일 검색 시작: {keyword}")
            search_result = search_files_with_permission(keyword, max_results=5)

            if search_result.get('files') and len(search_result['files']) > 0:
                # 4. 검색된 파일을 'AI 업무폴더'로 안전하게 복사 저장
                first_file = search_result['files'][0]
                save_result = save_to_ai_folder(first_file['path'])

                if save_result.get('success'):
                    report["action"] = f"파일 검색 성공: {first_file['name']} (AI 업무폴더 저장됨)"
                    report["saved_path"] = save_result.get('destination')
                    logger.info(f"파일 저장 완료: {first_file['name']}")
                else:
                    report["action"] = f"파일 복사 실패: {save_result.get('error')}"
                    logger.warning(f"파일 복사 실패: {save_result.get('error')}")
            else:
                report["action"] = "파일을 찾지 못함"
                logger.info("검색된 파일이 없습니다.")

        # 5. Excel에 업무 처리 기록 저장
        excel_data = [{
            "날짜": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "발신자": mail.get('from', 'N/A'),
            "제목": mail.get('subject', ''),
            "분류": analysis.get('분류', 'N/A'),
            "업무요약": analysis.get('요약', ''),
            "자료요청": analysis.get('자료요청', '무'),
            "중요도": analysis.get('중요도', '중'),
            "처리상태": report.get('action', ''),
            "저장경로": report.get('saved_path', '')
        }]

        excel_result = save_mail_to_excel(excel_data)
        logger.info(f"Excel 기록 완료: {excel_result.get('success', False)}")

        return {
            "status": "success",
            "data": [report],
            "excel_saved": excel_result.get('success', False),
            "excel_path": excel_result.get('file_path', ''),
            "analysis": analysis
        }

    except Exception as e:
        logger.error(f"통합 자동화 오류: {e}", exc_info=True)
        return {"status": "error", "message": str(e)}


if __name__ == "__main__":
    logger.info("C-Auto 서버 시작")
    uvicorn.run(app, host="0.0.0.0", port=8000)
