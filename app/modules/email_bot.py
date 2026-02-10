"""
Email Bot Module
하이웍스 이메일을 가져와서 AI로 분석하고 자동 답신 초안 생성
"""
import poplib
import email
import os
from dotenv import load_dotenv
from app.core.ai_selector import ask_claude, ask_gpt
from app.modules.excel_logger import save_mail_to_excel
from datetime import datetime

load_dotenv()

def fetch_hiworks_emails():
    """
    하이웍스 POP3 서버에서 이메일을 가져와 AI로 분석
    
    Returns:
        dict: 분석 결과 딕셔너리
    """
    try:
        # 1. 하이웍스 POP3 서버 연결
        server = poplib.POP3_SSL(os.getenv("IMAP_SERVER"), int(os.getenv("IMAP_PORT")))
        server.user(os.getenv("EMAIL_USER"))
        server.pass_(os.getenv("EMAIL_PASS"))
        
        # 메일 개수 확인
        num_messages = len(server.list()[1])
        print(f"✅ 연결 성공! 새로운 메일 {num_messages}개가 있습니다.")

        # 가장 최근 메일 1개 가져오기 테스트
        if num_messages > 0:
            _, lines, _ = server.retr(num_messages)
            msg_content = b'\n'.join(lines).decode('utf-8', errors='ignore')
            msg = email.message_from_string(msg_content)
            
            subject = msg["Subject"]
            print(f"📩 읽은 메일 제목: {subject}")

            # 2. AI 분석 시작
            # GPT-4o로 카테고리 분류
            category = ask_gpt(f"이 메일 제목을 보고 [재고, 발주, 문의] 중 하나로 분류해줘: {subject}")
            
            # Claude 3.5로 내용 요약 및 답신 초안
            analysis = ask_claude(f"이사님 비서로서 다음 메일의 답신 초안을 작성해줘: {msg_content[:500]}")

            print(f"📌 분류 결과: {category}")
            print(f"📝 AI 제안 답신:\n{analysis}")

            server.quit()
            
            return {
                "total_emails": num_messages,
                "subject": subject,
                "category": category,
                "response_draft": analysis
            }
        
        server.quit()
        return {"total_emails": num_messages, "message": "메일이 없습니다."}
        
    except Exception as e:
        print(f"❌ 오류 발생: {e}")
        return {"error": str(e)}

def fetch_and_record_emails():
    try:
        # 1. 하이웍스 메일 접속 (비밀번호: asdf1004++)
        server = poplib.POP3_SSL(os.getenv("IMAP_SERVER"), int(os.getenv("IMAP_PORT")))
        server.user(os.getenv("EMAIL_USER"))
        server.pass_(os.getenv("EMAIL_PASS"))
        
        num_messages = len(server.list()[1])
        if num_messages == 0:
            return {"count": 0, "message": "새로운 메일이 없습니다."}

        processed_data = []
        # 최신 메일 3개 분석
        for i in range(num_messages, max(0, num_messages - 3), -1):
            _, lines, _ = server.retr(i)
            msg_content = b'\n'.join(lines).decode('utf-8', errors='ignore')
            msg = email.message_from_string(msg_content)
            subject = msg["Subject"]

            # 2. AI 분석 진행
            category = ask_gpt(f"이 메일을 [재고, 발주, 문의] 중 하나로 분류해: {subject}")
            draft = ask_claude(f"다음 메일의 답신 초안을 작성해줘: {subject}")

            record = {
                "날짜": datetime.now().strftime("%Y-%m-%d"),
                "제목": subject,
                "분류": category,
                "답신초안": draft,
                "상태": "완료"
            }
            processed_data.append(record)

        # 3. 엑셀 저장 실행 (드롭박스 경로로 저장)
        save_mail_to_excel(processed_data)
        server.quit()
        
        return {"count": len(processed_data), "data": processed_data[0] if processed_data else {}}
    except Exception as e:
        return {"count": 0, "message": f"오류 발생: {str(e)}"}

if __name__ == "__main__":
    fetch_hiworks_emails()
    # fetch_and_record_emails() # Uncomment to test new function locally
