/**
 * Inventory Management Routes - /api/v1/inventory
 * 재고 관리 + 엑셀 업로드 + AI 분석 보고서 + 이카운트 ERP 연동
 */
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, desc, like, count } from "drizzle-orm";
import { inventoryItems, inventoryTransactions, dailyReports } from "../db/schema";
import { authMiddleware } from "../middleware/auth";
import { askAIAnalyze, askAIAnalyzePro } from "../services/ai";
import {
  getERPStatus,
  getInventory as getEcountInventory,
  getSales as getEcountSales,
} from "../services/ecount";
import { isKprosConfigured, getKprosStock } from "../services/kpros";
import type { Env } from "../types";

const inventory = new Hono<{ Bindings: Env }>();

inventory.use("*", authMiddleware);

/**
 * GET /inventory/kpros-stock - KPROS ERP 실시간 재고 현황
 */
inventory.get("/kpros-stock", async (c) => {
  if (!isKprosConfigured(c.env)) {
    return c.json({ status: "error", message: "KPROS 인증 정보 미설정", configured: false }, 400);
  }
  const forceRefresh = c.req.query("refresh") === "true";
  try {
    const data = await getKprosStock(c.env, forceRefresh);
    return c.json({ status: "success", data });
  } catch (e: any) {
    // 오류 시 캐시 데이터 반환 시도
    if (c.env.CACHE) {
      const stale = await c.env.CACHE.get("kpros:stock_data", "json");
      if (stale) return c.json({ status: "success", data: stale, stale: true });
    }
    return c.json({ status: "error", message: e.message }, 500);
  }
});

/**
 * GET /inventory/kpros-status - KPROS 연동 상태
 */
inventory.get("/kpros-status", async (c) => {
  return c.json({ status: "success", data: { configured: isKprosConfigured(c.env) } });
});

/**
 * GET /inventory - 재고 목록
 * 프론트엔드 호환: { status: 'success', data: [{ name, stock, unit }] }
 */
inventory.get("/", async (c) => {
  const db = drizzle(c.env.DB);
  const lowStockOnly = c.req.query("low_stock") === "true";

  const items = await db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.isActive, true))
    .orderBy(inventoryItems.itemName);

  const result = lowStockOnly
    ? items.filter((item) => item.currentStock <= (item.minStock || 0))
    : items;

  // 프론트엔드 호환 형식 (한국어 필드명 + 영문 필드명 모두 포함)
  const data = result.map((item) => ({
    id: item.id,
    name: item.itemName,
    "품목명": item.itemName,
    stock: item.currentStock,
    "현재고": String(item.currentStock),
    unit: item.unit || "개",
    "단위": item.unit || "개",
    item_code: item.itemCode,
    min_stock: item.minStock,
    max_stock: item.maxStock,
    unit_price: item.unitPrice,
    supplier: item.supplier,
  }));

  return c.json({ status: "success", data });
});

/**
 * GET /inventory/stats - 재고 통계
 */
inventory.get("/stats", async (c) => {
  const db = drizzle(c.env.DB);

  const items = await db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.isActive, true));

  const totalItems = items.length;
  const totalValue = items.reduce(
    (sum, item) => sum + item.currentStock * (item.unitPrice || 0),
    0
  );
  const lowStockCount = items.filter(
    (item) => item.currentStock <= (item.minStock || 0)
  ).length;

  return c.json({
    status: "success",
    data: {
      total_items: totalItems,
      total_value: Math.round(totalValue),
      low_stock_count: lowStockCount,
      low_stock_items: items
        .filter((item) => item.currentStock <= (item.minStock || 0))
        .map((item) => ({
          id: item.id,
          name: item.itemName,
          current: item.currentStock,
          min: item.minStock,
        })),
    },
  });
});

/**
 * POST /inventory/items - 품목 추가
 */
inventory.post("/items", async (c) => {
  const body = await c.req.json<{
    item_code?: string;
    item_name: string;
    unit?: string;
    current_stock?: number;
    min_stock?: number;
    max_stock?: number;
    unit_price?: number;
    supplier?: string;
    category?: string;
    location?: string;
  }>();

  const db = drizzle(c.env.DB);

  const [item] = await db
    .insert(inventoryItems)
    .values({
      itemCode: body.item_code,
      itemName: body.item_name,
      unit: body.unit,
      currentStock: body.current_stock || 0,
      minStock: body.min_stock || 0,
      maxStock: body.max_stock || 0,
      unitPrice: body.unit_price || 0,
      supplier: body.supplier,
      category: body.category,
      location: body.location,
    })
    .returning();

  return c.json({ status: "success", data: item }, 201);
});

/**
 * PATCH /inventory/items/:id - 품목 수정
 */
inventory.patch("/items/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  const body = await c.req.json();
  const db = drizzle(c.env.DB);

  const updateData: Record<string, any> = {
    updatedAt: new Date().toISOString(),
  };

  if (body.item_name) updateData.itemName = body.item_name;
  if (body.unit) updateData.unit = body.unit;
  if (body.min_stock !== undefined) updateData.minStock = body.min_stock;
  if (body.max_stock !== undefined) updateData.maxStock = body.max_stock;
  if (body.unit_price !== undefined) updateData.unitPrice = body.unit_price;
  if (body.supplier !== undefined) updateData.supplier = body.supplier;

  const [updated] = await db
    .update(inventoryItems)
    .set(updateData)
    .where(eq(inventoryItems.id, id))
    .returning();

  if (!updated) {
    return c.json({ detail: "품목을 찾을 수 없습니다" }, 404);
  }

  return c.json({ status: "success", data: updated });
});

/**
 * POST /inventory/items/:id/transaction - 입출고 처리
 */
inventory.post("/items/:id/transaction", async (c) => {
  const id = parseInt(c.req.param("id"));
  const user = c.get("user");
  const { transaction_type, quantity, note, reference_number } =
    await c.req.json<{
      transaction_type: "입고" | "출고";
      quantity: number;
      note?: string;
      reference_number?: string;
    }>();

  if (!transaction_type || !quantity || quantity <= 0) {
    return c.json({ detail: "유효한 거래 유형과 수량을 입력하세요" }, 400);
  }

  const db = drizzle(c.env.DB);

  const [item] = await db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.id, id))
    .limit(1);

  if (!item) {
    return c.json({ detail: "품목을 찾을 수 없습니다" }, 404);
  }

  const newStock =
    transaction_type === "입고"
      ? item.currentStock + quantity
      : item.currentStock - quantity;

  if (newStock < 0) {
    return c.json({ detail: "재고가 부족합니다" }, 400);
  }

  await db.insert(inventoryTransactions).values({
    itemId: id,
    transactionType: transaction_type,
    quantity,
    note,
    referenceNumber: reference_number,
    createdBy: user.userId,
  });

  await db
    .update(inventoryItems)
    .set({
      currentStock: newStock,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(inventoryItems.id, id));

  return c.json({
    status: "success",
    message: `${item.itemName} ${quantity}개 ${transaction_type} 완료`,
    current_stock: newStock,
  });
});

/**
 * POST /inventory/transaction - 프론트엔드 호환 (이름으로 입출고)
 */
