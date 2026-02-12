import pandas as pd
import os
from typing import Optional, List, Dict, Any
from dotenv import load_dotenv
from app.utils.logger import setup_logger

load_dotenv()
logger = setup_logger(__name__)

def get_current_inventory() -> Optional[List[Dict[str, Any]]]:
    """
    드롭박스에서 현재 재고 현황을 조회

    Returns:
        Optional[List[Dict[str, Any]]]: 재고 목록 또는 None
    """
    dropbox_path = os.getenv("DROPBOX_PATH", "/tmp/dropbox")
    if not dropbox_path:
        logger.error("DROPBOX_PATH 환경 변수가 설정되지 않았습니다.")
        return None

    inventory_file = os.path.join(dropbox_path, "재고 폴더", "실시간_재고현황.xlsx")

    if not os.path.exists(inventory_file):
        logger.warning(f"재고 파일을 찾을 수 없습니다: {inventory_file}")
        return None

    try:
        df = pd.read_excel(inventory_file)
        # 품목명, 현재고, 규격 등 필요한 정보만 추출
        inventory_data = df[['품목명', '현재고', '단위']].to_dict(orient='records')
        logger.info(f"재고 조회 완료: {len(inventory_data)}개 품목")
        return inventory_data
    except Exception as e:
        logger.error(f"재고 읽기 오류: {e}", exc_info=True)
        return None


def record_inventory_transaction(item_name: str, quantity: int, transaction_type: str, note: str = "") -> bool:
    """
    재고 입출고 기록

    Args:
        item_name: 품목명
        quantity: 수량
        transaction_type: '입고' 또는 '출고'
        note: 비고 (선택)

    Returns:
        bool: 성공 여부
    """
    from datetime import datetime

    dropbox_path = os.getenv("DROPBOX_PATH", "/tmp/dropbox")
    if not dropbox_path:
        logger.error("DROPBOX_PATH 환경 변수가 설정되지 않았습니다.")
        return False

    log_file = os.path.join(dropbox_path, "재고 폴더", "입출고_기록.xlsx")

    # 새 기록 데이터
    new_record = {
        '일시': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        '품목명': item_name,
        '수량': quantity,
        '구분': transaction_type,
        '비고': note
    }

    try:
        # 기존 파일이 있으면 불러오기
        if os.path.exists(log_file):
            df = pd.read_excel(log_file)
            df = pd.concat([df, pd.DataFrame([new_record])], ignore_index=True)
            logger.info(f"기존 입출고 기록에 추가: {item_name} {quantity}{transaction_type}")
        else:
            df = pd.DataFrame([new_record])
            logger.info(f"새 입출고 기록 생성: {item_name} {quantity}{transaction_type}")

        # 저장
        df.to_excel(log_file, index=False)

        # 재고 현황 업데이트
        update_inventory_stock(item_name, quantity, transaction_type)

        return True
    except Exception as e:
        logger.error(f"입출고 기록 오류: {e}", exc_info=True)
        return False


def update_inventory_stock(item_name: str, quantity: int, transaction_type: str) -> bool:
    """
    재고 현황 파일 업데이트

    Args:
        item_name: 품목명
        quantity: 수량
        transaction_type: '입고' 또는 '출고'

    Returns:
        bool: 성공 여부
    """
    dropbox_path = os.getenv("DROPBOX_PATH", "/tmp/dropbox")
    if not dropbox_path:
        logger.error("DROPBOX_PATH 환경 변수가 설정되지 않았습니다.")
        return False

    inventory_file = os.path.join(dropbox_path, "재고 폴더", "실시간_재고현황.xlsx")

    if not os.path.exists(inventory_file):
        logger.error(f"재고 현황 파일이 존재하지 않습니다: {inventory_file}")
        return False

    try:
        df = pd.read_excel(inventory_file)

        # 해당 품목 찾기
        item_idx = df[df['품목명'] == item_name].index

        if len(item_idx) > 0:
            idx = item_idx[0]
            current_stock = df.loc[idx, '현재고']

            # 입고는 +, 출고는 -
            if transaction_type == '입고':
                new_stock = current_stock + quantity
                df.loc[idx, '현재고'] = new_stock
                logger.info(f"재고 업데이트: {item_name} {current_stock} -> {new_stock} (입고 +{quantity})")
            elif transaction_type == '출고':
                new_stock = current_stock - quantity
                df.loc[idx, '현재고'] = new_stock
                logger.info(f"재고 업데이트: {item_name} {current_stock} -> {new_stock} (출고 -{quantity})")

            # 저장
            df.to_excel(inventory_file, index=False)
            return True
        else:
            logger.warning(f"품목 '{item_name}'을 찾을 수 없습니다.")
            return False

    except Exception as e:
        logger.error(f"재고 업데이트 오류: {e}", exc_info=True)
        return False
