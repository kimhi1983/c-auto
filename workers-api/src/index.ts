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
import gmail from './routes/gmail';
import dropbox from './routes/dropbox';
import erp from './routes/erp';
import marketReport from './routes/market-report';
import aiRouter from './routes/ai';
import commodityPrices from './routes/commodity-prices';
import commodityTrends from './routes/commodity-trends';
import { getAIEngineStatus, classifyEmailAdvanced } from './services/ai';
import { isGmailConfigured, getGmailAccessToken, listGmailMessagesAll, getGmailMessage, parseGmailMessage, downloadGmailAttachment, base64UrlToBase64 } from './services/gmail';
import { isDropboxConfigured, getDropboxAccessToken as getDropboxToken, uploadAttachmentToDropbox } from './services/dropbox';
import { drizzle } from 'drizzle-orm/d1';
import { eq, lt, like, desc, sql } from 'drizzle-orm';
import { emails, emailAttachments, emailApprovals } from './db/schema';
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
app.route('/api/v1/gmail', gmail);
app.route('/api/v1/dropbox', dropbox);
app.route('/api/v1/erp', erp);
app.route('/api/v1/market-report', marketReport);
app.route('/api/v1/ai', aiRouter);
app.route('/api/v1/commodity-prices', commodityPrices);
app.route('/api/v1/commodity-trends', commodityTrends);

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

// ═══════════════════════════════════════════
// Cron Scheduled Handler - 실시간 메일 수신 + 30일 자동삭제
// ═══════════════════════════════════════════

function normalizeDate(dateStr: string | null | undefined, fallback: string): string {
  if (!dateStr) return fallback;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return fallback;
    return d.toISOString();
  } catch {
    return fallback;
  }
}

