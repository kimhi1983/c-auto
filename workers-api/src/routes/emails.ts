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
 * POST /emails/fetch - 이메일 수신 (비즈니스 이메일 수신 시뮬레이션)
 */
emailsRouter.post("/fetch", async (c) => {
  const maxCount = Math.min(parseInt(c.req.query("max_count") || "3"), 5);
  const user = c.get("user");
  const db = drizzle(c.env.DB);
  const now = new Date().toISOString();

  // 한국 무역/제조 회사 비즈니스 이메일 샘플 풀
  const sampleEmails = [
    {
      sender: "김태호 부장 <th.kim@startech.co.kr>",
      subject: "[발주] ST-2400 부품 500개 긴급 발주 요청",
      body: "안녕하세요, 스타텍 김태호입니다.\n\n다름이 아니라 ST-2400 부품 500개를 긴급으로 발주 요청드립니다. 현재 생산라인 가동에 필요한 재고가 부족한 상황이며, 가능한 이번 주 금요일까지 납품 부탁드립니다.\n\n단가는 기존 계약 조건(개당 12,500원)으로 진행 부탁드리며, 납기 가능 여부 회신 부탁드립니다.\n\n감사합니다.",
      category: "발주",
      priority: "high",
      summary: "ST-2400 부품 500개 긴급 발주 요청, 금요일까지 납품 필요",
    },
    {
      sender: "박지연 대리 <jy.park@dongwoo-ind.com>",
      subject: "[견적요청] 2024년 하반기 원자재 견적 요청",
      body: "안녕하세요, 동우산업 구매팀 박지연입니다.\n\n2024년 하반기 원자재 공급 관련하여 견적을 요청드립니다. 대상 품목은 알루미늄 합금(A6061) 10톤, 스테인리스 강판(SUS304) 5톤입니다.\n\n견적서에 단가, 납기, 결제조건을 포함하여 다음 주 수요일까지 회신 부탁드립니다.\n\n감사합니다.",
      category: "견적요청",
      priority: "medium",
      summary: "하반기 원자재(알루미늄, 스테인리스) 견적 요청",
    },
    {
      sender: "이수민 과장 <sm.lee@globalcomm.kr>",
      subject: "[문의] OEM 제품 커스터마이징 가능 여부 문의",
      body: "안녕하세요, 글로벌커뮤니케이션 이수민입니다.\n\n귀사의 GC-100 시리즈 제품에 대해 OEM 커스터마이징이 가능한지 문의드립니다. 자사 브랜드 로고 각인과 패키지 디자인 변경이 필요하며, 월 1,000대 규모로 검토 중입니다.\n\n가능 여부와 최소 주문 수량, 리드타임에 대해 안내 부탁드립니다.",
      category: "문의",
      priority: "medium",
      summary: "GC-100 시리즈 OEM 커스터마이징 가능 여부 문의",
    },
    {
      sender: "정현우 팀장 <hw.jung@hankook-parts.co.kr>",
      subject: "[클레임] 납품 제품 품질 불량 건 통보",
      body: "안녕하세요, 한국부품 품질관리팀 정현우입니다.\n\n지난 2월 5일 납품받은 HK-350 부품 200개 중 15개에서 치수 불량이 확인되었습니다. 규격 대비 0.3mm 초과 상태이며, 현재 생산라인 투입이 불가합니다.\n\n즉시 불량품 교체 및 원인 분석 보고서를 요청드립니다. 납품 품질 관리에 각별한 주의를 부탁드립니다.\n\n담당자 연락 부탁드립니다.",
      category: "클레임",
      priority: "high",
      summary: "HK-350 부품 치수 불량(15개), 즉시 교체 및 원인 분석 요청",
    },
    {
      sender: "최영진 상무 <yj.choi@samhwa-group.com>",
      subject: "[미팅] 2월 전략 파트너십 회의 일정 안내",
      body: "안녕하세요, 삼화그룹 경영전략실 최영진입니다.\n\n2025년 전략 파트너십 관련 회의를 아래와 같이 안내드립니다.\n\n일시: 2월 20일(목) 오후 2시\n장소: 삼화그룹 본사 15층 회의실\n안건: 하반기 공동 마케팅 전략, 신규 사업 협력 방안\n\n참석 가능 여부를 2월 17일까지 회신 부탁드립니다.",
      category: "미팅",
      priority: "medium",
      summary: "2월 20일 전략 파트너십 회의 일정 안내 및 참석 확인 요청",
    },
    {
      sender: "송미경 차장 <mk.song@keumsung.co.kr>",
      subject: "[요청] 2월 납품 일정 변경 요청",
      body: "안녕하세요, 금성전자 구매팀 송미경입니다.\n\n기존 2월 15일로 예정되어 있던 KS-200 부품 납품 일정을 2월 22일로 변경 요청드립니다. 자사 생산계획 조정으로 인해 입고 일정이 1주일 연기되었습니다.\n\n변경 가능 여부를 확인하여 회신 부탁드립니다. 불편을 드려 죄송합니다.",
      category: "요청",
      priority: "medium",
      summary: "KS-200 부품 납품 일정 2/15 → 2/22로 변경 요청",
    },
    {
      sender: "인사팀 <hr@company.com>",
      subject: "[공지] 2025년 상반기 정기 건강검진 안내",
      body: "안녕하세요, 인사팀입니다.\n\n2025년 상반기 정기 건강검진을 아래와 같이 안내드립니다.\n\n대상: 전 직원\n기간: 3월 3일 ~ 3월 28일\n검진기관: 서울아산병원 건강증진센터\n\n개인별 검진 일정은 별도 안내 예정이며, 검진 전 유의사항을 첨부 파일에서 확인해 주시기 바랍니다.",
      category: "공지",
      priority: "low",
      summary: "2025년 상반기 정기 건강검진 안내 (3월 3일~28일)",
    },
    {
      sender: "왕웨이 매니저 <wang.wei@shenzhen-tech.cn>",
      subject: "[발주] PCB 기판 3,000장 발주 (PO#CN-2025-0213)",
      body: "안녕하세요, 심천테크 왕웨이입니다.\n\n아래와 같이 PCB 기판을 발주합니다.\n\n품목: FR-4 양면 PCB 기판\n수량: 3,000장\n규격: 100mm x 80mm, 1.6mm 두께\n납기: 3월 15일\nPO번호: CN-2025-0213\n\n기존 단가(장당 $2.50, FOB 선전) 기준으로 진행 부탁드립니다. 선적 서류는 B/L, Invoice, Packing List 필요합니다.",
      category: "발주",
      priority: "high",
      summary: "PCB 기판 3,000장 발주 (FOB 선전, 3/15 납기)",
    },
    {
      sender: "한지은 대리 <je.han@mirae-auto.com>",
      subject: "[견적요청] 자동차 부품 시작품 제작 견적",
      body: "안녕하세요, 미래자동차 R&D센터 한지은입니다.\n\n신규 개발 중인 전기차 모터 하우징 시작품 제작 견적을 요청드립니다.\n\n재질: ADC12 알루미늄 다이캐스팅\n수량: 시작품 50개\n도면: 첨부 파일 참조\n납기 희망: 4주 이내\n\n기술 검토 후 견적서와 함께 제작 가능 여부를 회신해 주시기 바랍니다.",
      category: "견적요청",
      priority: "medium",
      summary: "전기차 모터 하우징 시작품 50개 제작 견적 요청",
    },
    {
      sender: "오성준 부장 <sj.oh@daehang-logistics.kr>",
      subject: "[요청] 수출 통관 서류 긴급 요청",
      body: "안녕하세요, 대항물류 오성준입니다.\n\n2월 14일 선적 예정인 컨테이너(BOOKING NO: DH-250214) 관련하여 수출 통관 서류를 긴급히 요청드립니다.\n\n필요 서류: Commercial Invoice, Packing List, Certificate of Origin\n마감: 오늘 오후 5시까지\n\n선적 일정에 차질이 없도록 협조 부탁드립니다.",
      category: "요청",
      priority: "high",
      summary: "2/14 선적 건 수출 통관 서류 오늘 오후 5시까지 긴급 요청",
    },
  ];

  try {
    // 랜덤 셔플 후 maxCount만큼 선택
    const shuffled = [...sampleEmails].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, maxCount);

    const processed: Array<Record<string, unknown>> = [];

    for (const mail of selected) {
      const externalId = `gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
          aiSummary: mail.summary,
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
      message: `${processed.length}개 이메일 처리 완료`,
      count: processed.length,
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
  const classification = await askClaude(c.env.ANTHROPIC_API_KEY, prompt);

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
