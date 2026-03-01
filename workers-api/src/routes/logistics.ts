/**
 * KPROS 물류관리 라우트
 * 매입, 납품, 입고, 출고, 창고입고, 창고출고, 성적서(CoA)
 */
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, desc, like, or, and, count, sql } from 'drizzle-orm';
import {
  kprosPurchases, kprosDeliveries, kprosInbound, kprosOutbound,
  kprosWarehouseIn, kprosWarehouseOut, kprosCoa,
} from '../db/schema';
import { authMiddleware } from '../middleware/auth';
import {
  getKprosPurchases, getKprosDeliveries, getKprosInbound, getKprosOutbound,
  getKprosWarehouseIn, getKprosWarehouseOut, getKprosCoa,
} from '../services/kpros';
import type { Env, UserContext } from '../types';

const logistics = new Hono<{ Bindings: Env; Variables: { user: UserContext } }>();

logistics.use('*', authMiddleware);

// ═══════════════════════════════════════════
// 대시보드 — 7개 모듈 요약 집계
// ═══════════════════════════════════════════

logistics.get('/dashboard', async (c) => {
  const db = drizzle(c.env.DB);

  const [
    [{ purchaseCount }],
    [{ deliveryCount }],
    [{ inboundCount }],
    [{ outboundCount }],
    [{ warehouseInCount }],
    [{ warehouseOutCount }],
    [{ coaCount }],
    recentPurchases,
    recentDeliveries,
    expiringCoa,
  ] = await Promise.all([
    db.select({ purchaseCount: count() }).from(kprosPurchases),
    db.select({ deliveryCount: count() }).from(kprosDeliveries),
    db.select({ inboundCount: count() }).from(kprosInbound),
    db.select({ outboundCount: count() }).from(kprosOutbound),
    db.select({ warehouseInCount: count() }).from(kprosWarehouseIn),
    db.select({ warehouseOutCount: count() }).from(kprosWarehouseOut),
    db.select({ coaCount: count() }).from(kprosCoa),
    db.select().from(kprosPurchases).orderBy(desc(kprosPurchases.purchaseDate)).limit(5),
    db.select().from(kprosDeliveries).orderBy(desc(kprosDeliveries.dueDate)).limit(5),
    db.select().from(kprosCoa)
      .where(and(
        sql`${kprosCoa.validDate} IS NOT NULL`,
        sql`${kprosCoa.validDate} >= date('now')`,
        sql`${kprosCoa.validDate} <= date('now', '+90 days')`,
      ))
      .orderBy(kprosCoa.validDate)
      .limit(10),
  ]);

  return c.json({
    status: 'success',
    data: {
      summary: {
        purchases: purchaseCount,
        deliveries: deliveryCount,
        inbound: inboundCount,
        outbound: outboundCount,
        warehouseIn: warehouseInCount,
        warehouseOut: warehouseOutCount,
        coa: coaCount,
      },
      recentPurchases,
      recentDeliveries,
      expiringCoa,
    },
  });
});

// ═══════════════════════════════════════════
// 매입등록 목록
// ═══════════════════════════════════════════

logistics.get('/purchases', async (c) => {
  const db = drizzle(c.env.DB);
  const search = c.req.query('search');
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '50');

  const conditions: any[] = [];
  if (search) {
    conditions.push(
      or(
        like(kprosPurchases.productNm, `%${search}%`),
        like(kprosPurchases.companyNm, `%${search}%`),
        like(kprosPurchases.lotNo, `%${search}%`),
        like(kprosPurchases.warehouseNm, `%${search}%`),
      )
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, [{ total }]] = await Promise.all([
    db.select().from(kprosPurchases)
      .where(where)
      .orderBy(desc(kprosPurchases.purchaseDate))
      .limit(limit)
      .offset((page - 1) * limit),
    db.select({ total: count() }).from(kprosPurchases).where(where),
  ]);

  return c.json({ status: 'success', data: items, total, page, totalPages: Math.ceil(total / limit) });
});

// ═══════════════════════════════════════════
// 납품등록 목록
// ═══════════════════════════════════════════

