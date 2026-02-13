/**
 * Exchange Rate Routes - /api/v1/exchange-rates
 */
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, desc, and, gte } from "drizzle-orm";
import { exchangeRateHistory } from "../db/schema";
import { authMiddleware } from "../middleware/auth";
import type { Env } from "../types";

const rates = new Hono<{ Bindings: Env }>();

/**
 * GET /exchange-rates/current - 현재 환율 (인증 불필요 - 대시보드 위젯용)
 */
rates.get("/current", async (c) => {
  const db = drizzle(c.env.DB);

  // KV 캐시 확인
  if (c.env.CACHE) {
    try {
      const cached = await c.env.CACHE.get("exchange_rates_current", "json");
      if (cached) {
        return c.json({ status: "success", data: cached });
      }
    } catch { /* KV not available */ }
  }

  // 외부 API에서 환율 가져오기
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    const data = (await res.json()) as any;

    if (data.result === "success") {
      const krwRate = data.rates.KRW;
      const cnyRate = data.rates.CNY;
      const cnyToKrw = krwRate / cnyRate;
      const usdToCny = cnyRate;
      const today = new Date().toISOString().split("T")[0];

      const result = {
        USD_KRW: Math.round(krwRate * 100) / 100,
        CNY_KRW: Math.round(cnyToKrw * 100) / 100,
        USD_CNY: Math.round(usdToCny * 100) / 100,
        updated_at: new Date().toISOString(),
      };

      // D1에 저장
      await db
        .insert(exchangeRateHistory)
        .values([
          { currencyPair: "USD_KRW", rate: krwRate, rateDate: today },
          { currencyPair: "CNY_KRW", rate: cnyToKrw, rateDate: today },
        ])
        .onConflictDoNothing();

      // KV에 1시간 캐시
      if (c.env.CACHE) {
        try {
          await c.env.CACHE.put("exchange_rates_current", JSON.stringify(result), {
            expirationTtl: 3600,
          });
        } catch { /* KV not available */ }
      }

      return c.json({ status: "success", data: result });
    }
  } catch (e) {
    // API 실패 시 DB에서 최신 데이터
  }

  // 폴백: DB에서 최신 환율
  const usd = await db
    .select()
    .from(exchangeRateHistory)
    .where(eq(exchangeRateHistory.currencyPair, "USD_KRW"))
    .orderBy(desc(exchangeRateHistory.rateDate))
    .limit(1);

  const cny = await db
    .select()
    .from(exchangeRateHistory)
    .where(eq(exchangeRateHistory.currencyPair, "CNY_KRW"))
    .orderBy(desc(exchangeRateHistory.rateDate))
    .limit(1);

  return c.json({
    status: "success",
    data: {
      USD_KRW: usd[0]?.rate || 0,
      CNY_KRW: cny[0]?.rate || 0,
      USD_CNY: 0,
      updated_at: usd[0]?.createdAt || null,
    },
  });
});

/**
 * GET /exchange-rates/history - 환율 히스토리 (차트용)
 */
rates.get("/history", authMiddleware, async (c) => {
  const pair = c.req.query("pair") || "USD_KRW";
  const days = parseInt(c.req.query("days") || "30");

  const db = drizzle(c.env.DB);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().split("T")[0];

  const history = await db
    .select()
    .from(exchangeRateHistory)
    .where(
      and(
        eq(exchangeRateHistory.currencyPair, pair),
        gte(exchangeRateHistory.rateDate, startDateStr)
      )
    )
    .orderBy(exchangeRateHistory.rateDate);

  return c.json({ status: "success", data: history });
});

export default rates;
