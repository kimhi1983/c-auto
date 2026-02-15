/**
 * Archive Routes - /api/v1/archives
 */
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, desc, like, and, count, gte, sql } from "drizzle-orm";
import { archivedDocuments, dailyReports, emails } from "../db/schema";
import { authMiddleware } from "../middleware/auth";
import { askAIAnalyze } from "../services/ai";
import type { Env } from "../types";

const archives = new Hono<{ Bindings: Env }>();

archives.use("*", authMiddleware);

/**
 * GET /archives - 아카이브 목록
 */
archives.get("/", async (c) => {
  const db = drizzle(c.env.DB);
  const docType = c.req.query("document_type") || c.req.query("type");
  const category = c.req.query("category");
  const company = c.req.query("company");
  const search = c.req.query("search");
  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("page_size") || c.req.query("limit") || "20");

  const conditions = [];
  if (docType) conditions.push(eq(archivedDocuments.documentType, docType as any));
  if (category) conditions.push(eq(archivedDocuments.category, category));
  if (company) conditions.push(like(archivedDocuments.companyName, `%${company}%`));
  if (search) conditions.push(like(archivedDocuments.fileName, `%${search}%`));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [docs, [{ total }]] = await Promise.all([
    db
      .select()
      .from(archivedDocuments)
      .where(where)
      .orderBy(desc(archivedDocuments.createdAt))
      .limit(limit)
      .offset((page - 1) * limit),
    db.select({ total: count() }).from(archivedDocuments).where(where),
  ]);

  // snake_case 변환
  const archiveList = docs.map((d) => ({
    id: d.id,
    email_id: d.emailId,
    document_type: d.documentType,
    file_name: d.fileName,
    file_path: d.filePath,
    file_size: d.fileSize || 0,
    company_name: d.companyName,
    category: d.category,
    description: d.description,
    archived_date: d.archivedDate || d.createdAt,
  }));

  const totalPages = Math.ceil(total / limit);

  return c.json({
    archives: archiveList,
    total,
    total_pages: totalPages,
    page,
  });
});

/**
 * GET /archives/stats - 아카이브 통계
 */
archives.get("/stats", async (c) => {
  const db = drizzle(c.env.DB);

  const [{ total }] = await db
    .select({ total: count() })
    .from(archivedDocuments);

  const byType = await db
    .select({
      type: archivedDocuments.documentType,
      count: count(),
    })
    .from(archivedDocuments)
    .groupBy(archivedDocuments.documentType);

  const byCategory = await db
    .select({
      category: archivedDocuments.category,
      count: count(),
    })
    .from(archivedDocuments)
    .groupBy(archivedDocuments.category);

  // 최근 7일
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const [recentResult] = await db
    .select({ total: count() })
    .from(archivedDocuments)
    .where(gte(archivedDocuments.createdAt, sevenDaysAgo.toISOString()));

  const [reportResult] = await db
    .select({ total: count() })
    .from(dailyReports);

  const byTypeObj: Record<string, number> = {};
  for (const row of byType) {
    if (row.type) byTypeObj[row.type] = row.count;
  }

  const byCategoryObj: Record<string, number> = {};
  for (const row of byCategory) {
    if (row.category) byCategoryObj[row.category] = row.count;
  }

  return c.json({
    status: "success",
    data: {
      total_archives: total,
      recent_7days: recentResult.total,
      total_size_bytes: 0,
      total_size_mb: 0,
      total_reports: reportResult.total,
      by_type: byTypeObj,
      by_category: byCategoryObj,
    },
  });
});

/**
 * GET /archives/reports - 보고서 목록 (프론트엔드 호환)
 */
archives.get("/reports", async (c) => {
  const db = drizzle(c.env.DB);

  const reportList = await db
    .select()
    .from(dailyReports)
    .orderBy(desc(dailyReports.reportDate))
    .limit(30);

  const reports = reportList.map((r) => ({
    id: r.id,
    report_date: r.reportDate,
    report_type: r.reportType,
    file_name: r.fileName || `report_${r.reportDate}.txt`,
    email_count: r.emailCount || 0,
    summary: r.summaryText,
    created_at: r.createdAt,
  }));

  return c.json({ reports });
});

/**
 * GET /archives/reports/list - 보고서 목록 (레거시 경로)
 */
