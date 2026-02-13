"""
Inventory Management API endpoints
Migrated from Excel to DB with alerts and analytics
"""
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func as sqlfunc, desc, or_

from app.database.config import get_db
from app.models.user import User
from app.models.inventory import InventoryItem, InventoryTransaction
from app.auth.dependencies import get_current_active_user
from app.utils.logger import setup_logger

logger = setup_logger(__name__)
router = APIRouter()


@router.get("/")
async def list_inventory(
    search: Optional[str] = None,
    category: Optional[str] = None,
    low_stock_only: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """List inventory items with filtering"""
    query = db.query(InventoryItem).filter(InventoryItem.is_active == 1)

    if search:
        query = query.filter(
            or_(
                InventoryItem.item_name.contains(search),
                InventoryItem.item_code.contains(search),
                InventoryItem.supplier.contains(search),
            )
        )
    if category:
        query = query.filter(InventoryItem.category == category)
    if low_stock_only:
        query = query.filter(
            InventoryItem.current_stock <= InventoryItem.min_stock,
            InventoryItem.min_stock > 0,
        )

    total = query.count()
    items = (
        query.order_by(InventoryItem.item_name)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return {
        "status": "success",
        "total": total,
        "page": page,
        "items": [
            {
                "id": item.id,
                "item_code": item.item_code,
                "item_name": item.item_name,
                "unit": item.unit,
                "current_stock": item.current_stock,
                "min_stock": item.min_stock,
                "max_stock": item.max_stock,
                "unit_price": item.unit_price,
                "supplier": item.supplier,
                "category": item.category,
                "location": item.location,
                "is_low_stock": item.current_stock <= item.min_stock if item.min_stock > 0 else False,
                "updated_at": item.updated_at.isoformat() if item.updated_at else None,
            }
            for item in items
        ],
    }


@router.get("/stats")
async def inventory_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get inventory statistics"""
    total_items = db.query(InventoryItem).filter(InventoryItem.is_active == 1).count()

    # Low stock alerts
    low_stock = (
        db.query(InventoryItem)
        .filter(
            InventoryItem.is_active == 1,
            InventoryItem.current_stock <= InventoryItem.min_stock,
            InventoryItem.min_stock > 0,
        )
        .count()
    )

    # Total stock value
    total_value = (
        db.query(sqlfunc.sum(InventoryItem.current_stock * InventoryItem.unit_price))
        .filter(InventoryItem.is_active == 1)
        .scalar() or 0
    )

    # Category breakdown
    categories = (
        db.query(InventoryItem.category, sqlfunc.count(InventoryItem.id))
        .filter(InventoryItem.is_active == 1, InventoryItem.category.isnot(None))
        .group_by(InventoryItem.category)
        .all()
    )

    # Recent transactions (7 days)
    week_ago = datetime.now() - timedelta(days=7)
    recent_transactions = (
        db.query(InventoryTransaction)
        .filter(InventoryTransaction.created_at >= week_ago)
        .count()
    )

    return {
        "status": "success",
        "data": {
            "total_items": total_items,
            "low_stock_alerts": low_stock,
            "total_value": round(total_value, 0),
            "recent_transactions_7d": recent_transactions,
            "categories": {cat or "미분류": c for cat, c in categories},
        },
    }


@router.post("/items")
async def create_item(
    item_name: str = Query(..., min_length=1),
    unit: str = Query("EA"),
    current_stock: int = Query(0, ge=0),
    min_stock: int = Query(0, ge=0),
    max_stock: int = Query(0, ge=0),
    unit_price: float = Query(0, ge=0),
    supplier: Optional[str] = None,
    category: Optional[str] = None,
    item_code: Optional[str] = None,
    location: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Create a new inventory item"""
    # Check duplicate
    existing = db.query(InventoryItem).filter(InventoryItem.item_name == item_name).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"'{item_name}' 품목이 이미 존재합니다")

    item = InventoryItem(
        item_code=item_code,
        item_name=item_name,
        unit=unit,
        current_stock=current_stock,
        min_stock=min_stock,
        max_stock=max_stock,
        unit_price=unit_price,
        supplier=supplier,
        category=category,
        location=location,
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    logger.info(f"새 품목 등록: {item_name} (재고: {current_stock})")

    return {
        "status": "success",
        "message": f"품목 '{item_name}' 등록 완료",
        "data": {"id": item.id, "item_name": item.item_name},
    }


@router.patch("/items/{item_id}")
async def update_item(
    item_id: int,
    item_name: Optional[str] = None,
    unit: Optional[str] = None,
    min_stock: Optional[int] = None,
    max_stock: Optional[int] = None,
    unit_price: Optional[float] = None,
    supplier: Optional[str] = None,
    category: Optional[str] = None,
    location: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Update inventory item details"""
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="품목을 찾을 수 없습니다")

    if item_name is not None:
        item.item_name = item_name
    if unit is not None:
        item.unit = unit
    if min_stock is not None:
        item.min_stock = min_stock
    if max_stock is not None:
        item.max_stock = max_stock
    if unit_price is not None:
        item.unit_price = unit_price
    if supplier is not None:
        item.supplier = supplier
    if category is not None:
        item.category = category
    if location is not None:
        item.location = location

    db.commit()
    return {"status": "success", "message": f"품목 '{item.item_name}' 수정 완료"}


@router.delete("/items/{item_id}")
async def delete_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Soft delete inventory item"""
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="품목을 찾을 수 없습니다")

    item.is_active = 0
    db.commit()
    return {"status": "success", "message": f"품목 '{item.item_name}' 삭제 완료"}


@router.post("/items/{item_id}/transaction")
async def record_transaction(
    item_id: int,
    transaction_type: str = Query(..., regex="^(입고|출고)$"),
    quantity: int = Query(..., gt=0),
    note: Optional[str] = None,
    reference_number: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Record inventory transaction (입고/출고)"""
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="품목을 찾을 수 없습니다")

    # Calculate new stock
    if transaction_type == "입고":
        new_stock = item.current_stock + quantity
    else:
        new_stock = item.current_stock - quantity
        if new_stock < 0:
            raise HTTPException(status_code=400, detail=f"재고 부족: 현재 {item.current_stock}, 출고 요청 {quantity}")

    # Record transaction
    transaction = InventoryTransaction(
        item_id=item.id,
        transaction_type=transaction_type,
        quantity=quantity,
        reference_number=reference_number,
        note=note,
        created_by=current_user.id,
    )
    db.add(transaction)

    # Update stock
    old_stock = item.current_stock
    item.current_stock = new_stock
    db.commit()

    logger.info(f"재고 {transaction_type}: {item.item_name} {old_stock} -> {new_stock} ({transaction_type} {quantity})")

    return {
        "status": "success",
        "message": f"{item.item_name} {quantity}{item.unit} {transaction_type} 완료",
        "data": {
            "item_name": item.item_name,
            "old_stock": old_stock,
            "new_stock": new_stock,
            "transaction_type": transaction_type,
            "quantity": quantity,
        },
    }


@router.get("/items/{item_id}/transactions")
async def get_item_transactions(
    item_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get transaction history for an item"""
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="품목을 찾을 수 없습니다")

    query = db.query(InventoryTransaction).filter(InventoryTransaction.item_id == item_id)
    total = query.count()

    transactions = (
        query.order_by(desc(InventoryTransaction.created_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return {
        "status": "success",
        "item_name": item.item_name,
        "current_stock": item.current_stock,
        "total": total,
        "transactions": [
            {
                "id": t.id,
                "transaction_type": t.transaction_type,
                "quantity": t.quantity,
                "reference_number": t.reference_number,
                "note": t.note,
                "created_at": t.created_at.isoformat() if t.created_at else None,
            }
            for t in transactions
        ],
    }


@router.get("/alerts")
async def get_low_stock_alerts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get items below minimum stock level"""
    items = (
        db.query(InventoryItem)
        .filter(
            InventoryItem.is_active == 1,
            InventoryItem.current_stock <= InventoryItem.min_stock,
            InventoryItem.min_stock > 0,
        )
        .order_by(InventoryItem.current_stock)
        .all()
    )

    return {
        "status": "success",
        "total_alerts": len(items),
        "alerts": [
            {
                "id": item.id,
                "item_name": item.item_name,
                "current_stock": item.current_stock,
                "min_stock": item.min_stock,
                "unit": item.unit,
                "supplier": item.supplier,
                "shortage": item.min_stock - item.current_stock,
            }
            for item in items
        ],
    }


@router.post("/import-from-excel")
async def import_from_excel(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Import inventory from existing Excel file (one-time migration)"""
    import os
    try:
        import pandas as pd
    except ImportError:
        raise HTTPException(status_code=500, detail="pandas가 설치되지 않았습니다")

    dropbox_path = os.getenv("DROPBOX_PATH", "/tmp/dropbox")
    inventory_file = os.path.join(dropbox_path, "재고 폴더", "실시간_재고현황.xlsx")

    if not os.path.exists(inventory_file):
        raise HTTPException(status_code=404, detail=f"재고 파일을 찾을 수 없습니다: {inventory_file}")

    try:
        df = pd.read_excel(inventory_file)
        imported = 0
        skipped = 0

        for _, row in df.iterrows():
            item_name = str(row.get("품목명", "")).strip()
            if not item_name:
                continue

            existing = db.query(InventoryItem).filter(InventoryItem.item_name == item_name).first()
            if existing:
                skipped += 1
                continue

            item = InventoryItem(
                item_name=item_name,
                current_stock=int(row.get("현재고", 0)) if not pd.isna(row.get("현재고", 0)) else 0,
                unit=str(row.get("단위", "EA")) if not pd.isna(row.get("단위", "EA")) else "EA",
            )
            db.add(item)
            imported += 1

        db.commit()
        logger.info(f"Excel 재고 가져오기 완료: {imported}건 신규, {skipped}건 건너뜀")

        return {
            "status": "success",
            "message": f"가져오기 완료",
            "data": {"imported": imported, "skipped": skipped},
        }

    except Exception as e:
        logger.error(f"Excel 가져오기 실패: {e}")
        raise HTTPException(status_code=500, detail=f"가져오기 실패: {str(e)}")
