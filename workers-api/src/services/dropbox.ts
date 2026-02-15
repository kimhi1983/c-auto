/**
 * Dropbox API Service - OAuth2 인증 + 파일 검색/공유
 * KPROS 자료대응(A카테고리) 자동 파일 검색
 */

const DROPBOX_AUTH_URL = "https://www.dropbox.com/oauth2/authorize";
const DROPBOX_TOKEN_URL = "https://api.dropboxapi.com/oauth2/token";
const DROPBOX_API_URL = "https://api.dropboxapi.com/2";

// ─── OAuth2 ───

export function isDropboxConfigured(env: { DROPBOX_APP_KEY?: string; DROPBOX_APP_SECRET?: string }): boolean {
  return !!(env.DROPBOX_APP_KEY && env.DROPBOX_APP_SECRET);
}

export function getDropboxAuthUrl(appKey: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: appKey,
    redirect_uri: redirectUri,
    response_type: "code",
    token_access_type: "offline",
  });
  return `${DROPBOX_AUTH_URL}?${params}`;
}

export async function exchangeDropboxCode(
  code: string,
  appKey: string,
  appSecret: string,
  redirectUri: string
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const res = await fetch(DROPBOX_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      grant_type: "authorization_code",
      client_id: appKey,
      client_secret: appSecret,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Dropbox token exchange failed: ${err}`);
  }

  return res.json();
}

export async function refreshDropboxToken(
  refreshToken: string,
  appKey: string,
  appSecret: string
): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch(DROPBOX_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      client_id: appKey,
      client_secret: appSecret,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Dropbox token refresh failed: ${err}`);
  }

  return res.json();
}

// ─── KV Token Management ───

export async function saveDropboxTokens(
  kv: KVNamespace,
  accessToken: string,
  refreshToken: string,
  expiresIn: number
): Promise<void> {
  await kv.put("dropbox_access_token", accessToken, { expirationTtl: expiresIn - 60 });
  await kv.put("dropbox_refresh_token", refreshToken);
}

export async function getDropboxAccessToken(
  kv: KVNamespace,
  appKey: string,
  appSecret: string
): Promise<string | null> {
  // 캐시된 access_token 확인
  const cached = await kv.get("dropbox_access_token");
  if (cached) return cached;

  // refresh_token으로 갱신
  const refreshToken = await kv.get("dropbox_refresh_token");
  if (!refreshToken) return null;

  try {
    const result = await refreshDropboxToken(refreshToken, appKey, appSecret);
    await kv.put("dropbox_access_token", result.access_token, {
      expirationTtl: result.expires_in - 60,
    });
    return result.access_token;
  } catch {
    return null;
  }
}

// ─── Config ───

// 검색에서 제외할 폴더 목록
const EXCLUDED_FOLDERS = ["/회사 자료"];

function isExcludedPath(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return EXCLUDED_FOLDERS.some((folder) => lower.startsWith(folder.toLowerCase()));
}

// ─── File Search ───

export interface DropboxSearchResult {
  name: string;
  path: string;
  size: number;
  modified: string;
  is_folder: boolean;
}