archives.get("/reports/list", async (c) => {
  const db = drizzle(c.env.DB);

  const reports = await db
    .select()
    .from(dailyReports)
    .orderBy(desc(dailyReports.reportDate))
    .limit(30);

  return c.json({ reports });
});

/**
 * GET /archives/:id - 아카이브 상세
 */
archives.get("/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  const db = drizzle(c.env.DB);

  const [doc] = await db
    .select()
    .from(archivedDocuments)
    .where(eq(archivedDocuments.id, id))
    .limit(1);

  if (!doc) {
    return c.json({ detail: "문서를 찾을 수 없습니다" }, 404);
  }

  // R2에서 파일 내용 가져오기
  let content = null;
  if (doc.filePath && c.env.FILES) {
    try {
      const file = await c.env.FILES.get(doc.filePath);
      if (file) {
        content = await file.text();
      }
    } catch {
      // R2 접근 실패 시 무시
    }
  }

  return c.json({
    data: {
      id: doc.id,
      email_id: doc.emailId,
      document_type: doc.documentType,
      file_name: doc.fileName,
      file_path: doc.filePath,
      file_size: doc.fileSize || 0,
      company_name: doc.companyName,
      category: doc.category,
      description: doc.description,
      archived_date: doc.archivedDate || doc.createdAt,
      content,
    },
  });
});

/**
 * DELETE /archives/:id - 아카이브 삭제
 */
archives.delete("/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  const db = drizzle(c.env.DB);

  const [doc] = await db
    .select()
    .from(archivedDocuments)
    .where(eq(archivedDocuments.id, id))
    .limit(1);

  if (!doc) {
    return c.json({ detail: "문서를 찾을 수 없습니다" }, 404);
  }

  // R2에서 파일 삭제
  if (doc.filePath && c.env.FILES) {
    try {
      await c.env.FILES.delete(doc.filePath);
    } catch {
      // R2 접근 실패 시 무시
    }
  }

  await db.delete(archivedDocuments).where(eq(archivedDocuments.id, id));

  return c.json({ message: "삭제 완료" });
});

/**
 * 리포트 summaryText 파싱 헬퍼 - JSON이면 파싱, 아니면 레거시 plain text 반환
 */
function parseReportData(summaryText: string | null): any {
  if (!summaryText) return null;
  try {
    const parsed = JSON.parse(summaryText);
    if (parsed && parsed.title) return parsed; // 구조화된 데이터
  } catch {
    // plain text (레거시) → 기본 구조로 변환
  }
  return { legacy_text: summaryText };
}

/**
 * GET /archives/reports/:id - 개별 리포트 조회
 */
archives.get("/reports/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  const db = drizzle(c.env.DB);

  const [report] = await db
    .select()
    .from(dailyReports)
    .where(eq(dailyReports.id, id))
    .limit(1);

  if (!report) {
    return c.json({ detail: "리포트를 찾을 수 없습니다" }, 404);
  }

  const reportData = parseReportData(report.summaryText);

  return c.json({
    status: "success",
    data: {
      id: report.id,
      report_date: report.reportDate,
      report_type: report.reportType,
      file_name: report.fileName || `report_${report.reportDate}.txt`,
      email_count: report.emailCount || 0,
      summary: report.summaryText,
      report_data: reportData,
      created_at: report.createdAt,
    },
  });
});

/**
 * POST /archives/generate-report - AI 기반 상세 리포트 생성 (구조화 JSON)
 */
