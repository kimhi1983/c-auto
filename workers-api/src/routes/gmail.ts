/**
 * Gmail OAuth2 Routes - /api/v1/gmail
 * 하이웍스 → Gmail POP3 포워딩 후 Gmail API로 메일 조회
 */
import { Hono } from "hono";
import {
  getGmailAuthUrl,
  exchangeGmailCode,
  saveGmailTokens,
  isGmailConfigured,
} from "../services/gmail";
import { authMiddleware, requireAdmin } from "../middleware/auth";
import type { Env } from "../types";

const gmailRouter = new Hono<{ Bindings: Env }>();

/**
 * GET /gmail/status - Gmail 연동 상태 확인
 */
gmailRouter.get("/status", authMiddleware, async (c) => {
  const configured = isGmailConfigured(c.env);
  let tokenValid = false;

  if (configured && c.env.CACHE) {
    const token = await c.env.CACHE.get("gmail:access_token");
    tokenValid = !!token;

    // refresh token만 있어도 연동은 된 상태
    if (!tokenValid) {
      const refresh = await c.env.CACHE.get("gmail:refresh_token");
      tokenValid = !!refresh;
    }
  }

  return c.json({
    status: "success",
    data: {
      configured,
      token_valid: tokenValid,
      has_client_id: !!c.env.GMAIL_CLIENT_ID,
      has_client_secret: !!c.env.GMAIL_CLIENT_SECRET,
      has_kv: !!c.env.CACHE,
    },
  });
});

/**
 * GET /gmail/auth-url - Gmail OAuth 인증 URL 생성 (관리자만)
 */
gmailRouter.get("/auth-url", authMiddleware, requireAdmin, async (c) => {
  if (!c.env.GMAIL_CLIENT_ID) {
    return c.json({ detail: "GMAIL_CLIENT_ID가 설정되지 않았습니다" }, 400);
  }

  const redirectUri = new URL("/api/v1/gmail/callback", c.req.url).toString();
  const authUrl = getGmailAuthUrl(c.env.GMAIL_CLIENT_ID, redirectUri);

  return c.json({
    status: "success",
    data: { auth_url: authUrl, redirect_uri: redirectUri },
  });
});

/**
 * GET /gmail/callback - Google OAuth 콜백
 */
gmailRouter.get("/callback", async (c) => {
  const code = c.req.query("code");
  const error = c.req.query("error");

  if (error) {
    return c.html(`
      <html><body style="font-family:sans-serif;text-align:center;padding:50px">
        <h2>Gmail 인증 실패</h2>
        <p>오류: ${error}</p>
        <p><a href="https://c-auto.pages.dev">돌아가기</a></p>
      </body></html>
    `);
  }

  if (!code) {
    return c.html(`
      <html><body style="font-family:sans-serif;text-align:center;padding:50px">
        <h2>인증 코드 없음</h2>
        <p><a href="https://c-auto.pages.dev">돌아가기</a></p>
      </body></html>
    `);
  }

  if (!c.env.GMAIL_CLIENT_ID || !c.env.GMAIL_CLIENT_SECRET || !c.env.CACHE) {
    return c.json({ detail: "Gmail 설정이 완료되지 않았습니다" }, 500);
  }

  try {
    const redirectUri = new URL("/api/v1/gmail/callback", c.req.url).toString();
    const tokens = await exchangeGmailCode(
      c.env.GMAIL_CLIENT_ID,
      c.env.GMAIL_CLIENT_SECRET,
      code,
      redirectUri
    );

    await saveGmailTokens(c.env.CACHE, tokens);

    return c.html(`
      <html><body style="font-family:sans-serif;text-align:center;padding:50px">
        <h2>Gmail 연동 완료!</h2>
        <p>이제 하이웍스에서 포워딩된 메일을 가져올 수 있습니다.</p>
        <p style="margin-top:20px">
          <a href="https://c-auto.pages.dev" style="display:inline-block;padding:12px 24px;background:#1e293b;color:white;border-radius:10px;text-decoration:none;font-weight:bold">
            C-Auto로 돌아가기
          </a>
        </p>
      </body></html>
    `);
  } catch (err: any) {
    return c.html(`
      <html><body style="font-family:sans-serif;text-align:center;padding:50px">
        <h2>토큰 교환 실패</h2>
        <p>${err.message}</p>
        <p><a href="https://c-auto.pages.dev">돌아가기</a></p>
      </body></html>
    `);
  }
});

export default gmailRouter;
