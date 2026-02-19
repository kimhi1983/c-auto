import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { trimTrailingSlash } from 'hono/trailing-slash';
import auth from './routes/auth';
import emailsRouter from './routes/emails';
import inventory from './routes/inventory';
import rates from './routes/exchange-rates';
import archives from './routes/archives';
import usersRouter from './routes/users';
import files from './routes/files';
import aiDocs from './routes/ai-docs';
import gmail from './routes/gmail';
import dropbox from './routes/dropbox';
import erp from './routes/erp';
import marketReport from './routes/market-report';
import aiRouter from './routes/ai';
import { getAIEngineStatus } from './services/ai';
import type { Env, UserContext } from './types';

const app = new Hono<{ Bindings: Env; Variables: { user: UserContext } }>();

// 미들웨어 설정 (CORS를 최우선 적용 → 리다이렉트 응답에도 CORS 헤더 포함)
app.use('*', async (c, next) => {
  const allowedOrigins = (c.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const origin = c.req.header('Origin');

  // 정확한 매칭 또는 *.c-auto.pages.dev 프리뷰 URL 허용
  const isAllowed = origin && (
    allowedOrigins.includes(origin) ||
    /^https:\/\/[a-z0-9-]+\.c-auto\.pages\.dev$/.test(origin)
  );
  const allowOrigin = isAllowed ? origin : allowedOrigins[0] || '*';

  const corsMiddleware = cors({
    origin: allowOrigin,
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['POST', 'GET', 'OPTIONS', 'PUT', 'DELETE', 'PATCH'],
    exposeHeaders: ['Content-Length'],
    maxAge: 600,
  });
  return corsMiddleware(c, next);
});

app.use(trimTrailingSlash());
app.use('*', logger());

// 라우터 등록
app.route('/api/v1/auth', auth);
app.route('/api/v1/emails', emailsRouter);
app.route('/api/v1/inventory', inventory);
app.route('/api/v1/exchange-rates', rates);
app.route('/api/v1/archives', archives);
app.route('/api/v1/users', usersRouter);
app.route('/api/v1/files', files);
app.route('/api/v1/ai-docs', aiDocs);
app.route('/api/v1/gmail', gmail);
app.route('/api/v1/dropbox', dropbox);
app.route('/api/v1/erp', erp);
app.route('/api/v1/market-report', marketReport);
app.route('/api/v1/ai', aiRouter);

// 상태 확인 라우트
app.get('/api/status', (c) => {
  return c.json({
    status: 'success',
    message: '시스템이 정상 작동 중입니다.',
    version: '3.0.0',
    env: c.env.ENVIRONMENT,
  });
});

// AI 엔진 상태 (인증 불필요)
app.get('/api/v1/ai/status', (c) => {
  return c.json({
    status: 'success',
    data: getAIEngineStatus(c.env),
  });
});

// 기본 라우트
app.get('/', (c) => {
  return c.json({
    message: 'C-Auto Workers API v3.0',
    status: 'operational',
    env: c.env.ENVIRONMENT,
  });
});

export default app;
