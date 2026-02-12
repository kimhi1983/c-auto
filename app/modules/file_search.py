"""
파일 검색 모듈
Dropbox 및 로컬 드라이브에서 파일을 검색하고 AI 업무 폴더에 저장
"""
import os
import shutil
from typing import Dict, List, Any
from dotenv import load_dotenv
from app.utils.logger import setup_logger

load_dotenv()
logger = setup_logger(__name__)

DROPBOX_PATH = os.getenv("DROPBOX_PATH")
EXCLUDE_FOLDER = os.getenv("EXCLUDE_FOLDER")
AI_WORK_DIR = os.path.join(DROPBOX_PATH, os.getenv("AI_WORK_DIR"))

def initialize_ai_folder() -> str:
    """
    AI 업무 전용 폴더가 없으면 생성합니다.

    Returns:
        str: AI 업무 폴더 경로
    """
    if not os.path.exists(AI_WORK_DIR):
        os.makedirs(AI_WORK_DIR)
        logger.info(f"폴더 생성 완료: {AI_WORK_DIR}")
    return AI_WORK_DIR

def search_files_with_permission(keyword: str, max_results: int = 50) -> Dict[str, Any]:
    """
    '회사 자료' 폴더를 제외한 모든 영역에서 파일을 검색합니다.

    Args:
        keyword: 검색할 키워드
        max_results: 최대 결과 수 (기본값: 50)

    Returns:
        Dict[str, Any]: 검색된 파일 정보
    """
    found_files: List[Dict[str, Any]] = []

    if not DROPBOX_PATH or not os.path.exists(DROPBOX_PATH):
        logger.error(f"Dropbox 경로를 찾을 수 없습니다: {DROPBOX_PATH}")
        return {"error": f"Dropbox 경로를 찾을 수 없습니다: {DROPBOX_PATH}"}

    try:
        logger.info(f"파일 검색 시작: 키워드='{keyword}', 최대 결과={max_results}")

        for root, dirs, files in os.walk(DROPBOX_PATH):
            # '회사 자료' 폴더가 경로에 포함되어 있으면 스킵 (보안 권한 설정)
            if EXCLUDE_FOLDER and EXCLUDE_FOLDER in root:
                continue

            for file in files:
                if keyword.lower() in file.lower():
                    file_path = os.path.join(root, file)
                    try:
                        file_size = os.path.getsize(file_path)
                        found_files.append({
                            "path": file_path,
                            "name": file,
                            "size": file_size,
                            "size_mb": round(file_size / (1024 * 1024), 2)
                        })
                    except OSError as e:
                        logger.warning(f"파일 크기 확인 실패: {file_path} - {e}")
                        continue

                    # 최대 결과 수 제한
                    if len(found_files) >= max_results:
                        break

            if len(found_files) >= max_results:
                break

        logger.info(f"파일 검색 완료: {len(found_files)}개 발견")

    except Exception as e:
        logger.error(f"파일 검색 중 오류 발생: {e}", exc_info=True)
        return {"error": f"파일 검색 중 오류 발생: {str(e)}"}

    return {
        "keyword": keyword,
        "total_found": len(found_files),
        "files": found_files,
        "ai_work_dir": AI_WORK_DIR
    }

def save_to_ai_folder(source_file_path: str) -> Dict[str, Any]:
    """
    검색된 자료나 생성된 문서를 AI 업무폴더로 복사/저장합니다.

    Args:
        source_file_path: 복사할 원본 파일 경로

    Returns:
        Dict[str, Any]: 복사 결과
    """
    try:
        initialize_ai_folder()

        if not os.path.exists(source_file_path):
            logger.error(f"파일을 찾을 수 없습니다: {source_file_path}")
            return {"error": f"파일을 찾을 수 없습니다: {source_file_path}"}

        file_name = os.path.basename(source_file_path)
        dest_path = os.path.join(AI_WORK_DIR, file_name)

        # 파일이 이미 존재하면 번호 추가
        if os.path.exists(dest_path):
            base, ext = os.path.splitext(file_name)
            counter = 1
            while os.path.exists(dest_path):
                new_name = f"{base}_{counter}{ext}"
                dest_path = os.path.join(AI_WORK_DIR, new_name)
                counter += 1

        shutil.copy2(source_file_path, dest_path)
        logger.info(f"파일 복사 완료: {source_file_path} -> {dest_path}")

        return {
            "success": True,
            "source": source_file_path,
            "destination": dest_path,
            "message": f"파일이 AI 업무폴더로 복사되었습니다."
        }

    except Exception as e:
        logger.error(f"파일 복사 중 오류 발생: {e}", exc_info=True)
        return {"error": f"파일 복사 중 오류 발생: {str(e)}"}

def get_ai_folder_contents() -> Dict[str, Any]:
    """
    AI 업무폴더의 내용을 조회합니다.

    Returns:
        Dict[str, Any]: 폴더 내용 정보
    """
    try:
        initialize_ai_folder()

        files: List[Dict[str, Any]] = []
        for item in os.listdir(AI_WORK_DIR):
            item_path = os.path.join(AI_WORK_DIR, item)
            if os.path.isfile(item_path):
                try:
                    files.append({
                        "name": item,
                        "path": item_path,
                        "size": os.path.getsize(item_path),
                        "modified": os.path.getmtime(item_path)
                    })
                except OSError as e:
                    logger.warning(f"파일 정보 조회 실패: {item_path} - {e}")
                    continue

        logger.info(f"AI 업무폴더 조회: {len(files)}개 파일")

        return {
            "folder": AI_WORK_DIR,
            "total_files": len(files),
            "files": files
        }

    except Exception as e:
        logger.error(f"폴더 조회 중 오류 발생: {e}", exc_info=True)
        return {"error": f"폴더 조회 중 오류 발생: {str(e)}"}