inventory.post("/transaction", async (c) => {
  const user = c.get("user");
  const { item_name, transaction_type, quantity, note } =
    await c.req.json<{
      item_name: string;
      transaction_type: string;
      quantity: number;
      note?: string;
    }>();

  if (!item_name || !quantity || quantity <= 0) {
    return c.json({ detail: "품목명과 수량을 입력하세요" }, 400);
  }

  const db = drizzle(c.env.DB);

  const [item] = await db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.itemName, item_name))
    .limit(1);

  if (!item) {
    return c.json({ detail: "품목을 찾을 수 없습니다" }, 404);
  }

  const newStock =
    transaction_type === "입고"
      ? item.currentStock + quantity
      : item.currentStock - quantity;

  if (newStock < 0) {
    return c.json({ detail: "재고가 부족합니다" }, 400);
  }

  await db.insert(inventoryTransactions).values({
    itemId: item.id,
    transactionType: transaction_type,
    quantity,
    note,
    createdBy: user.userId,
  });

  await db
    .update(inventoryItems)
    .set({
      currentStock: newStock,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(inventoryItems.id, item.id));

  return c.json({
    status: "success",
    message: `${item.itemName} ${quantity}개 ${transaction_type} 완료`,
  });
});

/**
 * GET /inventory/items/:id/transactions - 거래 이력
 */
inventory.get("/items/:id/transactions", async (c) => {
  const id = parseInt(c.req.param("id"));
  const db = drizzle(c.env.DB);

  const transactions = await db
    .select()
    .from(inventoryTransactions)
    .where(eq(inventoryTransactions.itemId, id))
    .orderBy(desc(inventoryTransactions.createdAt))
    .limit(50);

  return c.json({ status: "success", data: transactions });
});

/**
 * POST /inventory/upload - 엑셀 데이터 업로드 (클라이언트에서 파싱 후 JSON 전송)
 * 기존 품목은 업데이트, 새 품목은 추가
 */
inventory.post("/upload", async (c) => {
  const body = await c.req.json<{
    items: Array<{
      item_code?: string;
      item_name: string;
      unit?: string;
      current_stock: number;
      min_stock?: number;
      max_stock?: number;
      unit_price?: number;
      supplier?: string;
      category?: string;
      location?: string;
    }>;
    file_name?: string;
  }>();

  if (!body.items || body.items.length === 0) {
    return c.json({ status: "error", message: "업로드할 데이터가 없습니다" }, 400);
  }

  const db = drizzle(c.env.DB);
  let created = 0;
  let updated = 0;

  for (const row of body.items) {
    if (!row.item_name) continue;

    // 기존 품목 조회 (이름으로)
    const [existing] = await db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.itemName, row.item_name))
      .limit(1);

    if (existing) {
      await db
        .update(inventoryItems)
        .set({
          currentStock: row.current_stock ?? existing.currentStock,
          minStock: row.min_stock ?? existing.minStock,
          maxStock: row.max_stock ?? existing.maxStock,
          unitPrice: row.unit_price ?? existing.unitPrice,
          unit: row.unit || existing.unit,
          supplier: row.supplier || existing.supplier,
          category: row.category || existing.category,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(inventoryItems.id, existing.id));
      updated++;
    } else {
      await db.insert(inventoryItems).values({
        itemCode: row.item_code,
        itemName: row.item_name,
        unit: row.unit || "개",
        currentStock: row.current_stock || 0,
        minStock: row.min_stock || 0,
        maxStock: row.max_stock || 0,
        unitPrice: row.unit_price || 0,
        supplier: row.supplier,
        category: row.category,
        location: row.location,
      });
      created++;
    }
  }

  return c.json({
    status: "success",
    data: { total: body.items.length, created, updated },
    message: `${body.items.length}건 처리 (신규 ${created}, 업데이트 ${updated})`,
  });
});

/**
 * POST /inventory/analyze - AI 재고 분석 보고서 생성
 * 엑셀 데이터를 받아서 안전재고, 부족재고, 과잉재고, 추천사항 분석
 */
inventory.post("/analyze", async (c) => {
  const body = await c.req.json<{
    items: Array<{
      item_name: string;
      current_stock: number;
      min_stock?: number;
      max_stock?: number;
      unit?: string;
      unit_price?: number;
      supplier?: string;
      category?: string;
    }>;
    file_name?: string;
  }>();

  if (!body.items || body.items.length === 0) {
    return c.json({ status: "error", message: "분석할 데이터가 없습니다" }, 400);
  }

  const items = body.items;

  // 기본 통계 계산
  const totalItems = items.length;
  const totalValue = items.reduce((s, i) => s + (i.current_stock || 0) * (i.unit_price || 0), 0);
  const lowStock = items.filter((i) => i.min_stock && i.current_stock <= i.min_stock);
  const overStock = items.filter((i) => i.max_stock && i.max_stock > 0 && i.current_stock > i.max_stock);
  const zeroStock = items.filter((i) => i.current_stock === 0);
  const safeItems = items.filter(
    (i) => !i.min_stock || i.current_stock > i.min_stock
  );

  // 카테고리별 집계
  const byCategory: Record<string, { count: number; value: number }> = {};
  for (const item of items) {
    const cat = item.category || "미분류";
    if (!byCategory[cat]) byCategory[cat] = { count: 0, value: 0 };
    byCategory[cat].count++;
    byCategory[cat].value += (item.current_stock || 0) * (item.unit_price || 0);
  }

  // 공급사별 집계
  const bySupplier: Record<string, number> = {};
  for (const item of items) {
    const sup = item.supplier || "미지정";
    bySupplier[sup] = (bySupplier[sup] || 0) + 1;
  }

  // AI 분석 프롬프트
  const dataForAI = `
[KPROS 재고 현황 분석 데이터]

■ 전체 요약
- 총 품목 수: ${totalItems}개
- 총 재고 가치: ₩${totalValue.toLocaleString()}
- 안전재고 부족: ${lowStock.length}건
- 과잉재고: ${overStock.length}건
- 재고 0 품목: ${zeroStock.length}건

■ 안전재고 부족 품목 (긴급)
${lowStock.length > 0 ? lowStock.slice(0, 15).map((i) =>
  `- ${i.item_name}: 현재 ${i.current_stock}${i.unit || "개"} / 최소 ${i.min_stock}${i.unit || "개"} (부족: ${(i.min_stock || 0) - i.current_stock}${i.unit || "개"})${i.supplier ? ` [공급: ${i.supplier}]` : ""}`
).join("\n") : "없음"}

■ 과잉재고 품목
${overStock.length > 0 ? overStock.slice(0, 10).map((i) =>
  `- ${i.item_name}: 현재 ${i.current_stock}${i.unit || "개"} / 최대 ${i.max_stock}${i.unit || "개"} (초과: ${i.current_stock - (i.max_stock || 0)}${i.unit || "개"})${i.unit_price ? ` [단가: ₩${i.unit_price.toLocaleString()}]` : ""}`
).join("\n") : "없음"}

■ 재고 없는 품목
${zeroStock.length > 0 ? zeroStock.slice(0, 10).map((i) =>
  `- ${i.item_name}${i.supplier ? ` [공급: ${i.supplier}]` : ""}`
).join("\n") : "없음"}

■ 카테고리별 현황
${Object.entries(byCategory).map(([cat, d]) =>
  `- ${cat}: ${d.count}개 품목, 재고가치 ₩${d.value.toLocaleString()}`
).join("\n")}

■ 공급사별 품목 수
${Object.entries(bySupplier).map(([sup, cnt]) =>
  `- ${sup}: ${cnt}개 품목`
).join("\n")}

■ 전체 품목 목록 (상위 30개)
${items.slice(0, 30).map((i) =>
  `${i.item_name} | 재고: ${i.current_stock}${i.unit || "개"} | 최소: ${i.min_stock || "-"} | 최대: ${i.max_stock || "-"} | 단가: ${i.unit_price ? "₩" + i.unit_price.toLocaleString() : "-"}`
).join("\n")}
${items.length > 30 ? `\n... 외 ${items.length - 30}건` : ""}
`;

  let aiInsight = "";
  try {
    aiInsight = await askAIAnalyze(
      c.env,
      `다음 KPROS(화장품 원료 전문기업) 재고 데이터를 분석하여 이사님께 보고할 재고 관리 보고서를 작성하세요.

${dataForAI}

[작성 규칙]
1. **긴급 조치 필요** - 안전재고 미달 품목 중 즉시 발주가 필요한 항목 (우선순위 순)
2. **안전재고 확보 방안** - 부족 품목별 권장 발주량과 예상 비용
3. **과잉재고 관리** - 과잉 품목의 재고 최적화 방안
4. **재고 효율성 분석** - 재고 회전율, 사장 재고 위험, 보관 비용 관점
5. **공급사 관리** - 공급사 의존도, 대체 공급처 필요 여부
6. **추천 액션 플랜** - 향후 1주/1개월 실행 과제
7. 숫자는 ₩ 단위, 천 단위 콤마 포함
8. 이사님이 빠르게 의사결정할 수 있도록 간결하게`,
      "당신은 KPROS(화장품 원료 전문기업) 재고관리 전문 AI 비서입니다. 안전재고 관리, SCM 최적화, 원가절감에 전문성을 갖고 이사님께 보고하는 톤으로 분석합니다.",
      4096
    );
  } catch (e) {
    console.error("[Inventory] AI analysis failed:", e);
    aiInsight = "AI 분석을 생성할 수 없습니다.";
  }

  return c.json({
    status: "success",
    data: {
      summary: {
        total_items: totalItems,
        total_value: totalValue,
        low_stock_count: lowStock.length,
        over_stock_count: overStock.length,
        zero_stock_count: zeroStock.length,
        safe_stock_count: safeItems.length,
      },
      low_stock_items: lowStock.map((i) => ({
        name: i.item_name,
        current: i.current_stock,
        min: i.min_stock,
        shortage: (i.min_stock || 0) - i.current_stock,
        unit: i.unit || "개",
        supplier: i.supplier,
      })),
      over_stock_items: overStock.map((i) => ({
        name: i.item_name,
        current: i.current_stock,
        max: i.max_stock,
        excess: i.current_stock - (i.max_stock || 0),
        unit: i.unit || "개",
      })),
      zero_stock_items: zeroStock.map((i) => ({
        name: i.item_name,
        supplier: i.supplier,
      })),
      by_category: byCategory,
      by_supplier: bySupplier,
      ai_insight: aiInsight,
      analyzed_at: new Date().toISOString(),
      file_name: body.file_name,
    },
    message: "재고 분석 완료",
  });
});