logistics.get('/deliveries', async (c) => {
  const db = drizzle(c.env.DB);
  const search = c.req.query('search');
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '50');

  const conditions: any[] = [];
  if (search) {
    conditions.push(
      or(
        like(kprosDeliveries.productNm, `%${search}%`),
        like(kprosDeliveries.companyToNm, `%${search}%`),
        like(kprosDeliveries.lotNo, `%${search}%`),
        like(kprosDeliveries.warehouseNm, `%${search}%`),
      )
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, [{ total }]] = await Promise.all([
    db.select().from(kprosDeliveries)
      .where(where)
      .orderBy(desc(kprosDeliveries.dueDate))
      .limit(limit)
      .offset((page - 1) * limit),
    db.select({ total: count() }).from(kprosDeliveries).where(where),
  ]);

  return c.json({ status: 'success', data: items, total, page, totalPages: Math.ceil(total / limit) });
});

// ═══════════════════════════════════════════
// 입고반영 목록
// ═══════════════════════════════════════════

logistics.get('/inbound', async (c) => {
  const db = drizzle(c.env.DB);
  const search = c.req.query('search');
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '50');

  const conditions: any[] = [];
  if (search) {
    conditions.push(
      or(
        like(kprosInbound.productNm, `%${search}%`),
        like(kprosInbound.companyNm, `%${search}%`),
        like(kprosInbound.lotNo, `%${search}%`),
      )
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, [{ total }]] = await Promise.all([
    db.select().from(kprosInbound)
      .where(where)
      .orderBy(desc(kprosInbound.realWearingDate))
      .limit(limit)
      .offset((page - 1) * limit),
    db.select({ total: count() }).from(kprosInbound).where(where),
  ]);

  return c.json({ status: 'success', data: items, total, page, totalPages: Math.ceil(total / limit) });
});

// ═══════════════════════════════════════════
// 출고반영 목록
// ═══════════════════════════════════════════

logistics.get('/outbound', async (c) => {
  const db = drizzle(c.env.DB);
  const search = c.req.query('search');
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '50');

  const conditions: any[] = [];
  if (search) {
    conditions.push(
      or(
        like(kprosOutbound.productNm, `%${search}%`),
        like(kprosOutbound.companyToNm, `%${search}%`),
        like(kprosOutbound.lotNo, `%${search}%`),
      )
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, [{ total }]] = await Promise.all([
    db.select().from(kprosOutbound)
      .where(where)
      .orderBy(desc(kprosOutbound.dueDate))
      .limit(limit)
      .offset((page - 1) * limit),
    db.select({ total: count() }).from(kprosOutbound).where(where),
  ]);

  return c.json({ status: 'success', data: items, total, page, totalPages: Math.ceil(total / limit) });
});

// ═══════════════════════════════════════════
// 창고입고 목록
// ═══════════════════════════════════════════

logistics.get('/warehouse/in', async (c) => {
  const db = drizzle(c.env.DB);
  const search = c.req.query('search');
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '50');

  const conditions: any[] = [];
  if (search) {
    conditions.push(
      or(
        like(kprosWarehouseIn.productNm, `%${search}%`),
        like(kprosWarehouseIn.companyNm, `%${search}%`),
        like(kprosWarehouseIn.lotNo, `%${search}%`),
        like(kprosWarehouseIn.warehouseNm, `%${search}%`),
      )
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, [{ total }]] = await Promise.all([
    db.select().from(kprosWarehouseIn)
      .where(where)
      .orderBy(desc(kprosWarehouseIn.realWearingDate))
      .limit(limit)
      .offset((page - 1) * limit),
    db.select({ total: count() }).from(kprosWarehouseIn).where(where),
  ]);

  return c.json({ status: 'success', data: items, total, page, totalPages: Math.ceil(total / limit) });
});

// ═══════════════════════════════════════════
// 창고출고 목록
// ═══════════════════════════════════════════

logistics.get('/warehouse/out', async (c) => {
  const db = drizzle(c.env.DB);
  const search = c.req.query('search');
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '50');

  const conditions: any[] = [];
  if (search) {
    conditions.push(
      or(
        like(kprosWarehouseOut.productNm, `%${search}%`),
        like(kprosWarehouseOut.companyToNm, `%${search}%`),
        like(kprosWarehouseOut.lotNo, `%${search}%`),
        like(kprosWarehouseOut.warehouseNm, `%${search}%`),
      )
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, [{ total }]] = await Promise.all([
    db.select().from(kprosWarehouseOut)
      .where(where)
      .orderBy(desc(kprosWarehouseOut.dueDate))
      .limit(limit)
      .offset((page - 1) * limit),
    db.select({ total: count() }).from(kprosWarehouseOut).where(where),
  ]);

  return c.json({ status: 'success', data: items, total, page, totalPages: Math.ceil(total / limit) });
});

