/**
 * Order Workflows - /api/v1/workflows
 * 판매/구매 입력 후 창고 출고/입고 완료까지 상태 추적
 */
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, desc, and, like, sql } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth';
import { orderWorkflows } from '../db/schema';
import type { Env } from '../types';

const workflows = new Hono<{ Bindings: Env }>();

workflows.use('*', authMiddleware);

// 판매 워크플로우 상태 순서
const SALES_STEPS = ['ERP_SUBMITTED', 'SHIPPING_ORDER', 'PICKING', 'SHIPPED', 'DELIVERED'] as const;
const SALES_LABELS: Record<string, string> = {
  ERP_SUBMITTED: '판매입력완료',
  SHIPPING_ORDER: '출고지시',
  PICKING: '피킹/포장',
  SHIPPED: '출고완료',
  DELIVERED: '납품완료',
};

// 구매 워크플로우 상태 순서
const PURCHASE_STEPS = ['ERP_SUBMITTED', 'RECEIVING_SCHEDULED', 'INSPECTING', 'RECEIVED', 'STOCKED'] as const;
const PURCHASE_LABELS: Record<string, string> = {
  ERP_SUBMITTED: '구매입력완료',
  RECEIVING_SCHEDULED: '입고예정',
  INSPECTING: '입고검수',
  RECEIVED: '입고완료',
  STOCKED: '재고반영',
};

function getSteps(type: string) {
  return type === 'SALES' ? SALES_STEPS : PURCHASE_STEPS;
}

function getLabels(type: string) {
  return type === 'SALES' ? SALES_LABELS : PURCHASE_LABELS;
}

/**
 * GET /workflows - 워크플로우 목록
 */
workflows.get('/', async (c) => {
  const db = drizzle(c.env.DB);
  const type = c.req.query('type');
  const status = c.req.query('status');
  const search = c.req.query('search');
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
  const page = Math.max(parseInt(c.req.query('page') || '1'), 1);
  const offset = (page - 1) * limit;

  const conditions = [];
  if (type) conditions.push(eq(orderWorkflows.workflowType, type));
  if (status) conditions.push(eq(orderWorkflows.status, status));
  if (search) conditions.push(like(orderWorkflows.custName, `%${search}%`));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countResult] = await Promise.all([
    db.select()
      .from(orderWorkflows)
      .where(where)
      .orderBy(desc(orderWorkflows.id))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` })
      .from(orderWorkflows)
      .where(where),
  ]);

  const total = countResult[0]?.count || 0;

  const data = rows.map((r) => ({
    ...r,
    items: JSON.parse(r.itemsData || '[]'),
    steps: getSteps(r.workflowType).map((s) => s),
    labels: getLabels(r.workflowType),
  }));

  return c.json({
    status: 'success',
    data,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    meta: { salesLabels: SALES_LABELS, purchaseLabels: PURCHASE_LABELS },
  });
});

/**
 * GET /workflows/summary - 대시보드 요약
 */
workflows.get('/summary', async (c) => {
  const db = drizzle(c.env.DB);

  const rows = await db.select({
    workflowType: orderWorkflows.workflowType,
    status: orderWorkflows.status,
    count: sql<number>`count(*)`,
  })
    .from(orderWorkflows)
    .groupBy(orderWorkflows.workflowType, orderWorkflows.status);

  const summary = {
    sales: { total: 0, active: 0, completed: 0, byStatus: {} as Record<string, number> },
    purchase: { total: 0, active: 0, completed: 0, byStatus: {} as Record<string, number> },
  };

  for (const r of rows) {
    const key = r.workflowType === 'SALES' ? 'sales' : 'purchase';
    summary[key].total += r.count;
    summary[key].byStatus[r.status] = r.count;
    if (r.status === 'DELIVERED' || r.status === 'STOCKED') {
      summary[key].completed += r.count;
    } else {
      summary[key].active += r.count;
    }
  }

  return c.json({ status: 'success', data: summary });
});

/**
 * GET /workflows/:id - 워크플로우 상세
 */
workflows.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ status: 'error', message: '잘못된 ID' }, 400);

  const db = drizzle(c.env.DB);
  const [row] = await db.select().from(orderWorkflows).where(eq(orderWorkflows.id, id)).limit(1);
  if (!row) return c.json({ status: 'error', message: '워크플로우를 찾을 수 없습니다' }, 404);

  return c.json({
    status: 'success',
    data: {
      ...row,
      items: JSON.parse(row.itemsData || '[]'),
      steps: getSteps(row.workflowType).map((s) => s),
      labels: getLabels(row.workflowType),
    },
  });
});

/**
 * PATCH /workflows/:id/status - 상태 변경 (다음 단계로 진행)
 */
workflows.patch('/:id/status', async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ status: 'error', message: '잘못된 ID' }, 400);

  const db = drizzle(c.env.DB);
  const [row] = await db.select().from(orderWorkflows).where(eq(orderWorkflows.id, id)).limit(1);
  if (!row) return c.json({ status: 'error', message: '워크플로우를 찾을 수 없습니다' }, 404);

  const body = await c.req.json<{ action?: string; note?: string }>().catch(() => ({}));
  const steps = getSteps(row.workflowType);
  const currentIdx = steps.indexOf(row.status as any);

  // action: 'next' (다음 단계) 또는 'prev' (이전 단계)
  const action = body.action || 'next';
  let newIdx = currentIdx;
  if (action === 'next' && currentIdx < steps.length - 1) {
    newIdx = currentIdx + 1;
  } else if (action === 'prev' && currentIdx > 0) {
    newIdx = currentIdx - 1;
  } else if (action === 'next' && currentIdx >= steps.length - 1) {
    return c.json({ status: 'error', message: '이미 최종 단계입니다' }, 400);
  }

  const newStatus = steps[newIdx];
  const now = new Date().toISOString();

  // 단계별 timestamp 업데이트
  const stepField = `step${newIdx + 1}At` as keyof typeof row;
  const update: Record<string, any> = {
    status: newStatus,
    updatedAt: now,
  };
  if (body.note) update.note = body.note;

  // step2~5 timestamp
  if (newIdx === 1) update.step2At = now;
  else if (newIdx === 2) update.step3At = now;
  else if (newIdx === 3) update.step4At = now;
  else if (newIdx === 4) update.step5At = now;

  await db.update(orderWorkflows).set(update).where(eq(orderWorkflows.id, id));

  const labels = getLabels(row.workflowType);
  return c.json({
    status: 'success',
    message: `${labels[newStatus]}(으)로 변경되었습니다`,
    data: { id, status: newStatus, label: labels[newStatus] },
  });
});

/**
 * DELETE /workflows/:id - 워크플로우 삭제
 */
workflows.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ status: 'error', message: '잘못된 ID' }, 400);

  const db = drizzle(c.env.DB);
  const [row] = await db.select({ id: orderWorkflows.id }).from(orderWorkflows).where(eq(orderWorkflows.id, id)).limit(1);
  if (!row) return c.json({ status: 'error', message: '워크플로우를 찾을 수 없습니다' }, 404);

  await db.delete(orderWorkflows).where(eq(orderWorkflows.id, id));
  return c.json({ status: 'success', message: '삭제 완료' });
});

export default workflows;
