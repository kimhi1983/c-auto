/**
 * CoA Documents Routes - /api/v1/coa-documents
 * 성적서 파일 업로드/관리 (Dropbox + D1 메타데이터)
 * 제품별 분류, LOT/날짜별 필터 지원
 */
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, desc, like, or, count, sql } from "drizzle-orm";
import { coaDocuments } from "../db/schema";
import { authMiddleware } from "../middleware/auth";
import {
  getDropboxAccessToken,
  uploadDropboxFile,
  getDropboxTempLink,
  createDropboxFolder,
  deleteDropboxFile,
} from "../services/dropbox";
import { analyzeCoaDocument } from "../services/ai";
import type { Env, UserContext } from "../types";

const coaDocs = new Hono<{ Bindings: Env; Variables: { user: UserContext } }>();

// 진단 엔드포인트는 인증 없이 접근 가능 (나머지는 인증 필요)
coaDocs.use("*", async (c, next) => {
  if (c.req.path.endsWith("/test-ai")) return next();
  return authMiddleware(c, next);
});

/**
 * GET /products - 제품별 그룹 목록
 */
coaDocs.get("/products", async (c) => {
  const db = drizzle(c.env.DB);
  const search = c.req.query("search");

  let query = `
    SELECT
      product_name as productName,
      COUNT(*) as count,
      MAX(created_at) as latestDate,
      MAX(valid_date) as latestValidDate
    FROM coa_documents
    WHERE product_name IS NOT NULL AND product_name != ''
  `;
  const params: string[] = [];

  if (search) {
    query += ` AND (product_name LIKE ? OR lot_no LIKE ? OR original_name LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  query += ` GROUP BY product_name ORDER BY MAX(created_at) DESC`;

  const results = await db.all(sql.raw(query, params));

  return c.json({ status: "success", data: results });
});

/**
 * GET /products/:name - 특정 제품의 파일 목록
 */
coaDocs.get("/products/:name", async (c) => {
  const productName = decodeURIComponent(c.req.param("name"));
  const db = drizzle(c.env.DB);

  const items = await db
    .select()
    .from(coaDocuments)
    .where(eq(coaDocuments.productName, productName))
    .orderBy(desc(coaDocuments.createdAt));

  return c.json({ status: "success", data: items });
});

/**
 * GET / - 파일 목록 (검색, 페이징, 제품 필터)
 */
coaDocs.get("/", async (c) => {
  const db = drizzle(c.env.DB);
  const search = c.req.query("search");
  const product = c.req.query("product");
  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("limit") || "20");

  let conditions: any[] = [];

  if (search) {
    conditions.push(
      or(
        like(coaDocuments.originalName, `%${search}%`),
        like(coaDocuments.note, `%${search}%`),
        like(coaDocuments.productName, `%${search}%`),
        like(coaDocuments.lotNo, `%${search}%`),
        like(coaDocuments.tags, `%${search}%`),
      )
    );
  }

  if (product) {
    conditions.push(eq(coaDocuments.productName, product));
  }

  const where = conditions.length === 1
    ? conditions[0]
    : conditions.length > 1
    ? sql`${conditions.map((c, i) => i === 0 ? c : sql` AND ${c}`)}`
    : undefined;

  // 조건 조합을 위해 raw SQL 사용
  let whereClause = '';
  const params: any[] = [];
  if (search && product) {
    whereClause = `WHERE (original_name LIKE ? OR note LIKE ? OR product_name LIKE ? OR lot_no LIKE ? OR tags LIKE ?) AND product_name = ?`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, product);
  } else if (search) {
    whereClause = `WHERE original_name LIKE ? OR note LIKE ? OR product_name LIKE ? OR lot_no LIKE ? OR tags LIKE ?`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  } else if (product) {
    whereClause = `WHERE product_name = ?`;
    params.push(product);
  }

  const countResult = await db.all(sql.raw(
    `SELECT COUNT(*) as total FROM coa_documents ${whereClause}`,
    params,
  ));
  const total = (countResult[0] as any)?.total || 0;

  const items = await db.all(sql.raw(
    `SELECT * FROM coa_documents ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit],
  ));

  return c.json({
    status: "success",
    data: items,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
});

/**
 * POST / - 파일 업로드 (제품 메타데이터 포함)
 */
