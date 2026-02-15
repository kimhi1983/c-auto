/**
 * Dropbox Routes - /api/v1/dropbox
 * OAuth2 인증 + 파일 검색/다운로드
 */
import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import {
  isDropboxConfigured,
  getDropboxAuthUrl,
  exchangeDropboxCode,
  saveDropboxTokens,
  getDropboxAccessToken,
  searchDropboxFiles,
  searchDropboxMultiKeyword,
  listDropboxFolder,
  getDropboxTempLink,
  ensureDropboxFolderStructure,
  uploadDropboxFile,
} from "../services/dropbox";
import type { Env } from "../types";

const dropboxRouter = new Hono<{ Bindings: Env }>();

/**
 * GET /dropbox/status - 드롭박스 연동 상태 확인 (인증 불필요)
 */
dropboxRouter.get("/status", async (c) => {
  const configured = isDropboxConfigured(c.env);

  if (!configured) {
    return c.json({
      status: "success",
      data: { configured: false, token_valid: false },
    });
  }

  const accessToken = await getDropboxAccessToken(
    c.env.CACHE!,
    c.env.DROPBOX_APP_KEY!,
    c.env.DROPBOX_APP_SECRET!
  );

  return c.json({
    status: "success",
    data: { configured: true, token_valid: !!accessToken },
  });
});

/**
 * GET /dropbox/auth-url - OAuth 인증 URL 생성
 */
dropboxRouter.get("/auth-url", authMiddleware, async (c) => {
  if (!isDropboxConfigured(c.env)) {
    return c.json({ status: "error", detail: "Dropbox App Key/Secret이 설정되지 않았습니다." }, 400);
  }

  const baseUrl = new URL(c.req.url).origin;
  const redirectUri = `${baseUrl}/api/v1/dropbox/callback`;
  const authUrl = getDropboxAuthUrl(c.env.DROPBOX_APP_KEY!, redirectUri);

  return c.json({ status: "success", auth_url: authUrl, redirect_uri: redirectUri });
});

/**
 * GET /dropbox/callback - OAuth 콜백
 */
dropboxRouter.get("/callback", async (c) => {
  const code = c.req.query("code");
  if (!code) {
    return c.json({ status: "error", detail: "Authorization code가 없습니다." }, 400);
  }

  const baseUrl = new URL(c.req.url).origin;
  const redirectUri = `${baseUrl}/api/v1/dropbox/callback`;

  try {
    const tokens = await exchangeDropboxCode(
      code,
      c.env.DROPBOX_APP_KEY!,
      c.env.DROPBOX_APP_SECRET!,
      redirectUri
    );

    await saveDropboxTokens(
      c.env.CACHE!,
      tokens.access_token,
      tokens.refresh_token,
      tokens.expires_in
    );

    return c.html(`
      <html><body style="font-family:sans-serif;text-align:center;padding:60px">
        <h2>Dropbox 연동 완료!</h2>
        <p>이 창을 닫고 C-Auto로 돌아가세요.</p>
        <script>setTimeout(()=>window.close(),3000)</script>
      </body></html>
    `);
  } catch (err: any) {
    return c.json({ status: "error", detail: `Dropbox 인증 실패: ${err.message}` }, 500);
  }
});

// 인증 필요 라우트
dropboxRouter.use("/search", authMiddleware);
dropboxRouter.use("/search-multi", authMiddleware);
dropboxRouter.use("/list", authMiddleware);
dropboxRouter.use("/link", authMiddleware);
dropboxRouter.use("/init-folders", authMiddleware);
dropboxRouter.use("/upload", authMiddleware);

/**
 * POST /dropbox/search - 파일 검색
 */
dropboxRouter.post("/search", async (c) => {
  const body = await c.req.json<{ query: string; path?: string }>();

  if (!body.query) {
    return c.json({ status: "error", detail: "검색어를 입력하세요." }, 400);
  }

  const accessToken = await getDropboxAccessToken(
    c.env.CACHE!,
    c.env.DROPBOX_APP_KEY!,
    c.env.DROPBOX_APP_SECRET!
  );

  if (!accessToken) {
    return c.json({ status: "error", detail: "Dropbox 인증이 필요합니다.", need_reauth: true }, 401);
  }

  try {
    const results = await searchDropboxFiles(accessToken, body.query, body.path);
    return c.json({ status: "success", data: results, count: results.length });
  } catch (err: any) {
    return c.json({ status: "error", detail: `검색 실패: ${err.message}` }, 500);
  }
});

/**
 * POST /dropbox/search-multi - 복수 키워드 검색 (KPROS AI 키워드용)
 */
dropboxRouter.post("/search-multi", async (c) => {
  const body = await c.req.json<{ keywords: string[]; path?: string }>();

  if (!body.keywords || body.keywords.length === 0) {
    return c.json({ status: "error", detail: "검색 키워드를 입력하세요." }, 400);
  }

  const accessToken = await getDropboxAccessToken(
    c.env.CACHE!,
    c.env.DROPBOX_APP_KEY!,
    c.env.DROPBOX_APP_SECRET!
  );

  if (!accessToken) {
    return c.json({ status: "error", detail: "Dropbox 인증이 필요합니다.", need_reauth: true }, 401);
  }

  try {
    const results = await searchDropboxMultiKeyword(accessToken, body.keywords, body.path);
    return c.json({
      status: "success",
      data: results,
      count: results.length,
      keywords: body.keywords,
    });
  } catch (err: any) {
    return c.json({ status: "error", detail: `검색 실패: ${err.message}` }, 500);
  }
});

