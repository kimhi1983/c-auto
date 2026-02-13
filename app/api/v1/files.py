"""
File Search API endpoints
Enhanced search with DB indexing and AI recommendations
"""
import os
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.database.config import get_db
from app.models.user import User
from app.models.file_index import FileIndex
from app.auth.dependencies import get_current_active_user
from app.modules.file_search import (
    search_files_with_permission,
    save_to_ai_folder,
    get_ai_folder_contents,
    DROPBOX_PATH,
    EXCLUDE_FOLDER,
)
from app.core.ai_selector import ask_gemini
from app.utils.logger import setup_logger

logger = setup_logger(__name__)
router = APIRouter()


@router.get("/search")
async def search_files(
    keyword: str = Query(..., min_length=1),
    max_results: int = Query(50, ge=1, le=200),
    file_type: Optional[str] = None,
    use_index: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Search files in Dropbox (filesystem or indexed DB)
    """
    if use_index:
        # DB-based search
        query = db.query(FileIndex).filter(
            FileIndex.is_accessible == True,
            or_(
                FileIndex.file_name.contains(keyword),
                FileIndex.ai_tags.contains(keyword),
            )
        )
        if file_type:
            query = query.filter(FileIndex.file_type == file_type.lower())

        results = query.limit(max_results).all()

        return {
            "status": "success",
            "keyword": keyword,
            "total_found": len(results),
            "source": "index",
            "files": [
                {
                    "id": f.id,
                    "name": f.file_name,
                    "path": f.file_path,
                    "size": f.file_size,
                    "type": f.file_type,
                    "directory": f.directory,
                    "tags": f.ai_tags.split(",") if f.ai_tags else [],
                    "last_modified": f.last_modified.isoformat() if f.last_modified else None,
                }
                for f in results
            ],
        }
    else:
        # Filesystem search (existing logic)
        result = search_files_with_permission(keyword, max_results)
        if "error" in result:
            raise HTTPException(status_code=500, detail=result["error"])

        return {
            "status": "success",
            "keyword": keyword,
            "total_found": result.get("total_found", 0),
            "source": "filesystem",
            "files": result.get("files", []),
        }


@router.post("/save-to-ai-folder")
async def save_file_to_ai(
    file_path: str = Query(...),
    current_user: User = Depends(get_current_active_user),
):
    """Copy file to AI work folder"""
    result = save_to_ai_folder(file_path)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    return {"status": "success", "data": result}


@router.get("/ai-folder")
async def get_ai_folder(
    current_user: User = Depends(get_current_active_user),
):
    """List AI work folder contents"""
    result = get_ai_folder_contents()
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])

    return {
        "status": "success",
        "data": result,
    }


@router.post("/reindex")
async def reindex_files(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Re-index all files in Dropbox for fast search.
    Walks the filesystem and stores file metadata in DB.
    """
    if not DROPBOX_PATH or not os.path.exists(DROPBOX_PATH):
        raise HTTPException(status_code=500, detail=f"Dropbox 경로가 없습니다: {DROPBOX_PATH}")

    indexed_count = 0
    updated_count = 0
    errors = 0

    try:
        for root, dirs, files in os.walk(DROPBOX_PATH):
            if EXCLUDE_FOLDER and EXCLUDE_FOLDER in root:
                continue

            for file_name in files:
                try:
                    file_path = os.path.join(root, file_name)
                    file_stat = os.stat(file_path)
                    file_ext = os.path.splitext(file_name)[1].lower().lstrip(".")

                    existing = db.query(FileIndex).filter(FileIndex.file_path == file_path).first()

                    if existing:
                        existing.file_size = file_stat.st_size
                        existing.last_modified = datetime.fromtimestamp(file_stat.st_mtime)
                        existing.is_accessible = True
                        existing.indexed_at = datetime.now()
                        updated_count += 1
                    else:
                        new_file = FileIndex(
                            file_name=file_name,
                            file_path=file_path,
                            file_type=file_ext if file_ext else None,
                            file_size=file_stat.st_size,
                            directory=root,
                            last_modified=datetime.fromtimestamp(file_stat.st_mtime),
                            is_accessible=True,
                        )
                        db.add(new_file)
                        indexed_count += 1

                except Exception as e:
                    errors += 1
                    continue

        db.commit()

        total = db.query(FileIndex).count()

        logger.info(f"파일 인덱싱 완료: 신규 {indexed_count}, 업데이트 {updated_count}, 오류 {errors}")

        return {
            "status": "success",
            "message": f"인덱싱 완료",
            "data": {
                "new_files": indexed_count,
                "updated_files": updated_count,
                "errors": errors,
                "total_indexed": total,
            },
        }

    except Exception as e:
        logger.error(f"인덱싱 실패: {e}")
        raise HTTPException(status_code=500, detail=f"인덱싱 실패: {str(e)}")


@router.get("/stats")
async def file_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get file index statistics"""
    total = db.query(FileIndex).count()

    # Type breakdown
    from sqlalchemy import func as sqlfunc
    type_counts = (
        db.query(FileIndex.file_type, sqlfunc.count(FileIndex.id))
        .filter(FileIndex.file_type.isnot(None))
        .group_by(FileIndex.file_type)
        .order_by(sqlfunc.count(FileIndex.id).desc())
        .limit(20)
        .all()
    )

    return {
        "status": "success",
        "data": {
            "total_indexed": total,
            "types": {t: c for t, c in type_counts if t},
        },
    }


@router.get("/recommend")
async def recommend_files(
    context: str = Query(..., description="이메일 제목이나 키워드"),
    max_results: int = Query(5, ge=1, le=20),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    AI-powered file recommendation based on email context.
    Uses Gemini to extract keywords, then searches the index.
    """
    try:
        # Step 1: Extract search keywords using AI
        prompt = f"""다음 이메일 컨텍스트에서 관련 파일을 찾기 위한 검색 키워드를 추출해줘.
파일명에 포함될 수 있는 한국어/영어 키워드 3-5개만 쉼표로 구분해서 출력해. 다른 설명 없이 키워드만.

컨텍스트: {context}"""

        keywords_text = ask_gemini(prompt)
        keywords = [k.strip() for k in keywords_text.split(",") if k.strip()]

        if not keywords:
            keywords = [context[:20]]

        # Step 2: Search index with extracted keywords
        all_results = []
        seen_paths = set()

        for kw in keywords[:5]:
            results = (
                db.query(FileIndex)
                .filter(
                    FileIndex.is_accessible == True,
                    or_(
                        FileIndex.file_name.contains(kw),
                        FileIndex.ai_tags.contains(kw) if FileIndex.ai_tags else False,
                    )
                )
                .limit(max_results)
                .all()
            )

            for f in results:
                if f.file_path not in seen_paths:
                    seen_paths.add(f.file_path)
                    all_results.append(f)

        # Limit total results
        all_results = all_results[:max_results]

        return {
            "status": "success",
            "keywords": keywords,
            "total_found": len(all_results),
            "files": [
                {
                    "id": f.id,
                    "name": f.file_name,
                    "path": f.file_path,
                    "size": f.file_size,
                    "type": f.file_type,
                    "relevance": "high" if any(k in f.file_name for k in keywords[:2]) else "medium",
                }
                for f in all_results
            ],
        }

    except Exception as e:
        logger.error(f"AI 파일 추천 실패: {e}")
        # Fallback to simple search
        result = search_files_with_permission(context[:30], max_results)
        return {
            "status": "success",
            "keywords": [context[:30]],
            "total_found": result.get("total_found", 0),
            "files": result.get("files", []),
        }
