/**
 * Gmail API 연동 서비스
 *
 * 구성: 하이웍스(가비아) → Gmail POP3 포워딩 → Gmail API → Cloudflare Workers
 *
 * Gmail 설정:
 * 1. Gmail > 설정 > 계정 및 가져오기 > '다른 계정의 메일 확인하기'
 *    - POP3 서버: pop3.hiworks.com, 포트: 995, SSL
 *    - 하이웍스 이메일/비밀번호 입력
 * 2. Google Cloud Console > Gmail API 활성화
 *    - OAuth 2.0 클라이언트 ID 생성 (웹 애플리케이션)
 *    - 리다이렉트 URI: https://c-auto-workers-api.kimhi1983.workers.dev/api/v1/gmail/callback
 * 3. Cloudflare Workers Secrets 설정:
 *    - wrangler secret put GMAIL_CLIENT_ID
 *    - wrangler secret put GMAIL_CLIENT_SECRET
 */

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
].join(" ");

// KV 키
const KV_GMAIL_ACCESS = "gmail:access_token";
const KV_GMAIL_REFRESH = "gmail:refresh_token";

// ─── 타입 정의 ───

export interface GmailTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

interface GmailMessageHeader {
  name: string;
  value: string;
}

interface GmailMessagePart {
  mimeType: string;
  headers?: GmailMessageHeader[];
  body?: { size: number; data?: string };
  parts?: GmailMessagePart[];
}

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet: string;
  payload: {
    headers: GmailMessageHeader[];
    mimeType: string;
    body?: { size: number; data?: string };
    parts?: GmailMessagePart[];
  };
  internalDate: string;
}

export interface GmailListResponse {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
  resultSizeEstimate: number;
}

export interface ParsedEmail {
  messageId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  body: string;
  bodyHtml: string;
  snippet: string;
}

// ─── OAuth2 인증 ───

export function getGmailAuthUrl(clientId: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPES,
    access_type: "offline",
    prompt: "consent",
  });
  return `${GOOGLE_AUTH_URL}?${params}`;
}

export async function exchangeGmailCode(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string
): Promise<GmailTokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gmail token exchange failed: ${res.status} ${text}`);
  }

  return res.json();
}

async function refreshGmailToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<GmailTokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gmail token refresh failed: ${res.status} ${text}`);
  }

  return res.json();
}

// ─── KV 토큰 관리 ───

export async function saveGmailTokens(
  kv: KVNamespace,
  tokens: GmailTokenResponse
): Promise<void> {
  await kv.put(KV_GMAIL_ACCESS, tokens.access_token, {
    expirationTtl: tokens.expires_in,
  });
  if (tokens.refresh_token) {
    await kv.put(KV_GMAIL_REFRESH, tokens.refresh_token);
  }
}

export async function getGmailAccessToken(
  kv: KVNamespace,
  clientId: string,
  clientSecret: string
): Promise<string | null> {
  // 1) 캐시된 access token 확인
  const cached = await kv.get(KV_GMAIL_ACCESS);
  if (cached) return cached;

  // 2) refresh token으로 갱신
  const refreshToken = await kv.get(KV_GMAIL_REFRESH);
  if (!refreshToken) return null;

  try {
    const newTokens = await refreshGmailToken(clientId, clientSecret, refreshToken);
    await saveGmailTokens(kv, newTokens);
    return newTokens.access_token;
  } catch {
    return null;
  }
}

// ─── Gmail API 호출 ───

/**
 * 받은편지함 메일 목록 조회
 */
export async function listGmailMessages(
  accessToken: string,
  maxResults = 10,
  query = "in:inbox"
): Promise<GmailListResponse> {
  const params = new URLSearchParams({
    maxResults: maxResults.toString(),
    q: query,
  });

  const res = await fetch(`${GMAIL_API_BASE}/messages?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gmail messages.list failed: ${res.status} ${text}`);
  }

  return res.json();
}

/**
 * 메일 상세 조회
 */
export async function getGmailMessage(
  accessToken: string,
  messageId: string
): Promise<GmailMessage> {
  const res = await fetch(`${GMAIL_API_BASE}/messages/${messageId}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gmail messages.get failed: ${res.status} ${text}`);
  }

  return res.json();
}

// ─── 메일 파싱 ───

function getHeader(headers: GmailMessageHeader[], name: string): string {
  const h = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return h?.value || "";
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return atob(base64);
  } catch {
    return "";
  }
}

function extractBody(payload: GmailMessage["payload"]): { text: string; html: string } {
  let text = "";
  let html = "";

  if (payload.body?.data) {
    const decoded = decodeBase64Url(payload.body.data);
    if (payload.mimeType === "text/html") {
      html = decoded;
    } else {
      text = decoded;
    }
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        text = decodeBase64Url(part.body.data);
      } else if (part.mimeType === "text/html" && part.body?.data) {
        html = decodeBase64Url(part.body.data);
      } else if (part.parts) {
        // multipart/alternative 내부
        for (const sub of part.parts) {
          if (sub.mimeType === "text/plain" && sub.body?.data) {
            text = decodeBase64Url(sub.body.data);
          } else if (sub.mimeType === "text/html" && sub.body?.data) {
            html = decodeBase64Url(sub.body.data);
          }
        }
      }
    }
  }

  // HTML에서 텍스트 추출 (text가 비어있는 경우)
  if (!text && html) {
    text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  return { text, html };
}

export function parseGmailMessage(msg: GmailMessage): ParsedEmail {
  const headers = msg.payload.headers;
  const { text, html } = extractBody(msg.payload);

  return {
    messageId: msg.id,
    subject: getHeader(headers, "Subject") || "(제목 없음)",
    from: getHeader(headers, "From"),
    to: getHeader(headers, "To"),
    date: getHeader(headers, "Date") || new Date(parseInt(msg.internalDate)).toISOString(),
    body: text,
    bodyHtml: html,
    snippet: msg.snippet,
  };
}

// ─── 헬퍼 ───

export function isGmailConfigured(env: {
  GMAIL_CLIENT_ID?: string;
  GMAIL_CLIENT_SECRET?: string;
  CACHE?: KVNamespace;
}): boolean {
  return !!(env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET && env.CACHE);
}