/**
 * POST /inventory/sync-ecount - 이카운트 ERP 재고/판매 동기화
 * 이카운트에서 재고현황 + 판매내역을 가져와서 DB 동기화
 */
inventory.post("/sync-ecount", async (c) => {
  const erpStatus = getERPStatus(c.env);
  if (!erpStatus.configured) {
    return c.json({
      status: "error",
      message: "이카운트 ERP 인증 정보가 설정되지 않았습니다. wrangler secret put으로 ECOUNT_COM_CODE, ECOUNT_USER_ID, ECOUNT_API_CERT_KEY를 등록하세요.",
      erp_configured: false,
    }, 400);
  }

  const user = c.get("user");
  const db = drizzle(c.env.DB);
  const now = new Date().toISOString();

  // 판매 기간 설정 (기본 90일)
  const body = await c.req.json<{
    sales_days?: number; // 판매 데이터 조회 기간 (기본 90일)
  }>().catch(() => ({}));

  const salesDays = Math.min(body.sales_days || 90, 365);
  const today = new Date();
  const dateTo = today.toISOString().split("T")[0].replace(/-/g, "");
  const dateFrom = (() => {
    const d = new Date(today);
    d.setDate(d.getDate() - salesDays);
    return d.toISOString().split("T")[0].replace(/-/g, "");
  })();

  try {
    // ── 이카운트 API 동시 호출: 재고현황 + 판매내역 ──
    const [inventoryResult, salesResult] = await Promise.allSettled([
      getEcountInventory(c.env),
      getEcountSales(c.env, dateFrom, dateTo),
    ]);

    // 재고 데이터 처리
    let inventoryItems_synced = 0;
    let inventoryItems_created = 0;
    let inventoryItems_updated = 0;
    const syncedInventory: Array<{
      item_name: string;
      item_code: string;
      current_stock: number;
      unit: string;
      unit_price: number;
      action: "created" | "updated";
    }> = [];

    if (inventoryResult.status === "fulfilled") {
      const ecountItems = inventoryResult.value.items || [];

      for (const item of ecountItems) {
        const prodCode = item.PROD_CD || item.PROD_CODE || "";
        const prodName = item.PROD_DES || item.PROD_NAME || item.PROD_CD || "";
        const qty = parseFloat(item.STCK_QTY || item.BAL_QTY || item.QTY || "0") || 0;
        const unit = item.UNIT || item.UNIT_DES || "EA";
        const price = parseFloat(item.PRICE || item.UNIT_PRICE || "0") || 0;
        const whCode = item.WH_CD || item.WH_DES || "";

        if (!prodName) continue;

        // DB에서 기존 품목 조회 (품목코드 또는 이름으로)
        let [existing] = prodCode
          ? await db.select().from(inventoryItems).where(eq(inventoryItems.itemCode, prodCode)).limit(1)
          : [];
        if (!existing) {
          [existing] = await db.select().from(inventoryItems).where(eq(inventoryItems.itemName, prodName)).limit(1);
        }

        if (existing) {
          const oldStock = existing.currentStock;
          await db.update(inventoryItems).set({
            currentStock: qty,
            itemCode: prodCode || existing.itemCode,
            unit: unit || existing.unit,
            unitPrice: price || existing.unitPrice,
            location: whCode || existing.location,
            updatedAt: now,
          }).where(eq(inventoryItems.id, existing.id));

          // 재고 변동 시 트랜잭션 기록
          if (oldStock !== qty) {
            const diff = qty - oldStock;
            await db.insert(inventoryTransactions).values({
              itemId: existing.id,
              transactionType: diff > 0 ? "입고" : "출고",
              quantity: Math.abs(diff),
              note: `이카운트 동기화 (${dateTo})`,
              referenceNumber: `ECOUNT-SYNC-${dateTo}`,
              createdBy: user.userId,
            });
          }

          inventoryItems_updated++;
          syncedInventory.push({ item_name: prodName, item_code: prodCode, current_stock: qty, unit, unit_price: price, action: "updated" });
        } else {
          const [newItem] = await db.insert(inventoryItems).values({
            itemCode: prodCode || null,
            itemName: prodName,
            unit: unit || "EA",
            currentStock: qty,
            unitPrice: price,
            location: whCode || null,
          }).returning();

          if (newItem && qty > 0) {
            await db.insert(inventoryTransactions).values({
              itemId: newItem.id,
              transactionType: "입고",
              quantity: qty,
              note: `이카운트 초기 동기화`,
              referenceNumber: `ECOUNT-INIT-${dateTo}`,
              createdBy: user.userId,
            });
          }

          inventoryItems_created++;
          syncedInventory.push({ item_name: prodName, item_code: prodCode, current_stock: qty, unit, unit_price: price, action: "created" });
        }

        inventoryItems_synced++;
      }
    }

    // 판매 데이터 처리
    let salesCount = 0;
    const salesRecords: Array<{
      date: string;
      item_name: string;
      item_code: string;
      quantity: number;
      amount: number;
      customer: string;
    }> = [];

    if (salesResult.status === "fulfilled") {
      const ecountSales = salesResult.value.items || [];

      for (const sale of ecountSales) {
        const date = sale.IO_DATE || "";
        const prodName = sale.PROD_DES || sale.PROD_CD || "";
        const prodCode = sale.PROD_CD || "";
        const qty = parseFloat(sale.QTY || "0") || 0;
        const amt = parseFloat(sale.SUPPLY_AMT || sale.TOTAL_AMT || "0") || 0;
        const customer = sale.CUST_DES || sale.CUST_CD || "";

        if (!prodName || !date) continue;

        salesRecords.push({
          date,
          item_name: prodName,
          item_code: prodCode,
          quantity: qty,
          amount: amt,
          customer,
        });
        salesCount++;
      }
    }

    const invError = inventoryResult.status === "rejected" ? (inventoryResult.reason as Error).message : null;
    const salesError = salesResult.status === "rejected" ? (salesResult.reason as Error).message : null;

    return c.json({
      status: "success",
      data: {
        inventory: {
          synced: inventoryItems_synced,
          created: inventoryItems_created,
          updated: inventoryItems_updated,
          items: syncedInventory,
          error: invError,
        },
        sales: {
          count: salesCount,
          period: { from: dateFrom, to: dateTo, days: salesDays },
          records: salesRecords,
          error: salesError,
        },
        synced_at: now,
      },
      message: `이카운트 동기화 완료: 재고 ${inventoryItems_synced}건 (신규 ${inventoryItems_created}, 업데이트 ${inventoryItems_updated}), 판매 ${salesCount}건 (${salesDays}일)`,
    });
  } catch (e: any) {
    console.error("[Inventory] eCount sync error:", e);
    return c.json({
      status: "error",
      message: e.message || "이카운트 동기화 실패",
      erp_configured: true,
    }, 500);
  }
});