// ═══════════════════════════════════════════
// 성적서 CoA 목록
// ═══════════════════════════════════════════

logistics.get('/coa', async (c) => {
  const db = drizzle(c.env.DB);
  const search = c.req.query('search');
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '50');
  const expiring = c.req.query('expiring');

  const conditions: any[] = [];
  if (search) {
    conditions.push(
      or(
        like(kprosCoa.productNm, `%${search}%`),
        like(kprosCoa.companyNm, `%${search}%`),
        like(kprosCoa.lotNo, `%${search}%`),
        like(kprosCoa.braNm, `%${search}%`),
      )
    );
  }
  if (expiring === 'true') {
    conditions.push(
      and(
        sql`${kprosCoa.validDate} IS NOT NULL`,
        sql`${kprosCoa.validDate} >= date('now')`,
        sql`${kprosCoa.validDate} <= date('now', '+90 days')`,
      )
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, [{ total }]] = await Promise.all([
    db.select().from(kprosCoa)
      .where(where)
      .orderBy(desc(kprosCoa.validDate))
      .limit(limit)
      .offset((page - 1) * limit),
    db.select({ total: count() }).from(kprosCoa).where(where),
  ]);

  return c.json({ status: 'success', data: items, total, page, totalPages: Math.ceil(total / limit) });
});

// ═══════════════════════════════════════════
// 전체 동기화 (KPROS → D1)
// ═══════════════════════════════════════════

logistics.post('/sync', async (c) => {
  // 아카이브 완료 후 실시간 동기화 비활성화
  return c.json({
    status: 'error',
    message: 'KPROS 실시간 동기화가 비활성화되었습니다. 아카이브 데이터를 사용하세요. (POST /archive로 최종 동기화 가능)',
    archived: true,
  }, 403);
});

// 개별 모듈 동기화 (비활성화)
logistics.post('/sync/:module', async (c) => {
  return c.json({
    status: 'error',
    message: 'KPROS 실시간 동기화가 비활성화되었습니다. D1 아카이브 데이터를 사용하세요.',
    archived: true,
  }, 403);
});

// ═══════════════════════════════════════════
// 동기화 함수들 (KPROS → D1 upsert)
// ═══════════════════════════════════════════