/**
 * POST /dropbox/list - 폴더 내용 조회
 */
dropboxRouter.post("/list", async (c) => {
  const body = await c.req.json<{ path: string }>();

  const accessToken = await getDropboxAccessToken(
    c.env.CACHE!,
    c.env.DROPBOX_APP_KEY!,
    c.env.DROPBOX_APP_SECRET!
  );

  if (!accessToken) {
    return c.json({ status: "error", detail: "Dropbox 인증이 필요합니다.", need_reauth: true }, 401);
  }

  try {
    const results = await listDropboxFolder(accessToken, body.path || "");
    return c.json({ status: "success", data: results, count: results.length });
  } catch (err: any) {
    return c.json({ status: "error", detail: `폴더 조회 실패: ${err.message}` }, 500);
  }
});

/**
 * POST /dropbox/link - 파일 임시 다운로드 링크 생성
 */
dropboxRouter.post("/link", async (c) => {
  const body = await c.req.json<{ path: string }>();

  if (!body.path) {
    return c.json({ status: "error", detail: "파일 경로를 입력하세요." }, 400);
  }

  const accessToken = await getDropboxAccessToken(
    c.env.CACHE!,
    c.env.DROPBOX_APP_KEY!,
    c.env.DROPBOX_APP_SECRET!
  );

  if (!accessToken) {
    return c.json({ status: "error", detail: "Dropbox 인증이 필요합니다.", need_reauth: true }, 401);
  }

  try {
    const link = await getDropboxTempLink(accessToken, body.path);
    return c.json({ status: "success", link });
  } catch (err: any) {
    return c.json({ status: "error", detail: `링크 생성 실패: ${err.message}` }, 500);
  }
});

/**
 * POST /dropbox/init-folders - AI업무폴더 + 카테고리별 하위 폴더 초기화
 */
dropboxRouter.post("/init-folders", async (c) => {
  const accessToken = await getDropboxAccessToken(
    c.env.CACHE!,
    c.env.DROPBOX_APP_KEY!,
    c.env.DROPBOX_APP_SECRET!
  );

  if (!accessToken) {
    return c.json({ status: "error", detail: "Dropbox 인증이 필요합니다.", need_reauth: true }, 401);
  }

  try {
    await ensureDropboxFolderStructure(accessToken);
    return c.json({ status: "success", message: "AI업무폴더 구조가 생성되었습니다." });
  } catch (err: any) {
    return c.json({ status: "error", detail: `폴더 생성 실패: ${err.message}` }, 500);
  }
});

/**
 * POST /dropbox/upload - 파일 업로드 (지시서 저장)
 * body: { category: string, fileName: string, content?: string, contentBase64?: string }
 * contentBase64: Excel 등 바이너리 파일의 base64 인코딩 데이터
 */
dropboxRouter.post("/upload", async (c) => {
  const body = await c.req.json<{
    category: string;
    fileName: string;
    content?: string;
    contentBase64?: string;
  }>();

  if (!body.fileName || (!body.content && !body.contentBase64)) {
    return c.json({ status: "error", detail: "파일명과 내용이 필요합니다." }, 400);
  }

  const accessToken = await getDropboxAccessToken(
    c.env.CACHE!,
    c.env.DROPBOX_APP_KEY!,
    c.env.DROPBOX_APP_SECRET!
  );

  if (!accessToken) {
    return c.json({ status: "error", detail: "Dropbox 인증이 필요합니다.", need_reauth: true }, 401);
  }

  // 카테고리 → 폴더 매핑
  const CATEGORY_FOLDERS: Record<string, string> = {
    '자료대응': 'A.자료대응',
    '영업기회': 'B.영업기회',
    '스케줄링': 'C.스케줄링',
    '정보수집': 'D.정보수집',
    '필터링': 'E.필터링',
  };

  const folderName = CATEGORY_FOLDERS[body.category] || 'E.필터링';
  const filePath = `/AI업무폴더/${folderName}/${body.fileName}`;

  try {
    // 폴더가 없으면 생성
    await ensureDropboxFolderStructure(accessToken);

    // base64 바이너리 또는 텍스트 업로드
    let uploadData: string | Uint8Array;
    if (body.contentBase64) {
      const binaryStr = atob(body.contentBase64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      uploadData = bytes;
    } else {
      uploadData = body.content!;
    }

    const result = await uploadDropboxFile(accessToken, filePath, uploadData);
    return c.json({
      status: "success",
      data: result,
      message: `${filePath}에 저장되었습니다.`,
    });
  } catch (err: any) {
    return c.json({ status: "error", detail: `업로드 실패: ${err.message}` }, 500);
  }
});

export default dropboxRouter;