/**
 * GET /inventory/ecount-status - 이카운트 ERP 연동 상태 확인
 */
inventory.get("/ecount-status", async (c) => {
  const status = getERPStatus(c.env);
  return c.json({
    status: "success",
    data: {
      configured: status.configured,
      credentials: {
        com_code: status.comCode,
        user_id: status.userId,
        api_key: status.apiKey,
      },
    },
  });
});

/**
 * POST /inventory/smart-analyze - 재고 + 판매 통합 스마트 분석
 * ABC분석, 안전재고 산출, 발주점(ROP), 판매속도, 재고일수, 품절위험, 사장재고
 */
inventory.post("/smart-analyze", async (c) => {
  const body = await c.req.json<{
    inventory_items: Array<{
      item_name: string;
      item_code?: string;
      current_stock: number;
      min_stock?: number;
      max_stock?: number;
      unit?: string;
      unit_price?: number;
      supplier?: string;
      category?: string;
    }>;
    sales_records: Array<{
      date: string;       // YYYY-MM-DD or YYYYMMDD
      item_name: string;
      quantity: number;
      amount?: number;
      customer?: string;
    }>;
    lead_time_days?: number;    // 기본 리드타임 (기본 7일)
    service_level?: number;     // 서비스 레벨 (기본 95% → z=1.65)
  }>();

  if (!body.inventory_items?.length) {
    return c.json({ status: "error", message: "재고 데이터가 필요합니다" }, 400);
  }

  const invItems = body.inventory_items;
  const salesRecs = body.sales_records || [];
  const leadTime = body.lead_time_days || 7;
  // z-score: 90%=1.28, 95%=1.65, 99%=2.33
  const zScore = body.service_level === 99 ? 2.33 : body.service_level === 90 ? 1.28 : 1.65;

  // ──── 판매 데이터 정규화 ────
  const normalizeDate = (d: string) => d.replace(/[^0-9]/g, '').replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');

  // 품목별 판매 집계
  const salesByItem: Record<string, { dates: Record<string, number>; totalQty: number; totalAmt: number; customers: Set<string> }> = {};

  for (const rec of salesRecs) {
    const key = rec.item_name.trim();
    if (!salesByItem[key]) {
      salesByItem[key] = { dates: {}, totalQty: 0, totalAmt: 0, customers: new Set() };
    }
    const dateStr = normalizeDate(rec.date);
    salesByItem[key].dates[dateStr] = (salesByItem[key].dates[dateStr] || 0) + rec.quantity;
    salesByItem[key].totalQty += rec.quantity;
    salesByItem[key].totalAmt += rec.amount || 0;
    if (rec.customer) salesByItem[key].customers.add(rec.customer);
  }

  // 판매 기간 계산 (일수)
  const allDates = salesRecs.map((r) => normalizeDate(r.date)).filter(Boolean).sort();
  const salesPeriodDays = allDates.length > 1
    ? Math.max(1, Math.ceil((new Date(allDates[allDates.length - 1]).getTime() - new Date(allDates[0]).getTime()) / 86400000) + 1)
    : allDates.length === 1 ? 1 : 0;

  // ──── 품목별 분석 ────
  interface ItemAnalysis {
    name: string;
    code?: string;
    category?: string;
    supplier?: string;
    unit: string;
    current_stock: number;
    unit_price: number;
    stock_value: number;
    // 판매 분석
    total_sold: number;
    total_revenue: number;
    avg_daily_sales: number;
    max_daily_sales: number;
    std_daily_sales: number;
    customer_count: number;
    // 재고 분석
    safety_stock: number;
    reorder_point: number;
    days_of_supply: number;
    recommended_order_qty: number;
    // 분류
    abc_class: 'A' | 'B' | 'C';
    status: 'stockout_risk' | 'low_stock' | 'optimal' | 'overstock' | 'dead_stock';
    demand_trend: 'increasing' | 'decreasing' | 'stable' | 'no_data';
  }

  const analyses: ItemAnalysis[] = [];

  for (const inv of invItems) {
    const sales = salesByItem[inv.item_name.trim()];
    const unitPrice = inv.unit_price || 0;

    let totalSold = 0;
    let totalRevenue = 0;
    let avgDaily = 0;
    let maxDaily = 0;
    let stdDaily = 0;
    let customerCount = 0;
    let demandTrend: ItemAnalysis['demand_trend'] = 'no_data';

    if (sales && salesPeriodDays > 0) {
      totalSold = sales.totalQty;
      totalRevenue = sales.totalAmt || totalSold * unitPrice;
      avgDaily = totalSold / salesPeriodDays;
      customerCount = sales.customers.size;

      // 일별 판매량 배열
      const dailySales = Object.values(sales.dates);
      maxDaily = Math.max(...dailySales, 0);

      // 표준편차
      if (dailySales.length > 1) {
        const mean = dailySales.reduce((s, v) => s + v, 0) / dailySales.length;
        const variance = dailySales.reduce((s, v) => s + (v - mean) ** 2, 0) / dailySales.length;
        stdDaily = Math.sqrt(variance);
      }

      // 트렌드 분석 (전반기 vs 후반기)
      const sortedDates = Object.keys(sales.dates).sort();
      if (sortedDates.length >= 4) {
        const mid = Math.floor(sortedDates.length / 2);
        const firstHalf = sortedDates.slice(0, mid).reduce((s, d) => s + (sales.dates[d] || 0), 0) / mid;
        const secondHalf = sortedDates.slice(mid).reduce((s, d) => s + (sales.dates[d] || 0), 0) / (sortedDates.length - mid);
        const changeRate = firstHalf > 0 ? (secondHalf - firstHalf) / firstHalf : 0;
        demandTrend = changeRate > 0.15 ? 'increasing' : changeRate < -0.15 ? 'decreasing' : 'stable';
      } else if (sortedDates.length > 0) {
        demandTrend = 'stable';
      }
    }

    // 안전재고 = Z × σ × √L  (σ: 일별 판매 표준편차, L: 리드타임)
    const safetyStock = salesPeriodDays > 0
      ? Math.ceil(zScore * stdDaily * Math.sqrt(leadTime))
      : inv.min_stock || 0;

    // 발주점(ROP) = 평균일판매 × 리드타임 + 안전재고
    const reorderPoint = Math.ceil(avgDaily * leadTime + safetyStock);

    // 재고일수 = 현재고 / 일평균판매
    const daysOfSupply = avgDaily > 0 ? Math.round(inv.current_stock / avgDaily) : inv.current_stock > 0 ? 999 : 0;

    // 권장 발주량 = (일평균판매 × (리드타임+30)) + 안전재고 - 현재고
    const recommendedOrder = Math.max(0, Math.ceil(avgDaily * (leadTime + 30) + safetyStock - inv.current_stock));

    // 상태 판정
    let status: ItemAnalysis['status'] = 'optimal';
    if (totalSold === 0 && salesPeriodDays > 0 && inv.current_stock > 0) {
      status = 'dead_stock';
    } else if (inv.current_stock === 0) {
      status = 'stockout_risk';
    } else if (daysOfSupply <= leadTime && avgDaily > 0) {
      status = 'stockout_risk';
    } else if (inv.current_stock <= reorderPoint && avgDaily > 0) {
      status = 'low_stock';
    } else if (inv.max_stock && inv.current_stock > inv.max_stock) {
      status = 'overstock';
    }

    analyses.push({
      name: inv.item_name,
      code: inv.item_code,
      category: inv.category,
      supplier: inv.supplier,
      unit: inv.unit || '개',
      current_stock: inv.current_stock,
      unit_price: unitPrice,
      stock_value: inv.current_stock * unitPrice,
      total_sold: totalSold,
      total_revenue: totalRevenue,
      avg_daily_sales: Math.round(avgDaily * 100) / 100,
      max_daily_sales: maxDaily,
      std_daily_sales: Math.round(stdDaily * 100) / 100,
      customer_count: customerCount,
      safety_stock: safetyStock,
      reorder_point: reorderPoint,
      days_of_supply: daysOfSupply,
      recommended_order_qty: recommendedOrder,
      abc_class: 'C', // 임시, 아래에서 재계산
      status,
      demand_trend: demandTrend,
    });
  }

  // ──── ABC 분류 (매출 기여도 기반) ────
  const totalRevAll = analyses.reduce((s, a) => s + a.total_revenue, 0);
  if (totalRevAll > 0) {
    const sorted = [...analyses].sort((a, b) => b.total_revenue - a.total_revenue);
    let cumRev = 0;
    for (const item of sorted) {
      cumRev += item.total_revenue;
      const cumPct = cumRev / totalRevAll;
      const original = analyses.find((a) => a.name === item.name);
      if (original) {
        original.abc_class = cumPct <= 0.8 ? 'A' : cumPct <= 0.95 ? 'B' : 'C';
      }
    }
  }

  // ──── 집계 ────
  const summary = {
    total_items: analyses.length,
    total_stock_value: analyses.reduce((s, a) => s + a.stock_value, 0),
    total_sales_revenue: totalRevAll,
    sales_period_days: salesPeriodDays,
    lead_time_days: leadTime,
    abc_counts: { A: 0, B: 0, C: 0 } as Record<string, number>,
    status_counts: { stockout_risk: 0, low_stock: 0, optimal: 0, overstock: 0, dead_stock: 0 } as Record<string, number>,
    avg_days_of_supply: 0,
    items_needing_reorder: 0,
  };

  for (const a of analyses) {
    summary.abc_counts[a.abc_class]++;
    summary.status_counts[a.status]++;
    if (a.recommended_order_qty > 0) summary.items_needing_reorder++;
  }

  const supplyItems = analyses.filter((a) => a.days_of_supply < 999);
  summary.avg_days_of_supply = supplyItems.length > 0
    ? Math.round(supplyItems.reduce((s, a) => s + a.days_of_supply, 0) / supplyItems.length)
    : 0;

  // 위험 품목 (발주 필요)
  const reorderItems = analyses
    .filter((a) => a.status === 'stockout_risk' || a.status === 'low_stock')
    .sort((a, b) => a.days_of_supply - b.days_of_supply);

  // 사장재고
  const deadStockItems = analyses.filter((a) => a.status === 'dead_stock');

  // 과잉재고
  const overstockItems = analyses.filter((a) => a.status === 'overstock');

  // TOP 판매 품목
  const topSellers = [...analyses]
    .sort((a, b) => b.total_revenue - a.total_revenue)
    .slice(0, 10);

  // 카테고리별
  const byCategory: Record<string, { count: number; value: number; revenue: number }> = {};
  for (const a of analyses) {
    const cat = a.category || '미분류';
    if (!byCategory[cat]) byCategory[cat] = { count: 0, value: 0, revenue: 0 };
    byCategory[cat].count++;
    byCategory[cat].value += a.stock_value;
    byCategory[cat].revenue += a.total_revenue;
  }

  // 월별 판매 트렌드
  const monthlyTrend: Record<string, { qty: number; amount: number }> = {};
  for (const rec of salesRecs) {
    const month = normalizeDate(rec.date).substring(0, 7); // YYYY-MM
    if (!monthlyTrend[month]) monthlyTrend[month] = { qty: 0, amount: 0 };
    monthlyTrend[month].qty += rec.quantity;
    monthlyTrend[month].amount += rec.amount || 0;
  }

  // ──── AI 인사이트 ────
  let aiInsight = "";
  try {
    const aiData = `
[KPROS 재고-판매 통합 분석 데이터]

■ 전체 요약
- 분석 품목: ${summary.total_items}개
- 총 재고가치: ₩${summary.total_stock_value.toLocaleString()}
- 기간 총 매출: ₩${summary.total_sales_revenue.toLocaleString()} (${salesPeriodDays}일)
- 리드타임: ${leadTime}일
- 평균 재고일수: ${summary.avg_days_of_supply}일

■ ABC 분류 (매출 기여도)
- A등급 (상위 80%): ${summary.abc_counts.A}개 품목
- B등급 (80~95%): ${summary.abc_counts.B}개 품목
- C등급 (하위 5%): ${summary.abc_counts.C}개 품목

■ 재고 상태
- 품절 위험: ${summary.status_counts.stockout_risk}건
- 안전재고 부족: ${summary.status_counts.low_stock}건
- 정상: ${summary.status_counts.optimal}건
- 과잉재고: ${summary.status_counts.overstock}건
- 사장재고(판매 0): ${summary.status_counts.dead_stock}건

■ 긴급 발주 필요 (품절 위험 + 부족 품목)
${reorderItems.slice(0, 15).map((i) =>
  `- ${i.name}: 현재 ${i.current_stock}${i.unit}, 일평균판매 ${i.avg_daily_sales}${i.unit}/일, 재고일수 ${i.days_of_supply}일, 권장발주 ${i.recommended_order_qty}${i.unit}${i.supplier ? ` [${i.supplier}]` : ''}`
).join('\n') || '없음'}

■ TOP 10 매출 품목
${topSellers.map((i, idx) =>
  `${idx + 1}. ${i.name} (${i.abc_class}등급): 매출 ₩${i.total_revenue.toLocaleString()}, 판매 ${i.total_sold}${i.unit}, 일평균 ${i.avg_daily_sales}${i.unit}/일, 트렌드: ${i.demand_trend === 'increasing' ? '↑증가' : i.demand_trend === 'decreasing' ? '↓감소' : '→안정'}`
).join('\n') || '판매 데이터 없음'}

■ 사장재고 (판매실적 없음)
${deadStockItems.slice(0, 10).map((i) =>
  `- ${i.name}: 재고 ${i.current_stock}${i.unit}, 가치 ₩${i.stock_value.toLocaleString()}`
).join('\n') || '없음'}

■ 과잉재고
${overstockItems.slice(0, 10).map((i) =>
  `- ${i.name}: 현재 ${i.current_stock}${i.unit}, 재고일수 ${i.days_of_supply}일`
).join('\n') || '없음'}

■ 월별 판매 추이
${Object.entries(monthlyTrend).sort(([a],[b]) => a.localeCompare(b)).map(([m, d]) =>
  `- ${m}: ${d.qty}개, ₩${d.amount.toLocaleString()}`
).join('\n') || '데이터 없음'}
`;

    aiInsight = await askAIAnalyze(
      c.env,
      `다음 KPROS(화장품 원료 전문기업) 재고+판매 통합 데이터를 분석하여 이사님께 보고할 스마트 재고관리 보고서를 작성하세요.

${aiData}

[보고서 구성]
1. **경영진 요약** - 핵심 지표 3줄 요약
2. **긴급 발주 권고** - 품절 위험 품목별 발주량/예상비용/우선순위
3. **ABC 분석 인사이트** - A등급 품목 집중관리 포인트, C등급 재고 축소 방안
4. **판매 트렌드 분석** - 수요 증가/감소 품목, 계절성, 성장 기회
5. **사장재고 처리방안** - 판매실적 없는 품목 처분/활용 제안
6. **안전재고 최적화** - 현재 vs 권장 안전재고 비교, 비용 절감 효과
7. **공급망 리스크** - 단일 공급사 의존 품목, 리드타임 개선 필요 사항
8. **1주/1개월 액션플랜** - 즉시 실행 과제와 중기 개선 과제

[작성 규칙]
- 숫자는 ₩ 단위, 천 단위 콤마 포함
- 이사님이 5분 안에 의사결정할 수 있도록 간결하게
- 각 항목은 구체적 수치와 품목명 포함`,
      "당신은 KPROS(화장품 원료 전문기업) SCM·재고관리 전문 컨설턴트 AI입니다. ABC분석, 안전재고, 수요예측, 공급망 최적화에 전문성을 갖고 경영진 보고 톤으로 분석합니다.",
      4096
    );
  } catch (e) {
    console.error("[Inventory] Smart analysis AI failed:", e);
    aiInsight = "AI 분석을 생성할 수 없습니다.";
  }

  return c.json({
    status: "success",
    data: {
      summary,
      analyses: analyses.map((a) => ({
        ...a,
        avg_daily_sales: a.avg_daily_sales,
        days_of_supply: a.days_of_supply === 999 ? null : a.days_of_supply,
      })),
      reorder_items: reorderItems.map((i) => ({
        name: i.name, code: i.code, supplier: i.supplier, unit: i.unit,
        current_stock: i.current_stock, safety_stock: i.safety_stock,
        reorder_point: i.reorder_point, days_of_supply: i.days_of_supply,
        recommended_order_qty: i.recommended_order_qty,
        estimated_cost: i.recommended_order_qty * i.unit_price,
        demand_trend: i.demand_trend, abc_class: i.abc_class,
      })),
      dead_stock_items: deadStockItems.map((i) => ({
        name: i.name, current_stock: i.current_stock, unit: i.unit,
        stock_value: i.stock_value, supplier: i.supplier,
      })),
      overstock_items: overstockItems.map((i) => ({
        name: i.name, current_stock: i.current_stock, unit: i.unit,
        days_of_supply: i.days_of_supply === 999 ? null : i.days_of_supply,
      })),
      top_sellers: topSellers.map((i) => ({
        name: i.name, abc_class: i.abc_class, total_revenue: i.total_revenue,
        total_sold: i.total_sold, unit: i.unit, avg_daily_sales: i.avg_daily_sales,
        demand_trend: i.demand_trend, customer_count: i.customer_count,
      })),
      by_category: byCategory,
      monthly_trend: Object.entries(monthlyTrend)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, d]) => ({ month, ...d })),
      ai_insight: aiInsight,
      analyzed_at: new Date().toISOString(),
    },
    message: "스마트 재고 분석 완료",
  });
});

