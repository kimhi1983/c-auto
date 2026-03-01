/**
 * Commodity Prices Routes - /api/v1/commodity-prices
 * Yahoo Finance 프록시를 통한 원자재 가격 조회
 */
import { Hono } from "hono";
import type { Env } from "../types";

const commodityPrices = new Hono<{ Bindings: Env }>();

/** 지원 원자재 목록 */
const COMMODITIES: Record<string, { ticker: string; name: string; unit: string }> = {
  "palm-oil": { ticker: "CPO=F", name: "말레이시아 원유 팜유 (CPO)", unit: "USD/톤" },
  "naphtha": { ticker: "BZ=F", name: "납사 (Naphtha) · Brent Crude 기준", unit: "USD/배럴" },
  "wti": { ticker: "CL=F", name: "원유 (WTI) · NYMEX 선물", unit: "USD/배럴" },
};

/**
 * Yahoo Finance에서 시세 데이터를 가져오는 공통 함수
 */
export async function fetchYahooFinance(
  ticker: string,
  range: string,
  interval: string
): Promise<any> {
  const encodedTicker = encodeURIComponent(ticker);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodedTicker}?range=${range}&interval=${interval}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "C-Auto/1.0" },
  });

  if (!res.ok) {
    throw new Error(`Yahoo Finance API 호출 실패 (${res.status})`);
  }

  const raw = (await res.json()) as any;
  const chart = raw?.chart?.result?.[0];
  if (!chart) {
    throw new Error("차트 데이터 없음");
  }

  const timestamps: number[] = chart.timestamp || [];
  const quotes = chart.indicators?.quote?.[0] || {};
  const meta = chart.meta || {};

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

  const lastPrice = prices[prices.length - 1]?.close || 0;
  const prevPrice = prices.length >= 2 ? prices[prices.length - 2]?.close : null;

  return {
    ticker,
    currency: meta.currency || "USD",
    exchange: meta.exchangeName || "",
    range,
    interval,
    prices,
    current_price: lastPrice,
    previous_close: prevPrice,
    fifty_two_week_high: meta.fiftyTwoWeekHigh || null,
    fifty_two_week_low: meta.fiftyTwoWeekLow || null,
    updated_at: new Date().toISOString(),
  };
}

/**
 * GET /commodity-prices/current - 팜오일(CPO) 시세 (인증 불필요, 하위호환)
 * ?range=6mo&interval=1d
 */
commodityPrices.get("/current", async (c) => {
  const range = c.req.query("range") || "6mo";
  const interval = c.req.query("interval") || "1d";
  const cacheKey = `commodity_cpo_${range}_${interval}`;

  if (c.env.CACHE) {
    try {
      const cached = await c.env.CACHE.get(cacheKey, "json");
      if (cached) {
        return c.json({ status: "success", data: cached });
      }
    } catch { /* KV not available */ }
  }

  try {
    const data = await fetchYahooFinance("CPO=F", range, interval);
    const result = { ...data, name: "말레이시아 원유 팜유 (CPO)" };

    if (c.env.CACHE) {
      try {
        await c.env.CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: 7200 });
      } catch { /* KV not available */ }
    }

    return c.json({ status: "success", data: result });
  } catch (e: any) {
    return c.json({ status: "error", message: e.message || "원자재 가격 조회 실패" }, 500);
  }
});

/**
 * SunSirs 스크래핑 - 메탈 실리콘 등 중국 원자재 가격
 * HTML 테이블에서 날짜/가격 추출
 */
export async function fetchSunSirs(productId: string): Promise<any> {
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html",
  };

  // 현물가 + 선물가 동시 조회
  const [spotRes, futuresRes] = await Promise.all([
    fetch(`https://www.sunsirs.com/uk/prodetail-${productId}.html`, { headers }),
    fetch(`https://www.sunsirs.com/uk/frodetail-${productId}.html`, { headers }),
  ]);

  const prices: { date: string; close: number; open: number; high: number; low: number; volume: null }[] = [];
  const tdPattern = /<td[^>]*>(.*?)<\/td>/g;

  // 현물가 파싱: [Commodity, Sectors, Price, Date] 4개씩
  if (spotRes.ok) {
    const html = await spotRes.text();
    const cells: string[] = [];
    let match;
    while ((match = tdPattern.exec(html)) !== null) {
      cells.push(match[1].replace(/<[^>]+>/g, "").trim());
    }
    // 첫 4개는 헤더, 이후 4개씩 데이터 행
    for (let i = 4; i < cells.length; i += 4) {
      const price = parseFloat(cells[i + 2]?.replace(/,/g, ""));
      const date = cells[i + 3];
      if (price && date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        prices.push({ date, close: price, open: price, high: price, low: price, volume: null });
      }
    }
  }

  // 선물가 파싱: [Commodity, Spot price, Dominant contract, Date] 4개씩
  let futuresPrices: { date: string; spot: number; futures: number }[] = [];
  if (futuresRes.ok) {
    const html = await futuresRes.text();
    const cells: string[] = [];
    tdPattern.lastIndex = 0;
    let match;
    while ((match = tdPattern.exec(html)) !== null) {
      cells.push(match[1].replace(/<[^>]+>/g, "").trim());
    }
    for (let i = 4; i < cells.length; i += 4) {
      const spot = parseFloat(cells[i + 1]?.replace(/,/g, ""));
      const futures = parseFloat(cells[i + 2]?.replace(/,/g, ""));
      const date = cells[i + 3];
      if (spot && date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        futuresPrices.push({ date, spot, futures });
      }
    }
  }

  // 선물 데이터를 spot price에 병합 (중복 날짜 제외)
  const existingDates = new Set(prices.map(p => p.date));
  for (const fp of futuresPrices) {
    if (!existingDates.has(fp.date)) {
      prices.push({ date: fp.date, close: fp.spot, open: fp.spot, high: fp.spot, low: fp.spot, volume: null });
    }
  }

  // 날짜순 정렬
  prices.sort((a, b) => a.date.localeCompare(b.date));

  if (prices.length === 0) {
    throw new Error("SunSirs 데이터 파싱 실패");
  }

  const lastPrice = prices[prices.length - 1].close;
  const prevPrice = prices.length >= 2 ? prices[prices.length - 2].close : null;

  return {
    prices,
    current_price: lastPrice,
    previous_close: prevPrice,
    futures_price: futuresPrices.length > 0 ? futuresPrices[0].futures : null,
    updated_at: new Date().toISOString(),
  };
}

