"""
Exchange Rate history model
"""
from sqlalchemy import Column, Integer, String, Float, DateTime, Date
from sqlalchemy.sql import func

from app.database.base import Base


class ExchangeRateHistory(Base):
    """Exchange rate history for tracking trends"""
    __tablename__ = "exchange_rate_history"

    id = Column(Integer, primary_key=True, index=True)
    currency_pair = Column(String(10), nullable=False, index=True)  # USD_KRW, CNY_KRW
    rate = Column(Float, nullable=False)
    rate_date = Column(Date, nullable=False, index=True)
    source = Column(String(50), default="exchangerate-api")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<ExchangeRate {self.currency_pair}: {self.rate} ({self.rate_date})>"
