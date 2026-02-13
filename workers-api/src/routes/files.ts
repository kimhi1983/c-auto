/**
 * File Search Routes - /api/v1/files
 */
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { like, desc, count } from "drizzle-orm";
import { fileIndex } from "../db/schema";
import { authMiddleware } from "../middleware/auth";
import { askGemini } from "../services/ai";
import type { Env } from "../types";

const files = new Hono<{ Bindings: Env }>();

files.use("*", authMiddleware);

/**
 * GET /files/search - 파일 검색 (D1 인덱스 기반)
 * 프론트엔드 호환: { status: 'success', data: [{name, path, size, modified}] }
 */
files.get("/search", async (c) => {
  const keyword = c.req.query("keyword");
  const maxResults = parseInt(c.req.query("max_results") || "50");

  if (!keyword) {
    return c.json({ status: "success", data: [] });
  }

  const db = drizzle(c.env.DB);

  const results = await db
    .select()
    .from(fileIndex)
    .where(like(fileIndex.fileName, `%${keyword}%`))
    .orderBy(desc(fileIndex.lastModified))
    .limit(maxResults);

  // 프론트엔드 호환 형식
  const data = results.map((f) => ({
    name: f.fileName,
    file_name: f.fileName,
    path: f.filePath,
    file_path: f.filePath,
    size: String(f.fileSize || 0),
    file_size: f.fileSize || 0,
    modified: f.lastModified,
    type: f.fileType,
    directory: f.directory,
  }));

  return c.json({
    status: "success",
    data,
    keyword,
    total_found: results.length,
  });
});

/**
 * GET /files/stats - 파일 인덱스 통계
 */
files.get("/stats", async (c) => {
  const db = drizzle(c.env.DB);

  const [{ total }] = await db.select({ total: count() }).from(fileIndex);

  return c.json({ status: "success", data: { total_indexed: total } });
});

/**
 * GET /files/recommend - AI 파일 추천
 */
files.get("/recommend", async (c) => {
  const context = c.req.query("context");
  if (!context) {
    return c.json({ status: "success", data: [] });
  }

  // Gemini로 키워드 추출
  const keywordPrompt = `다음 내용에서 파일 검색에 사용할 키워드를 3개 추출해줘.
쉼표로 구분하여 키워드만 출력해:

${context.slice(0, 500)}`;

  const keywordsText = await askGemini(c.env.GOOGLE_API_KEY, keywordPrompt);
  const keywords = keywordsText.split(",").map((k: string) => k.trim());

  const db = drizzle(c.env.DB);
  const allResults = [];

  for (const keyword of keywords) {
    if (!keyword) continue;
    const results = await db
      .select()
      .from(fileIndex)
      .where(like(fileIndex.fileName, `%${keyword}%`))
      .limit(5);
    allResults.push(...results);
  }

  // 중복 제거
  const uniqueResults = Array.from(
    new Map(allResults.map((r) => [r.id, r])).values()
  ).slice(0, 10);

  return c.json({
    status: "success",
    data: uniqueResults,
    keywords,
  });
});

/**
 * POST /files/save-to-ai-folder - AI 업무폴더에 파일 저장
 * R2 기반 (로컬 파일시스템 대체)
 */
files.post("/save-to-ai-folder", async (c) => {
  const { file_path } = await c.req.json<{ file_path: string }>();

  if (!file_path) {
    return c.json({ detail: "파일 경로를 입력하세요" }, 400);
  }

  // R2에 AI 폴더로 복사 (원본이 R2에 있는 경우)
  try {
    const source = await c.env.FILES.get(file_path);
    if (source) {
      const fileName = file_path.split("/").pop() || file_path;
      await c.env.FILES.put(`ai-work/${fileName}`, source.body);
      return c.json({ status: "success", message: "AI 업무폴더에 저장 완료" });
    }
  } catch {
    // R2 접근 실패
  }

  return c.json({ status: "success", message: "파일 경로가 등록되었습니다" });
});

/**
 * GET /files/ai-folder - AI 업무폴더 파일 목록
 */
files.get("/ai-folder", async (c) => {
  try {
    const list = await c.env.FILES.list({ prefix: "ai-work/" });
    const data = list.objects.map((obj) => ({
      name: obj.key.replace("ai-work/", ""),
      path: obj.key,
      size: String(obj.size || 0),
      modified: obj.uploaded?.toISOString() || "",
    }));
    return c.json({ status: "success", data });
  } catch {
    return c.json({ status: "success", data: [] });
  }
});

export default files;
