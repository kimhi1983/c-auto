/**
 * Commodity Trends AI Report - /api/v1/commodity-trends
 * 5개 원자재 가격 + 환율 + AI 전문가 분석
 */
import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { askAIResearch } from '../services/ai';
import { fetchYahooFinance, fetchSunSirs } from './commodity-prices';
import type { Env } from '../types';

const commodityTrends = new Hono<{ Bindings: Env }>();

commodityTrends.use('*', authMiddleware);

interface CommodityItem {
  key: string;
  name: string;
  label: string;
  currency: string;
  unit: string;
  current_price: number;
  previous_close: number | null;
  change_pct: number | null;
  prices: { date: string; close: number }[];
}

/**
 * POST /commodity-trends/generate - 트렌드 보고서 생성
 * 구조화된 데이터 + AI 전문가 분석 텍스트 분리 반환
 */
commodityTrends.post('/generate', async (c) => {
  const today = new Date().toISOString().split('T')[0];

  // 5개 원자재 + 환율 병렬 fetch
  const [palmOil, naphtha, wti, siliconMetal, dmc, ratesResult] = await Promise.allSettled([
    fetchYahooFinance('CPO=F', '3mo', '1d'),
    fetchYahooFinance('BZ=F', '3mo', '1d'),
    fetchYahooFinance('CL=F', '3mo', '1d'),
    fetchSunSirs('238'),
    fetchSunSirs('751'),
    fetchExchangeRates(),
  ]);

  const commodities: CommodityItem[] = [];

  const add = (
    key: string, name: string, label: string, currency: string, unit: string,
    result: PromiseSettledResult<any>,
  ) => {
    if (result.status === 'fulfilled') {
      const d = result.value;
      const changePct = d.previous_close
        ? parseFloat((((d.current_price - d.previous_close) / d.previous_close) * 100).toFixed(2))
        : null;
      const prices = (d.prices || []).slice(-30).map((p: any) => ({
        date: p.date,
        close: Math.round(p.close * 100) / 100,
      }));
      commodities.push({ key, name, label, currency, unit, current_price: Math.round(d.current_price * 100) / 100, previous_close: d.previous_close ? Math.round(d.previous_close * 100) / 100 : null, change_pct: changePct, prices });
    } else {
      commodities.push({ key, name, label, currency, unit, current_price: 0, previous_close: null, change_pct: null, prices: [] });
    }
  };

  add('palm-oil', '팜오일', 'CPO', 'USD', '톤', palmOil);
  add('naphtha', '납사', 'Naphtha', 'USD', '배럴', naphtha);
  add('wti', '원유', 'WTI', 'USD', '배럴', wti);
  add('silicon-metal', '메탈 실리콘', 'Si-Metal', 'CNY', '톤', siliconMetal);
  add('dmc', 'DMC', 'DMC', 'CNY', '톤', dmc);

  // 환율
  const exchange_rates: Record<string, number> = {};
  if (ratesResult.status === 'fulfilled') {
    Object.assign(exchange_rates, ratesResult.value);
  }

  // AI 분석 - 데이터 나열 없이 인사이트만 요청
  const dataSummary = commodities.filter(c => c.current_price > 0).map(c => {
    const sym = c.currency === 'USD' ? '$' : '¥';
    const chg = c.change_pct !== null ? `${c.change_pct >= 0 ? '+' : ''}${c.change_pct}%` : 'N/A';
    return `${c.name}(${c.label}): ${sym}${c.current_price} (${chg})`;
  }).join(' | ');

  const ratesSummary = exchange_rates.USD_KRW
    ? `USD/KRW ${exchange_rates.USD_KRW}, CNY/KRW ${exchange_rates.CNY_KRW || 'N/A'}`
    : '환율 미확인';

  const prompt = `기준일: ${today}
현재 시세: ${dataSummary}
환율: ${ratesSummary}

위 데이터를 기반으로 전문가 분석을 작성하세요. 데이터 표나 가격 나열은 절대 하지 마세요.

다음 4개 섹션을 각각 작성하세요. 각 섹션은 "## 섹션제목" 헤더로 시작합니다:

## 시장 총평
전체 원자재 시장의 흐름을 3~4문장으로 요약. 핵심 트렌드와 주요 변동 원인.

## 원자재별 분석
5개 원자재 각각을 "**원자재명**:" 으로 시작하는 짧은 단락(2~3문장)으로 분석. 가격 변동의 원인, 수급 상황, 주요 이슈. 숫자를 반복하지 말고 원인과 전망에 집중.

## 주요 뉴스
최근 원자재/화장품 원료 관련 주요 뉴스 3~5건. 각 항목을 "- **제목**: 내용" 형식의 리스트로 작성. 구체적인 뉴스만 포함.

## 전망 및 리스크
향후 1~3개월 전망. K-뷰티/화장품 원료 기업 관점에서의 시사점과 주의할 리스크 요인. 3~4문장.`;

  const systemPrompt = `당신은 글로벌 원자재 시장 수석 애널리스트입니다. 화장품/올레오케미컬 원료 시장 전문가로서 경영진에게 간결하고 날카로운 인사이트를 제공합니다. 모든 내용은 한국어로 작성하되 업계 용어(CPO, WTI, DMC 등)는 영어로 유지합니다. 데이터 표를 만들지 말고 분석과 인사이트에만 집중하세요.`;

  let analysis = '';
  try {
    analysis = await askAIResearch(c.env, prompt, systemPrompt, 4096);
  } catch (e: any) {
    analysis = `## 시장 총평\n분석 생성에 실패했습니다: ${e.message}`;
  }

  const responseData = {
    commodities,
    exchange_rates,
    analysis,
    date: today,
    generated_at: new Date().toISOString(),
  };

  // KV 캐시 (24시간)
  if (c.env.CACHE) {
    try {
      await c.env.CACHE.put('commodity-trends:latest', JSON.stringify(responseData), { expirationTtl: 86400 });
    } catch { /* KV not available */ }
  }

  return c.json({ status: 'success', data: responseData });
});

/**
 * GET /commodity-trends/latest - 캐시된 최신 보고서 조회
 */
commodityTrends.get('/latest', async (c) => {
  if (!c.env.CACHE) {
    return c.json({ status: 'success', data: null });
  }

  const cached = await c.env.CACHE.get('commodity-trends:latest', 'json') as any;
  return c.json({ status: 'success', data: cached || null });
});

/**
 * 환율 조회 (네이버 금융)
 */
async function fetchExchangeRates(): Promise<Record<string, number>> {
  const res = await fetch(
    'https://m.stock.naver.com/front-api/v1/marketIndex/prices?category=exchange&reutersCode=FX_USDKRW,FX_EURKRW,FX_JPYKRW,FX_CNYKRW',
    { headers: { 'User-Agent': 'C-Auto/1.0' } },
  );
  if (!res.ok) throw new Error('환율 조회 실패');
  const data = (await res.json()) as any;
  const result: Record<string, number> = {};
  for (const item of data.result || []) {
    const code = item.reutersCode;
    const price = parseFloat(item.closePrice || item.marketPrice || '0');
    if (code === 'FX_USDKRW') result.USD_KRW = price;
    if (code === 'FX_EURKRW') result.EUR_KRW = price;
    if (code === 'FX_JPYKRW') result.JPY_KRW = price;
    if (code === 'FX_CNYKRW') result.CNY_KRW = price;
  }
  return result;
}

export default commodityTrends;
