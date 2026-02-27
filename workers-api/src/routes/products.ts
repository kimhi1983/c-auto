/**
 * 품목 관리 CRUD + 이카운트/KPROS 동기화 라우트
 */
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, desc, like, or, and, count } from "drizzle-orm";
import { products } from "../db/schema";
import { authMiddleware } from "../middleware/auth";
import { getProducts as getEcountProducts, getERPStatus } from "../services/ecount";
import { isKprosConfigured, getKprosStock } from "../services/kpros";
import type { Env, UserContext } from "../types";

const productsRouter = new Hono<{ Bindings: Env; Variables: { user: UserContext } }>();

productsRouter.use("*", authMiddleware);

// ─── GET / - 품목 목록 (검색, 페이징, 분류/소스 필터) ───

productsRouter.get("/", async (c) => {
  const db = drizzle(c.env.DB);
  const search = c.req.query("search");
  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("limit") || "50");
  const source = c.req.query("source");
  const classCd = c.req.query("class");
  const activeOnly = c.req.query("active") !== "false";

  const conditions: any[] = [];
  if (activeOnly) conditions.push(eq(products.isActive, true));
  if (source) conditions.push(eq(products.source, source));
  if (classCd) conditions.push(eq(products.classCd, classCd));
  if (search) {
    const pattern = "%" + search + "%";
    conditions.push(
      or(
        like(products.prodDes, pattern),
        like(products.prodCd, pattern),
        like(products.classDes, pattern),
        like(products.brand, pattern),
      )
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, [{ total }]] = await Promise.all([
    db
      .select()
      .from(products)
      .where(where)
      .orderBy(desc(products.updatedAt))
      .limit(limit)
      .offset((page - 1) * limit),
    db.select({ total: count() }).from(products).where(where),
  ]);

  return c.json({
    status: "success",
    data: items,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
});

// ─── GET /:id - 품목 단건 조회 ───

productsRouter.get("/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  if (isNaN(id)) return c.json({ status: "error", message: "잘못된 ID" }, 400);

  const db = drizzle(c.env.DB);
  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, id))
    .limit(1);

  if (!product) {
    return c.json({ status: "error", message: "품목을 찾을 수 없습니다" }, 404);
  }

  return c.json({ status: "success", data: product });
});

// ─── POST / - 품목 수동 등록 ───

productsRouter.post("/", async (c) => {
  const body = await c.req.json<{
    prod_cd?: string;
    prod_des: string;
    prod_des2?: string;
    unit?: string;
    sell_price?: number;
    cost_price?: number;
    class_cd?: string;
    class_des?: string;
    brand?: string;
    manufacturer?: string;
    memo?: string;
  }>();

  if (!body.prod_des?.trim()) {
    return c.json({ status: "error", message: "품목명은 필수입니다" }, 400);
  }

  const db = drizzle(c.env.DB);
  const [created] = await db
    .insert(products)
    .values({
      prodCd: body.prod_cd || null,
      prodDes: body.prod_des.trim(),
      prodDes2: body.prod_des2 || null,
      unit: body.unit || null,
      sellPrice: body.sell_price || 0,
      costPrice: body.cost_price || 0,
      classCd: body.class_cd || null,
      classDes: body.class_des || null,
      brand: body.brand || null,
      manufacturer: body.manufacturer || null,
      memo: body.memo || null,
      source: "manual",
    })
    .returning();

  return c.json({ status: "success", data: created }, 201);
});

// ─── PATCH /:id - 품목 수정 ───

productsRouter.patch("/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  if (isNaN(id)) return c.json({ status: "error", message: "잘못된 ID" }, 400);

  const body = await c.req.json();
  const db = drizzle(c.env.DB);

  const updateData: Record<string, any> = {
    updatedAt: new Date().toISOString(),
  };

  const fieldMap: Record<string, string> = {
    prod_cd: "prodCd",
    prod_des: "prodDes",
    prod_des2: "prodDes2",
    unit: "unit",
    sell_price: "sellPrice",
    cost_price: "costPrice",
    class_cd: "classCd",
    class_des: "classDes",
    brand: "brand",
    manufacturer: "manufacturer",
    memo: "memo",
    is_active: "isActive",
  };

  for (const [reqKey, dbKey] of Object.entries(fieldMap)) {
    if (body[reqKey] !== undefined) {
      updateData[dbKey] = body[reqKey];
    }
  }

  const [updated] = await db
    .update(products)
    .set(updateData)
    .where(eq(products.id, id))
    .returning();

  if (!updated) {
    return c.json({ status: "error", message: "품목을 찾을 수 없습니다" }, 404);
  }

  return c.json({ status: "success", data: updated });
});

// ─── DELETE /:id - 품목 비활성화 (soft-delete) ───

productsRouter.delete("/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  if (isNaN(id)) return c.json({ status: "error", message: "잘못된 ID" }, 400);

  const db = drizzle(c.env.DB);
  const [updated] = await db
    .update(products)
    .set({ isActive: false, updatedAt: new Date().toISOString() })
    .where(eq(products.id, id))
    .returning();

  if (!updated) {
    return c.json({ status: "error", message: "품목을 찾을 수 없습니다" }, 404);
  }

  return c.json({ status: "success", message: "품목이 비활성화되었습니다" });
});

// ─── POST /sync-ecount - 이카운트 품목 → D1 동기화 ───

