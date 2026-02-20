"""
파일 에이전트 - Dropbox 파일 검색 및 AI 업무폴더 관리 담당
"""
import os
import shutil
from typing import Dict, Any, List
from app.agents.base import BaseAgent


class FileAgent(BaseAgent):
    """
    담당 업무:
    - 이메일 에이전트가 추출한 키워드로 Dropbox 파일 검색
    - 관련 파일을 AI 업무폴더로 복사
    - AI 업무폴더 목록 조회
    """

    def __init__(self):
        super().__init__(name="파일에이전트", role="파일 검색 및 복사")

    def run(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        context에서 이메일 분석 결과를 받아
        키워드로 파일 검색 후 복사
        """
        self._start()
        try:
            emails = context.get("emails", [])
            all_results = []

            for mail in emails:
                keyword = mail.get("keyword", "")
                file_request = mail.get("file_request", "무")

                if file_request == "유" and keyword:
                    self.logger.info(f"파일 검색 시작: '{keyword}'")
                    found = self._search(keyword)
                    copied = []

                    for f in found[:3]:  # 상위 3개만 복사
                        result = self._copy_to_ai_folder(f["path"])
                        if result["success"]:
                            copied.append(result["destination"])

                    all_results.append({
                        "subject": mail.get("subject", ""),
                        "keyword": keyword,
                        "found_count": len(found),
                        "copied": copied,
                    })
                    self.logger.info(f"'{keyword}' → {len(copied)}개 파일 복사")
                else:
                    all_results.append({
                        "subject": mail.get("subject", ""),
                        "keyword": keyword,
                        "found_count": 0,
                        "copied": [],
                        "skip_reason": "자료요청 없음" if file_request == "무" else "키워드 없음",
                    })

            self._done()
            return self.report(
                f"{len(all_results)}건 파일 작업 완료",
                {"file_results": all_results},
            )

        except Exception as e:
            self._error(e)
            return self.report(f"오류: {e}", {"file_results": []})

    def _search(self, keyword: str, max_results: int = 20) -> List[Dict]:
        """Dropbox에서 키워드로 파일 검색"""
        dropbox_path = os.getenv("DROPBOX_PATH", "D:/Dropbox")
        exclude = os.getenv("EXCLUDE_FOLDER", "회사 자료")
        results = []

        if not os.path.exists(dropbox_path):
            self.logger.warning(f"Dropbox 경로 없음: {dropbox_path}")
            return []

        for root, dirs, files in os.walk(dropbox_path):
            dirs[:] = [d for d in dirs if exclude not in d]
            for fname in files:
                if keyword.lower() in fname.lower():
                    full_path = os.path.join(root, fname)
                    size = os.path.getsize(full_path)
                    results.append({
                        "name": fname,
                        "path": full_path,
                        "size": size,
                        "size_mb": round(size / 1024 / 1024, 2),
                    })
                    if len(results) >= max_results:
                        return results

        return results

    def _copy_to_ai_folder(self, source_path: str) -> Dict[str, Any]:
        """파일을 AI 업무폴더로 복사"""
        try:
            dropbox_path = os.getenv("DROPBOX_PATH", "D:/Dropbox")
            ai_dir = os.getenv("AI_WORK_DIR", "AI 업무폴더")
            ai_folder = os.path.join(dropbox_path, ai_dir)
            os.makedirs(ai_folder, exist_ok=True)

            filename = os.path.basename(source_path)
            dest = os.path.join(ai_folder, filename)

            # 동일 파일명 충돌 방지
            if os.path.exists(dest):
                name, ext = os.path.splitext(filename)
                counter = 1
                while os.path.exists(dest):
                    dest = os.path.join(ai_folder, f"{name}_{counter}{ext}")
                    counter += 1

            shutil.copy2(source_path, dest)
            return {"success": True, "source": source_path, "destination": dest}

        except Exception as e:
            return {"success": False, "source": source_path, "error": str(e)}
