import { Hono } from 'hono';
import { askAIAnalyze } from '../services/ai';
import type { Env, UserContext } from '../types';

const ai = new Hono<{ Bindings: Env; Variables: { user: UserContext } }>();

// ─── AI 분석 (재고, 문서 등) ───
// Note: 인증 없이 사용 가능 (내부 시스템용)
ai.post('/analyze', async (c) => {
  try {
    const { prompt, systemPrompt, maxTokens } = await c.req.json();

    if (!prompt) {
      return c.json({ status: 'error', message: 'prompt가 필요합니다.' }, 400);
    }

    const analysis = await askAIAnalyze(
      c.env,
      prompt,
      systemPrompt || '당신은 비즈니스 데이터 분석 전문가입니다.',
      maxTokens || 4096
    );

    return c.json({
      status: 'success',
      analysis,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[AI 분석 오류]', error);
    return c.json({
      status: 'error',
      message: error.message || 'AI 분석 중 오류가 발생했습니다.',
    }, 500);
  }
});

export default ai;
