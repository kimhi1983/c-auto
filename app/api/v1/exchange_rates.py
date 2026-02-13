"""
Exchange Rate API endpoints
Enhanced with history tracking and chart data
"""
import httpx
from datetime import datetime, date, timedelta
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.database.config import get_db
from app.models.exchange_rate import ExchangeRateHistory
from app.utils.logger import setup_logger

logger = setup_logger(__name__)

router = APIRouter()


@router.get("/current")
async def get_current_rates(db: Session = Depends(get_db)):
    """
    Get current USD/KRW and CNY/KRW exchange rates.
    Also saves to history if not already saved today.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                "https://open.er-api.com/v6/latest/USD"
            )
            if response.status_code != 200:
                raise HTTPException(status_code=502, detail="환율 API 호출 실패")

            data = response.json()
            rates = data.get("rates", {})

            krw_per_usd = rates.get("KRW", 0)
            cny_per_usd = rates.get("CNY", 0)

            # Calculate CNY/KRW
            krw_per_cny = round(krw_per_usd / cny_per_usd, 2) if cny_per_usd > 0 else 0

            # Save to history (once per day)
            today = date.today()
            existing = (
                db.query(ExchangeRateHistory)
                .filter(
                    ExchangeRateHistory.rate_date == today,
                    ExchangeRateHistory.currency_pair == "USD_KRW",
                )
                .first()
            )

            if not existing and krw_per_usd > 0:
                for pair, rate_val in [("USD_KRW", krw_per_usd), ("CNY_KRW", krw_per_cny)]:
                    entry = ExchangeRateHistory(
                        currency_pair=pair,
                        rate=round(rate_val, 2),
                        rate_date=today,
                    )
                    db.add(entry)
                db.commit()
                logger.info(f"환율 히스토리 저장: USD/KRW={krw_per_usd}, CNY/KRW={krw_per_cny}")

            return {
                "status": "success",
                "data": {
                    "USD_KRW": round(krw_per_usd, 2),
                    "CNY_KRW": krw_per_cny,
                    "USD_CNY": round(cny_per_usd, 4),
                    "updated_at": data.get("time_last_update_utc", datetime.now().isoformat()),
                },
            }
    except httpx.TimeoutException:
        logger.warning("환율 API 타임아웃")
        # Fallback to latest from DB
        latest = _get_latest_from_db(db)
        if latest:
            return {"status": "success", "data": latest, "source": "cache"}
        return {
            "status": "error",
            "message": "환율 정보를 가져오는데 시간이 초과되었습니다.",
            "data": None,
        }
    except Exception as e:
        logger.error(f"환율 조회 실패: {e}")
        latest = _get_latest_from_db(db)
        if latest:
            return {"status": "success", "data": latest, "source": "cache"}
        return {
            "status": "error",
            "message": "환율 정보를 가져올 수 없습니다.",
            "data": None,
        }


@router.get("/history")
async def get_rate_history(
    currency_pair: str = Query("USD_KRW", regex="^(USD_KRW|CNY_KRW)$"),
    days: int = Query(30, ge=7, le=365),
    db: Session = Depends(get_db),
):
    """
    Get exchange rate history for chart display.
    Returns daily rates for the specified period.
    """
    start_date = date.today() - timedelta(days=days)

    history = (
        db.query(ExchangeRateHistory)
        .filter(
            ExchangeRateHistory.currency_pair == currency_pair,
            ExchangeRateHistory.rate_date >= start_date,
        )
        .order_by(ExchangeRateHistory.rate_date)
        .all()
    )

    return {
        "status": "success",
        "currency_pair": currency_pair,
        "days": days,
        "data": [
            {
                "date": h.rate_date.isoformat(),
                "rate": h.rate,
            }
            for h in history
        ],
    }


@router.post("/fetch-history")
async def fetch_and_store_history(
    days: int = Query(30, ge=1, le=90),
    db: Session = Depends(get_db),
):
    """
    Fetch historical rates and store in DB.
    Uses the free API to backfill data.
    """
    saved_count = 0
    errors = 0

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            for i in range(days):
                target_date = date.today() - timedelta(days=i)

                # Skip if already have data
                existing = (
                    db.query(ExchangeRateHistory)
                    .filter(
                        ExchangeRateHistory.rate_date == target_date,
                        ExchangeRateHistory.currency_pair == "USD_KRW",
                    )
                    .first()
                )
                if existing:
                    continue

                try:
                    url = f"https://open.er-api.com/v6/latest/USD"
                    response = await client.get(url)
                    if response.status_code != 200:
                        errors += 1
                        continue

                    data = response.json()
                    rates = data.get("rates", {})
                    krw = rates.get("KRW", 0)
                    cny = rates.get("CNY", 0)

                    if krw > 0 and cny > 0:
                        krw_per_cny = round(krw / cny, 2)

                        for pair, rate_val in [("USD_KRW", round(krw, 2)), ("CNY_KRW", krw_per_cny)]:
                            entry = ExchangeRateHistory(
                                currency_pair=pair,
                                rate=rate_val,
                                rate_date=target_date,
                            )
                            db.add(entry)
                        saved_count += 1

                except Exception:
                    errors += 1
                    continue

        db.commit()
        logger.info(f"환율 히스토리 백필 완료: {saved_count}일 저장, {errors}건 오류")

        return {
            "status": "success",
            "message": f"환율 히스토리 {saved_count}일치 저장 완료",
            "data": {"saved": saved_count, "errors": errors},
        }

    except Exception as e:
        logger.error(f"환율 히스토리 백필 실패: {e}")
        raise HTTPException(status_code=500, detail=f"히스토리 백필 실패: {str(e)}")


def _get_latest_from_db(db: Session) -> Optional[dict]:
    """Get latest rates from DB as fallback"""
    usd = (
        db.query(ExchangeRateHistory)
        .filter(ExchangeRateHistory.currency_pair == "USD_KRW")
        .order_by(desc(ExchangeRateHistory.rate_date))
        .first()
    )
    cny = (
        db.query(ExchangeRateHistory)
        .filter(ExchangeRateHistory.currency_pair == "CNY_KRW")
        .order_by(desc(ExchangeRateHistory.rate_date))
        .first()
    )

    if usd:
        return {
            "USD_KRW": usd.rate,
            "CNY_KRW": cny.rate if cny else 0,
            "USD_CNY": 0,
            "updated_at": usd.rate_date.isoformat(),
        }
    return None
