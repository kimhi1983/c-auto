/**
 * Market Report Generation Routes - /api/v1/market-report
 */
import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { askAIWrite, askAIResearch } from '../services/ai';
import type { Env } from '../types';

const marketReport = new Hono<{ Bindings: Env }>();

marketReport.use('*', authMiddleware);

/**
 * POST /market-report/research - AI 자동 시세 조사
 * 원자재 시세, 시장 동향, 뉴스, 업종 이슈를 AI가 조사하여 반환
 */
marketReport.post('/research', async (c) => {
  const body = await c.req.json<{
    commodityNames: string[];
    date?: string;
  }>();

  const commodityList = (body.commodityNames || []).join(', ');
  const targetDate = body.date || new Date().toISOString().split('T')[0];

  const prompt = `당신은 화장품/올레오케미컬 원자재 시장 전문 애널리스트입니다.
아래 원자재 목록에 대해 최신 시장 정보를 조사하여 JSON 형식으로 반환해주세요.

기준일: ${targetDate}

원자재 목록:
${commodityList}

다음 JSON 형식으로만 응답하세요 (마크다운 코드블록 없이 순수 JSON만):
{
  "commodities": [
    {
      "name": "원자재명 (영문 그대로)",
      "estimatedPrice": "1,050",
      "previousPrice": "1,030",
      "trend": "up 또는 down 또는 stable",
      "note": "간단한 가격 변동 사유"
    }
  ],
  "marketNotes": "원자재 시장 전반의 동향 분석 (3~4문단, 한국어)\\n\\n각 문단은 구체적인 수치와 원인 분석 포함.\\n\\n환율, 유가, 공급망 이슈 등 거시경제 요인 분석.\\n\\n화장품 원료 시장에 미치는 영향 분석.",
  "materialNews": "화장품 원료 관련 최신 뉴스와 이슈 (3~5건, 한국어)\\n\\n1. 뉴스제목 - 상세내용\\n2. 뉴스제목 - 상세내용\\n...",
  "industryOverview": "K-뷰티/화장품 업종 동향 분석 (3~4문단, 한국어)\\n\\n수출 동향, 주요 기업 실적, 시장 트렌드 등 포함."
}

작성 기준:
1. 가격은 해당 원자재의 현실적인 최근 시장가격 기준으로 작성
2. 추세(trend)는 최근 1주일 기준 변동 방향
3. 모든 텍스트 내용은 한국어로, 구체적이고 실무적으로 작성
4. marketNotes는 원자재 가격 동향의 거시적 분석
5. materialNews는 화장품 원료와 관련된 구체적인 뉴스/규제/이슈
6. industryOverview는 K-뷰티 업종 전반의 동향과 트렌드
7. 각 섹션은 실무자가 보고서에 바로 활용할 수 있는 수준`;

  const systemPrompt = `화장품 및 올레오케미컬 원자재 시장 전문 애널리스트입니다.
요청받은 원자재의 시장 가격과 동향 정보를 JSON 형식으로 제공합니다.
반드시 순수 JSON만 반환하세요. 마크다운 코드블록(\`\`\`)을 사용하지 마세요.`;

  const result = await askAIResearch(c.env, prompt, systemPrompt, 8192);

  // Parse JSON - handle markdown code blocks if present
  let cleaned = result.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }

  try {
    const parsed = JSON.parse(cleaned);
    return c.json({ status: 'success', data: parsed });
  } catch {
    // If JSON parsing fails, return raw text for frontend to handle
    return c.json({
      status: 'success',
      data: { raw: result },
      parseError: true,
    });
  }
});

/**
 * POST /market-report/generate - AI 시장자료 보고서 생성
 */
