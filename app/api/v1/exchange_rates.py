"""
Exchange Rate API endpoints
"""
import httpx
from datetime import datetime
from fastapi import APIRouter, HTTPException
from app.utils.logger import setup_logger

logger = setup_logger(__name__)

router = APIRouter()


@router.get("/current")
async def get_current_rates():
    """
    Get current USD/KRW and CNY/KRW exchange rates
    Uses free exchangerate-api.com
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
        return {
            "status": "error",
            "message": "환율 정보를 가져오는데 시간이 초과되었습니다.",
            "data": None,
        }
    except Exception as e:
        logger.error(f"환율 조회 실패: {e}")
        return {
            "status": "error",
            "message": "환율 정보를 가져올 수 없습니다.",
            "data": None,
        }