coaDocs.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{
    fileName: string;
    contentBase64: string;
    contentType?: string;
    note?: string;
    tags?: string[];
    productName?: string;
    lotNo?: string;
    manuDate?: string;
    validDate?: string;
  }>();

  if (!body.fileName || !body.contentBase64) {
    return c.json({ error: "fileName과 contentBase64는 필수입니다" }, 400);
  }

  if (body.contentBase64.length > 14_000_000) {
    return c.json({ error: "파일 크기가 10MB를 초과합니다" }, 400);
  }

  const accessToken = await getDropboxAccessToken(
    c.env.CACHE!,
    c.env.DROPBOX_APP_KEY!,
    c.env.DROPBOX_APP_SECRET!,
  );
  if (!accessToken) {
    return c.json({ error: "Dropbox 인증이 필요합니다" }, 503);
  }

  const binStr = atob(body.contentBase64);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);

  // Dropbox 경로: 제품명이 있으면 제품별 폴더, 없으면 날짜별
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, "").slice(0, 15);
  const storedName = `${timestamp}_${body.fileName}`;
  const folderName = body.productName
    ? body.productName.replace(/[\\/:*?"<>|]/g, "_")
    : now.toISOString().split("T")[0];
  const folderPath = `/AI업무폴더/B.성적서대응/${folderName}`;

  try {
    await createDropboxFolder(accessToken, folderPath);
  } catch {
    // 이미 존재하면 무시
  }

  const result = await uploadDropboxFile(
    accessToken,
    `${folderPath}/${storedName}`,
    bytes,
  );

  const db = drizzle(c.env.DB);
  const [doc] = await db
    .insert(coaDocuments)
    .values({
      fileName: storedName,
      originalName: body.fileName,
      fileSize: bytes.length,
      contentType: body.contentType || null,
      dropboxPath: result.path,
      note: body.note || null,
      tags: body.tags ? JSON.stringify(body.tags) : null,
      uploadedBy: user.userId,
      uploadedByName: user.email,
      productName: body.productName || null,
      lotNo: body.lotNo || null,
      manuDate: body.manuDate || null,
      validDate: body.validDate || null,
    })
    .returning();

  return c.json({ status: "success", data: doc }, 201);
});

/**
 * POST /auto-upload - AI 자동분석 업로드 (메타데이터 자동 추출)
 * Gemini가 성적서에서 제품명/LOT/날짜/제조사를 추출하여 자동 분류 저장
 */
coaDocs.post("/auto-upload", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{
    fileName: string;
    contentBase64: string;
    contentType?: string;
  }>();

  if (!body.fileName || !body.contentBase64) {
    return c.json({ error: "fileName과 contentBase64는 필수입니다" }, 400);
  }

  if (body.contentBase64.length > 14_000_000) {
    return c.json({ error: "파일 크기가 10MB를 초과합니다" }, 400);
  }

  console.log(`[CoA Upload] Starting auto-upload: ${body.fileName} (${body.contentType}, base64 ${Math.round(body.contentBase64.length / 1024)}KB)`);

  // 1) AI 분석 — 실패해도 업로드는 계속 진행
  let aiExtracted = null;
  let aiError = null;
  try {
    aiExtracted = await analyzeCoaDocument(
      c.env,
      body.fileName,
      body.contentType || "application/pdf",
      body.contentBase64,
    );
    console.log(`[CoA Upload] AI result for ${body.fileName}:`, JSON.stringify(aiExtracted));
  } catch (e: any) {
    aiError = e.message || "AI 분석 실패";
    console.error("[CoA Upload] AI analysis error:", e);
  }

  // AI 결과 또는 파일명 기반 폴백
  const productName = aiExtracted?.productName || body.fileName.replace(/\.[^.]+$/, "");
  const lotNo = aiExtracted?.lotNo || null;
  const manuDate = aiExtracted?.manuDate || null;
  const validDate = aiExtracted?.validDate || null;
  const manufacturer = aiExtracted?.manufacturer || null;

  // 2) base64 → Uint8Array
  const binStr = atob(body.contentBase64);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);

  // 3) Dropbox 업로드 (제품명 폴더)
  const accessToken = await getDropboxAccessToken(
    c.env.CACHE!,
    c.env.DROPBOX_APP_KEY!,
    c.env.DROPBOX_APP_SECRET!,
  );
  if (!accessToken) {
    return c.json({ error: "Dropbox 인증이 필요합니다" }, 503);
  }

  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, "").slice(0, 15);
  const storedName = `${timestamp}_${body.fileName}`;
  const folderName = productName.replace(/[\\/:*?"<>|®™]/g, "_").replace(/_+/g, "_");
  const folderPath = `/AI업무폴더/B.성적서대응/${folderName}`;

  try { await createDropboxFolder(accessToken, folderPath); } catch { /* 이미 존재 */ }

  const result = await uploadDropboxFile(
    accessToken,
    `${folderPath}/${storedName}`,
    bytes,
  );

  // 4) D1 저장 (제조사는 note에 포함)
  const noteText = manufacturer ? `제조사: ${manufacturer}` : null;
  const db = drizzle(c.env.DB);
  const [doc] = await db
    .insert(coaDocuments)
    .values({
      fileName: storedName,
      originalName: body.fileName,
      fileSize: bytes.length,
      contentType: body.contentType || null,
      dropboxPath: result.path,
      note: noteText,
      tags: null,
      uploadedBy: user.userId,
      uploadedByName: user.email,
      productName,
      lotNo,
      manuDate,
      validDate,
    })
    .returning();

  return c.json({
    status: "success",
    data: doc,
    aiExtracted: aiExtracted ? {
      productName: aiExtracted.productName,
      lotNo: aiExtracted.lotNo,
      manuDate: aiExtracted.manuDate,
      validDate: aiExtracted.validDate,
      manufacturer: aiExtracted.manufacturer,
      confidence: aiExtracted.confidence,
      debug: aiExtracted.rawResponse || null,
    } : null,
    aiError: aiError || null,
  }, 201);
});

