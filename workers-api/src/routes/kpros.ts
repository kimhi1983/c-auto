/**
 * 거래처 관리 CRUD + KPROS 동기화 라우트
 */
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, desc, like, or, and, count } from "drizzle-orm";
import { companies } from "../db/schema";
import { authMiddleware } from "../middleware/auth";
import { isKprosConfigured, getKprosCompanies } from "../services/kpros";
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
 * POST /companies - 거래처 등록
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
  }>();

  if (!body.company_nm?.trim()) {
    return c.json({ status: "error", message: "거래처명은 필수입니다" }, 400);
  }

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

  return c.json({ status: "success", data: created }, 201);
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
 * POST /companies/sync-kpros - KPROS에서 거래처 동기화
 */
kpros.post("/companies/sync-kpros", async (c) => {
  if (!isKprosConfigured(c.env)) {
    return c.json({ status: "error", message: "KPROS 인증 정보 미설정" }, 400);
  }

  const db = drizzle(c.env.DB);
  let created = 0;
  let updated = 0;

  try {
    const kprosData = await getKprosCompanies(c.env, true);

    if (kprosData.items.length === 0) {
      return c.json({
        status: "success",
        data: { total: 0, created: 0, updated: 0 },
        message: "KPROS에서 가져온 거래처 데이터가 없습니다 (권한 확인 필요)",
      });
    }

    for (const kc of kprosData.items) {
      const [existing] = await db
        .select()
        .from(companies)
        .where(eq(companies.kprosIdx, kc.companyIdx))
        .limit(1);

      if (existing) {
        await db
          .update(companies)
          .set({
            companyNm: kc.companyNm || existing.companyNm,
            companyCd: kc.companyCd || existing.companyCd,
            ceoNm: kc.ceoNm || existing.ceoNm,
            bizNo: kc.bizNo || existing.bizNo,
            tel: kc.tel || existing.tel,
            fax: kc.fax || existing.fax,
            email: kc.email || existing.email,
            addr: kc.addr || existing.addr,
            memo: kc.memo || existing.memo,
            managerNm: kc.managerNm || existing.managerNm,
            managerTel: kc.managerTel || existing.managerTel,
            managerEmail: kc.managerEmail || existing.managerEmail,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(companies.id, existing.id));
        updated++;
      } else {
        await db.insert(companies).values({
          companyCd: kc.companyCd || null,
          companyNm: kc.companyNm,
          ceoNm: kc.ceoNm,
          bizNo: kc.bizNo,
          tel: kc.tel,
          fax: kc.fax,
          email: kc.email,
          addr: kc.addr,
          memo: kc.memo,
          managerNm: kc.managerNm,
          managerTel: kc.managerTel,
          managerEmail: kc.managerEmail,
          kprosIdx: kc.companyIdx,
        });
        created++;
      }
    }

    return c.json({
      status: "success",
      data: { total: kprosData.totalCount, created, updated },
      message: `KPROS 동기화 완료: 신규 ${created}, 업데이트 ${updated}`,
    });
  } catch (e: any) {
    console.error("[KPROS Sync]", e.message);
    return c.json({ status: "error", message: e.message }, 500);
  }
});

export default kpros;
