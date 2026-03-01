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
  filename?: string;
  headers?: GmailMessageHeader[];
  body?: { size: number; data?: string; attachmentId?: string };
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

export interface ParsedAttachment {
  fileName: string;
  contentType: string;
  fileSize: number;
  attachmentId?: string;
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
  attachments: ParsedAttachment[];
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
 * 받은편지함 메일 목록 조회 (단일 페이지)
 */
export async function listGmailMessages(
  accessToken: string,
  maxResults = 10,
  query = "in:inbox",
  pageToken?: string
): Promise<GmailListResponse> {
  const params = new URLSearchParams({
    maxResults: maxResults.toString(),
    q: query,
  });
  if (pageToken) params.set("pageToken", pageToken);

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
 * 페이지네이션으로 여러 페이지 메일 ID 수집 (최대 totalMax개)
 * Gmail API는 페이지당 최대 500개, 기본 100개
 */
export async function listGmailMessagesAll(
  accessToken: string,
  totalMax: number,
  query = "in:inbox"
): Promise<Array<{ id: string; threadId: string }>> {
  const allMessages: Array<{ id: string; threadId: string }> = [];
  let pageToken: string | undefined;
  const perPage = Math.min(totalMax, 100); // Gmail API 권장 페이지 크기

  while (allMessages.length < totalMax) {
    const res = await listGmailMessages(accessToken, perPage, query, pageToken);
    if (res.messages) {
      allMessages.push(...res.messages);
    }
    if (!res.nextPageToken || allMessages.length >= totalMax) break;
    pageToken = res.nextPageToken;
  }

  return allMessages.slice(0, totalMax);
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
    const binaryStr = atob(base64);
    // atob()은 Latin-1 바이트 문자열을 반환하므로, UTF-8 한글이 깨짐
    // Uint8Array로 변환 후 TextDecoder로 UTF-8 디코딩
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return new TextDecoder("utf-8").decode(bytes);
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

/**
 * MIME parts에서 첨부파일 메타데이터 추출
 */
function extractAttachments(parts?: GmailMessagePart[]): ParsedAttachment[] {
  const attachments: ParsedAttachment[] = [];
  if (!parts) return attachments;

  for (const part of parts) {
    // filename이 있는 파트는 첨부파일
    if (part.filename && part.filename.length > 0) {
      attachments.push({
        fileName: part.filename,
        contentType: part.mimeType || "application/octet-stream",
        fileSize: part.body?.size || 0,
        attachmentId: part.body?.attachmentId,
      });
    }
    // 중첩된 multipart 파트도 탐색
    if (part.parts) {
      attachments.push(...extractAttachments(part.parts));
    }
  }

  return attachments;
}

export function parseGmailMessage(msg: GmailMessage): ParsedEmail {
  const headers = msg.payload.headers;
  const { text, html } = extractBody(msg.payload);
  const attachments = extractAttachments(msg.payload.parts);

  return {
    messageId: msg.id,
    subject: getHeader(headers, "Subject") || "(제목 없음)",
    from: getHeader(headers, "From"),
    to: getHeader(headers, "To"),
    date: getHeader(headers, "Date") || new Date(parseInt(msg.internalDate)).toISOString(),
    body: text,
    bodyHtml: html,
    snippet: msg.snippet,
    attachments,
  };
}

// ─── 첨부파일 다운로드 ───

/**
 * Gmail 첨부파일 내용 다운로드
 * @returns base64url 인코딩된 파일 데이터
 */
export async function downloadGmailAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string
): Promise<{ data: string; size: number }> {
  const res = await fetch(
    `${GMAIL_API_BASE}/messages/${messageId}/attachments/${attachmentId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gmail attachment download failed: ${res.status} ${text}`);
  }

  return res.json();
}

/**
 * base64url → 표준 base64 변환 (AI API에서 사용)
 */
export function base64UrlToBase64(data: string): string {
  return data.replace(/-/g, "+").replace(/_/g, "/");
}

/**
 * base64url → UTF-8 텍스트 디코딩 (텍스트 파일용)
 */
export function decodeAttachmentToText(data: string): string {
  return decodeBase64Url(data);
}

// ─── 메일 발송 ───

/**
 * RFC 2822 형식 이메일 메시지 생성
 */
function buildRawEmail(options: {
  to: string;
  from: string;
  cc?: string;
  subject: string;
  body: string;
  inReplyTo?: string;
}): string {
  const lines = [
    `To: ${options.to}`,
    `From: ${options.from}`,
  ];
  if (options.cc) lines.push(`Cc: ${options.cc}`);
  lines.push(`Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(options.subject)))}?=`);
  lines.push("MIME-Version: 1.0");
  lines.push("Content-Type: text/plain; charset=UTF-8");
  lines.push("Content-Transfer-Encoding: base64");
  if (options.inReplyTo) lines.push(`In-Reply-To: ${options.inReplyTo}`);
  lines.push(""); // blank line separating headers from body
  // base64 encode the body
  lines.push(btoa(unescape(encodeURIComponent(options.body))));
  return lines.join("\r\n");
}

/**
 * MIME multipart/mixed 이메일 생성 (본문 + 첨부파일)
 */
export interface EmailAttachmentData {
  fileName: string;
  contentType: string;
  base64Data: string; // standard base64
}

function buildRawEmailWithAttachments(options: {
  to: string;
  from: string;
  cc?: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  attachments: EmailAttachmentData[];
}): string {
  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const headers = [
    `To: ${options.to}`,
    `From: ${options.from}`,
  ];
  if (options.cc) headers.push(`Cc: ${options.cc}`);
  headers.push(`Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(options.subject)))}?=`);
  headers.push("MIME-Version: 1.0");
  headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  if (options.inReplyTo) headers.push(`In-Reply-To: ${options.inReplyTo}`);
  headers.push(""); // blank line

  const parts: string[] = [];

  // Text body part
  parts.push(`--${boundary}`);
  parts.push("Content-Type: text/plain; charset=UTF-8");
  parts.push("Content-Transfer-Encoding: base64");
  parts.push("");
  parts.push(btoa(unescape(encodeURIComponent(options.body))));

  // Attachment parts
  for (const att of options.attachments) {
    const encodedName = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(att.fileName)))}?=`;
    parts.push(`--${boundary}`);
    parts.push(`Content-Type: ${att.contentType}; name="${encodedName}"`);
    parts.push(`Content-Disposition: attachment; filename="${encodedName}"`);
    parts.push("Content-Transfer-Encoding: base64");
    parts.push("");
    // Split base64 into 76-char lines per RFC
    const b64 = att.base64Data;
    for (let i = 0; i < b64.length; i += 76) {
      parts.push(b64.slice(i, i + 76));
    }
  }

  parts.push(`--${boundary}--`);

  return headers.join("\r\n") + "\r\n" + parts.join("\r\n");
}

/**
 * base64 → base64url 변환 (Gmail API 용)
 */
function base64ToBase64Url(str: string): string {
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Uint8Array → standard base64
 */
function uint8ArrayToBase64(data: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}

/**
 * Gmail API로 이메일 발송 (첨부파일 지원)
 */
export async function sendGmailMessage(
  accessToken: string,
  options: {
    to: string;
    from?: string;
    cc?: string;
    subject: string;
    body: string;
    inReplyTo?: string;
    attachments?: EmailAttachmentData[];
  }
): Promise<{ id: string; threadId: string; labelIds: string[] }> {
  let rawEmail: string;

  if (options.attachments && options.attachments.length > 0) {
    rawEmail = buildRawEmailWithAttachments({
      to: options.to,
      from: options.from || "me",
      cc: options.cc,
      subject: options.subject,
      body: options.body,
      inReplyTo: options.inReplyTo,
      attachments: options.attachments,
    });
  } else {
    rawEmail = buildRawEmail({
      to: options.to,
      from: options.from || "me",
      cc: options.cc,
      subject: options.subject,
      body: options.body,
      inReplyTo: options.inReplyTo,
    });
  }

  // raw email → base64url for Gmail API
  // Use Uint8Array for proper UTF-8 encoding of multipart content
  const encoder = new TextEncoder();
  const rawBytes = encoder.encode(rawEmail);
  const base64Raw = uint8ArrayToBase64(rawBytes);
  const encodedMessage = base64ToBase64Url(base64Raw);

  const res = await fetch(`${GMAIL_API_BASE}/messages/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: encodedMessage }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gmail send failed: ${res.status} ${text}`);
  }

  return res.json();
}

// ─── 헬퍼 ───

export function isGmailConfigured(env: {
  GMAIL_CLIENT_ID?: string;
  GMAIL_CLIENT_SECRET?: string;
  CACHE?: KVNamespace;
}): boolean {
  return !!(env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET && env.CACHE);
}