archives.post("/generate-report", async (c) => {
  const reportType = c.req.query("report_type") || "daily";
  const db = drizzle(c.env.DB);
  const user = c.get("user");
  const today = new Date().toISOString().split("T")[0];

  // 리포트 기간 설정
  const now = new Date();
  let startDate: string;
  if (reportType === "weekly") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    startDate = d.toISOString().split("T")[0];
  } else if (reportType === "monthly") {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 1);
    startDate = d.toISOString().split("T")[0];
  } else {
    startDate = today;
  }

  const typeLabel = reportType === "daily" ? "일간" : reportType === "weekly" ? "주간" : "월간";
  const periodLabel = reportType === "daily" ? today : `${startDate} ~ ${today}`;

  // 기간 내 이메일 조회
  const emailList = await db
    .select({
      id: emails.id,
      subject: emails.subject,
      sender: emails.sender,
      category: emails.category,
      priority: emails.priority,
      status: emails.status,
      aiSummary: emails.aiSummary,
      receivedAt: emails.receivedAt,
    })
    .from(emails)
    .where(gte(emails.receivedAt, startDate))
    .orderBy(desc(emails.receivedAt))
    .limit(500);

  // 전체 이메일 수
  const [emailCount] = await db.select({ total: count() }).from(emails);

  // 데이터 수집
  const categoryMap: Record<string, number> = {};
  const priorityMap: Record<string, number> = {};
  const approvalItems: Array<{ subject: string; sender: string; company: string; summary: string; category: string }> = [];
  const keyEmailItems: Array<{ category: string; subject: string; sender: string; company: string; summary: string; priority: string }> = [];
  const emailDetails: Array<{
    no: number; received_at: string; category: string; code: string;
    sender: string; company: string; subject: string; summary: string;
    priority: string; status: string; action_items: string; needs_approval: boolean;
  }> = [];

  const catCodeMap: Record<string, string> = {
    "자료대응": "A", "영업기회": "B", "스케줄링": "C", "정보수집": "D", "필터링": "E",
  };

  for (let idx = 0; idx < emailList.length; idx++) {
    const e = emailList[idx];
    const cat = e.category || "미분류";
    categoryMap[cat] = (categoryMap[cat] || 0) + 1;
    const pri = e.priority || "medium";
    priorityMap[pri] = (priorityMap[pri] || 0) + 1;

    let parsed: any = null;
    if (e.aiSummary) {
      try { parsed = JSON.parse(e.aiSummary); } catch {}
    }

    const summary = parsed?.summary || (typeof e.aiSummary === "string" && !e.aiSummary.startsWith("{") ? e.aiSummary : "") || "";
    const directorReport = parsed?.director_report || "";
    const actionItems = parsed?.action_items || "";
    const needsApproval = parsed?.needs_approval === true;
    const company = parsed?.company_name || "";

    emailDetails.push({
      no: idx + 1,
      received_at: e.receivedAt || "",
      category: cat,
      code: catCodeMap[cat] || "-",
      sender: e.sender || "",
      company,
      subject: e.subject || "",
      summary,
      priority: pri === "high" ? "긴급" : pri === "medium" ? "일반" : "낮음",
      status: e.status === "unread" ? "미처리" : e.status === "read" ? "확인" : e.status === "replied" ? "답변완료" : e.status || "",
      action_items: actionItems,
      needs_approval: needsApproval,
    });

    if (needsApproval) {
      approvalItems.push({ subject: e.subject || "", sender: e.sender || "", company, summary: directorReport || summary, category: cat });
    }

    if (pri === "high" || cat === "영업기회") {
      keyEmailItems.push({ category: cat, subject: e.subject || "", sender: e.sender || "", company, summary: directorReport || summary, priority: pri === "high" ? "긴급" : "일반" });
    }
  }

  // 카테고리 통계 배열
  const catOrder = ["자료대응", "영업기회", "스케줄링", "정보수집", "필터링"];
  const catCodes = ["A", "B", "C", "D", "E"];
  const categories = catOrder.map((name, i) => ({
    code: catCodes[i], name, count: categoryMap[name] || 0,
  }));
  // 기타 카테고리 추가
  for (const [cat, cnt] of Object.entries(categoryMap)) {
    if (!catOrder.includes(cat)) {
      categories.push({ code: "-", name: cat, count: cnt });
    }
  }

  // AI 분석 요약
  let aiInsight = "";
  if (emailList.length > 0) {
    try {
      const summaryData = emailList.slice(0, 30).map((e) => {
        let p: any = null;
        try { p = JSON.parse(e.aiSummary || ""); } catch {}
        return `[${e.category}] ${e.subject} - ${p?.summary || ""}`;
      }).join("\n");

      aiInsight = await askAIAnalyze(
        c.env,
        `다음은 KPROS의 ${typeLabel} 이메일 현황입니다. 이사님을 위한 3줄 핵심 요약과 이번 주 주의해야 할 사항을 간결하게 작성하세요.\n\n${summaryData}`,
        "당신은 KPROS(화장품 원료 전문기업) 경영 보고서 작성 전문가입니다. 이사님께 보고하는 톤으로, 핵심만 간결하게 작성합니다.",
        1024
      );
    } catch (e) {
      console.error("[Report] AI insight generation failed:", e);
    }
  }

  // 구조화된 리포트 데이터
  const reportData = {
    title: `KPROS ${typeLabel} 업무 리포트`,
    type: reportType,
    type_label: typeLabel,
    period: periodLabel,
    start_date: startDate,
    end_date: today,
    generated_at: new Date().toISOString(),
    overview: {
      total_emails: emailCount.total,
      period_emails: emailList.length,
      approval_needed: approvalItems.length,
      key_emails_count: keyEmailItems.length,
    },
    categories,
    priorities: {
      high: priorityMap["high"] || 0,
      medium: priorityMap["medium"] || 0,
      low: priorityMap["low"] || 0,
    },
    key_emails: keyEmailItems.slice(0, 15),
    approval_items: approvalItems.slice(0, 15),
    ai_insight: aiInsight,
    email_details: emailDetails,
  };

  const [report] = await db
    .insert(dailyReports)
    .values({
      reportDate: today,
      reportType: reportType,
      fileName: `KPROS_${typeLabel}_리포트_${today}.xlsx`,
      generatedBy: user.userId,
      emailCount: emailList.length,
      summaryText: JSON.stringify(reportData),
    })
    .returning();

  return c.json({
    status: "success",
    data: {
      id: report.id,
      report_date: report.reportDate,
      report_type: report.reportType,
      file_name: report.fileName,
      email_count: report.emailCount,
      summary: report.summaryText,
      report_data: reportData,
      created_at: report.createdAt,
    },
    message: `${typeLabel} 리포트 생성 완료`,
  });
});

