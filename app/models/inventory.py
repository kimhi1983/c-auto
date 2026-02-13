"""
Inventory models - migrated from Excel to DB
"""
from sqlalchemy import Column, Integer, String, Float, Text, DateTime, ForeignKey
from sqlalchemy.sql import func

from app.database.base import Base


class InventoryItem(Base):
    """Inventory items"""
    __tablename__ = "inventory_items"

    id = Column(Integer, primary_key=True, index=True)
    item_code = Column(String(50), unique=True, nullable=True, index=True)
    item_name = Column(String(200), nullable=False, index=True)
    unit = Column(String(20), default="EA")
    current_stock = Column(Integer, default=0)
    min_stock = Column(Integer, default=0)
    max_stock = Column(Integer, default=0)
    unit_price = Column(Float, default=0)
    supplier = Column(String(200), nullable=True)
    category = Column(String(100), nullable=True)
    location = Column(String(100), nullable=True)
    is_active = Column(Integer, default=1)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<InventoryItem {self.item_name}: {self.current_stock}>"


class InventoryTransaction(Base):
    """Inventory transaction log"""
    __tablename__ = "inventory_transactions"

    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(Integer, ForeignKey("inventory_items.id"), nullable=False, index=True)
    transaction_type = Column(String(10), nullable=False)  # 입고, 출고
    quantity = Column(Integer, nullable=False)
    reference_number = Column(String(100), nullable=True)
    note = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<InventoryTransaction {self.id}: {self.transaction_type} {self.quantity}>"
