import pandas as pd
import os
from dotenv import load_dotenv

load_dotenv()

def get_current_inventory():
    """드롭박스에서 현재 재고 현황을 조회"""
    inventory_file = os.path.join(os.getenv("DROPBOX_PATH"), "재고 폴더", "실시간_재고현황.xlsx")
    
    if not os.path.exists(inventory_file):
        return None
    
    try:
        df = pd.read_excel(inventory_file)
        # 품목명, 현재고, 규격 등 필요한 정보만 추출
        inventory_data = df[['품목명', '현재고', '단위']].to_dict(orient='records')
        return inventory_data
    except Exception as e:
        print(f"재고 읽기 오류: {e}")
        return None


def record_inventory_transaction(item_name, quantity, transaction_type, note=""):
    """재고 입출고 기록
    
    Args:
        item_name: 품목명
        quantity: 수량
        transaction_type: '입고' 또는 '출고'
        note: 비고 (선택)
    """
    from datetime import datetime
    
    log_file = os.path.join(os.getenv("DROPBOX_PATH"), "재고 폴더", "입출고_기록.xlsx")
    
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
        else:
            df = pd.DataFrame([new_record])
        
        # 저장
        df.to_excel(log_file, index=False)
        
        # 재고 현황 업데이트
        update_inventory_stock(item_name, quantity, transaction_type)
        
        return True
    except Exception as e:
        print(f"입출고 기록 오류: {e}")
        return False


def update_inventory_stock(item_name, quantity, transaction_type):
    """재고 현황 파일 업데이트"""
    inventory_file = os.path.join(os.getenv("DROPBOX_PATH"), "재고 폴더", "실시간_재고현황.xlsx")
    
    if not os.path.exists(inventory_file):
        print("재고 현황 파일이 존재하지 않습니다.")
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
                df.loc[idx, '현재고'] = current_stock + quantity
            elif transaction_type == '출고':
                df.loc[idx, '현재고'] = current_stock - quantity
            
            # 저장
            df.to_excel(inventory_file, index=False)
            return True
        else:
            print(f"품목 '{item_name}'을 찾을 수 없습니다.")
            return False
            
    except Exception as e:
        print(f"재고 업데이트 오류: {e}")
        return False
