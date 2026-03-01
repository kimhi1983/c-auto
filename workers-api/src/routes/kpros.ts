/**
 * 거래처 관리 CRUD + Dropbox Excel 동기화 라우트
 */
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, desc, like, or, and, count } from "drizzle-orm";
import { companies } from "../db/schema";
import { authMiddleware } from "../middleware/auth";
import { saveCustomer, getERPStatus } from "../services/ecount";
import { isDropboxConfigured, getDropboxAccessToken, listDropboxFolder, downloadDropboxFile } from "../services/dropbox";
import { parseXlsx } from "../utils/xlsx-reader";
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
      configured: true,
      modules: ["companies"],
      source: "dropbox",
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
    sync_ecount?: boolean;
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

  // 이카운트 ERP 연동 (best-effort)
  let ecountResult: { success: boolean; message: string; skipped: boolean } = {
    success: false, message: "", skipped: true,
  };

  const syncEcount = body.sync_ecount !== false;
  const erpStatus = getERPStatus(c.env);

  if (syncEcount && erpStatus.configured && body.biz_no?.trim()) {
    try {
      const fields: Record<string, string> = {
        BUSINESS_NO: body.biz_no.trim(),
        CUST_NAME: body.company_nm.trim(),
      };
      if (body.ceo_nm) fields.BOSS_NAME = body.ceo_nm;
      if (body.tel) fields.TEL_NO = body.tel;
      if (body.fax) fields.FAX_NO = body.fax;
      if (body.email) fields.EMAIL = body.email;
      if (body.addr) fields.ADDR = body.addr;
      if (body.memo) fields.REMARK = body.memo;

      // 이카운트 Save API 형식: { CustList: [{ BulkDatas: { fields }, Line: "0" }] }
      await saveCustomer(c.env, {
        CustList: [{ BulkDatas: fields, Line: "0" }],
      });
      ecountResult = { success: true, message: "이카운트 ERP 거래처 등록 완료", skipped: false };
    } catch (e: any) {
      ecountResult = { success: false, message: `이카운트 연동 실패: ${e.message}`, skipped: false };
    }
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

  const updateData: Record<string, any> = { updatedAt: new Date().toISOString() };
  const fieldMap: Record<string, string> = {
    company_cd: "companyCd", company_nm: "companyNm", ceo_nm: "ceoNm",
    biz_no: "bizNo", tel: "tel", fax: "fax", email: "email", addr: "addr",
    memo: "memo", manager_nm: "managerNm", manager_tel: "managerTel",
    manager_email: "managerEmail", company_type: "companyType", is_active: "isActive",
  };

  for (const [reqKey, dbKey] of Object.entries(fieldMap)) {
    if (body[reqKey] !== undefined) updateData[dbKey] = body[reqKey];
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
 * POST /companies/sync-dropbox - Dropbox Excel에서 거래처 동기화
 * /AI업무폴더/F.거래처정보/거래처정보.xlsx 파일 읽어서 D1 upsert
 */
kpros.post("/companies/sync-dropbox", async (c) => {
  if (!isDropboxConfigured(c.env)) {
    return c.json({ status: "error", message: "Dropbox 인증 정보가 설정되지 않았습니다" }, 400);
  }

  try {
    const token = await getDropboxAccessToken(c.env.CACHE!, c.env.DROPBOX_APP_KEY!, c.env.DROPBOX_APP_SECRET!);
    if (!token) {
      return c.json({ status: "error", message: "Dropbox 토큰 획득 실패" }, 500);
    }

    // 폴더에서 최신 xlsx 파일 찾기
    const FOLDER = "/AI업무폴더/F.거래처정보";
    const files = await listDropboxFolder(token, FOLDER);
    const xlsxFiles = files
      .filter(f => !f.is_folder && f.name.endsWith(".xlsx"))
      .sort((a, b) => (b.modified || "").localeCompare(a.modified || ""));

    if (xlsxFiles.length === 0) {
      return c.json({ status: "error", message: "Dropbox에 거래처 Excel 파일이 없습니다" }, 404);
    }

    const latestFile = xlsxFiles[0];
    const { data: xlsxData } = await downloadDropboxFile(token, latestFile.path);
    const { headers, rows } = parseXlsx(xlsxData);

    // 컬럼 인덱스 매핑
    const colMap: Record<string, number> = {};
    const expectedCols = ["거래처코드", "거래처명", "대표자명", "전화", "모바일", "사용구분"];
    for (const col of expectedCols) {
      const idx = headers.indexOf(col);
      if (idx >= 0) colMap[col] = idx;
    }

    if (colMap["거래처명"] === undefined) {
      return c.json({ status: "error", message: `Excel 헤더 매핑 실패. 발견된 헤더: ${headers.join(", ")}` }, 400);
    }

    const db = drizzle(c.env.DB);

    // 기존 데이터 전체 삭제
    const [{ total: deletedCount }] = await db.select({ total: count() }).from(companies);
    await db.delete(companies);

    // Dropbox Excel 데이터 새로 등록
    let created = 0, skipped = 0;
    const now = new Date().toISOString();

    for (const row of rows) {
      const companyNm = (colMap["거래처명"] !== undefined ? row[colMap["거래처명"]] : "")?.trim();
      if (!companyNm) { skipped++; continue; }

      const companyCd = (colMap["거래처코드"] !== undefined ? row[colMap["거래처코드"]] : "")?.trim() || null;
      const ceoNm = (colMap["대표자명"] !== undefined ? row[colMap["대표자명"]] : "")?.trim() || null;
      const rawTel = (colMap["전화"] !== undefined ? row[colMap["전화"]] : "")?.trim() || "";
      const rawMobile = (colMap["모바일"] !== undefined ? row[colMap["모바일"]] : "")?.trim() || "";
      // 전화번호 최소 7자리 이상 또는 하이픈 포함 시만 유효 (Excel 서식코드 "11" 등 필터)
      const tel = (rawTel.length >= 7 || rawTel.includes("-")) ? rawTel : null;
      const mobile = (rawMobile.length >= 7 || rawMobile.includes("-")) ? rawMobile : null;
      const useYn = (colMap["사용구분"] !== undefined ? row[colMap["사용구분"]] : "YES")?.trim();
      const isActive = useYn !== "NO";

      await db.insert(companies).values({
        companyCd,
        companyNm,
        ceoNm,
        tel,
        managerTel: mobile,
        isActive,
        createdAt: now,
        updatedAt: now,
      });
      created++;
    }

    // 거래처 검색 캐시 초기화
    if (c.env.CACHE) {
      await c.env.CACHE.delete("ecount:customers_all");
    }

    return c.json({
      status: "success",
      data: {
        file: latestFile.name,
        total: rows.length,
        deleted: deletedCount,
        created,
        skipped,
      },
      message: `Dropbox 동기화 완료: 기존 ${deletedCount}건 삭제, 신규 ${created}건 등록, 건너뜀 ${skipped}`,
    });
  } catch (e: any) {
    console.error("[Companies] Dropbox sync error:", e);
    return c.json({ status: "error", message: e.message || "Dropbox 동기화 실패" }, 500);
  }
});

export default kpros;
