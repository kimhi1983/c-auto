/**
 * 거래처 관리 CRUD + KPROS 동기화 라우트
 */
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, desc, like, or, and, count } from "drizzle-orm";
import { companies } from "../db/schema";
import { authMiddleware } from "../middleware/auth";
import { isKprosConfigured, getKprosCompanies, debugCrawlCompanies } from "../services/kpros";
import { saveCustomer, getERPStatus } from "../services/ecount";
import type { Env, UserContext } from "../types";

const kpros = new Hono<{ Bindings: Env; Variables: { user: UserContext } }>();

kpros.use("*", authMiddleware);

/**
 * GET /status - 연동 상태
 */
kpros.get("/status", async (c) => {
  return c.json({
    status: "success",
    data: {
      configured: isKprosConfigured(c.env),
      modules: ["stock", "companies"],
    },
  });
});

/**
 * GET /companies - 거래처 목록 (검색, 페이징, 유형 필터)
 */
kpros.get("/companies", async (c) => {
  const db = drizzle(c.env.DB);
  const search = c.req.query("search");
  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("limit") || "50");
  const type = c.req.query("type");
  const activeOnly = c.req.query("active") !== "false";

  const conditions: any[] = [];
  if (activeOnly) conditions.push(eq(companies.isActive, true));
  if (type) conditions.push(eq(companies.companyType, type));
  if (search) {
    conditions.push(
      or(
        like(companies.companyNm, `%${search}%`),
        like(companies.companyCd, `%${search}%`),
        like(companies.ceoNm, `%${search}%`),
        like(companies.managerNm, `%${search}%`),
        like(companies.email, `%${search}%`),
        like(companies.bizNo, `%${search}%`),
      )
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, [{ total }]] = await Promise.all([
    db
      .select()
      .from(companies)
      .where(where)
      .orderBy(desc(companies.updatedAt))
      .limit(limit)
      .offset((page - 1) * limit),
    db.select({ total: count() }).from(companies).where(where),
  ]);

  return c.json({
    status: "success",
    data: items,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
});

/**
 * GET /companies/:id - 거래처 단건 조회
 */
kpros.get("/companies/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  if (isNaN(id)) return c.json({ status: "error", message: "잘못된 ID" }, 400);

  const db = drizzle(c.env.DB);
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, id))
    .limit(1);

  if (!company) {
    return c.json({ status: "error", message: "거래처를 찾을 수 없습니다" }, 404);
  }

  return c.json({ status: "success", data: company });
});

/**
 * POST /companies - 거래처 등록 (D1 + 이카운트 ERP 연동)
 */
