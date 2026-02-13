/**
 * Email Management Routes - /api/v1/emails
 */
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, desc, like, and, sql, count } from "drizzle-orm";
import { emails, emailApprovals } from "../db/schema";
import { authMiddleware, requireApprover } from "../middleware/auth";
import { askClaude, askGemini, classifyEmailPrompt } from "../services/ai";
import type { Env } from "../types";

const emailsRouter = new Hono<{ Bindings: Env }>();

emailsRouter.use("*", authMiddleware);

/**
 * GET /emails - 이메일 목록 (필터링, 페이지네이션)
 */
emailsRouter.get("/", async (c) => {
  const db = drizzle(c.env.DB);
  const status = c.req.query("status");
  const category = c.req.query("category");
  const search = c.req.query("search");
  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("limit") || "20");
  const offset = (page - 1) * limit;

  const conditions = [];
  if (status) conditions.push(eq(emails.status, status as any));
  if (category) conditions.push(eq(emails.category, category as any));
  if (search) conditions.push(like(emails.subject, `%${search}%`));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [results, [{ total }]] = await Promise.all([
    db
      .select()
      .from(emails)
      .where(where)
      .orderBy(desc(emails.receivedAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(emails)
      .where(where),
  ]);

  return c.json({
    status: "success",
    data: results,
    count: results.length,
    total,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

/**
 * GET /emails/stats - 이메일 통계
 */
emailsRouter.get("/stats", async (c) => {
  const db = drizzle(c.env.DB);

  const [totalResult] = await db.select({ total: count() }).from(emails);
  const [unreadResult] = await db
    .select({ total: count() })
    .from(emails)
    .where(eq(emails.status, "unread"));
  const [inReviewResult] = await db
    .select({ total: count() })
    .from(emails)
    .where(eq(emails.status, "in_review"));
  const [approvedResult] = await db
    .select({ total: count() })
    .from(emails)
    .where(eq(emails.status, "approved"));
  const [sentResult] = await db
    .select({ total: count() })
    .from(emails)
    .where(eq(emails.status, "sent"));

  const categoryRows = await db
    .select({
      category: emails.category,
      count: count(),
    })
    .from(emails)
    .groupBy(emails.category);

  const categories: Record<string, number> = {};
  for (const row of categoryRows) {
    if (row.category) categories[row.category] = row.count;
  }

  return c.json({
    status: "success",
    data: {
      total: totalResult.total,
      unread: unreadResult.total,
      in_review: inReviewResult.total,
      approved: approvedResult.total,
      sent: sentResult.total,
      categories,
    },
  });
});

/**
 * GET /emails/:id - 이메일 상세
 */
emailsRouter.get("/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  const db = drizzle(c.env.DB);

  const [email] = await db
    .select()
    .from(emails)
    .where(eq(emails.id, id))
    .limit(1);

  if (!email) {
    return c.json({ detail: "이메일을 찾을 수 없습니다" }, 404);
  }

  // 읽음 처리
  if (email.status === "unread") {
    await db
      .update(emails)
      .set({ status: "read", updatedAt: new Date().toISOString() })
      .where(eq(emails.id, id));
  }

  const approvals = await db
    .select()
    .from(emailApprovals)
    .where(eq(emailApprovals.emailId, id))
    .orderBy(desc(emailApprovals.createdAt));

  return c.json({
    status: "success",
    data: {
      ...email,
      draft_response: email.draftResponse,
      draft_subject: email.draftSubject,
      ai_summary: email.aiSummary,
      ai_draft_response: email.aiDraftResponse,
      ai_confidence: email.aiConfidence || 0,
      received_at: email.receivedAt,
      processed_at: email.processedAt,
      sent_at: email.sentAt,
      created_at: email.createdAt,
      approvals,
      attachments: [],
    },
  });
});

/**
 * POST /emails/fetch - 이메일 수신 (하이웍스 API)
 */
emailsRouter.post("/fetch", async (c) => {
  return c.json({
    status: "success",
    message: "하이웍스 API 연동 준비 중입니다.",
    count: 0,
  });
});

/**
 * PATCH /emails/:id - 이메일 수정 (답신 초안 등)
 */
emailsRouter.patch("/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  const body = await c.req.json<{
    draft_response?: string;
    draft_subject?: string;
    status?: string;
    category?: string;
  }>();

  const db = drizzle(c.env.DB);
  const updateData: Record<string, any> = {
    updatedAt: new Date().toISOString(),
  };

  if (body.draft_response) updateData.draftResponse = body.draft_response;
  if (body.draft_subject) updateData.draftSubject = body.draft_subject;
  if (body.status) updateData.status = body.status;
  if (body.category) updateData.category = body.category;

  const [updated] = await db
    .update(emails)
    .set(updateData)
    .where(eq(emails.id, id))
    .returning();

  if (!updated) {
    return c.json({ detail: "이메일을 찾을 수 없습니다" }, 404);
  }

  return c.json({ status: "success", data: updated });
});

/**
 * POST /emails/:id/submit - 결재 요청
 */
emailsRouter.post("/:id/submit", async (c) => {
  const id = parseInt(c.req.param("id"));
  const user = c.get("user");
  const db = drizzle(c.env.DB);

  await db
    .update(emails)
    .set({ status: "in_review", updatedAt: new Date().toISOString() })
    .where(eq(emails.id, id));

  await db.insert(emailApprovals).values({
    emailId: id,
    stage: "review",
    approverId: null,
    status: "pending",
    comments: `${user.email}님이 결재 요청`,
  });

  return c.json({ status: "success", message: "결재 요청이 완료되었습니다" });
});

/**
 * POST /emails/:id/approve - 승인 (Approver 이상)
 */
emailsRouter.post("/:id/approve", requireApprover, async (c) => {
  const id = parseInt(c.req.param("id"));
  const user = c.get("user");
  const body = await c.req.json<{ comments?: string }>().catch(() => ({ comments: undefined }));
  const db = drizzle(c.env.DB);

  await db
    .update(emails)
    .set({ status: "approved", updatedAt: new Date().toISOString() })
    .where(eq(emails.id, id));

  await db.insert(emailApprovals).values({
    emailId: id,
    stage: "approval",
    approverId: user.userId,
    status: "approved",
    comments: body.comments || "승인",
    approvedAt: new Date().toISOString(),
  });

  return c.json({ status: "success", message: "승인 완료" });
});

/**
 * POST /emails/:id/reject - 반려 (Approver 이상)
 */
emailsRouter.post("/:id/reject", requireApprover, async (c) => {
  const id = parseInt(c.req.param("id"));
  const user = c.get("user");
  const body = await c.req.json<{ comments: string }>();
  const db = drizzle(c.env.DB);

  await db
    .update(emails)
    .set({ status: "rejected", updatedAt: new Date().toISOString() })
    .where(eq(emails.id, id));

  await db.insert(emailApprovals).values({
    emailId: id,
    stage: "approval",
    approverId: user.userId,
    status: "rejected",
    comments: body.comments || "반려",
  });

  return c.json({ status: "success", message: "반려 처리 완료" });
});

/**
 * POST /emails/:id/send - 이메일 발송
 */
emailsRouter.post("/:id/send", async (c) => {
  const id = parseInt(c.req.param("id"));
  const db = drizzle(c.env.DB);

  await db
    .update(emails)
    .set({ status: "sent", sentAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    .where(eq(emails.id, id));

  return c.json({ status: "success", message: "이메일이 발송되었습니다" });
});

/**
 * POST /emails/:id/reclassify - AI 재분류
 */
emailsRouter.post("/:id/reclassify", async (c) => {
  const id = parseInt(c.req.param("id"));
  const db = drizzle(c.env.DB);

  const [email] = await db
    .select()
    .from(emails)
    .where(eq(emails.id, id))
    .limit(1);

  if (!email) {
    return c.json({ detail: "이메일을 찾을 수 없습니다" }, 404);
  }

  const prompt = classifyEmailPrompt(email.sender || "", email.subject || "", email.body || "");
  const classification = await askGemini(c.env.GOOGLE_API_KEY, prompt);

  let category = "기타";
  const categories = ["발주", "요청", "견적요청", "문의", "공지", "미팅", "클레임"];
  for (const cat of categories) {
    if (classification.includes(cat)) {
      category = cat;
      break;
    }
  }

  await db
    .update(emails)
    .set({ category: category as any, updatedAt: new Date().toISOString() })
    .where(eq(emails.id, id));

  return c.json({ status: "success", message: "AI 재분류가 완료되었습니다", category });
});

/**
 * POST /emails/:id/generate-draft - AI 답신 생성
 */
emailsRouter.post("/:id/generate-draft", async (c) => {
  const id = parseInt(c.req.param("id"));
  const db = drizzle(c.env.DB);

  const [email] = await db
    .select()
    .from(emails)
    .where(eq(emails.id, id))
    .limit(1);

  if (!email) {
    return c.json({ detail: "이메일을 찾을 수 없습니다" }, 404);
  }

  const prompt = `다음 비즈니스 이메일에 대한 전문적인 한국어 답신을 작성해주세요.

발신자: ${email.sender}
제목: ${email.subject}
내용: ${email.body?.slice(0, 2000)}

답신 요구사항:
1. 비즈니스 경어체 사용
2. 구체적이고 실질적인 내용
3. 적절한 인사말과 마무리`;

  const draft = await askClaude(c.env.ANTHROPIC_API_KEY, prompt);

  await db
    .update(emails)
    .set({
      aiDraftResponse: draft,
      status: "draft",
      updatedAt: new Date().toISOString(),
    })
    .where(eq(emails.id, id));

  return c.json({ status: "success", draft });
});

export default emailsRouter;
