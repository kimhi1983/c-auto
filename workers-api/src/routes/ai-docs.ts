/**
 * AI Document Generation & Analysis Routes - /api/v1/ai-docs
 */
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, desc } from "drizzle-orm";
import { archivedDocuments, emails } from "../db/schema";
import { authMiddleware } from "../middleware/auth";
import { askAILong, SYSTEM_PROMPTS } from "../services/ai";
import type { Env } from "../types";

const aiDocs = new Hono<{ Bindings: Env }>();

aiDocs.use("*", authMiddleware);

// 7종 문서 템플릿
const TEMPLATES = [
  {
    id: "work_instruction",
    name: "업무지시서",
    description: "업무 지시/배분 문서",
    icon: "📋",
  },
  {
    id: "business_report",
    name: "업무보고서",
    description: "업무 결과 보고",
    icon: "📊",
  },
  {
    id: "meeting_minutes",
    name: "회의록",
    description: "회의 내용 기록",
    icon: "📝",
  },
  {
    id: "quotation",
    name: "견적서",
    description: "가격 견적 제출",
    icon: "💰",
  },
  {
    id: "business_letter",
    name: "비즈니스 서신",
    description: "공식 서신 발송",
    icon: "✉️",
  },
  {
    id: "contract_review",
    name: "계약서 검토",
    description: "계약 조항 분석",
    icon: "📄",
  },
  {
    id: "email_summary",
    name: "이메일 분석",
    description: "수신 이메일 종합 분석",
    icon: "📧",
  },
];

/**
 * GET /ai-docs/templates - 템플릿 목록
 */
aiDocs.get("/templates", (c) => {
  return c.json({ status: "success", templates: TEMPLATES });
});

/**
 * POST /ai-docs/generate - 문서 생성
 * 프론트엔드: { context, title, template_id(query) }
 */
aiDocs.post("/generate", async (c) => {
  const templateIdQuery = c.req.query("template_id");
  const body = await c.req.json<{
    template_id?: string;
    context?: string;
    content?: string;
    title?: string;
  }>();

  const template_id = templateIdQuery || body.template_id;
  const inputContent = body.context || body.content;

  if (!template_id || !inputContent) {
    return c.json({ detail: "템플릿과 내용을 입력하세요" }, 400);
  }

  const template = TEMPLATES.find((t) => t.id === template_id);
  if (!template) {
    return c.json({ detail: "유효하지 않은 템플릿입니다" }, 400);
  }

  const prompt = `[문서 유형: ${template.name}]

아래 내용을 바탕으로 공식 ${template.name}를 작성해주세요:

${inputContent}

요구사항:
- 문서번호, 작성일자 포함
- 수신/발신 정보 포함 (내용에서 추론)
- 항목별 번호 매기기
- 한국 비즈니스 문서 관례 준수
- 공식적이고 전문적인 어조`;

  const result = await askAILong(
    c.env.AI,
    prompt,
    SYSTEM_PROMPTS.documentWriter
  );

  // 자동 아카이브 저장
  const user = c.get("user");
  const db = drizzle(c.env.DB);
  const fileName = `${template.name}_${new Date().toISOString().split("T")[0]}.md`;

  await db.insert(archivedDocuments).values({
    documentType: "ai_document",
    fileName,
    filePath: `ai-docs/${template_id}/${Date.now()}.md`,
    companyName: null,
    category: template_id,
    description: inputContent.slice(0, 200),
    createdBy: user.userId,
  });

  return c.json({
    status: "success",
    data: { content: result },
    template: template.name,
    saved: true,
  });
});

/**
 * POST /ai-docs/generate-from-email/:id - 이메일 기반 문서 생성
 */
