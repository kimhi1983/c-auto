/**
 * Inventory Management Routes - /api/v1/inventory
 */
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, desc, like, count } from "drizzle-orm";
import { inventoryItems, inventoryTransactions } from "../db/schema";
import { authMiddleware } from "../middleware/auth";
import type { Env } from "../types";

const inventory = new Hono<{ Bindings: Env }>();

inventory.use("*", authMiddleware);

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

export default inventory;
