/**
 * Commodity Prices Routes - /api/v1/commodity-prices
 * Yahoo Finance 프록시를 통한 원자재 가격 조회
 */
import { Hono } from "hono";
import type { Env } from "../types";

const commodityPrices = new Hono<{ Bindings: Env }>();

/**
 * GET /commodity-prices/current - 팜오일(CPO) 시세 (인증 불필요)
 * ?range=6mo&interval=1d (기본값)
 */
commodityPrices.get("/current", async (c) => {
  const range = c.req.query("range") || "6mo";
  const interval = c.req.query("interval") || "1d";
  const cacheKey = `commodity_cpo_${range}_${interval}`;

  // KV 캐시 확인 (2시간)
  if (c.env.CACHE) {
    try {
      const cached = await c.env.CACHE.get(cacheKey, "json");
      if (cached) {
        return c.json({ status: "success", data: cached });
      }
    } catch { /* KV not available */ }
  }

  // Yahoo Finance에서 팜오일 시세 가져오기
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/CPO%3DF?range=${range}&interval=${interval}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "C-Auto/1.0" },
    });

    if (!res.ok) {
      return c.json({ status: "error", message: "Yahoo Finance API 호출 실패" }, 502);
    }

    const raw = (await res.json()) as any;
    const chart = raw?.chart?.result?.[0];
    if (!chart) {
      return c.json({ status: "error", message: "차트 데이터 없음" }, 502);
    }

    const timestamps: number[] = chart.timestamp || [];
    const quotes = chart.indicators?.quote?.[0] || {};
    const meta = chart.meta || {};

    // 간결한 배열로 변환
    const prices = timestamps
      .map((ts: number, i: number) => ({
        date: new Date(ts * 1000).toISOString().split("T")[0],
        close: quotes.close?.[i] ?? null,
        open: quotes.open?.[i] ?? null,
        high: quotes.high?.[i] ?? null,
        low: quotes.low?.[i] ?? null,
        volume: quotes.volume?.[i] ?? null,
      }))
      .filter((p: any) => p.close !== null);

    // 차트 데이터의 마지막 종가를 현재가로 사용 (meta.regularMarketPrice는 부정확할 수 있음)
    const lastPrice = prices[prices.length - 1]?.close || 0;
    const prevPrice = prices.length >= 2 ? prices[prices.length - 2]?.close : null;

    const result = {
      ticker: "CPO=F",
      name: "말레이시아 원유 팜유 (CPO)",
      currency: meta.currency || "USD",
      exchange: meta.exchangeName || "CME",
      range,
      interval,
      prices,
      current_price: lastPrice,
      previous_close: prevPrice,
      fifty_two_week_high: meta.fiftyTwoWeekHigh || null,
      fifty_two_week_low: meta.fiftyTwoWeekLow || null,
      updated_at: new Date().toISOString(),
    };

    // KV에 2시간 캐시
    if (c.env.CACHE) {
      try {
        await c.env.CACHE.put(cacheKey, JSON.stringify(result), {
          expirationTtl: 7200,
        });
      } catch { /* KV not available */ }
    }

    return c.json({ status: "success", data: result });
  } catch (e: any) {
    return c.json({ status: "error", message: e.message || "원자재 가격 조회 실패" }, 500);
  }
});

export default commodityPrices;
