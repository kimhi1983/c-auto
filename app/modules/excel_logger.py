"""
Excel 로깅 모듈
이메일 분석 결과를 엑셀 파일로 저장하여 업무 처리 기록 관리
"""
import pandas as pd
import os
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

def get_ai_work_path():
    """
    드롭박스 내 AI 업무폴더 경로를 반환하고 없으면 생성합니다.
    
    Returns:
        AI 업무폴더 절대 경로
    """
    # 윈도우 환경에 맞는 경로 정규화
    dropbox_path = os.getenv("DROPBOX_PATH", "D:/Dropbox").replace('\\', '/')
    ai_folder_name = os.getenv("AI_WORK_DIR", "AI 업무폴더")
    target_path = os.path.join(dropbox_path, ai_folder_name)

    if not os.path.exists(target_path):
        os.makedirs(target_path, exist_ok=True)
    
    return target_path

def save_mail_to_excel(data_list):
    """
    분석된 메일 데이터를 엑셀로 저장합니다.
    
    Args:
        data_list: 메일 데이터 리스트
                   [{날짜, 발신자, 제목, 요약, 분류, 자료요청, 처리상태}]
    
    Returns:
        저장 결과 딕셔너리
    """
    try:
        folder_path = get_ai_work_path()
        file_path = os.path.join(folder_path, "업무처리_기록부.xlsx")
        
        # 새로운 데이터 프레임 생성
        new_df = pd.DataFrame(data_list)
        
        if os.path.exists(file_path):
            # 기존 파일이 있으면 불러와서 합치기
            existing_df = pd.read_excel(file_path)
            combined_df = pd.concat([existing_df, new_df], ignore_index=True)
            combined_df.to_excel(file_path, index=False)
        else:
            # 파일이 없으면 새로 생성
            new_df.to_excel(file_path, index=False)
        
        return {
            "success": True,
            "file_path": file_path,
            "records_added": len(data_list),
            "message": f"{len(data_list)}건의 기록이 저장되었습니다."
        }
    
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "message": f"엑셀 저장 중 오류 발생: {str(e)}"
        }

def get_work_log():
    """
    저장된 업무 처리 기록을 조회합니다.
    
    Returns:
        업무 처리 기록 데이터
    """
    try:
        folder_path = get_ai_work_path()
        file_path = os.path.join(folder_path, "업무처리_기록부.xlsx")
        
        if not os.path.exists(file_path):
            return {
                "success": True,
                "total_records": 0,
                "records": [],
                "message": "아직 기록이 없습니다."
            }
        
        df = pd.read_excel(file_path)
        
        return {
            "success": True,
            "total_records": len(df),
            "records": df.to_dict('records'),
            "file_path": file_path
        }
    
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "message": f"기록 조회 중 오류 발생: {str(e)}"
        }
