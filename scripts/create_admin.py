"""
관리자 계정 생성 스크립트
"""
import sys
from pathlib import Path

# UTF-8 encoding for Windows console
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# 프로젝트 루트를 Python 경로에 추가
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from app.database.config import SessionLocal
from app.models.user import User, UserRole
from app.auth.security import get_password_hash


def create_admin():
    """관리자 계정 생성"""
    db = SessionLocal()

    try:
        # 관리자 계정 확인
        admin = db.query(User).filter(User.email == "admin@company.com").first()

        if admin:
            print("WARNING: Admin account already exists.")
            print(f"   Email: {admin.email}")
            print(f"   Name: {admin.full_name}")
            print(f"   Role: {admin.role}")
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

        print("SUCCESS: Admin account created!")
        print(f"   Email: {admin.email}")
        print(f"   Password: admin1234!")
        print(f"   Name: {admin.full_name}")
        print(f"   Role: {admin.role}")
        print(f"   Department: {admin.department}")
        print("\nWARNING: Please change the password after first login!")

    except Exception as e:
        db.rollback()
        print(f"ERROR: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    create_admin()
