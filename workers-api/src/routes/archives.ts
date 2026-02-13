/**
 * Archive Routes - /api/v1/archives
 */
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, desc, like, and, count, gte, sql } from "drizzle-orm";
import { archivedDocuments, dailyReports, emails } from "../db/schema";
import { authMiddleware } from "../middleware/auth";
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
  if (doc.filePath) {
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
  if (doc.filePath) {
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
 * POST /archives/generate-report - 리포트 생성
 */
archives.post("/generate-report", async (c) => {
  const reportType = c.req.query("report_type") || "daily";
  const db = drizzle(c.env.DB);
  const user = c.get("user");
  const today = new Date().toISOString().split("T")[0];

  // 이메일 수 집계
  const [emailCount] = await db.select({ total: count() }).from(emails);

  const [report] = await db
    .insert(dailyReports)
    .values({
      reportDate: today,
      reportType: reportType,
      fileName: `${reportType}_report_${today}.txt`,
      generatedBy: user.userId,
      emailCount: emailCount.total,
      summaryText: `${reportType} 리포트 - ${today} 생성\n이메일 ${emailCount.total}건 처리`,
    })
    .returning();

  return c.json({
    status: "success",
    data: report,
    message: `${reportType} 리포트 생성 완료`,
  });
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
