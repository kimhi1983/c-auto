/**
 * Email Management Routes - /api/v1/emails
 * KPROS 5-카테고리 AI 자동화 시스템 v2
 */
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, desc, like, and, sql, count } from "drizzle-orm";
import { emails, emailApprovals, emailAttachments } from "../db/schema";
import { authMiddleware, requireApprover } from "../middleware/auth";
import { classifyEmailAdvanced, askAIDraft, analyzeAttachment, KPROS_EMAIL_SYSTEM_PROMPT } from "../services/ai";
import {
  isGmailConfigured,
  getGmailAccessToken,
  listGmailMessages,
  listGmailMessagesAll,
  getGmailMessage,
  parseGmailMessage,
  downloadGmailAttachment,
  base64UrlToBase64,
} from "../services/gmail";
import type { Env } from "../types";

const emailsRouter = new Hono<{ Bindings: Env }>();

emailsRouter.use("*", authMiddleware);

/**
 * AI가 JSON으로 응답한 경우 텍스트만 추출하는 헬퍼
 */
function extractDraftText(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('```')) {
    try {
      const cleaned = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      const parsed = JSON.parse(cleaned);
      const text = parsed.draft_reply || parsed.answer || parsed.reply || parsed.content || parsed.response || parsed.text || '';
      if (text && typeof text === 'string' && text.length > 10) return text;
    } catch {
      // JSON 파싱 실패 시 regex로 추출 시도
      const answerMatch = trimmed.match(/"(?:draft_reply|answer|reply)":\s*"((?:[^"\\]|\\.)*)"/);
      if (answerMatch) return answerMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
    }
  }
  return raw;
}

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

  const [approvals, attachmentRows] = await Promise.all([
    db
      .select()
      .from(emailApprovals)
      .where(eq(emailApprovals.emailId, id))
      .orderBy(desc(emailApprovals.createdAt)),
    db
      .select()
      .from(emailAttachments)
      .where(eq(emailAttachments.emailId, id)),
  ]);

  return c.json({
    status: "success",
    data: {
      ...email,
      draft_response: email.draftResponse,
      draft_subject: email.draftSubject,
      ai_summary: email.aiSummary,
      ai_draft_response: email.aiDraftResponse,
      ai_confidence: email.aiConfidence || 0,
      body_html: email.bodyHtml || null,
      received_at: email.receivedAt,
      processed_at: email.processedAt,
      sent_at: email.sentAt,
      created_at: email.createdAt,
      approvals,
      attachments: attachmentRows.map((a) => ({
        id: a.id,
        file_name: a.fileName,
        file_path: a.filePath,
        file_size: a.fileSize,
        content_type: a.contentType,
        ai_analysis: a.aiAnalysis || null,
      })),
    },
  });
});

/**
 * POST /emails/fetch - Gmail API로 메일 가져오기 (KPROS 5분류 AI 분석)
 * 하이웍스 → Gmail POP3 포워딩 → Gmail API → C-Auto
 *
 * 2단계 처리:
 *   Phase 1 (즉시): Gmail → DB 저장 (AI 없이, 빠름)
 *   Phase 2 (백그라운드): waitUntil로 AI 분류 병렬 처리
 *
 * ?max_count=200 (최대 500)
 */