kpros.post("/companies", async (c) => {
  const body = await c.req.json<{
    company_cd?: string;
    company_nm: string;
    ceo_nm?: string;
    biz_no?: string;
    tel?: string;
    fax?: string;
    email?: string;
    addr?: string;
    memo?: string;
    manager_nm?: string;
    manager_tel?: string;
    manager_email?: string;
    company_type?: string;
    sync_ecount?: boolean; // 이카운트 연동 여부 (기본 true)
  }>();

  if (!body.company_nm?.trim()) {
    return c.json({ status: "error", message: "거래처명은 필수입니다" }, 400);
  }

  // ── Step 1: D1 저장 ──
  const db = drizzle(c.env.DB);
  const [created] = await db
    .insert(companies)
    .values({
      companyCd: body.company_cd || null,
      companyNm: body.company_nm.trim(),
      ceoNm: body.ceo_nm || null,
      bizNo: body.biz_no || null,
      tel: body.tel || null,
      fax: body.fax || null,
      email: body.email || null,
      addr: body.addr || null,
      memo: body.memo || null,
      managerNm: body.manager_nm || null,
      managerTel: body.manager_tel || null,
      managerEmail: body.manager_email || null,
      companyType: body.company_type || null,
    })
    .returning();

  // ── Step 2: 이카운트 ERP 연동 (best-effort) ──
  let ecountResult: { success: boolean; message: string; skipped: boolean } = {
    success: false,
    message: "",
    skipped: true,
  };

  const syncEcount = body.sync_ecount !== false;
  const erpStatus = getERPStatus(c.env);

  if (syncEcount && erpStatus.configured && body.biz_no?.trim()) {
    try {
      // D1 필드 → 이카운트 SaveBasicCust 필드 매핑
      const custItem: Record<string, string> = {
        BUSINESS_NO: body.biz_no.trim(),
        CUST_NAME: body.company_nm.trim(),
      };
      if (body.ceo_nm) custItem.BOSS_NAME = body.ceo_nm;
      if (body.tel) custItem.TEL_NO = body.tel;
      if (body.fax) custItem.FAX_NO = body.fax;
      if (body.email) custItem.EMAIL = body.email;
      if (body.addr) custItem.ADDR = body.addr;
      if (body.memo) custItem.REMARK = body.memo;

      await saveCustomer(c.env, { CustList: [custItem] });
      ecountResult = {
        success: true,
        message: "이카운트 ERP 거래처 등록 완료",
        skipped: false,
      };
    } catch (e: any) {
      console.error("[KPROS] 이카운트 연동 실패:", e.message);
      ecountResult = {
        success: false,
        message: `이카운트 연동 실패: ${e.message}`,
        skipped: false,
      };
    }
  } else if (!syncEcount) {
    ecountResult.message = "이카운트 연동 비활성화";
  } else if (!erpStatus.configured) {
    ecountResult.message = "이카운트 ERP 인증 정보 미설정";
  } else if (!body.biz_no?.trim()) {
    ecountResult.message = "사업자번호 미입력으로 이카운트 연동 건너뜀";
  }

  return c.json({ status: "success", data: created, ecount: ecountResult }, 201);
});

/**
 * PATCH /companies/:id - 거래처 수정
 */
kpros.patch("/companies/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  if (isNaN(id)) return c.json({ status: "error", message: "잘못된 ID" }, 400);

  const body = await c.req.json();
  const db = drizzle(c.env.DB);

  const updateData: Record<string, any> = {
    updatedAt: new Date().toISOString(),
  };

  const fieldMap: Record<string, string> = {
    company_cd: "companyCd",
    company_nm: "companyNm",
    ceo_nm: "ceoNm",
    biz_no: "bizNo",
    tel: "tel",
    fax: "fax",
    email: "email",
    addr: "addr",
    memo: "memo",
    manager_nm: "managerNm",
    manager_tel: "managerTel",
    manager_email: "managerEmail",
    company_type: "companyType",
    is_active: "isActive",
  };

  for (const [reqKey, dbKey] of Object.entries(fieldMap)) {
    if (body[reqKey] !== undefined) {
      updateData[dbKey] = body[reqKey];
    }
  }

  const [updated] = await db
    .update(companies)
    .set(updateData)
    .where(eq(companies.id, id))
    .returning();

  if (!updated) {
    return c.json({ status: "error", message: "거래처를 찾을 수 없습니다" }, 404);
  }

  return c.json({ status: "success", data: updated });
});

/**
 * DELETE /companies/:id - 거래처 비활성화 (soft-delete)
 */
kpros.delete("/companies/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  if (isNaN(id)) return c.json({ status: "error", message: "잘못된 ID" }, 400);

  const db = drizzle(c.env.DB);
  const [updated] = await db
    .update(companies)
    .set({ isActive: false, updatedAt: new Date().toISOString() })
    .where(eq(companies.id, id))
    .returning();

  if (!updated) {
    return c.json({ status: "error", message: "거래처를 찾을 수 없습니다" }, 404);
  }

  return c.json({ status: "success", message: "거래처가 비활성화되었습니다" });
});

/**
 * POST /companies/bulk-import - 크롤링 데이터 벌크 업로드 (upsert by kpros_idx)
 */