/**
 * POST /:id/link - Dropbox 다운로드 링크 발급
 */
coaDocs.post("/:id/link", async (c) => {
  const id = parseInt(c.req.param("id"));
  const db = drizzle(c.env.DB);

  const [doc] = await db
    .select()
    .from(coaDocuments)
    .where(eq(coaDocuments.id, id))
    .limit(1);

  if (!doc) {
    return c.json({ error: "파일을 찾을 수 없습니다" }, 404);
  }

  const accessToken = await getDropboxAccessToken(
    c.env.CACHE!,
    c.env.DROPBOX_APP_KEY!,
    c.env.DROPBOX_APP_SECRET!,
  );
  if (!accessToken) {
    return c.json({ error: "Dropbox 인증이 필요합니다" }, 503);
  }

  const link = await getDropboxTempLink(accessToken, doc.dropboxPath);
  return c.json({ status: "success", link, doc });
});

/**
 * PUT /:id - 메타데이터 수정
 */
coaDocs.put("/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  const body = await c.req.json<{
    note?: string;
    tags?: string[];
    productName?: string;
    lotNo?: string;
    manuDate?: string;
    validDate?: string;
  }>();
  const db = drizzle(c.env.DB);

  const updates: Record<string, any> = { updatedAt: new Date().toISOString() };
  if (body.note !== undefined) updates.note = body.note;
  if (body.tags !== undefined) updates.tags = JSON.stringify(body.tags);
  if (body.productName !== undefined) updates.productName = body.productName;
  if (body.lotNo !== undefined) updates.lotNo = body.lotNo;
  if (body.manuDate !== undefined) updates.manuDate = body.manuDate;
  if (body.validDate !== undefined) updates.validDate = body.validDate;

  const [updated] = await db
    .update(coaDocuments)
    .set(updates)
    .where(eq(coaDocuments.id, id))
    .returning();

  if (!updated) {
    return c.json({ error: "파일을 찾을 수 없습니다" }, 404);
  }

  return c.json({ status: "success", data: updated });
});

/**
 * DELETE /:id - 파일 삭제 (Dropbox + D1)
 */
