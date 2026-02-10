"""
C-Auto Main Application
FastAPI 기반 웹 서버
"""
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
from app.modules.email_bot import fetch_hiworks_emails, fetch_and_record_emails
from app.modules.file_search import search_files_with_permission, save_to_ai_folder, get_ai_folder_contents, initialize_ai_folder
from app.modules.excel_logger import save_mail_to_excel, get_work_log
from app.core.ai_selector import ask_claude
import uvicorn
import os
from datetime import datetime

app = FastAPI(title="C-Auto 이사님 업무지원 시스템")

# 정적 파일 서빙 (프론트엔드)
app.mount("/static", StaticFiles(directory="frontend"), name="static")

@app.get("/")
def read_root():
    """루트 경로를 대시보드로 리다이렉트"""
    return RedirectResponse(url="/static/index.html")

@app.get("/api/status")
def api_status():
    """API 상태 확인"""
    return {"status": "running", "message": "이사님, 시스템이 정상 작동 중입니다."}

@app.get("/check-emails")
async def check_emails_api():
    result = fetch_and_record_emails()
    
    # 웹 화면(JavaScript)이 인식할 수 있는 명확한 구조로 반환
    return {
        "status": "success",
        "count": result.get("count", 0),
        "subject": result.get("data", {}).get("제목", "N/A"),
        "category": result.get("data", {}).get("분류", "N/A"),
        "draft": result.get("data", {}).get("답신초안", "N/A")
    }

@app.get("/ai-chat")
def ai_chat(query: str):
    """웹에서 AI에게 바로 질문할 수 있는 기능"""
    answer = ask_claude(query)
    return {"answer": answer}

@app.get("/search-files")
def search_files(keyword: str, max_results: int = 50):
    """Dropbox에서 파일 검색 (보안 폴더 제외)"""
    result = search_files_with_permission(keyword, max_results)
    return result

@app.post("/save-to-ai-folder")
def save_file(file_path: str):
    """파일을 AI 업무폴더로 복사"""
    result = save_to_ai_folder(file_path)
    return result

@app.get("/ai-folder-contents")
def ai_folder_contents():
    """AI 업무폴더의 내용 조회"""
    result = get_ai_folder_contents()
    return result

@app.get("/work-log")
def work_log():
    """업무 처리 기록 조회"""
    result = get_work_log()
    return result

@app.post("/run-integration")
async def run_integration():
    """
    통합 워크플로우: 이메일 수신 → AI 분석 → 파일 검색 → AI 폴더 저장 → Excel 기록
    
    프로세스:
    1. 하이웍스 메일 수신
    2. GPT를 통한 정밀 분석 (JSON 형식)
    3. Dropbox 내 보안 검색 (회사 자료 폴더 제외)
    4. 검색된 파일을 'AI 업무폴더'로 안전하게 복사 저장
    5. Excel에 업무 처리 기록 저장
    """
    try:
        # 1. 하이웍스 메일 수신
        email_data = fetch_hiworks_emails()
        
        if not email_data or not email_data.get('subject'):
            return {"status": "success", "message": "새로운 메일이 없습니다."}
        
        initialize_ai_folder()  # AI 업무폴더 준비
        
        # 단일 이메일 처리 (현재 fetch_hiworks_emails는 최신 1개만 반환)
        mail = email_data
        
        # 2. GPT를 사용한 정밀 분석 (JSON 형식)
        from app.core.ai_selector import ask_gpt
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
        
        analysis_text = ask_gpt(analysis_query)
        
        # JSON 파싱 시도
        try:
            # JSON 블록 추출 (```json ... ``` 형식 처리)
            if "```json" in analysis_text:
                analysis_text = analysis_text.split("```json")[1].split("```")[0].strip()
            elif "```" in analysis_text:
                analysis_text = analysis_text.split("```")[1].split("```")[0].strip()
            
            analysis = json.loads(analysis_text)
        except:
            # JSON 파싱 실패 시 기본값
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
            search_result = search_files_with_permission(keyword, max_results=5)
            
            if search_result.get('files') and len(search_result['files']) > 0:
                # 4. 검색된 파일을 'AI 업무폴더'로 안전하게 복사 저장
                first_file = search_result['files'][0]
                save_result = save_to_ai_folder(first_file['path'])
                
                if save_result.get('success'):
                    report["action"] = f"파일 검색 성공: {first_file['name']} (AI 업무폴더 저장됨)"
                    report["saved_path"] = save_result.get('destination')
                else:
                    report["action"] = f"파일 복사 실패: {save_result.get('error')}"
            else:
                report["action"] = "파일을 찾지 못함"
        
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
        
        return {
            "status": "success",
            "data": [report],
            "excel_saved": excel_result.get('success', False),
            "excel_path": excel_result.get('file_path', ''),
            "analysis": analysis
        }
    
    except Exception as e:
        return {"status": "error", "message": str(e)}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