productsRouter.post("/sync-ecount", async (c) => {
  const status = getERPStatus(c.env);
  if (!status.configured) {
    return c.json({ status: "error", message: "이카운트 ERP 인증 정보가 설정되지 않았습니다" }, 400);
  }

  try {
    const result = await getEcountProducts(c.env);

    // API 미인증 에러 처리
    if (result.error) {
      return c.json({ status: "error", message: result.error }, 400);
    }

    if (result.items.length === 0) {
      return c.json({
        status: "success",
        data: { total: 0, created: 0, updated: 0 },
        message: "이카운트에서 가져온 품목 데이터가 없습니다",
      });
    }

    const db = drizzle(c.env.DB);
    let created = 0, updated = 0, skipped = 0;

    for (const item of result.items) {
      if (!item.PROD_DES?.trim()) { skipped++; continue; }

      // prod_cd로 기존 데이터 확인
      const [existing] = item.PROD_CD
        ? await db.select().from(products).where(eq(products.prodCd, item.PROD_CD)).limit(1)
        : [null];

      if (existing) {
        await db.update(products).set({
          prodDes: item.PROD_DES || existing.prodDes,
          prodDes2: item.PROD_DES2 || existing.prodDes2,
          unit: item.UNIT || existing.unit,
          sellPrice: item.PRICE ? parseFloat(item.PRICE) : existing.sellPrice,
          costPrice: item.COST ? parseFloat(item.COST) : existing.costPrice,
          classCd: item.CLASS_CD || existing.classCd,
          classDes: item.CLASS_DES || existing.classDes,
          isActive: item.USE_YN !== "N",
          source: existing.source === "kpros" ? "kpros" : "ecount",
          updatedAt: new Date().toISOString(),
        }).where(eq(products.id, existing.id));
        updated++;
      } else {
        await db.insert(products).values({
          prodCd: item.PROD_CD || null,
          prodDes: item.PROD_DES.trim(),
          prodDes2: item.PROD_DES2 || null,
          unit: item.UNIT || null,
          sellPrice: item.PRICE ? parseFloat(item.PRICE) : 0,
          costPrice: item.COST ? parseFloat(item.COST) : 0,
          classCd: item.CLASS_CD || null,
          classDes: item.CLASS_DES || null,
          isActive: item.USE_YN !== "N",
          source: "ecount",
        });
        created++;
      }
    }

    return c.json({
      status: "success",
      data: { total: result.items.length, created, updated, skipped },
      message: "이카운트 품목 동기화 완료: 신규 " + created + ", 업데이트 " + updated + ", 건너뜀 " + skipped,
    });
  } catch (e: any) {
    console.error("[Products] Ecount sync error:", e);
    return c.json({ status: "error", message: e.message || "이카운트 품목 동기화 실패" }, 500);
  }
});

// ─── POST /sync-kpros - KPROS 재고(품목) → D1 동기화 ───

productsRouter.post("/sync-kpros", async (c) => {
  if (!isKprosConfigured(c.env)) {
    return c.json({ status: "error", message: "KPROS 인증 정보가 설정되지 않았습니다" }, 400);
  }

  try {
    const stockData = await getKprosStock(c.env, true);

    if (stockData.items.length === 0) {
      return c.json({
        status: "success",
        data: { total: 0, created: 0, updated: 0 },
        message: "KPROS에서 가져온 품목 데이터가 없습니다",
      });
    }

    const db = drizzle(c.env.DB);
    let created = 0, updated = 0, skipped = 0;

    // productIdx 기준 중복 제거 (같은 품목이 여러 창고에 있을 수 있음)
    const uniqueProducts = new Map<number, typeof stockData.items[0]>();
    for (const item of stockData.items) {
      if (!uniqueProducts.has(item.productIdx)) {
        uniqueProducts.set(item.productIdx, item);
      }
    }

    for (const [productIdx, item] of uniqueProducts) {
      if (!item.productNm?.trim()) { skipped++; continue; }

      // kpros_product_idx로 기존 데이터 확인
      const [existing] = await db
        .select()
        .from(products)
        .where(eq(products.kprosProductIdx, productIdx))
        .limit(1);

      if (existing) {
        await db.update(products).set({
          prodDes: item.productNm || existing.prodDes,
          unit: item.pkgUnitNm || existing.unit,
          brand: item.braNmList || existing.brand,
          manufacturer: item.manuNmList || existing.manufacturer,
          updatedAt: new Date().toISOString(),
        }).where(eq(products.id, existing.id));
        updated++;
      } else {
        // 품목명으로 이미 등록된 품목 확인 (이카운트에서 먼저 등록된 경우)
        const [byName] = await db
          .select()
          .from(products)
          .where(eq(products.prodDes, item.productNm.trim()))
          .limit(1);

        if (byName) {
          // KPROS 정보 병합
          await db.update(products).set({
            kprosProductIdx: productIdx,
            unit: item.pkgUnitNm || byName.unit,
            brand: item.braNmList || byName.brand,
            manufacturer: item.manuNmList || byName.manufacturer,
            updatedAt: new Date().toISOString(),
          }).where(eq(products.id, byName.id));
          updated++;
        } else {
          await db.insert(products).values({
            prodDes: item.productNm.trim(),
            unit: item.pkgUnitNm || null,
            brand: item.braNmList || null,
            manufacturer: item.manuNmList || null,
            kprosProductIdx: productIdx,
            source: "kpros",
          });
          created++;
        }
      }
    }

    return c.json({
      status: "success",
      data: { total: uniqueProducts.size, created, updated, skipped },
      message: "KPROS 품목 동기화 완료: 신규 " + created + ", 업데이트 " + updated + ", 건너뜀 " + skipped,
    });
  } catch (e: any) {
    console.error("[Products] KPROS sync error:", e);
    return c.json({ status: "error", message: e.message || "KPROS 품목 동기화 실패" }, 500);
  }
});

export default productsRouter;
