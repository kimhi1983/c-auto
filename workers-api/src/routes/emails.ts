/**
 * Email Management Routes - /api/v1/emails
 * KPROS 5-카테고리 AI 자동화 시스템 v2
 */
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, desc, like, and, sql, count } from "drizzle-orm";
import { emails, emailApprovals } from "../db/schema";
import { authMiddleware, requireApprover } from "../middleware/auth";
import { classifyEmailAdvanced, askClaudeLong, KPROS_EMAIL_SYSTEM_PROMPT } from "../services/ai";
import {
  isGmailConfigured,
  getGmailAccessToken,
  listGmailMessages,
  getGmailMessage,
  parseGmailMessage,
} from "../services/gmail";
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
 * POST /emails/fetch - Gmail API로 메일 가져오기 (KPROS 5분류 AI 분석)
 * 하이웍스 → Gmail POP3 포워딩 → Gmail API → C-Auto
 */
emailsRouter.post("/fetch", async (c) => {
  const maxCount = Math.min(parseInt(c.req.query("max_count") || "5"), 20);
  const user = c.get("user");
  const db = drizzle(c.env.DB);
  const now = new Date().toISOString();

  // ── Gmail API 연동 모드 ──
  if (isGmailConfigured(c.env)) {
    try {
      const accessToken = await getGmailAccessToken(
        c.env.CACHE!,
        c.env.GMAIL_CLIENT_ID!,
        c.env.GMAIL_CLIENT_SECRET!
      );

      if (!accessToken) {
        return c.json({
          status: "error",
          detail: "Gmail 인증이 만료되었습니다. 관리자가 재인증해야 합니다.",
          need_reauth: true,
        }, 401);
      }

      // Gmail KPROS 라벨에서 메일 목록 가져오기
      const listRes = await listGmailMessages(accessToken, maxCount, "label:KPROS is:unread");

      if (!listRes.messages || listRes.messages.length === 0) {
        // 읽지 않은 메일이 없으면 KPROS 라벨 전체에서 재시도
        const allRes = await listGmailMessages(accessToken, maxCount, "label:KPROS");
        if (!allRes.messages || allRes.messages.length === 0) {
          return c.json({
            status: "success",
            message: "KPROS 라벨에 새 이메일이 없습니다",
            count: 0,
            source: "gmail",
            data: [],
          });
        }
        listRes.messages = allRes.messages;
      }

      const processed: Array<Record<string, unknown>> = [];

      for (const ref of listRes.messages) {
        // 이미 가져온 메일인지 확인
        const [existing] = await db
          .select({ id: emails.id })
          .from(emails)
          .where(eq(emails.externalId, `gmail-${ref.id}`))
          .limit(1);

        if (existing) continue;

        // 메일 상세 조회
        const fullMsg = await getGmailMessage(accessToken, ref.id);
        const parsed = parseGmailMessage(fullMsg);

        // KPROS AI 고급 분류
        let category = "필터링";
        let priority = "medium";
        let aiSummaryJson = "";
        let draftReply = "";
        let draftSubject = "";
        let confidence = 0;

        try {
          const classification = await classifyEmailAdvanced(
            c.env.ANTHROPIC_API_KEY,
            parsed.from,
            parsed.subject,
            parsed.body
          );
          const jsonMatch = classification.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const p = JSON.parse(jsonMatch[0]);
            category = p.category || "필터링";
            priority = p.priority || "medium";
            confidence = p.confidence || 0;
            draftReply = p.draft_reply || "";
            draftSubject = p.draft_subject || "";
            // aiSummary에 전체 AI 분석 JSON 저장
            aiSummaryJson = JSON.stringify({
              code: p.code || "E",
              summary: p.summary || "",
              importance: p.importance || "하",
              action_items: p.action_items || "",
              search_keywords: p.search_keywords || [],
              director_report: p.director_report || "",
              needs_approval: p.needs_approval ?? true,
              company_name: p.company_name || "",
              sender_info: p.sender_info || "",
              estimated_revenue: p.estimated_revenue || "",
              note: p.note || "",
            });
          }
        } catch {
          aiSummaryJson = JSON.stringify({
            code: "E",
            summary: parsed.snippet || parsed.subject,
            importance: "하",
            action_items: "",
            search_keywords: [],
            director_report: "",
            needs_approval: false,
            company_name: "",
            sender_info: "",
            estimated_revenue: "",
            note: "AI 분류 실패 - 수동 확인 필요",
          });
        }

        const [inserted] = await db
          .insert(emails)
          .values({
            externalId: `gmail-${ref.id}`,
            subject: parsed.subject,
            sender: parsed.from,
            recipient: parsed.to || user.email,
            body: parsed.body,
            bodyHtml: parsed.bodyHtml || null,
            category: category as any,
            priority: priority as any,
            status: "unread",
            aiSummary: aiSummaryJson || null,
            aiDraftResponse: draftReply || null,
            draftSubject: draftSubject || null,
            aiConfidence: confidence,
            processedBy: user.userId,
            receivedAt: parsed.date || now,
            processedAt: now,
          })
          .returning();

        processed.push({
          id: inserted.id,
          subject: inserted.subject,
          sender: inserted.sender,
          category: inserted.category,
          priority: inserted.priority,
          ai_summary: inserted.aiSummary,
        });
      }

      return c.json({
        status: "success",
        message: `Gmail KPROS 라벨에서 ${processed.length}개 이메일 가져오기 완료`,
        count: processed.length,
        source: "gmail",
        data: processed,
      });
    } catch (err: any) {
      return c.json(
        { status: "error", detail: `Gmail 메일 가져오기 실패: ${err.message}` },
        500
      );
    }
  }

  // ── KPROS 샘플 이메일 모드 (데모) ──
  const sampleEmails = [
    {
      sender: "박지민 과장 <park@abccosmetic.com>",
      subject: "KPROS 히알루론산 관련 자료 요청",
      body: "안녕하세요, ABC코스메틱 구매팀 박지민입니다.\n\n귀사의 히알루론산 나트륨(Sodium Hyaluronate) 제품에 관심이 있어 연락드립니다.\n\n아래 자료를 보내주실 수 있을까요?\n1. 제품 카탈로그\n2. MSDS (국문)\n3. CoA (최신 로트)\n\n감사합니다.",
      category: "자료대응", priority: "medium",
      aiSummary: JSON.stringify({ code: "A", summary: "ABC코스메틱에서 히알루론산 나트륨 카탈로그, MSDS, CoA 요청", importance: "중", action_items: "드롭박스에서 히알루론산 관련 파일 검색 후 첨부 회신", search_keywords: ["히알루론산", "Sodium Hyaluronate", "HA", "MSDS", "CoA"], director_report: "ABC코스메틱 구매팀에서 HA 자료 3종 요청. 파일 첨부 회신 준비 완료.", needs_approval: false, company_name: "ABC코스메틱", sender_info: "박지민 (과장)", estimated_revenue: "", note: "" }),
      draftReply: "안녕하세요, KPROS입니다.\n\n히알루론산 나트륨(Sodium Hyaluronate) 제품에 관심 가져주셔서 감사합니다.\n\n요청하신 자료를 첨부하여 드리오니 확인 부탁드립니다.\n\n[첨부파일]\n1. SodiumHyaluronate_카탈로그_v2024.pdf\n2. SodiumHyaluronate_MSDS_KR.pdf\n3. SodiumHyaluronate_CoA_Lot240301.pdf\n\n추가로 궁금하신 사항이 있으시면 언제든 말씀해 주세요.\n감사합니다.\n\nKPROS 드림",
    },
    {
      sender: "김태호 부장 <th.kim@startech.co.kr>",
      subject: "[견적] 히알루론산 나트륨 외 3종 견적 요청",
      body: "안녕하세요, 스타텍 김태호입니다.\n\n아래 품목에 대해 견적을 요청드립니다.\n\n1. 히알루론산 나트륨 50kg\n2. 나이아신아마이드 100kg\n3. 알란토인 30kg\n4. 판테놀 50kg\n\n납기: 2주 이내 희망\n결제조건: 월말 정산\n\n견적서 회신 부탁드립니다.",
      category: "영업기회", priority: "high",
      aiSummary: JSON.stringify({ code: "B", summary: "스타텍에서 히알루론산 외 3종 총 4품목 견적 요청 (230kg)", importance: "상", action_items: "이사님께 단가 확인 요청 후 견적서 작성 발송 예정", search_keywords: [], director_report: "스타텍 김태호 부장, 4품목 230kg 견적 요청. 예상 매출 약 800만원. 우선 접수 확인 발송, 견적서는 이사님 단가 확인 후 발송.", needs_approval: true, company_name: "스타텍", sender_info: "김태호 (부장)", estimated_revenue: "약 800만원", note: "신규 대량 거래 기회" }),
      draftReply: "안녕하세요, KPROS입니다.\n\n견적 문의해 주셔서 감사합니다.\n\n요청하신 4개 품목(히알루론산 나트륨, 나이아신아마이드, 알란토인, 판테놀)에 대해 확인 후 상세 견적서를 보내드리겠습니다.\n\n영업일 기준 1~2일 이내 안내 가능하오니 양해 부탁드립니다.\n\n추가로 확인이 필요한 사항이 있으시면 말씀해 주세요.\n감사합니다.\n\nKPROS 드림",
    },
    {
      sender: "이수민 과장 <sm.lee@globalcomm.kr>",
      subject: "미팅 요청 - 2025년 공급 계약 논의",
      body: "안녕하세요, 글로벌커뮤니케이션 이수민입니다.\n\n2025년 원료 공급 계약 관련하여 미팅을 요청드립니다.\n\n일시: 2월 25일(화) 오후 2시 또는 2월 26일(수) 오전 10시\n장소: KPROS 본사 또는 화상회의\n안건: 연간 공급량 및 단가 협의\n\n참석 가능 여부 회신 부탁드립니다.",
      category: "스케줄링", priority: "medium",
      aiSummary: JSON.stringify({ code: "C", summary: "글로벌커뮤니케이션에서 2025년 공급 계약 미팅 요청 (2/25 또는 2/26)", importance: "중", action_items: "이사님 일정 확인 후 수락/대안 답변 발송", search_keywords: [], director_report: "글로벌커뮤니케이션 이수민 과장, 연간 공급 계약 미팅 제안. 2/25 오후2시 또는 2/26 오전10시. 이사님 일정 확인 필요.", needs_approval: true, company_name: "글로벌커뮤니케이션", sender_info: "이수민 (과장)", estimated_revenue: "", note: "" }),
      draftReply: "안녕하세요, KPROS입니다.\n\n미팅 제안 감사합니다.\n말씀하신 2월 25일(화) 오후 2시에 일정이 가능하여, 해당 시간으로 확정하겠습니다.\n\n미팅 전 준비해야 할 자료가 있으시면 사전에 공유 부탁드립니다.\n당일 뵙겠습니다.\n\n감사합니다.\nKPROS 드림",
    },
    {
      sender: "원료팀 <materials@globalchem.co.kr>",
      subject: "[공지] 히알루론산 원료 단가 인상 통보",
      body: "안녕하세요, 글로벌케미칼 원료팀입니다.\n\n글로벌 발효 원료 공급 부족에 따라 히알루론산 나트륨 단가를 아래와 같이 조정합니다.\n\n변동 내용:\n- 대상: 히알루론산 나트륨 (Sodium Hyaluronate)\n- 현행: kg당 ₩45,000\n- 변경: kg당 ₩48,600 (8% 인상)\n- 적용: 2025년 4월 1일부터\n\n양해 부탁드립니다.",
      category: "정보수집", priority: "medium",
      aiSummary: JSON.stringify({ code: "D", summary: "글로벌케미칼에서 히알루론산 나트륨 8% 단가 인상 통보 (4/1 적용)", importance: "상", action_items: "2차 공급사 단가 비교 + 현재 단가 재고 확보 검토", search_keywords: [], director_report: "히알루론산 나트륨 8% 인상(₩45,000→₩48,600), 4/1 적용. 주력 세럼 원가 약 3.2% 상승 예상. 대체 공급사 검토 권장.", needs_approval: false, company_name: "글로벌케미칼", sender_info: "원료팀", estimated_revenue: "", note: "원가 영향 분석 필요" }),
      draftReply: "",
    },
    {
      sender: "marketing@spamcorp.com",
      subject: "[광고] 무료 마케팅 컨설팅 제안",
      body: "귀사의 매출 200% 성장을 약속합니다!\n\n지금 바로 무료 상담을 받아보세요.\n\n☎ 1588-XXXX\n\n수신거부: reply STOP",
      category: "필터링", priority: "low",
      aiSummary: JSON.stringify({ code: "E", summary: "스팸 광고 메일 - 마케팅 컨설팅 제안", importance: "하", action_items: "응대 불필요", search_keywords: [], director_report: "", needs_approval: false, company_name: "", sender_info: "", estimated_revenue: "", note: "스팸" }),
      draftReply: "",
    },
  ];

  try {
    const shuffled = [...sampleEmails].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, Math.min(maxCount, 5));
    const processed: Array<Record<string, unknown>> = [];

    for (const mail of selected) {
      const externalId = `sample-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const receivedAt = new Date(Date.now() - Math.floor(Math.random() * 3600000)).toISOString();

      const [inserted] = await db
        .insert(emails)
        .values({
          externalId,
          subject: mail.subject,
          sender: mail.sender,
          recipient: user.email,
          body: mail.body,
          category: mail.category as any,
          priority: mail.priority as any,
          status: "unread",
          aiSummary: mail.aiSummary,
          aiDraftResponse: mail.draftReply || null,
          aiConfidence: 90 + Math.floor(Math.random() * 10),
          processedBy: user.userId,
          receivedAt,
          processedAt: now,
        })
        .returning();

      processed.push({
        id: inserted.id,
        subject: inserted.subject,
        sender: inserted.sender,
        category: inserted.category,
        priority: inserted.priority,
        ai_summary: inserted.aiSummary,
      });
    }

    return c.json({
      status: "success",
      message: `${processed.length}개 샘플 이메일 생성 (KPROS 데모 모드)`,
      count: processed.length,
      source: "sample",
      data: processed,
    });
  } catch (err: any) {
    return c.json(
      { status: "error", detail: `이메일 가져오기 실패: ${err.message}` },
      500
    );
  }
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
 * POST /emails/:id/reclassify - KPROS AI 재분류
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

  try {
    const classification = await classifyEmailAdvanced(
      c.env.ANTHROPIC_API_KEY,
      email.sender || "",
      email.subject || "",
      email.body || ""
    );
    const jsonMatch = classification.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const p = JSON.parse(jsonMatch[0]);
      const category = p.category || "필터링";
      const priority = p.priority || "medium";
      const draftReply = p.draft_reply || "";
      const draftSubject = p.draft_subject || "";
      const confidence = p.confidence || 0;
      const aiSummaryJson = JSON.stringify({
        code: p.code || "E",
        summary: p.summary || "",
        importance: p.importance || "하",
        action_items: p.action_items || "",
        search_keywords: p.search_keywords || [],
        director_report: p.director_report || "",
        needs_approval: p.needs_approval ?? true,
        company_name: p.company_name || "",
        sender_info: p.sender_info || "",
        estimated_revenue: p.estimated_revenue || "",
        note: p.note || "",
      });

      await db
        .update(emails)
        .set({
          category: category as any,
          priority: priority as any,
          aiSummary: aiSummaryJson,
          aiDraftResponse: draftReply || null,
          draftSubject: draftSubject || null,
          aiConfidence: confidence,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(emails.id, id));

      return c.json({ status: "success", message: "KPROS AI 재분류 완료", category, code: p.code });
    }
  } catch (err: any) {
    return c.json({ status: "error", detail: `재분류 실패: ${err.message}` }, 500);
  }

  return c.json({ status: "error", detail: "AI 응답 파싱 실패" }, 500);
});

/**
 * POST /emails/:id/generate-draft - KPROS AI 답신 생성
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

  const prompt = `다음 비즈니스 이메일에 대한 답신을 작성해주세요.
답변 서두에 "안녕하세요, KPROS입니다."를 포함하고, 마무리에 "KPROS 드림"을 넣어주세요.

발신자: ${email.sender}
제목: ${email.subject}
카테고리: ${email.category}
내용: ${email.body?.slice(0, 2000)}

카테고리별 답변 규칙:
- 자료대응: "요청하신 자료를 첨부하여 드립니다." 포함
- 영업기회: "문의해 주셔서 감사합니다. 검토 후 상세 견적서를 보내드리겠습니다." 포함, 단가 직접 기재 금지
- 스케줄링: 수락 버전으로 작성
- 정보수집/필터링: "답변이 필요하지 않은 메일입니다."로 간략히`;

  const draft = await askClaudeLong(c.env.ANTHROPIC_API_KEY, prompt, KPROS_EMAIL_SYSTEM_PROMPT, 1024);

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