/**
 * GET /commodity-prices/silicon-metal - 메탈 실리콘 시세 (SunSirs)
 */
commodityPrices.get("/silicon-metal", async (c) => {
  const cacheKey = "commodity_silicon_metal";

  if (c.env.CACHE) {
    try {
      const cached = await c.env.CACHE.get(cacheKey, "json");
      if (cached) {
        return c.json({ status: "success", data: cached });
      }
    } catch { /* KV not available */ }
  }

  try {
    const data = await fetchSunSirs("238");
    const result = {
      ...data,
      ticker: "Si-Metal",
      name: "메탈 실리콘 (Silicon Metal) #441",
      currency: "CNY",
      exchange: "GFEX",
      unit: "CNY/톤",
      source: "SunSirs",
      range: "recent",
    };

    if (c.env.CACHE) {
      try {
        await c.env.CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: 14400 });
      } catch { /* KV not available */ }
    }

    return c.json({ status: "success", data: result });
  } catch (e: any) {
    return c.json({ status: "error", message: e.message || "메탈 실리콘 가격 조회 실패" }, 500);
  }
});

/**
 * GET /commodity-prices/dmc - DMC (Silicone DMC) 시세 (SunSirs)
 */
commodityPrices.get("/dmc", async (c) => {
  const cacheKey = "commodity_dmc";

  if (c.env.CACHE) {
    try {
      const cached = await c.env.CACHE.get(cacheKey, "json");
      if (cached) {
        return c.json({ status: "success", data: cached });
      }
    } catch { /* KV not available */ }
  }

  try {
    const data = await fetchSunSirs("751");
    const result = {
      ...data,
      ticker: "DMC",
      name: "실리콘 DMC (Dimethylcyclosiloxane)",
      currency: "CNY",
      exchange: "Spot",
      unit: "CNY/톤",
      source: "SunSirs",
      range: "recent",
    };

    if (c.env.CACHE) {
      try {
        await c.env.CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: 14400 });
      } catch { /* KV not available */ }
    }

    return c.json({ status: "success", data: result });
  } catch (e: any) {
    return c.json({ status: "error", message: e.message || "DMC 가격 조회 실패" }, 500);
  }
});

/**
 * GET /commodity-prices/:commodity - 범용 원자재 시세 조회 (Yahoo Finance)
 * :commodity = "palm-oil" | "naphtha" | "wti"
 * ?range=6mo&interval=1d
 */
commodityPrices.get("/:commodity", async (c) => {
  const commodity = c.req.param("commodity");
  const info = COMMODITIES[commodity];
  if (!info) {
    const supported = [...Object.keys(COMMODITIES), "silicon-metal", "dmc"].join(", ");
    return c.json(
      { status: "error", message: `지원하지 않는 원자재: ${commodity}. 지원: ${supported}` },
      400
    );
  }

  const range = c.req.query("range") || "6mo";
  const interval = c.req.query("interval") || "1d";
  const cacheKey = `commodity_${commodity}_${range}_${interval}`;

  if (c.env.CACHE) {
    try {
      const cached = await c.env.CACHE.get(cacheKey, "json");
      if (cached) {
        return c.json({ status: "success", data: cached });
      }
    } catch { /* KV not available */ }
  }

  try {
    const data = await fetchYahooFinance(info.ticker, range, interval);
    const result = { ...data, name: info.name, unit: info.unit };

    if (c.env.CACHE) {
      try {
        await c.env.CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: 7200 });
      } catch { /* KV not available */ }
    }

    return c.json({ status: "success", data: result });
  } catch (e: any) {
    return c.json({ status: "error", message: e.message || "원자재 가격 조회 실패" }, 500);
  }
});

export default commodityPrices;