async function scheduledEmailFetch(env: Env) {
  if (!isGmailConfigured(env)) return;

  const db = drizzle(env.DB);
  const now = new Date().toISOString();

  // ── 1. 30일 지난 메일 자동삭제 ──
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 30);
  const cutoffStr = cutoffDate.toISOString().split("T")[0];

  try {
    // 관련 테이블 먼저 삭제 (FK 제약)
    const oldEmailIds = await db
      .select({ id: emails.id })
      .from(emails)
      .where(lt(emails.receivedAt, cutoffStr));

    if (oldEmailIds.length > 0) {
      const ids = oldEmailIds.map(e => e.id);
      for (const id of ids) {
        await db.delete(emailAttachments).where(eq(emailAttachments.emailId, id));
        await db.delete(emailApprovals).where(eq(emailApprovals.emailId, id));
      }
      await db.delete(emails).where(lt(emails.receivedAt, cutoffStr));
      console.log(`[Cron] ${oldEmailIds.length}건 30일 경과 메일 삭제`);
    }
  } catch (err: any) {
    console.error("[Cron] 30일 메일 삭제 실패:", err.message);
  }

  // ── 2. Gmail에서 새 메일 가져오기 ──
  try {
    const accessToken = await getGmailAccessToken(
      env.CACHE!,
      env.GMAIL_CLIENT_ID!,
      env.GMAIL_CLIENT_SECRET!
    );
    if (!accessToken) {
      console.error("[Cron] Gmail 인증 만료");
      return;
    }

    // 최근 2일치만 조회 (cron은 자주 실행되므로)
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const afterEpoch = Math.floor(twoDaysAgo.getTime() / 1000);
    const gmailQuery = `label:KPROS after:${afterEpoch}`;

    const messageRefs = await listGmailMessagesAll(accessToken, 50, gmailQuery);
    if (messageRefs.length === 0) {
      console.log("[Cron] 새 메일 없음");
      return;
    }

    let saved = 0;
    const BATCH_SIZE = 10;

    for (let i = 0; i < messageRefs.length; i += BATCH_SIZE) {
      const batch = messageRefs.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (ref) => {
          // 중복 확인
          const [existing] = await db
            .select({ id: emails.id })
            .from(emails)
            .where(eq(emails.externalId, `gmail-${ref.id}`))
            .limit(1);
          if (existing) return null;

          const fullMsg = await getGmailMessage(accessToken, ref.id);
          const parsed = parseGmailMessage(fullMsg);
          const isOurMail = /kpros\.kr/i.test(parsed.from || "");

          const [inserted] = await db
            .insert(emails)
            .values({
              externalId: `gmail-${ref.id}`,
              subject: parsed.subject,
              sender: parsed.from,
              recipient: parsed.to || "",
              body: parsed.body,
              bodyHtml: parsed.bodyHtml || null,
              category: "필터링" as any,
              priority: "medium" as any,
              status: isOurMail ? "sent" : "unread",
              aiSummary: null,
              aiDraftResponse: null,
              draftSubject: null,
              aiConfidence: 0,
              processedBy: 1,
              receivedAt: normalizeDate(parsed.date, now),
              processedAt: now,
            })
            .returning();

          // 첨부파일 메타데이터
          if (parsed.attachments.length > 0) {
            for (const att of parsed.attachments) {
              await db.insert(emailAttachments).values({
                emailId: inserted.id,
                fileName: att.fileName,
                filePath: att.attachmentId || null,
                fileSize: att.fileSize,
                contentType: att.contentType,
              });
            }
          }

          // AI 분류 (보낸메일은 스킵)
          if (isOurMail) {
            const sentSummary = JSON.stringify({
              code: "-", summary: `KPROS에서 발송한 메일`, importance: "하",
              action_items: "", search_keywords: [], director_report: "당사 발송 메일",
              needs_approval: false, company_name: "KPROS(자사)", sender_info: parsed.from,
              estimated_revenue: "", note: "보낸메일", direction: "outbound",
            });
            await db.update(emails).set({
              category: "필터링" as any, priority: "low" as any, status: "sent",
              aiSummary: sentSummary, aiConfidence: 100,
            }).where(eq(emails.id, inserted.id));
          } else {
            try {
              const classification = await classifyEmailAdvanced(env, parsed.from, parsed.subject, parsed.body || "", parsed.to || "");
              const jsonMatch = classification.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const p = JSON.parse(jsonMatch[0]);
                const category = p.category || "필터링";
                const aiSummaryJson = JSON.stringify({
                  code: p.code || "E", summary: p.summary || "", importance: p.importance || "하",
                  action_items: p.action_items || "", search_keywords: p.search_keywords || [],
                  director_report: p.director_report || "", needs_approval: p.needs_approval ?? true,
                  company_name: p.company_name || "", sender_info: p.sender_info || "",
                  estimated_revenue: p.estimated_revenue || "", note: p.note || "",
                  direction: p.direction || "inbound", request_type: p.request_type || "",
                });
                await db.update(emails).set({
                  category: category as any, priority: (p.priority || "medium") as any,
                  status: category === "필터링" ? "read" : "unread",
                  aiSummary: aiSummaryJson, aiDraftResponse: p.draft_reply || null,
                  draftSubject: p.draft_subject || null, aiConfidence: p.confidence || 0,
                }).where(eq(emails.id, inserted.id));
              }
            } catch (err) {
              console.error(`[Cron] AI 분류 실패 (id=${inserted.id}):`, err);
            }
          }

          return inserted.id;
        })
      );

      for (const r of results) {
        if (r.status === "fulfilled" && r.value) saved++;
      }
    }

    console.log(`[Cron] ${saved}건 새 메일 저장 완료`);

    // ── 3. 첨부파일 Dropbox 자동 저장 ──
    if (saved > 0 && isDropboxConfigured(env)) {
      try {
        const dropboxToken = await getDropboxToken(
          env.CACHE!,
          env.DROPBOX_APP_KEY!,
          env.DROPBOX_APP_SECRET!
        );
        if (dropboxToken) {
          // dropbox_path가 없는 첨부파일 조회 (최근 2일 이메일)
          const recentAttachments = await db.all(sql`
            SELECT ea.id, ea.email_id, ea.file_name, ea.file_path, ea.file_size, ea.dropbox_path,
                   e.external_id, e.category, e.received_at
            FROM email_attachments ea
            JOIN emails e ON ea.email_id = e.id
            WHERE ea.file_path IS NOT NULL
              AND ea.dropbox_path IS NULL
              AND ea.file_size <= 10485760
              AND e.received_at >= ${twoDaysAgo.toISOString().split("T")[0]}
            LIMIT 20
          `);

          for (const att of recentAttachments as any[]) {
            try {
              const gmailMsgId = (att.external_id || "").replace("gmail-", "");
              if (!gmailMsgId) continue;

              const downloaded = await downloadGmailAttachment(accessToken, gmailMsgId, att.file_path);
              const b64 = downloaded.data.replace(/-/g, "+").replace(/_/g, "/");
              const binStr = atob(b64);
              const bytes = new Uint8Array(binStr.length);
              for (let k = 0; k < binStr.length; k++) bytes[k] = binStr.charCodeAt(k);

              const category = att.category || "필터링";
              const dateStr = (att.received_at || new Date().toISOString()).split("T")[0];

              const result = await uploadAttachmentToDropbox(
                dropboxToken, category, dateStr, att.file_name, bytes
              );

              await db.update(emailAttachments)
                .set({ dropboxPath: result.path })
                .where(eq(emailAttachments.id, att.id));

              console.log(`[Cron][Dropbox] Saved: ${result.path}`);
            } catch (e: any) {
              console.error(`[Cron][Dropbox] Upload failed for ${att.file_name}:`, e.message);
            }
          }
        }
      } catch (e: any) {
        console.error("[Cron][Dropbox] Auto-save error:", e.message);
      }
    }
  } catch (err: any) {
    console.error("[Cron] Gmail fetch 실패:", err.message);
  }
}

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(scheduledEmailFetch(env));
  },
};
