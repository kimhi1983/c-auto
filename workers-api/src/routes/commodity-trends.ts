/**
 * Commodity Trends AI Report - /api/v1/commodity-trends
 * 5개 원자재 가격 + 환율 + AI 전문가 분석
 */
import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { askAIResearchPro } from '../services/ai';
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

위 데이터를 기반으로 전문가 분석 보고서를 작성하세요.
데이터 표나 가격 나열은 절대 하지 마세요. 분석과 인사이트에만 집중하세요.
최신 뉴스와 시장 동향을 Google Search로 확인하여 반영하세요.

다음 10개 섹션을 각각 작성하세요. 각 섹션은 "## 섹션제목" 헤더로 시작합니다:

## 시장 총평
글로벌 원자재 시장의 전체 흐름을 5~6문장으로 요약. 거시경제 환경(금리, 인플레이션, 경기), 지정학적 요인, 에너지 시장 동향을 포함하여 핵심 트렌드와 주요 변동 원인을 분석.

## 원자재별 심층 분석
5개 원자재(팜오일, 납사, WTI, 메탈실리콘, DMC) 각각을 "### 원자재명" 소제목으로 분리. 각 원자재를 4~5문장으로 분석: (1) 최근 가격 변동의 근본 원인, (2) 수급 밸런스와 재고 상황, (3) 주요 생산국/소비국 동향, (4) 단기 가격 방향성 전망.

## 환율 및 거시경제 분석
USD/KRW, CNY/KRW 환율 동향과 영향 요인 분석. 미국 연준(Fed) 통화정책, 중국 경제 지표, 한국 수출입 동향이 원료 수입 비용에 미치는 영향. 4~5문장.

## 공급망 및 물류 동향
글로벌 물류비(해상운임, 컨테이너), 주요 교역로(말라카 해협, 수에즈 운하) 상황, 원료 수입 리드타임 변화. 공급망 병목이나 개선 사항. 3~4문장.

## 주요 뉴스 및 이슈
최근 1~2주 내 원자재/화학/화장품 원료 관련 주요 뉴스 5~7건. 각 항목을 "- **제목**: 내용(2~3문장)" 형식의 리스트로 작성. Google Search로 확인된 구체적이고 최신 뉴스만 포함. 출처도 간략히 언급.

## 화장품·올레오케미컬 산업 동향
K-뷰티 시장 트렌드, 글로벌 화장품 원료 수요 변화, 주요 원료 (유화제, 계면활성제, 실리콘, 천연 오일) 시장 동향. 규제 변화(EU 화장품 규정, 중국 NMPA 등) 영향. 4~5문장.

## 경쟁사 및 업계 동향
글로벌 주요 올레오케미컬/화학 기업(Wilmar, IOI, KLK, Dow, Shin-Etsu 등)의 최근 움직임. 업계 M&A, 증설/감산 계획, 가격 정책 변화. 3~4문장.

## 전략적 시사점
KPROS와 같은 한국 화장품 원료 전문기업 관점에서의 구체적 시사점. 원가 관리 전략, 대체 원료 검토 필요성, 구매 타이밍 조언, 재고 전략. 4~5문장으로 실행 가능한 제안 포함.

## 리스크 요인
향후 1~3개월 내 주의해야 할 리스크 5가지를 "- **리스크명**: 설명" 형식으로 나열. 지정학, 기후, 규제, 수급, 환율 리스크를 각각 구체적으로 기술.

## 향후 전망
향후 1개월, 3개월 시점의 원자재 시장 전망. 핵심 변수(OPEC+ 정책, 팜오일 수확기, 중국 경기부양 등)와 시나리오(강세/약세/횡보). 5~6문장으로 종합 전망 제시.`;

  const systemPrompt = `당신은 글로벌 원자재 시장 수석 애널리스트이자 올레오케미컬/화장품 원료 산업 전문가입니다.
20년 이상 경력의 시장 분석가로서, 한국 화장품 원료 기업(KPROS) 경영진에게 심층적이고 날카로운 인사이트를 제공합니다.

[분석 원칙]
- 모든 내용은 한국어로 작성하되 업계 용어(CPO, WTI, DMC, OPEC+, Fed 등)는 영어로 유지
- 데이터 표를 만들지 말고 서술형 분석과 인사이트에만 집중
- Google Search를 활용하여 최신 뉴스와 시장 데이터를 반영
- 단순한 가격 변동 보고가 아닌, 원인·영향·대응방안 중심의 전문가 분석
- 화장품 원료 기업의 실무적 관점에서 바로 활용 가능한 인사이트 제공
- 불확실한 정보는 추측이라고 명시, 확인된 사실과 구분`;

  let analysis = '';
  try {
    analysis = await askAIResearchPro(c.env, prompt, systemPrompt, 8192);
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