// ═══════════════════════════════════════════════
// 판매현황 분석 + 안전재고 계획 (Gemini 2.5 Pro)
// ═══════════════════════════════════════════════

interface SalesRow {
  date: string;
  customer: string;
  productCode?: string;
  productName: string;
  quantity: number;
  unitPrice?: number;
  amount: number;
}

function findKprosMatch(
  salesProductName: string,
  kprosItems: { productNm: string; sumStockQty: number; warehouseNm: string }[]
): { productNm: string; sumStockQty: number; warehouseNm: string } | null {
  const normalized = salesProductName.trim().toLowerCase();
  // 1) 정확 일치
  let match = kprosItems.find(k => k.productNm.trim().toLowerCase() === normalized);
  if (match) return match;
  // 2) 포함 일치
  match = kprosItems.find(k =>
    k.productNm.toLowerCase().includes(normalized) ||
    normalized.includes(k.productNm.toLowerCase())
  );
  if (match) return match;
  // 3) 토큰 유사도 (70% 이상)
  const salesTokens = normalized.split(/[\s,./()%-]+/).filter(Boolean);
  let bestScore = 0;
  let bestMatch: typeof match = null;
  for (const k of kprosItems) {
    const kTokens = k.productNm.toLowerCase().split(/[\s,./()%-]+/).filter(Boolean);
    const overlap = salesTokens.filter(t => kTokens.some(kt => kt.includes(t) || t.includes(kt))).length;
    const score = overlap / Math.max(salesTokens.length, kTokens.length);
    if (score > 0.7 && score > bestScore) {
      bestScore = score;
      bestMatch = k;
    }
  }
  return bestMatch || null;
}

