/**
 * Commodity Trends AI Report - /api/v1/commodity-trends
 * 5개 원자재 가격 + 환율 + 실시간 뉴스를 종합한 AI 트렌드 보고서
 */
import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { askAIResearch } from '../services/ai';
import { fetchYahooFinance, fetchSunSirs } from './commodity-prices';
import type { Env } from '../types';

const commodityTrends = new Hono<{ Bindings: Env }>();

commodityTrends.use('*', authMiddleware);

interface CommoditySnapshot {
  name: string;
  currency: string;
  current_price: number;
  previous_close: number | null;
  change_pct: string;
  recent_prices: string;
}

/**
 * POST /commodity-trends/generate - AI 원료가격트렌드 보고서 생성
 */
commodityTrends.post('/generate', async (c) => {
  const today = new Date().toISOString().split('T')[0];

  // 5개 원자재 + 환율 병렬 fetch
  const [palmOil, naphtha, wti, siliconMetal, dmc, exchangeRates] = await Promise.allSettled([
    fetchYahooFinance('CPO=F', '3mo', '1d'),
    fetchYahooFinance('BZ=F', '3mo', '1d'),
    fetchYahooFinance('CL=F', '3mo', '1d'),
    fetchSunSirs('238'),
    fetchSunSirs('751'),
    fetchExchangeRates(),
  ]);

  // 데이터 정리
  const commodities: CommoditySnapshot[] = [];

  const addCommodity = (
    name: string,
    currency: string,
    result: PromiseSettledResult<any>,
  ) => {
    if (result.status === 'fulfilled') {
      const d = result.value;
      const changePct = d.previous_close
        ? (((d.current_price - d.previous_close) / d.previous_close) * 100).toFixed(2)
        : 'N/A';
      const recentPrices = (d.prices || [])
        .slice(-10)
        .map((p: any) => `${p.date}: ${p.close}`)
        .join(', ');
      commodities.push({
        name,
        currency,
        current_price: d.current_price,
        previous_close: d.previous_close,
        change_pct: changePct,
        recent_prices: recentPrices,
      });
    } else {
      commodities.push({
        name,
        currency,
        current_price: 0,
        previous_close: null,
        change_pct: 'N/A',
        recent_prices: '데이터 조회 실패',
      });
    }
  };

  addCommodity('팜오일 (CPO) · CME 선물 · USD/톤', 'USD', palmOil);
  addCommodity('납사 (Naphtha) · Brent Crude 기준 · USD/배럴', 'USD', naphtha);
  addCommodity('원유 WTI · NYMEX 선물 · USD/배럴', 'USD', wti);
  addCommodity('메탈 실리콘 (Silicon Metal) #441 · CNY/톤', 'CNY', siliconMetal);
  addCommodity('실리콘 DMC (Dimethylcyclosiloxane) · CNY/톤', 'CNY', dmc);

  // 환율 정보
  let exchangeInfo = '환율 데이터 없음';
  if (exchangeRates.status === 'fulfilled') {
    const rates = exchangeRates.value;
    exchangeInfo = `USD/KRW: ${rates.USD_KRW || 'N/A'}, CNY/KRW: ${rates.CNY_KRW || 'N/A'}, EUR/KRW: ${rates.EUR_KRW || 'N/A'}, JPY/KRW: ${rates.JPY_KRW || 'N/A'}`;
  }

  // 원자재 데이터 섹션 구성
  const commodityDataSection = commodities.map((c) => {
    const changeLabel = c.change_pct !== 'N/A'
      ? (parseFloat(c.change_pct) >= 0 ? `▲ +${c.change_pct}%` : `▼ ${c.change_pct}%`)
      : '변동률 불명';
    return `### ${c.name}
- 현재가: ${c.current_price > 0 ? `${c.currency === 'USD' ? '$' : '¥'}${c.current_price.toLocaleString()}` : '조회 실패'}
- 전일 대비: ${changeLabel}
- 최근 10일 가격: ${c.recent_prices}`;
  }).join('\n\n');

  const prompt = `기준일: ${today}

=== 실시간 원자재 가격 데이터 (5종) ===
${commodityDataSection}

=== 환율 정보 ===
${exchangeInfo}

위의 실제 가격 데이터를 기반으로, 인터넷에서 최신 뉴스와 리포트를 검색하여 종합적인 **원료가격트렌드 분석 보고서**를 작성하세요.

[보고서 필수 구조]
1. **Executive Summary (요약)** - 전체 원자재 시장 흐름을 3~5줄로 요약
2. **원자재별 상세 분석** - 5개 원자재 각각에 대해:
   - 현재 가격 및 추세 (실제 데이터 인용)
   - 가격 변동 원인 분석 (수급, 정책, 국제 이슈)
   - 마크다운 표로 가격 데이터 정리
3. **환율 동향 및 원가 영향** - 환율 변동이 원자재 수입 원가에 미치는 영향
4. **글로벌 시장 뉴스 & 이슈** - 인터넷 검색으로 확인한 최신 뉴스 5~8건 (출처 포함)
5. **K-뷰티/화장품 원료 시장 영향 분석** - 화장품·올레오케미컬 원료 시장에 미치는 실질적 영향
6. **향후 전망 & 리스크 요인** - 향후 1~3개월 전망, 주의해야 할 리스크

[작성 규칙]
- 전문 애널리스트 수준의 깊이 있는 분석
- 모든 분석은 한국어로 작성, 업계 용어(CPO, WTI, DMC 등)는 영어 유지
- 실제 제공된 가격 데이터를 반드시 인용하여 분석
- 구체적인 수치와 퍼센트 포함
- 마크다운 형식 (표, 볼드, 리스트 활용)
- A4 3~4페이지 분량으로 충실하게 작성
- 보고서 제목은 "KPROS 원료가격트렌드 분석 보고서" + 날짜`;

  const systemPrompt = `당신은 세계 최고 수준의 원자재 및 올레오케미컬 시장 수석 애널리스트입니다.
Goldman Sachs, Morgan Stanley, Bloomberg 급의 전문 분석 역량을 보유하고 있습니다.

전문 분야:
- 팜오일, 납사, 원유 등 에너지·농산물 원자재 시장 분석
- 실리콘 소재(메탈 실리콘, DMC 등) 중국 시장 동향
- K-뷰티/화장품 원료 공급망 및 원가 구조
- 글로벌 매크로 경제와 원자재 시장의 상관관계

분석 원칙:
1. 데이터 기반의 객관적 분석 (제공된 실제 가격 데이터 활용)
2. Google Search로 확인한 최신 뉴스와 리포트 반영
3. 화장품 원료 기업(KPROS) 경영진에게 실무적 인사이트 제공
4. 단순 나열이 아닌, 원인-결과-전망의 논리적 흐름
5. 모든 내용은 한국어로 작성`;

  try {
    const report = await askAIResearch(c.env, prompt, systemPrompt, 8192);

    // KV 캐시에 저장 (24시간)
    if (c.env.CACHE) {
      try {
        await c.env.CACHE.put(
          `commodity-trends:latest`,
          JSON.stringify({ content: report, generated_at: new Date().toISOString(), date: today }),
          { expirationTtl: 86400 },
        );
      } catch { /* KV not available */ }
    }

    return c.json({
      status: 'success',
      data: {
        content: report,
        generated_at: new Date().toISOString(),
        date: today,
        commodities_fetched: commodities.filter(c => c.current_price > 0).length,
      },
    });
  } catch (e: any) {
    return c.json({
      status: 'error',
      message: e.message || 'AI 보고서 생성 실패',
    }, 500);
  }
});

/**
 * GET /commodity-trends/latest - 캐시된 최신 보고서 조회
 */
commodityTrends.get('/latest', async (c) => {
  if (!c.env.CACHE) {
    return c.json({ status: 'error', message: 'KV 캐시 사용 불가' }, 500);
  }

  const cached = await c.env.CACHE.get('commodity-trends:latest', 'json') as any;
  if (!cached) {
    return c.json({ status: 'success', data: null });
  }

  return c.json({ status: 'success', data: cached });
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