emailsRouter.post("/fetch", async (c) => {
  const maxCount = Math.min(parseInt(c.req.query("max_count") || "20"), 500);
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

      // ── Phase 1: Gmail에서 메일 ID 목록 가져오기 (페이지네이션) ──
      let messageRefs = await listGmailMessagesAll(accessToken, maxCount, "label:KPROS is:unread");

      if (messageRefs.length === 0) {
        // 읽지 않은 메일 없으면 KPROS 라벨 전체에서 재시도
        messageRefs = await listGmailMessagesAll(accessToken, maxCount, "label:KPROS");
        if (messageRefs.length === 0) {
          return c.json({
            status: "success",
            message: "KPROS 라벨에 새 이메일이 없습니다",
            count: 0,
            source: "gmail",
            data: [],
          });
        }
      }

      // ── Phase 1: 중복 제외 + Gmail 상세 조회 + DB 저장 (AI 없이) ──
      const saved: Array<{ id: number; gmailId: string; subject: string; sender: string; body: string }> = [];
      const BATCH_SIZE = 10;

      for (let i = 0; i < messageRefs.length; i += BATCH_SIZE) {
        const batch = messageRefs.slice(i, i + BATCH_SIZE);

        // 병렬로 중복 확인 + Gmail 상세 조회
        const results = await Promise.allSettled(
          batch.map(async (ref) => {
            // 중복 확인
            const [existing] = await db
              .select({ id: emails.id })
              .from(emails)
              .where(eq(emails.externalId, `gmail-${ref.id}`))
              .limit(1);
            if (existing) return null;

            // Gmail 상세 조회
            const fullMsg = await getGmailMessage(accessToken, ref.id);
            const parsed = parseGmailMessage(fullMsg);

            // DB 저장 (AI 분류 없이 - 임시 분류로 저장)
            const [inserted] = await db
              .insert(emails)
              .values({
                externalId: `gmail-${ref.id}`,
                subject: parsed.subject,
                sender: parsed.from,
                recipient: parsed.to || user.email,
                body: parsed.body,
                bodyHtml: parsed.bodyHtml || null,
                category: "필터링" as any,      // 임시 - 백그라운드 AI가 업데이트
                priority: "medium" as any,
                status: "unread",
                aiSummary: null,                 // 백그라운드 AI가 채움
                aiDraftResponse: null,
                draftSubject: null,
                aiConfidence: 0,
                processedBy: user.userId,
                receivedAt: parsed.date || now,
                processedAt: now,
              })
              .returning();

            // 첨부파일 메타데이터 저장
            if (parsed.attachments.length > 0) {
              for (const att of parsed.attachments) {
                await db.insert(emailAttachments).values({
                  emailId: inserted.id,
                  fileName: att.fileName,
                  filePath: att.attachmentId || null,
                  fileSize: att.fileSize,
                  contentType: att.contentType,
                });
              }
            }

            return {
              id: inserted.id,
              gmailId: ref.id,
              subject: parsed.subject,
              sender: parsed.from,
              body: parsed.body || "",
            };
          })
        );

        for (const r of results) {
          if (r.status === "fulfilled" && r.value) {
            saved.push(r.value);
          }
        }
      }

      // ── Phase 2: 백그라운드 AI 분류 + 첨부파일 분석 (waitUntil) ──
      if (saved.length > 0) {
        const aiTask = (async () => {
          const AI_BATCH = 5; // AI 호출 5개씩 병렬
          const nonFilteringIds: number[] = []; // 첨부파일 분석 대상

          for (let i = 0; i < saved.length; i += AI_BATCH) {
            const aiBatch = saved.slice(i, i + AI_BATCH);
            await Promise.allSettled(
              aiBatch.map(async (item) => {
                try {
                  const classification = await classifyEmailAdvanced(
                    c.env,
                    item.sender,
                    item.subject,
                    item.body
                  );
                  const jsonMatch = classification.match(/\{[\s\S]*\}/);
                  if (jsonMatch) {
                    const p = JSON.parse(jsonMatch[0]);
                    const category = p.category || "필터링";
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
                    const initialStatus = category === "필터링" ? "read" : "unread";

                    await db.update(emails)
                      .set({
                        category: category as any,
                        priority: (p.priority || "medium") as any,
                        status: initialStatus,
                        aiSummary: aiSummaryJson,
                        aiDraftResponse: p.draft_reply || null,
                        draftSubject: p.draft_subject || null,
                        aiConfidence: p.confidence || 0,
                      })
                      .where(eq(emails.id, item.id));

                    // E(필터링) 제외한 이메일은 첨부파일 분석 대상
                    if (category !== "필터링") {
                      nonFilteringIds.push(item.id);
                    }
                  }
                } catch {
                  // AI 실패 시 기본 분류 유지
                  await db.update(emails)
                    .set({
                      aiSummary: JSON.stringify({
                        code: "D", summary: item.subject, importance: "하",
                        action_items: "", search_keywords: [], director_report: "",
                        needs_approval: false, company_name: "", sender_info: "",
                        estimated_revenue: "", note: "AI 분류 실패 - 수동 확인 필요",
                      }),
                      aiConfidence: 0,
                    })
                    .where(eq(emails.id, item.id));
                }
              })
            );
          }

          // ── Phase 2b: 첨부파일 분석 (필터링 제외 이메일만) ──
          if (nonFilteringIds.length > 0 && accessToken) {
            for (const emailId of nonFilteringIds) {
              try {
                const attRows = await db
                  .select()
                  .from(emailAttachments)
                  .where(eq(emailAttachments.emailId, emailId));

                if (attRows.length === 0) continue;

                // 해당 이메일의 Gmail ID 추출
                const [emailRow] = await db
                  .select({ externalId: emails.externalId })
                  .from(emails)
                  .where(eq(emails.id, emailId))
                  .limit(1);
                if (!emailRow?.externalId) continue;
                const gmailMsgId = emailRow.externalId.replace("gmail-", "");

                // 각 첨부파일 분석 (순차 - API 부하 방지)
                for (const att of attRows) {
                  if (!att.filePath || att.aiAnalysis) continue; // attachmentId 없거나 이미 분석됨
                  if ((att.fileSize || 0) > 10 * 1024 * 1024) continue; // 10MB 초과 스킵

                  try {
                    const downloaded = await downloadGmailAttachment(accessToken, gmailMsgId, att.filePath);
                    const base64Data = base64UrlToBase64(downloaded.data);

                    const analysis = await analyzeAttachment(
                      c.env,
                      att.fileName,
                      att.contentType || "application/octet-stream",
                      base64Data
                    );

                    await db.update(emailAttachments)
                      .set({ aiAnalysis: analysis })
                      .where(eq(emailAttachments.id, att.id));
                  } catch (e) {
                    console.error(`[Attachment] Analysis failed for ${att.fileName}:`, e);
                    await db.update(emailAttachments)
                      .set({ aiAnalysis: `분석 실패: ${att.fileName}` })
                      .where(eq(emailAttachments.id, att.id));
                  }
                }
              } catch (e) {
                console.error(`[Attachment] Email ${emailId} attachment analysis error:`, e);
              }
            }
          }
        })();

        // waitUntil: 응답 반환 후에도 AI 분류 + 첨부파일 분석 계속 실행
        c.executionCtx.waitUntil(aiTask);
      }

      return c.json({
        status: "success",
        message: `Gmail KPROS 라벨에서 ${saved.length}개 이메일 가져오기 완료 (AI 분류 백그라운드 처리중)`,
        count: saved.length,
        source: "gmail",
        ai_processing: saved.length > 0,
        data: saved.map((s) => ({
          id: s.id,
          subject: s.subject,
          sender: s.sender,
          category: "처리중",
          priority: "medium",
        })),
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
      sampleAttachments: [] as Array<{ fileName: string; fileSize: number; contentType: string }>,
      aiSummary: JSON.stringify({ code: "A", summary: "ABC코스메틱에서 히알루론산 나트륨 카탈로그, MSDS, CoA 요청", importance: "중", action_items: "드롭박스에서 히알루론산 관련 파일 검색 후 첨부 회신", search_keywords: ["히알루론산", "Sodium Hyaluronate", "HA", "MSDS", "CoA"], director_report: "ABC코스메틱 구매팀에서 HA 자료 3종 요청. 파일 첨부 회신 준비 완료.", needs_approval: false, company_name: "ABC코스메틱", sender_info: "박지민 (과장)", estimated_revenue: "", note: "" }),
      draftReply: "안녕하세요, KPROS입니다.\n\n히알루론산 나트륨(Sodium Hyaluronate) 제품에 관심 가져주셔서 감사합니다.\n\n요청하신 자료를 첨부하여 드리오니 확인 부탁드립니다.\n\n[첨부파일]\n1. SodiumHyaluronate_카탈로그_v2024.pdf\n2. SodiumHyaluronate_MSDS_KR.pdf\n3. SodiumHyaluronate_CoA_Lot240301.pdf\n\n추가로 궁금하신 사항이 있으시면 언제든 말씀해 주세요.\n감사합니다.\n\nKPROS 드림",
    },
    {
      sender: "김태호 부장 <th.kim@startech.co.kr>",
      subject: "[발주] 히알루론산 나트륨 외 3종 발주 요청",
      body: "안녕하세요, 스타텍 김태호입니다.\n\n아래 품목에 대해 발주를 요청드립니다.\n\n1. 히알루론산 나트륨 50kg\n2. 나이아신아마이드 100kg\n3. 알란토인 30kg\n4. 판테놀 50kg\n\n납기: 2주 이내 희망\n결제조건: 월말 정산\n\n발주서 첨부하오니 확인 부탁드립니다.",
      category: "발주내역", priority: "high",
      sampleAttachments: [
        { fileName: "스타텍_발주서_2025.xlsx", fileSize: 45200, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      ],
      aiSummary: JSON.stringify({ code: "B", summary: "스타텍에서 히알루론산 외 3종 총 4품목 발주 요청 (230kg)", importance: "상", action_items: "1. ERP 재고 확인\n2. 이사님께 단가 확인\n3. 납기 확인 후 발주 접수", search_keywords: [], director_report: "스타텍 김태호 부장, 4품목 230kg 발주. 예상 매출 약 800만원. ERP 재고 확인 후 접수 처리 필요.", needs_approval: true, company_name: "스타텍", sender_info: "김태호 (부장)", estimated_revenue: "약 800만원", note: "대량 발주 건" }),
      draftReply: "안녕하세요, KPROS입니다.\n\n발주서 접수 확인하였습니다.\n\n요청하신 4개 품목(히알루론산 나트륨, 나이아신아마이드, 알란토인, 판테놀)에 대해 재고 및 납기를 확인 후 안내드리겠습니다.\n\n영업일 기준 1~2일 이내 안내 가능하오니 양해 부탁드립니다.\n\n추가로 확인이 필요한 사항이 있으시면 말씀해 주세요.\n감사합니다.\n\nKPROS 드림",
    },
    {
      sender: "원료팀 <materials@globalchem.co.kr>",
      subject: "[공지] 히알루론산 원료 단가 인상 통보",
      body: "안녕하세요, 글로벌케미칼 원료팀입니다.\n\n글로벌 발효 원료 공급 부족에 따라 히알루론산 나트륨 단가를 아래와 같이 조정합니다.\n\n변동 내용:\n- 대상: 히알루론산 나트륨 (Sodium Hyaluronate)\n- 현행: kg당 ₩45,000\n- 변경: kg당 ₩48,600 (8% 인상)\n- 적용: 2025년 4월 1일부터\n\n양해 부탁드립니다.",
      category: "정보수집", priority: "medium",
      sampleAttachments: [
        { fileName: "단가변동_통지서_2025Q2.pdf", fileSize: 95300, contentType: "application/pdf" },
        { fileName: "원료시황_리포트_202502.xlsx", fileSize: 234100, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      ],
      aiSummary: JSON.stringify({ code: "C", summary: "글로벌케미칼에서 히알루론산 나트륨 8% 단가 인상 통보 (4/1 적용)", importance: "상", action_items: "2차 공급사 단가 비교 + 현재 단가 재고 확보 검토", search_keywords: [], director_report: "히알루론산 나트륨 8% 인상(₩45,000→₩48,600), 4/1 적용. 주력 세럼 원가 약 3.2% 상승 예상. 대체 공급사 검토 권장.", needs_approval: false, company_name: "글로벌케미칼", sender_info: "원료팀", estimated_revenue: "", note: "원가 영향 분석 필요" }),
      draftReply: "",
    },
    {
      sender: "marketing@spamcorp.com",
      subject: "[광고] 무료 마케팅 컨설팅 제안",
      body: "귀사의 매출 200% 성장을 약속합니다!\n\n지금 바로 무료 상담을 받아보세요.\n\n☎ 1588-XXXX\n\n수신거부: reply STOP",
      category: "필터링", priority: "low",
      sampleAttachments: [],
      aiSummary: JSON.stringify({ code: "D", summary: "스팸 광고 메일 - 마케팅 컨설팅 제안", importance: "하", action_items: "응대 불필요", search_keywords: [], director_report: "", needs_approval: false, company_name: "", sender_info: "", estimated_revenue: "", note: "스팸" }),
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

      // E.필터링은 자동으로 "read" 처리
      const sampleStatus = mail.category === "필터링" ? "read" : "unread";

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
          status: sampleStatus,
          aiSummary: mail.aiSummary,
          aiDraftResponse: mail.draftReply || null,
          aiConfidence: 90 + Math.floor(Math.random() * 10),
          processedBy: user.userId,
          receivedAt,
          processedAt: now,
        })
        .returning();

      // 샘플 첨부파일 저장
      if (mail.sampleAttachments && mail.sampleAttachments.length > 0) {
        for (const att of mail.sampleAttachments) {
          await db.insert(emailAttachments).values({
            emailId: inserted.id,
            fileName: att.fileName,
            filePath: null,
            fileSize: att.fileSize,
            contentType: att.contentType,
          });
        }
      }

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
      c.env,
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

중요: JSON이 아닌 일반 이메일 본문 텍스트로만 답변하세요. 코드블록(\`\`\`)이나 JSON 형식을 사용하지 마세요.

답변 서두에 "안녕하세요, KPROS입니다."를 포함하고, 마무리에 "KPROS 드림"을 넣어주세요.

발신자: ${email.sender}
제목: ${email.subject}
카테고리: ${email.category}
내용: ${email.body?.slice(0, 2000)}

카테고리별 답변 규칙:
- 자료대응: "요청하신 자료를 첨부하여 드립니다." 포함
- 발주내역: "발주서 접수 확인하였습니다. 재고 및 납기 확인 후 안내드리겠습니다." 포함
- 정보수집/필터링: "답변이 필요하지 않은 메일입니다."로 간략히

[답신 안전 규칙 - 반드시 준수]
- 견적서, 단가, 가격, 할인율 등 금액 정보를 절대 포함하지 마세요. "검토 후 별도 안내드리겠습니다." 로 대체
- 확정되지 않은 납기, 재고, 생산 일정을 기재하지 마세요. "확인 후 안내드리겠습니다." 로 대체
- 계약 효력이 있는 약속 문구(보장합니다, 약속드립니다)를 사용하지 마세요
- 사내 기밀(원가, 마진율) 및 첨부파일 내용을 추측하여 기재하지 마세요`;

  let draft = await askAIDraft(c.env, prompt, undefined, 1024);

  // AI가 JSON으로 응답한 경우 텍스트만 추출
  draft = extractDraftText(draft);

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

/**
 * POST /emails/reclassify-all - 전체 이메일 KPROS AI 재분류
 */
emailsRouter.post("/reclassify-all", async (c) => {
  const db = drizzle(c.env.DB);

  const allEmails = await db
    .select({ id: emails.id, sender: emails.sender, subject: emails.subject, body: emails.body })
    .from(emails)
    .orderBy(desc(emails.receivedAt));

  let processed = 0;
  let failed = 0;

  for (const email of allEmails) {
    try {
      const classification = await classifyEmailAdvanced(
        c.env,
        email.sender || "",
        email.subject || "",
        email.body || ""
      );
      const jsonMatch = classification.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const p = JSON.parse(jsonMatch[0]);
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
            category: (p.category || "필터링") as any,
            priority: (p.priority || "medium") as any,
            aiSummary: aiSummaryJson,
            aiDraftResponse: p.draft_reply || null,
            draftSubject: p.draft_subject || null,
            aiConfidence: p.confidence || 0,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(emails.id, email.id));
        processed++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return c.json({
    status: "success",
    message: `전체 재분류 완료: ${processed}건 성공, ${failed}건 실패`,
    processed,
    failed,
    total: allEmails.length,
  });
});

/**
 * POST /emails/refetch-bodies - Gmail에서 본문 재다운로드 (인코딩 수정용)
 * DB에 저장된 Gmail 이메일의 본문을 다시 가져와서 업데이트
 */
emailsRouter.post("/refetch-bodies", async (c) => {
  if (!isGmailConfigured(c.env)) {
    return c.json({ status: "error", detail: "Gmail이 설정되지 않았습니다" }, 400);
  }

  const db = drizzle(c.env.DB);

  try {
    const accessToken = await getGmailAccessToken(
      c.env.CACHE!,
      c.env.GMAIL_CLIENT_ID!,
      c.env.GMAIL_CLIENT_SECRET!
    );

    if (!accessToken) {
      return c.json({ status: "error", detail: "Gmail 인증이 만료되었습니다", need_reauth: true }, 401);
    }

    // gmail- 접두사가 있는 이메일 조회
    const gmailEmails = await db
      .select({ id: emails.id, externalId: emails.externalId })
      .from(emails)
      .where(like(emails.externalId, "gmail-%"))
      .orderBy(desc(emails.receivedAt));

    let updated = 0;
    let failed = 0;
    const BATCH = 5;

    for (let i = 0; i < gmailEmails.length; i += BATCH) {
      const batch = gmailEmails.slice(i, i + BATCH);
      await Promise.allSettled(
        batch.map(async (email) => {
          try {
            const gmailId = email.externalId!.replace("gmail-", "");
            const fullMsg = await getGmailMessage(accessToken, gmailId);
            const parsed = parseGmailMessage(fullMsg);

            await db
              .update(emails)
              .set({
                body: parsed.body,
                bodyHtml: parsed.bodyHtml || null,
                updatedAt: new Date().toISOString(),
              })
              .where(eq(emails.id, email.id));

            updated++;
          } catch {
            failed++;
          }
        })
      );
    }

    return c.json({
      status: "success",
      message: `본문 재동기화 완료: ${updated}건 업데이트, ${failed}건 실패`,
      updated,
      failed,
      total: gmailEmails.length,
    });
  } catch (err: any) {
    return c.json({ status: "error", detail: `본문 재동기화 실패: ${err.message}` }, 500);
  }
});

/**
 * POST /emails/:id/analyze-attachments - 첨부파일 AI 분석 (수동 트리거)
 * Gmail에서 첨부파일 다운로드 후 AI 분석 실행
 */
emailsRouter.post("/:id/analyze-attachments", async (c) => {
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

  const attRows = await db
    .select()
    .from(emailAttachments)
    .where(eq(emailAttachments.emailId, id));

  if (attRows.length === 0) {
    return c.json({ status: "success", message: "첨부파일이 없습니다", analyzed: 0 });
  }

  // Gmail 첨부파일인 경우만 다운로드 가능
  const gmailMsgId = email.externalId?.replace("gmail-", "");
  let accessToken: string | null = null;

  if (gmailMsgId && isGmailConfigured(c.env)) {
    accessToken = await getGmailAccessToken(
      c.env.CACHE!,
      c.env.GMAIL_CLIENT_ID!,
      c.env.GMAIL_CLIENT_SECRET!
    );
  }

  let analyzed = 0;
  let failed = 0;
  const results: Array<{ file_name: string; status: string }> = [];

  for (const att of attRows) {
    try {
      // attachmentId가 있고 Gmail 접근 가능하면 다운로드
      if (att.filePath && accessToken && gmailMsgId) {
        if ((att.fileSize || 0) > 10 * 1024 * 1024) {
          results.push({ file_name: att.fileName, status: "skipped (10MB 초과)" });
          continue;
        }

        const downloaded = await downloadGmailAttachment(accessToken, gmailMsgId, att.filePath);
        const base64Data = base64UrlToBase64(downloaded.data);

        const analysis = await analyzeAttachment(
          c.env,
          att.fileName,
          att.contentType || "application/octet-stream",
          base64Data
        );

        await db.update(emailAttachments)
          .set({ aiAnalysis: analysis })
          .where(eq(emailAttachments.id, att.id));

        results.push({ file_name: att.fileName, status: "analyzed" });
        analyzed++;
      } else {
        // attachmentId 없으면 파일명 기반 분석
        const analysis = await analyzeAttachment(
          c.env,
          att.fileName,
          att.contentType || "application/octet-stream",
          ""
        );

        await db.update(emailAttachments)
          .set({ aiAnalysis: analysis })
          .where(eq(emailAttachments.id, att.id));

        results.push({ file_name: att.fileName, status: "analyzed (metadata only)" });
        analyzed++;
      }
    } catch (err: any) {
      failed++;
      results.push({ file_name: att.fileName, status: `failed: ${err.message}` });
    }
  }

  return c.json({
    status: "success",
    message: `첨부파일 분석 완료: ${analyzed}건 성공, ${failed}건 실패`,
    analyzed,
    failed,
    results,
  });
});

export default emailsRouter;