async function syncPurchases(env: Env) {
  const db = drizzle(env.DB);
  const data = await getKprosPurchases(env, true);
  let synced = 0;

  for (const item of data.items) {
    await db.insert(kprosPurchases).values({
      kprosIdx: item.idx,
      productNm: item.productNm,
      braNm: item.braNm,
      companyNm: item.companyNm,
      cost: item.cost,
      incomeCost: item.incomeCost,
      incomeCostUnitNm: item.incomeCostUnitNm,
      lotNo: item.lotNo,
      purchaseDate: item.purchaseDate,
      purchaseStatus: item.purchaseStatus,
      warehouseNm: item.warehouseNm,
      totalPurchaseQty: item.totalPurchaseQty,
      pkgUnitNm: item.pkgUnitNm,
      manuDate: item.manuDate,
      validDate: item.validDate,
      expectWearingDate: item.expectWearingDate,
      realWearingDate: item.realWearingDate,
      prchNo: item.prchNo,
      syncedAt: new Date().toISOString(),
    }).onConflictDoUpdate({
      target: kprosPurchases.kprosIdx,
      set: {
        productNm: item.productNm,
        braNm: item.braNm,
        companyNm: item.companyNm,
        cost: item.cost,
        incomeCost: item.incomeCost,
        incomeCostUnitNm: item.incomeCostUnitNm,
        lotNo: item.lotNo,
        purchaseDate: item.purchaseDate,
        purchaseStatus: item.purchaseStatus,
        warehouseNm: item.warehouseNm,
        totalPurchaseQty: item.totalPurchaseQty,
        pkgUnitNm: item.pkgUnitNm,
        manuDate: item.manuDate,
        validDate: item.validDate,
        expectWearingDate: item.expectWearingDate,
        realWearingDate: item.realWearingDate,
        prchNo: item.prchNo,
        syncedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
    synced++;
  }

  return { total: data.totalCount, synced };
}

async function syncDeliveries(env: Env) {
  const db = drizzle(env.DB);
  const data = await getKprosDeliveries(env, true);
  let synced = 0;

  for (const item of data.items) {
    await db.insert(kprosDeliveries).values({
      kprosIdx: item.idx,
      companyFromNm: item.companyFromNm,
      companyToNm: item.companyToNm,
      productNm: item.productNm,
      dueDate: item.dueDate,
      deliveryStatus: item.deliveryStatus,
      deliveryStatusStr: item.deliveryStatusStr,
      deliveryBigo: item.deliveryBigo,
      warehouseNm: item.warehouseNm,
      expectQty: item.expectQty,
      realQty: item.realQty,
      lotNo: item.lotNo,
      dvrNo: item.dvrNo,
      orderDate: item.orderDate,
      orderMethod: item.orderMethod,
      pkgUnitNm: item.pkgUnitNm,
      syncedAt: new Date().toISOString(),
    }).onConflictDoUpdate({
      target: kprosDeliveries.kprosIdx,
      set: {
        companyFromNm: item.companyFromNm,
        companyToNm: item.companyToNm,
        productNm: item.productNm,
        dueDate: item.dueDate,
        deliveryStatus: item.deliveryStatus,
        deliveryStatusStr: item.deliveryStatusStr,
        deliveryBigo: item.deliveryBigo,
        warehouseNm: item.warehouseNm,
        expectQty: item.expectQty,
        realQty: item.realQty,
        lotNo: item.lotNo,
        dvrNo: item.dvrNo,
        orderDate: item.orderDate,
        orderMethod: item.orderMethod,
        pkgUnitNm: item.pkgUnitNm,
        syncedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
    synced++;
  }

  return { total: data.totalCount, synced };
}

async function syncInbound(env: Env) {
  const db = drizzle(env.DB);
  const data = await getKprosInbound(env, true);
  let synced = 0;

  for (const item of data.items) {
    await db.insert(kprosInbound).values({
      kprosIdx: item.idx,
      purchaseIdx: item.purchaseIdx,
      productNm: item.productNm,
      braNm: item.braNm,
      companyNm: item.companyNm,
      warehouseNm: item.warehouseNm,
      totalPurchaseQty: item.totalPurchaseQty,
      lotNo: item.lotNo,
      purchaseDate: item.purchaseDate,
      purchaseStatus: item.purchaseStatus,
      expectWearingDate: item.expectWearingDate,
      realWearingDate: item.realWearingDate,
      syncedAt: new Date().toISOString(),
    }).onConflictDoUpdate({
      target: kprosInbound.kprosIdx,
      set: {
        purchaseIdx: item.purchaseIdx,
        productNm: item.productNm,
        braNm: item.braNm,
        companyNm: item.companyNm,
        warehouseNm: item.warehouseNm,
        totalPurchaseQty: item.totalPurchaseQty,
        lotNo: item.lotNo,
        purchaseDate: item.purchaseDate,
        purchaseStatus: item.purchaseStatus,
        expectWearingDate: item.expectWearingDate,
        realWearingDate: item.realWearingDate,
        syncedAt: new Date().toISOString(),
      },
    });
    synced++;
  }

  return { total: data.totalCount, synced };
}

async function syncOutbound(env: Env) {
  const db = drizzle(env.DB);
  const data = await getKprosOutbound(env, true);
  let synced = 0;

  for (const item of data.items) {
    await db.insert(kprosOutbound).values({
      kprosIdx: item.idx,
      deliveryIdx: item.deliveryIdx,
      companyToNm: item.companyToNm,
      productNm: item.productNm,
      warehouseNm: item.warehouseNm,
      expectQty: item.expectQty,
      realQty: item.realQty,
      lotNo: item.lotNo,
      dueDate: item.dueDate,
      deliveryStatus: item.deliveryStatus,
      syncedAt: new Date().toISOString(),
    }).onConflictDoUpdate({
      target: kprosOutbound.kprosIdx,
      set: {
        deliveryIdx: item.deliveryIdx,
        companyToNm: item.companyToNm,
        productNm: item.productNm,
        warehouseNm: item.warehouseNm,
        expectQty: item.expectQty,
        realQty: item.realQty,
        lotNo: item.lotNo,
        dueDate: item.dueDate,
        deliveryStatus: item.deliveryStatus,
        syncedAt: new Date().toISOString(),
      },
    });
    synced++;
  }

  return { total: data.totalCount, synced };
}

async function syncWarehouseIn(env: Env) {
  const db = drizzle(env.DB);
  const data = await getKprosWarehouseIn(env, true);
  let synced = 0;

  for (const item of data.items) {
    await db.insert(kprosWarehouseIn).values({
      kprosIdx: item.idx,
      productNm: item.productNm,
      braNm: item.braNm,
      warehouseNm: item.warehouseNm,
      companyNm: item.companyNm,
      totalPurchaseQty: item.totalPurchaseQty,
      lotNo: item.lotNo,
      purchaseDate: item.purchaseDate,
      realWearingDate: item.realWearingDate,
      purchaseStatus: item.purchaseStatus,
      syncedAt: new Date().toISOString(),
    }).onConflictDoUpdate({
      target: kprosWarehouseIn.kprosIdx,
      set: {
        productNm: item.productNm,
        braNm: item.braNm,
        warehouseNm: item.warehouseNm,
        companyNm: item.companyNm,
        totalPurchaseQty: item.totalPurchaseQty,
        lotNo: item.lotNo,
        purchaseDate: item.purchaseDate,
        realWearingDate: item.realWearingDate,
        purchaseStatus: item.purchaseStatus,
        syncedAt: new Date().toISOString(),
      },
    });
    synced++;
  }

  return { total: data.totalCount, synced };
}

async function syncWarehouseOut(env: Env) {
  const db = drizzle(env.DB);
  const data = await getKprosWarehouseOut(env, true);
  let synced = 0;

  for (const item of data.items) {
    await db.insert(kprosWarehouseOut).values({
      kprosIdx: item.idx,
      companyToNm: item.companyToNm,
      productNm: item.productNm,
      warehouseNm: item.warehouseNm,
      expectQty: item.expectQty,
      realQty: item.realQty,
      lotNo: item.lotNo,
      dueDate: item.dueDate,
      deliveryStatus: item.deliveryStatus,
      dvrNo: item.dvrNo,
      syncedAt: new Date().toISOString(),
    }).onConflictDoUpdate({
      target: kprosWarehouseOut.kprosIdx,
      set: {
        companyToNm: item.companyToNm,
        productNm: item.productNm,
        warehouseNm: item.warehouseNm,
        expectQty: item.expectQty,
        realQty: item.realQty,
        lotNo: item.lotNo,
        dueDate: item.dueDate,
        deliveryStatus: item.deliveryStatus,
        dvrNo: item.dvrNo,
        syncedAt: new Date().toISOString(),
      },
    });
    synced++;
  }

  return { total: data.totalCount, synced };
}

async function syncCoa(env: Env) {
  const db = drizzle(env.DB);
  const data = await getKprosCoa(env, true);
  let synced = 0;

  for (const item of data.items) {
    // CoA는 kpros_idx 대신 productIdx+lotNo 조합으로 upsert
    const existing = await db.select({ id: kprosCoa.id }).from(kprosCoa)
      .where(and(
        eq(kprosCoa.productIdx, item.productIdx),
        eq(kprosCoa.lotNo, item.lotNo || ''),
      ))
      .limit(1);

    if (existing.length > 0) {
      await db.update(kprosCoa).set({
        productNm: item.productNm,
        warehouseNm: item.warehouseNm,
        companyNm: item.companyNm,
        manuDate: item.manuDate,
        validDate: item.validDate,
        braNm: item.braNm,
        reportsExist: item.reportsExist,
        pkgAmount: item.pkgAmount,
        pkgUnitNm: item.pkgUnitNm,
        totalAmount: item.totalAmount,
        syncedAt: new Date().toISOString(),
      }).where(eq(kprosCoa.id, existing[0].id));
    } else {
      await db.insert(kprosCoa).values({
        productIdx: item.productIdx,
        productNm: item.productNm,
        warehouseNm: item.warehouseNm,
        lotNo: item.lotNo,
        companyNm: item.companyNm,
        manuDate: item.manuDate,
        validDate: item.validDate,
        braNm: item.braNm,
        reportsExist: item.reportsExist,
        pkgAmount: item.pkgAmount,
        pkgUnitNm: item.pkgUnitNm,
        totalAmount: item.totalAmount,
        syncedAt: new Date().toISOString(),
      });
    }
    synced++;
  }

  return { total: data.totalCount, synced };
}

export default logistics;