export async function searchDropboxFiles(
  accessToken: string,
  query: string,
  path?: string,
  maxResults = 20
): Promise<DropboxSearchResult[]> {
  const body: Record<string, any> = {
    query,
    options: {
      max_results: maxResults,
      file_status: "active",
      filename_only: false,
    },
  };

  if (path) {
    body.options.path = path;
  }

  const res = await fetch(`${DROPBOX_API_URL}/files/search_v2`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Dropbox search failed: ${err}`);
  }

  const data = await res.json() as any;
  const results: DropboxSearchResult[] = [];

  for (const match of data.matches || []) {
    const meta = match.metadata?.metadata;
    if (!meta) continue;

    const filePath = meta.path_display || meta.path_lower || "";
    if (isExcludedPath(filePath)) continue;

    results.push({
      name: meta.name || "",
      path: filePath,
      size: meta.size || 0,
      modified: meta.server_modified || meta.client_modified || "",
      is_folder: meta[".tag"] === "folder",
    });
  }

  return results;
}

// ─── List Folder ───

export async function listDropboxFolder(
  accessToken: string,
  path: string
): Promise<DropboxSearchResult[]> {
  const res = await fetch(`${DROPBOX_API_URL}/files/list_folder`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      path: path || "",
      recursive: false,
      include_media_info: false,
      include_deleted: false,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Dropbox list_folder failed: ${err}`);
  }

  const data = await res.json() as any;
  const results: DropboxSearchResult[] = [];

  for (const entry of data.entries || []) {
    const filePath = entry.path_display || entry.path_lower || "";
    if (isExcludedPath(filePath)) continue;

    results.push({
      name: entry.name || "",
      path: filePath,
      size: entry.size || 0,
      modified: entry.server_modified || entry.client_modified || "",
      is_folder: entry[".tag"] === "folder",
    });
  }

  return results;
}

// ─── Get Temporary Link ───

export async function getDropboxTempLink(
  accessToken: string,
  path: string
): Promise<string> {
  const res = await fetch(`${DROPBOX_API_URL}/files/get_temporary_link`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ path }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Dropbox get_temporary_link failed: ${err}`);
  }

  const data = await res.json() as any;
  return data.link || "";
}

// ─── Create Folder ───

const DROPBOX_CONTENT_URL = "https://content.dropboxapi.com/2";

export async function createDropboxFolder(
  accessToken: string,
  path: string
): Promise<{ path: string; created: boolean }> {
  const res = await fetch(`${DROPBOX_API_URL}/files/create_folder_v2`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ path, autorename: false }),
  });

  if (!res.ok) {
    const err = await res.text();
    // 이미 존재하는 폴더면 무시
    if (err.includes("conflict") || err.includes("path/conflict")) {
      return { path, created: false };
    }
    throw new Error(`Dropbox create_folder failed: ${err}`);
  }

  return { path, created: true };
}

// ─── Ensure Folder Structure ───

export async function ensureDropboxFolderStructure(
  accessToken: string,
  basePath: string = "/AI업무폴더"
): Promise<void> {
  const folders = [
    basePath,
    `${basePath}/A.자료대응`,
    `${basePath}/B.영업기회`,
    `${basePath}/C.스케줄링`,
    `${basePath}/D.정보수집`,
    `${basePath}/E.필터링`,
  ];

  for (const folder of folders) {
    try {
      await createDropboxFolder(accessToken, folder);
    } catch {
      // 폴더가 이미 존재하면 무시
    }
  }
}

// ─── Upload File ───

export async function uploadDropboxFile(
  accessToken: string,
  path: string,
  content: string | Uint8Array
): Promise<{ name: string; path: string; size: number }> {
  const data = typeof content === "string"
    ? new TextEncoder().encode(content)
    : content;

  const res = await fetch(`${DROPBOX_CONTENT_URL}/files/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/octet-stream",
      "Dropbox-API-Arg": JSON.stringify({
        path,
        mode: "add",
        autorename: true,
        mute: false,
      }),
    },
    body: data,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Dropbox upload failed: ${err}`);
  }

  const result = await res.json() as any;
  return {
    name: result.name || "",
    path: result.path_display || path,
    size: result.size || data.byteLength,
  };
}

// ─── Multi-keyword Search (KPROS) ───

export async function searchDropboxMultiKeyword(
  accessToken: string,
  keywords: string[],
  basePath?: string
): Promise<DropboxSearchResult[]> {
  const allResults: DropboxSearchResult[] = [];
  const seenPaths = new Set<string>();

  for (const keyword of keywords) {
    try {
      const results = await searchDropboxFiles(accessToken, keyword, basePath, 10);
      for (const r of results) {
        if (!seenPaths.has(r.path)) {
          seenPaths.add(r.path);
          allResults.push(r);
        }
      }
    } catch {
      // 개별 키워드 검색 실패 시 계속 진행
    }
  }

  return allResults;
}