/**
 * POST /inventory/sales-analyze - 판매현황 분석 + 안전재고 계획
 * 판매 엑셀 데이터 + KPROS 실시간 재고 교차 분석 (Gemini 2.5 Pro)
 */
inventory.post("/sales-analyze", async (c) => {
  const body = await c.req.json<{
    salesData: SalesRow[];
    leadTimeDays?: number;
    serviceLevel?: number;
  }>();

  const { salesData, leadTimeDays = 14, serviceLevel = 95 } = body;

  if (!salesData || salesData.length === 0) {
    return c.json({ status: "error", message: "판매 데이터가 필요합니다" }, 400);
  }

  // Z-score 매핑 (서비스레벨 → Z)
  const zMap: Record<number, number> = { 90: 1.28, 95: 1.65, 97: 1.88, 99: 2.33 };
  const Z = zMap[serviceLevel] || 1.65;

  // ── 1. KPROS 재고 조회 (교차 참조용) ──
  let kprosItems: { productNm: string; sumStockQty: number; warehouseNm: string }[] = [];
  let kprosDataAvailable = false;
  try {
    if (isKprosConfigured(c.env)) {
      const kprosData = await getKprosStock(c.env);
      // 같은 품목 여러 창고 → 합산
      const stockMap = new Map<string, number>();
      for (const item of kprosData.items) {
        const name = item.productNm;
        stockMap.set(name, (stockMap.get(name) || 0) + item.sumStockQty);
      }
      kprosItems = Array.from(stockMap.entries()).map(([productNm, sumStockQty]) => ({
        productNm,
        sumStockQty,
        warehouseNm: kprosData.items.find(i => i.productNm === productNm)?.warehouseNm || '',
      }));
      kprosDataAvailable = true;
    }
  } catch (e) {
    console.error("[Sales Analyze] KPROS 재고 조회 실패:", e);
  }

  // ── 2. 판매 데이터 집계 ──
  const dates = salesData.map(r => r.date).filter(Boolean).sort();
  const periodFrom = dates[0] || '';
  const periodTo = dates[dates.length - 1] || '';
  const uniqueMonths = new Set(salesData.map(r => r.date?.substring(0, 7)).filter(Boolean));
  const monthCount = Math.max(uniqueMonths.size, 1);

  const totalSalesAmount = salesData.reduce((s, r) => s + (r.amount || 0), 0);
  const totalQuantity = salesData.reduce((s, r) => s + (r.quantity || 0), 0);
  const uniqueProducts = new Set(salesData.map(r => r.productName).filter(Boolean));
  const uniqueCustomers = new Set(salesData.map(r => r.customer).filter(Boolean));

  // ── 3. 월별 추이 ──
  const monthlyMap = new Map<string, { totalQty: number; totalAmount: number; products: Set<string> }>();
  for (const row of salesData) {
    const month = row.date?.substring(0, 7);
    if (!month) continue;
    const m = monthlyMap.get(month) || { totalQty: 0, totalAmount: 0, products: new Set<string>() };
    m.totalQty += row.quantity || 0;
    m.totalAmount += row.amount || 0;
    if (row.productName) m.products.add(row.productName);
    monthlyMap.set(month, m);
  }
  const monthlyTrend = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, d]) => ({ month, totalQty: d.totalQty, totalAmount: d.totalAmount, productCount: d.products.size }));

  // ── 4. 품목별 집계 ──
  const prodMap = new Map<string, {
    totalQty: number; totalAmount: number; customers: Set<string>;
    monthlyQtys: Map<string, number>;
  }>();
  for (const row of salesData) {
    const name = row.productName;
    if (!name) continue;
    const p = prodMap.get(name) || { totalQty: 0, totalAmount: 0, customers: new Set(), monthlyQtys: new Map() };
    p.totalQty += row.quantity || 0;
    p.totalAmount += row.amount || 0;
    if (row.customer) p.customers.add(row.customer);
    const month = row.date?.substring(0, 7) || '';
    if (month) p.monthlyQtys.set(month, (p.monthlyQtys.get(month) || 0) + (row.quantity || 0));
    prodMap.set(name, p);
  }

  const productRanking = Array.from(prodMap.entries())
    .map(([name, d]) => ({
      rank: 0,
      productName: name,
      totalQty: d.totalQty,
      totalAmount: d.totalAmount,
      customerCount: d.customers.size,
      avgMonthlyQty: Math.round(d.totalQty / monthCount),
      salesMonths: d.monthlyQtys.size,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);
  productRanking.forEach((p, i) => { p.rank = i + 1; });

  // ── 5. 재고 교차분석 + 안전재고 ──
  const inventoryCrossRef = productRanking.map(prod => {
    const kprosMatch = findKprosMatch(prod.productName, kprosItems);
    const currentStock = kprosMatch ? kprosMatch.sumStockQty : null;
    const avgMonthlySales = prod.avgMonthlyQty;

    // 월별 표준편차
    const monthlyData = prodMap.get(prod.productName)!.monthlyQtys;
    const monthlyVals = Array.from(monthlyData.values());
    const mean = monthlyVals.reduce((s, v) => s + v, 0) / Math.max(monthlyVals.length, 1);
    const variance = monthlyVals.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(monthlyVals.length, 1);
    const stdDev = Math.sqrt(variance);

    // 안전재고 = Z × σ × √(L/30)
    const safetyStock = Math.round(Z * stdDev * Math.sqrt(leadTimeDays / 30));
    // ROP = 월평균 × (L/30) + 안전재고
    const reorderPoint = Math.round(avgMonthlySales * (leadTimeDays / 30) + safetyStock);

    const monthsOfSupply = (currentStock !== null && avgMonthlySales > 0)
      ? Math.round((currentStock / avgMonthlySales) * 10) / 10
      : null;

    let status: 'urgent' | 'warning' | 'normal' | 'excess' | 'no_stock_data' = 'no_stock_data';
    if (monthsOfSupply !== null) {
      if (monthsOfSupply <= 1) status = 'urgent';
      else if (monthsOfSupply <= 2) status = 'warning';
      else if (monthsOfSupply >= 6) status = 'excess';
      else status = 'normal';
    }

    const recommendedOrder = (currentStock !== null && currentStock < reorderPoint)
      ? reorderPoint - currentStock + safetyStock
      : 0;

    return {
      productName: prod.productName,
      salesQty: prod.totalQty,
      avgMonthlySales,
      currentStock,
      monthsOfSupply,
      safetyStock,
      reorderPoint,
      status,
      recommendedOrder,
    };
  });

  const safetyStockSummary = {
    urgentCount: inventoryCrossRef.filter(i => i.status === 'urgent').length,
    warningCount: inventoryCrossRef.filter(i => i.status === 'warning').length,
    normalCount: inventoryCrossRef.filter(i => i.status === 'normal').length,
    excessCount: inventoryCrossRef.filter(i => i.status === 'excess').length,
    noDataCount: inventoryCrossRef.filter(i => i.status === 'no_stock_data').length,
    totalRecommendedOrderValue: inventoryCrossRef.reduce((s, i) => s + i.recommendedOrder, 0),
  };

  // ── 6. 거래처 분석 ──
  const custMap = new Map<string, { totalAmount: number; totalQty: number; products: Set<string>; orders: number }>();
  for (const row of salesData) {
    const cust = row.customer;
    if (!cust) continue;
    const c2 = custMap.get(cust) || { totalAmount: 0, totalQty: 0, products: new Set(), orders: 0 };
    c2.totalAmount += row.amount || 0;
    c2.totalQty += row.quantity || 0;
    if (row.productName) c2.products.add(row.productName);
    c2.orders++;
    custMap.set(cust, c2);
  }
  const customerAnalysis = Array.from(custMap.entries())
    .map(([customer, d]) => ({
      customer,
      totalAmount: d.totalAmount,
      totalQty: d.totalQty,
      productCount: d.products.size,
      orderCount: d.orders,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  // ── 7. AI 분석 (Gemini 2.5 Pro) ──
  const urgentItems = inventoryCrossRef.filter(i => i.status === 'urgent');
  const warningItems = inventoryCrossRef.filter(i => i.status === 'warning');
  const excessItems = inventoryCrossRef.filter(i => i.status === 'excess');
  const top10Products = productRanking.slice(0, 10);
  const top10Customers = customerAnalysis.slice(0, 10);

  const systemPrompt = `당신은 KPROS(화학/화장품 원료 전문 무역기업)의 재고관리 팀장입니다.
판매 데이터와 실시간 재고 데이터를 교차 분석하여 경영진에게 보고하는 전문가 보고서를 작성합니다.

[역할]
- 재고관리 팀장으로서 안전재고 유지, 발주 계획, 재고 최적화를 책임집니다
- 데이터에 기반한 정량적 분석을 우선합니다
- 경영진이 의사결정에 활용할 수 있는 구체적 제안을 제시합니다

[전문 분야]
- 화학/화장품 원료 특성을 반영한 재고관리 (유통기한, 보관조건, 최소발주량 고려)
- ABC 분석, 안전재고 산출, 발주점(ROP) 관리
- 수요 예측 및 계절성 분석
- 공급망 리스크 관리`;

  const monthlyTrendStr = monthlyTrend.map(m =>
    `  ${m.month}: 수량 ${m.totalQty.toLocaleString()}, 금액 ₩${m.totalAmount.toLocaleString()}, 품목 ${m.productCount}개`
  ).join('\n');

  const top10Str = top10Products.map(p =>
    `  ${p.rank}. ${p.productName} - 수량 ${p.totalQty.toLocaleString()}, 금액 ₩${p.totalAmount.toLocaleString()}, 월평균 ${p.avgMonthlyQty.toLocaleString()}, 거래처 ${p.customerCount}개`
  ).join('\n');

  const urgentStr = urgentItems.length > 0
    ? urgentItems.slice(0, 10).map(i => `  - ${i.productName}: 현재고 ${i.currentStock?.toLocaleString() ?? '?'}, 월평균판매 ${i.avgMonthlySales.toLocaleString()}, 재고월수 ${i.monthsOfSupply ?? '?'}개월`).join('\n')
    : '  없음';

  const excessStr = excessItems.length > 0
    ? excessItems.slice(0, 10).map(i => `  - ${i.productName}: 현재고 ${i.currentStock?.toLocaleString() ?? '?'}, 월평균판매 ${i.avgMonthlySales.toLocaleString()}, 재고월수 ${i.monthsOfSupply ?? '?'}개월`).join('\n')
    : '  없음';

  const custStr = top10Customers.map(c2 =>
    `  - ${c2.customer}: 금액 ₩${c2.totalAmount.toLocaleString()}, 수량 ${c2.totalQty.toLocaleString()}, 품목 ${c2.productCount}개`
  ).join('\n');

  const aiPrompt = `다음은 KPROS의 판매현황 데이터와 KPROS ERP 실시간 재고를 교차 분석한 결과입니다.

■ 분석 기간: ${periodFrom} ~ ${periodTo} (${monthCount}개월)

■ 판매 개요
- 총 매출: ₩${totalSalesAmount.toLocaleString()}
- 총 판매수량: ${totalQuantity.toLocaleString()}
- 판매 품목: ${uniqueProducts.size}개
- 거래처: ${uniqueCustomers.size}개

■ 월별 판매 추이
${monthlyTrendStr}

■ TOP 10 판매 품목
${top10Str}

■ 재고 교차분석 결과 (KPROS 재고 ${kprosDataAvailable ? '연동 성공' : '미연동'})
- 긴급 발주 필요 (재고 1개월 미만): ${safetyStockSummary.urgentCount}건
${urgentStr}
- 발주 검토 (재고 1~2개월): ${safetyStockSummary.warningCount}건
- 양호: ${safetyStockSummary.normalCount}건
- 과잉 재고 (6개월 이상): ${safetyStockSummary.excessCount}건
${excessStr}
- KPROS 재고 미확인: ${safetyStockSummary.noDataCount}건

■ TOP 10 거래처
${custStr}

[보고서 작성 요청]
재고관리 팀장의 관점에서 다음 섹션별로 보고서를 작성하세요:

1. **경영진 요약** - 3~5문장으로 핵심 인사이트와 즉시 조치 사항
2. **판매 패턴 분석** - 월별 추이 패턴, TOP 품목 집중도, 거래처 의존도
3. **재고 위험 평가** - 긴급 발주 품목 상세, 과잉재고 처리 방안
4. **안전재고 계획** - 품목별 권장 안전재고 근거, 발주점(ROP) 기준, 월별 발주 스케줄
5. **전략적 제안** - 재고 효율화 3가지 과제, 거래처 관리 방안, 1~3개월 액션플랜

[작성 규칙]
- 금액은 ₩ 표기, 천 단위 콤마 포함
- 마크다운 형식 (##, **, -, 표)
- 데이터 기반 정량적 분석 우선
- 구체적 품목명과 수치 포함`;

  let aiReport = '';
  try {
    aiReport = await askAIAnalyzePro(c.env, aiPrompt, systemPrompt, 8192);
  } catch (e: any) {
    aiReport = `AI 분석 생성 실패: ${e.message}`;
  }

  return c.json({
    status: "success",
    data: {
      overview: {
        totalSalesAmount,
        totalQuantity,
        productCount: uniqueProducts.size,
        customerCount: uniqueCustomers.size,
        period: { from: periodFrom, to: periodTo, months: monthCount },
      },
      monthlyTrend,
      productRanking: productRanking.slice(0, 20),
      inventoryCrossRef,
      safetyStockSummary,
      customerAnalysis: customerAnalysis.slice(0, 20),
      aiReport,
      kprosDataAvailable,
      analyzedAt: new Date().toISOString(),
    },
  });
});

// ═══════════════════════════════════════════════
// 스마트 분석 보고서 저장/조회/삭제
// ═══════════════════════════════════════════════

/**
 * POST /inventory/reports - 스마트 분석 보고서 저장
 */
inventory.post("/reports", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ report: any; report_name?: string }>();

  if (!body.report) {
    return c.json({ status: "error", message: "보고서 데이터가 필요합니다" }, 400);
  }

  const db = drizzle(c.env.DB);
  const reportDate = new Date().toISOString().split("T")[0];
  const reportName = body.report_name || `스마트재고분석_${reportDate}`;

  const [saved] = await db.insert(dailyReports).values({
    reportDate,
    reportType: "smart_inventory",
    fileName: reportName,
    generatedBy: user.userId,
    emailCount: body.report.summary?.total_items || 0,
    inventoryTransactionCount: body.report.reorder_items?.length || 0,
    summaryText: JSON.stringify(body.report),
  }).returning();

  return c.json({
    status: "success",
    data: {
      id: saved.id,
      report_name: reportName,
      report_date: reportDate,
      storage: {
        database: "c-auto-db (D1)",
        table: "daily_reports",
        report_type: "smart_inventory",
        record_id: saved.id,
        api_path: "POST /api/v1/inventory/reports",
      },
    },
    message: "보고서가 저장되었습니다",
  }, 201);
});

/**
 * GET /inventory/reports - 저장된 보고서 목록
 */
inventory.get("/reports", async (c) => {
  const db = drizzle(c.env.DB);

  const reports = await db
    .select({
      id: dailyReports.id,
      reportDate: dailyReports.reportDate,
      fileName: dailyReports.fileName,
      generatedBy: dailyReports.generatedBy,
      itemCount: dailyReports.emailCount,
      reorderCount: dailyReports.inventoryTransactionCount,
      createdAt: dailyReports.createdAt,
    })
    .from(dailyReports)
    .where(eq(dailyReports.reportType, "smart_inventory"))
    .orderBy(desc(dailyReports.createdAt))
    .limit(50);

  return c.json({ status: "success", data: reports });
});

/**
 * GET /inventory/reports/:id - 보고서 상세 조회
 */
inventory.get("/reports/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  if (isNaN(id)) return c.json({ status: "error", message: "잘못된 ID" }, 400);

  const db = drizzle(c.env.DB);
  const [report] = await db
    .select()
    .from(dailyReports)
    .where(eq(dailyReports.id, id))
    .limit(1);

  if (!report || report.reportType !== "smart_inventory") {
    return c.json({ status: "error", message: "보고서를 찾을 수 없습니다" }, 404);
  }

  let reportData = null;
  try { reportData = JSON.parse(report.summaryText || "{}"); } catch {}

  return c.json({
    status: "success",
    data: {
      id: report.id,
      report_name: report.fileName,
      report_date: report.reportDate,
      report: reportData,
      created_at: report.createdAt,
    },
  });
});

/**
 * DELETE /inventory/reports/:id - 보고서 삭제
 */
inventory.delete("/reports/:id", async (c) => {
  const user = c.get("user");
  const id = parseInt(c.req.param("id"));
  if (isNaN(id)) return c.json({ status: "error", message: "잘못된 ID" }, 400);

  const db = drizzle(c.env.DB);
  const [report] = await db
    .select({ id: dailyReports.id, generatedBy: dailyReports.generatedBy })
    .from(dailyReports)
    .where(eq(dailyReports.id, id))
    .limit(1);

  if (!report) {
    return c.json({ status: "error", message: "보고서를 찾을 수 없습니다" }, 404);
  }

  // 본인 또는 관리자만 삭제 가능
  if (report.generatedBy !== user.userId && user.role !== "admin") {
    return c.json({ status: "error", message: "삭제 권한이 없습니다" }, 403);
  }

  await db.delete(dailyReports).where(eq(dailyReports.id, id));
  return c.json({ status: "success", message: "보고서가 삭제되었습니다" });
});

export default inventory;
