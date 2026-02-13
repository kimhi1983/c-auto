"""
관리자 계정 생성 스크립트
"""
import sys
import os

# 프로젝트 루트 경로를 sys.path에 추가
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.database.config import SessionLocal
from app.models.user import User, UserRole
from app.auth.security import get_password_hash

def create_admin():
    db = SessionLocal()

    # 관리자 계정 확인
    admin = db.query(User).filter(User.email == "admin@company.com").first()

    if admin:
        print("⚠️  관리자 계정이 이미 존재합니다.")
        return

    # 새 관리자 생성
    admin = User(
        email="admin@company.com",
        password_hash=get_password_hash("admin1234!"),  # 변경 필수!
        full_name="시스템 관리자",
        role=UserRole.ADMIN,
        department="경영지원팀",
        is_active=True
    )

    db.add(admin)
    db.commit()
    db.refresh(admin)

    print("✅ 관리자 계정 생성 완료!")
    print(f"   이메일: {admin.email}")
    print(f"   비밀번호: admin1234!")
    print(f"   역할: {admin.role}")
    print("\n⚠️  보안을 위해 첫 로그인 후 비밀번호를 변경하세요!")

    db.close()

if __name__ == "__main__":
    create_admin()