kpros.post("/companies/bulk-import", async (c) => {
  const body = await c.req.json<{ items: any[] }>();
  if (!body.items?.length) {
    return c.json({ status: "error", message: "items 배열이 비어있습니다" }, 400);
  }

  const db = drizzle(c.env.DB);
  let created = 0, updated = 0, skipped = 0;

  for (const item of body.items) {
    if (!item.company_nm?.trim()) { skipped++; continue; }

    const kprosIdx = item.kpros_idx ? parseInt(item.kpros_idx) : null;

    // kpros_idx로 기존 데이터 확인
    if (kprosIdx) {
      const [existing] = await db
        .select()
        .from(companies)
        .where(eq(companies.kprosIdx, kprosIdx))
        .limit(1);

      if (existing) {
        await db.update(companies).set({
          companyNm: item.company_nm || existing.companyNm,
          tel: item.tel || existing.tel,
          fax: item.fax || existing.fax,
          email: item.email || existing.email,
          addr: item.addr || existing.addr,
          managerNm: item.manager_nm || existing.managerNm,
          managerTel: item.mobile || existing.managerTel,
          managerEmail: item.manager_email || existing.managerEmail,
          memo: item.memo || existing.memo,
          companyType: item.buy_sell_type || existing.companyType,
          updatedAt: new Date().toISOString(),
        }).where(eq(companies.id, existing.id));
        updated++;
        continue;
      }
    }

    // 업체명으로 중복 확인
    const [byName] = await db
      .select()
      .from(companies)
      .where(eq(companies.companyNm, item.company_nm.trim()))
      .limit(1);

    if (byName) {
      await db.update(companies).set({
        kprosIdx: kprosIdx,
        tel: item.tel || byName.tel,
        fax: item.fax || byName.fax,
        email: item.email || byName.email,
        addr: item.addr || byName.addr,
        managerNm: item.manager_nm || byName.managerNm,
        managerTel: item.mobile || byName.managerTel,
        companyType: item.buy_sell_type || byName.companyType,
        updatedAt: new Date().toISOString(),
      }).where(eq(companies.id, byName.id));
      updated++;
      continue;
    }

    // 신규 등록
    await db.insert(companies).values({
      companyNm: item.company_nm.trim(),
      tel: item.tel || null,
      fax: item.fax || null,
      email: item.email || null,
      addr: item.addr || null,
      managerNm: item.manager_nm || null,
      managerTel: item.mobile || null,
      managerEmail: item.email || null,
      companyType: item.buy_sell_type || null,
      kprosIdx: kprosIdx,
      memo: [item.dept, item.manager_rank, item.business].filter(Boolean).join(' / ') || null,
    });
    created++;
  }

  return c.json({
    status: "success",
    data: { total: body.items.length, created, updated, skipped },
    message: `벌크 임포트 완료: 신규 ${created}, 업데이트 ${updated}, 건너뜀 ${skipped}`,
  });
});

/**
 * POST /companies/debug-crawl - KPROS 거래처 크롤링 디버그 (raw 응답 반환)
 */
kpros.post("/companies/debug-crawl", async (c) => {
  if (!isKprosConfigured(c.env)) {
    return c.json({ status: "error", message: "KPROS 인증 정보 미설정" }, 400);
  }
  try {
    const result = await debugCrawlCompanies(c.env);
    return c.json({ status: "success", data: result });
  } catch (e: any) {
    return c.json({ status: "error", message: e.message, stack: e.stack?.substring(0, 500) }, 500);
  }
});

/**
 * POST /companies/sync-kpros - KPROS 거래처 동기화 (비활성화)
 */
kpros.post("/companies/sync-kpros", async (c) => {
  return c.json({
    status: "error",
    message: "KPROS 실시간 동기화가 비활성화되었습니다. D1 아카이브 데이터를 사용하세요.",
    archived: true,
  }, 403);
});

export default kpros;