coaDocs.delete("/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  const db = drizzle(c.env.DB);

  const [doc] = await db
    .select()
    .from(coaDocuments)
    .where(eq(coaDocuments.id, id))
    .limit(1);

  if (!doc) {
    return c.json({ error: "파일을 찾을 수 없습니다" }, 404);
  }

  try {
    const accessToken = await getDropboxAccessToken(
      c.env.CACHE!,
      c.env.DROPBOX_APP_KEY!,
      c.env.DROPBOX_APP_SECRET!,
    );
    if (accessToken) {
      await deleteDropboxFile(accessToken, doc.dropboxPath);
    }
  } catch {
    // Dropbox 삭제 실패해도 D1은 삭제 진행
  }

  await db.delete(coaDocuments).where(eq(coaDocuments.id, id));

  return c.json({ status: "success", message: "파일이 삭제되었습니다" });
});

/**
 * GET /test-ai - AI 진단 테스트 (Gemini + Claude)
 */
coaDocs.get("/test-ai", async (c) => {
  const results: Record<string, unknown> = {};

  // 1) Gemini 테스트
  results.hasGeminiKey = !!c.env.GEMINI_API_KEY;
  if (c.env.GEMINI_API_KEY) {
    try {
      const textRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${c.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "Reply with exactly: OK" }] }],
            generationConfig: { maxOutputTokens: 10, temperature: 0 },
          }),
        }
      );
      results.geminiStatus = textRes.status;
      if (textRes.ok) {
        const data = await textRes.json() as any;
        results.geminiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || "(empty)";
      } else {
        results.geminiError = await textRes.text();
      }
    } catch (e: any) {
      results.geminiError = e.message;
    }
  }

  // 2) Claude 테스트
  results.hasClaudeKey = !!c.env.ANTHROPIC_API_KEY;
  if (c.env.ANTHROPIC_API_KEY) {
    const ck = c.env.ANTHROPIC_API_KEY;
    results.claudeKeyPreview = `${ck.slice(0, 10)}...${ck.slice(-6)} (len=${ck.length})`;

    try {
      const claudeHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        "x-api-key": c.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "User-Agent": "c-auto-workers/1.0",
      };
      const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: claudeHeaders,
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: 10,
          messages: [{ role: "user", content: "Reply with exactly: OK" }],
        }),
      });
      results.claudeStatus = claudeRes.status;
      if (claudeRes.ok) {
        const data = await claudeRes.json() as any;
        results.claudeResponse = data.content?.[0]?.text || "(empty)";
      } else {
        results.claudeError = await claudeRes.text();
      }
    } catch (e: any) {
      results.claudeError = e.message;
    }

    // 3) Claude PDF 지원 테스트 (1x1 PNG로 멀티모달 확인)
    try {
      const tinyPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      const multiRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": c.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: 50,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/png", data: tinyPng } },
              { type: "text", text: "What is this? One word." },
            ],
          }],
        }),
      });
      results.claudeMultimodalStatus = multiRes.status;
      if (multiRes.ok) {
        const data = await multiRes.json() as any;
        results.claudeMultimodalResponse = data.content?.[0]?.text || "(empty)";
      } else {
        results.claudeMultimodalError = await multiRes.text();
      }
    } catch (e: any) {
      results.claudeMultimodalError = e.message;
    }
  }

  // 4) Workers AI Vision 테스트 — 여러 모델 시도
  const tinyPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const binaryStr = atob(tinyPng);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  // 4a) LLaVA (라이선스 불필요)
  try {
    const llavaRes = await c.env.AI.run("@cf/llava-hf/llava-1.5-7b-hf" as any, {
      prompt: "What is this image?",
      image: [...bytes],
      max_tokens: 50,
    });
    results.llavaStatus = "ok";
    results.llavaResponse = (llavaRes as any).description || (llavaRes as any).response || JSON.stringify(llavaRes).slice(0, 200);
  } catch (e: any) {
    results.llavaStatus = "error";
    results.llavaError = e.message?.slice(0, 200);
  }

  // 4b) Mistral Small 3.1 (비전 지원)
  try {
    const mistralRes = await c.env.AI.run("@cf/mistralai/mistral-small-3.1-24b-instruct" as any, {
      messages: [{ role: "user", content: "Reply with: OK" }],
      max_tokens: 10,
    });
    results.mistralStatus = "ok";
    results.mistralResponse = (mistralRes as any).response || "(empty)";
  } catch (e: any) {
    results.mistralStatus = "error";
    results.mistralError = e.message?.slice(0, 200);
  }

  return c.json({ status: "success", diagnostics: results });
});

export default coaDocs;