marketReport.post('/generate', async (c) => {
  const body = await c.req.json<{
    title: string;
    issueLabel: string;
    date: string;
    commodities: Array<{
      name: string;
      category: string;
      currentPrice: string;
      previousPrice: string;
      unit: string;
      trend: string;
    }>;
    marketNotes: string;
    materialNews: string;
    industryOverview: string;
    companies: Array<{
      name: string;
      description: string;
      metrics: Array<{ label: string; value: string }>;
    }>;
  }>();

  // Build commodity data section
  let commoditySection = '';
  if (body.commodities?.length) {
    commoditySection = body.commodities.map(c => {
      const trendLabel = c.trend === 'up' ? '▲ 상승' : c.trend === 'down' ? '▼ 하락' : '─ 보합';
      const priceInfo = c.currentPrice
        ? `현재 ${c.currentPrice} ${c.unit}${c.previousPrice ? ` / 전주 ${c.previousPrice} ${c.unit}` : ''}`
        : '가격 미입력';
      return `- ${c.name} (${c.category}): ${priceInfo} [${trendLabel}]`;
    }).join('\n');
  }

  // Build company analysis section
  let companySection = '';
  if (body.companies?.length) {
    companySection = body.companies.map(c => {
      const metricsStr = c.metrics
        .filter(m => m.label && m.value)
        .map(m => `  - ${m.label}: ${m.value}`)
        .join('\n');
      return `### ${c.name}\n${c.description || '(설명 없음)'}\n${metricsStr || '  (재무 지표 미입력)'}`;
    }).join('\n\n');
  }

  const prompt = `아래 입력 데이터를 기반으로 전문적인 주간 시장자료 보고서를 작성해주세요.

보고서 제목: ${body.title || 'KPROS Market Intelligence'}
호수: ${body.issueLabel || ''}
기준일: ${body.date || new Date().toISOString().split('T')[0]}

=== 원자재 시세 데이터 ===
${commoditySection || '(데이터 없음)'}

=== 시장 동향 분석 메모 ===
${body.marketNotes || '(없음)'}

=== 화장품 원료 관련 뉴스/이슈 ===
${body.materialNews || '(없음)'}

=== 업종 동향 ===
${body.industryOverview || '(없음)'}

=== 기업 분석 데이터 ===
${companySection || '(없음)'}

[보고서 작성 규칙]
1. 보고서 구조:
   - # 보고서 제목 (제목 + 호수 + 기준일)
   - ## Weekly Trend (주간 시세 동향)
     - 원자재별 시세 변동 요약 표 (마크다운 테이블)
     - 가격 변동 원인 분석
     - 화장품 원료 시장 영향 분석
     - 관련 뉴스 및 이슈 정리
     - 향후 전망
   - ## Important Issues (주요 이슈)
     - 업종 동향 분석
     - 개별 기업 분석 (재무 지표 표 포함)
     - 투자 포인트 및 리스크 요인

2. 작성 기준:
   - 전문적이고 객관적인 어조 유지
   - 데이터 기반 분석, 구체적인 수치 인용
   - 한국 화장품/K-뷰티 시장 관점에서 분석
   - 마크다운 형식 (표는 | 구분자 사용)
   - 입력 데이터가 부족한 섹션은 일반적인 시장 동향을 기반으로 보완
   - 각 섹션은 실무자가 바로 활용할 수 있는 수준의 인사이트 제공
   - 총 분량은 A4 2~3페이지 수준으로 충실하게 작성`;

  const systemPrompt = `당신은 화장품 및 올레오케미컬 업계 전문 시장 분석가입니다.
주어진 데이터를 분석하여 전문적이고 실무적인 주간 시장자료 보고서를 작성합니다.
K-뷰티 산업과 화장품 원료 시장에 대한 깊은 이해를 바탕으로 인사이트를 제공합니다.
모든 내용은 한국어로 작성하되, 업계 관례상 영어를 쓰는 용어(CPO, ODM, OEM 등)는 영어로 유지합니다.`;

  const result = await askAIWrite(c.env, prompt, systemPrompt, 8192);

  return c.json({
    status: 'success',
    data: { content: result },
  });
});

/**
 * POST /market-report/save - 보고서 저장
 */
marketReport.post('/save', async (c) => {
  const { title, issueLabel, date, content } = await c.req.json<{
    title: string;
    issueLabel: string;
    date: string;
    content: string;
  }>();

  if (!content) {
    return c.json({ detail: '저장할 보고서 내용이 없습니다' }, 400);
  }

  const id = String(Date.now());
  const savedAt = new Date().toISOString();

  await c.env.CACHE.put(
    `market-report:${id}`,
    content,
    {
      metadata: { title: title || '시장자료', issueLabel: issueLabel || '', date: date || '', savedAt },
      expirationTtl: 365 * 24 * 60 * 60,
    }
  );

  return c.json({ status: 'success', id, savedAt });
});

/**
 * GET /market-report/history - 저장된 보고서 목록
 */
marketReport.get('/history', async (c) => {
  const list = await c.env.CACHE.list({ prefix: 'market-report:' });

  const reports = list.keys
    .map(key => ({
      id: key.name.replace('market-report:', ''),
      ...(key.metadata as { title: string; issueLabel: string; date: string; savedAt: string }),
    }))
    .sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''));

  return c.json({ status: 'success', reports });
});

/**
 * GET /market-report/saved/:id - 저장된 보고서 조회
 */
marketReport.get('/saved/:id', async (c) => {
  const id = c.req.param('id');
  const result = await c.env.CACHE.getWithMetadata(`market-report:${id}`);

  if (!result.value) {
    return c.json({ detail: '보고서를 찾을 수 없습니다' }, 404);
  }

  const meta = (result.metadata || {}) as Record<string, string>;
  return c.json({
    status: 'success',
    data: { id, content: result.value, ...meta },
  });
});

/**
 * DELETE /market-report/saved/:id - 저장된 보고서 삭제
 */
marketReport.delete('/saved/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.CACHE.delete(`market-report:${id}`);
  return c.json({ status: 'success' });
});

export default marketReport;