/**
 * DELETE /archives/reports/:id - 개별 리포트 삭제
 */
archives.delete("/reports/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  const db = drizzle(c.env.DB);

  const [report] = await db
    .select()
    .from(dailyReports)
    .where(eq(dailyReports.id, id))
    .limit(1);

  if (!report) {
    return c.json({ detail: "리포트를 찾을 수 없습니다" }, 404);
  }

  await db.delete(dailyReports).where(eq(dailyReports.id, id));

  return c.json({ status: "success", message: "리포트 삭제 완료" });
});

/**
 * DELETE /archives/reports - 리포트 일괄 삭제
 */
archives.delete("/reports", async (c) => {
  const db = drizzle(c.env.DB);

  const idsParam = c.req.query("ids");
  if (idsParam) {
    // 선택한 ID들만 삭제
    const ids = idsParam.split(",").map(Number).filter(Boolean);
    let deleted = 0;
    for (const id of ids) {
      await db.delete(dailyReports).where(eq(dailyReports.id, id));
      deleted++;
    }
    return c.json({ status: "success", data: { deleted_count: deleted }, message: `${deleted}건 삭제 완료` });
  }

  // ids 없으면 전체 삭제
  const [{ total }] = await db.select({ total: count() }).from(dailyReports);
  await db.delete(dailyReports);
  return c.json({ status: "success", data: { deleted_count: total }, message: `전체 ${total}건 삭제 완료` });
});

/**
 * POST /archives/bulk-archive-emails - 일괄 아카이브
 */
archives.post("/bulk-archive-emails", async (c) => {
  const statusFilter = c.req.query("status_filter") || "sent";
  const db = drizzle(c.env.DB);

  const sentEmails = await db
    .select()
    .from(emails)
    .where(eq(emails.status, statusFilter as any));

  let archivedCount = 0;
  for (const email of sentEmails) {
    await db.insert(archivedDocuments).values({
      emailId: email.id,
      documentType: "email",
      fileName: `email_${email.id}_${email.subject?.slice(0, 30)}.txt`,
      filePath: `archives/emails/${email.id}.txt`,
      companyName: null,
      category: email.category,
      description: email.aiSummary || email.subject,
    });

    await db
      .update(emails)
      .set({ status: "archived", updatedAt: new Date().toISOString() })
      .where(eq(emails.id, email.id));

    archivedCount++;
  }

  return c.json({
    status: "success",
    data: { archived_count: archivedCount },
    message: `${archivedCount}건 아카이브 완료`,
  });
});

export default archives;