aiDocs.post("/generate-from-email/:id", async (c) => {
  const emailId = parseInt(c.req.param("id"));
  const { template_id } = await c.req.json<{ template_id: string }>();

  const db = drizzle(c.env.DB);
  const [email] = await db
    .select()
    .from(emails)
    .where(eq(emails.id, emailId))
    .limit(1);

  if (!email) {
    return c.json({ detail: "이메일을 찾을 수 없습니다" }, 404);
  }

  const template = TEMPLATES.find((t) => t.id === template_id);
  const prompt = `[이메일 기반 ${template?.name || "문서"} 작성]

발신자: ${email.sender}
제목: ${email.subject}
분류: ${email.category}
내용:
${email.body?.slice(0, 3000)}

위 이메일 내용을 바탕으로 ${template?.name || "업무지시서"}를 작성해주세요.`;

  const result = await askAILong(
    c.env.AI,
    prompt,
    SYSTEM_PROMPTS.documentWriter
  );

  return c.json({
    status: "success",
    data: { content: result },
    template: template?.name,
    emailId,
  });
});

/**
 * POST /ai-docs/analyze - 문서 분석
 */
aiDocs.post("/analyze", async (c) => {
  const { analysis_type, content } = await c.req.json<{
    analysis_type: "general" | "contract" | "financial" | "risk";
    content: string;
  }>();

  if (!content) {
    return c.json({ detail: "분석할 내용을 입력하세요" }, 400);
  }

  const typeLabels: Record<string, string> = {
    general: "종합 분석",
    contract: "계약 분석",
    financial: "재무 분석",
    risk: "리스크 분석",
  };

  const typePrompts: Record<string, string> = {
    general: `다음 문서를 종합적으로 분석해주세요:
1. 핵심 의도 및 목적
2. 중요 포인트 3~5가지
3. 대응 방안 3가지 (적극적/중립적/보수적)
4. 주의사항`,
    contract: `다음 계약서/계약 내용을 분석해주세요:
1. 주요 조항별 분석
2. 법률적 리스크 식별
3. 유불리 판단
4. 수정 권고사항
5. 협상 포인트`,
    financial: `다음 내용의 재무적 측면을 분석해주세요:
1. 금액 및 결제조건 분석
2. 환율 리스크 (해당 시)
3. 원가/마진 영향
4. 재무적 리스크 요인
5. 재무 전략 제안`,
    risk: `다음 내용의 리스크를 분석해주세요:
1. 식별된 리스크 목록 (확률/영향도)
2. 리스크 매트릭스
3. 각 리스크별 대응 방안
4. 모니터링 포인트
5. 비상 계획`,
  };

  const prompt = `${typePrompts[analysis_type] || typePrompts.general}

분석 대상:
${content}`;

  const result = await askAILong(
    c.env.AI,
    prompt,
    SYSTEM_PROMPTS.documentAnalyzer
  );

  return c.json({
    status: "success",
    data: { content: result },
    analysis_type: typeLabels[analysis_type],
  });
});

/**
 * POST /ai-docs/rewrite - 문서 수정/개선
 * 프론트엔드: { content, instructions }
 */
aiDocs.post("/rewrite", async (c) => {
  const body = await c.req.json<{
    content?: string;
    original?: string;
    instructions: string;
  }>();

  const original = body.content || body.original;

  if (!original || !body.instructions) {
    return c.json({ detail: "원본 문서와 수정 지시사항을 입력하세요" }, 400);
  }

  const prompt = `다음 문서를 주어진 지시사항에 따라 수정/개선해주세요.

[원본 문서]
${original}

[수정 지시사항]
${body.instructions}

수정된 전체 문서를 출력하세요.`;

  const result = await askAILong(c.env.AI, prompt);

  return c.json({
    status: "success",
    data: { content: result },
  });
});

/**
 * GET /ai-docs/history - 생성 히스토리
 */
aiDocs.get("/history", async (c) => {
  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("page_size") || c.req.query("limit") || "20");
  const db = drizzle(c.env.DB);

  const docs = await db
    .select()
    .from(archivedDocuments)
    .where(eq(archivedDocuments.documentType, "ai_document"))
    .orderBy(desc(archivedDocuments.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);

  // 프론트엔드 호환: snake_case 필드
  const documents = docs.map((d) => ({
    id: d.id,
    file_name: d.fileName,
    category: d.category,
    description: d.description,
    file_size: d.fileSize || 0,
    created_at: d.createdAt,
  }));

  return c.json({ status: "success", documents });
});

export default aiDocs;
