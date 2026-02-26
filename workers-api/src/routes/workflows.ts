/**
 * Order Workflows - /api/v1/workflows
 * 수동입력 → 승인 → ERP전송 → 창고 출고/입고 완료까지 상태 추적
 */
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, desc, and, like, or, sql, inArray } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth';
import { orderWorkflows } from '../db/schema';
import type { Env } from '../types';

const workflows = new Hono<{ Bindings: Env }>();

workflows.use('*', authMiddleware);

// ─── 상태 흐름 정의 ───
// 승인 단계 (공통)
const APPROVAL_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'] as const;

// 판매 워크플로우: 승인 후 → ERP → 창고
const SALES_STEPS = ['ERP_SUBMITTED', 'SHIPPING_ORDER', 'PICKING', 'SHIPPED', 'DELIVERED'] as const;
const PURCHASE_STEPS = ['ERP_SUBMITTED', 'RECEIVING_SCHEDULED', 'INSPECTING', 'RECEIVED', 'STOCKED'] as const;

// 전체 상태 라벨 (승인 + 워크플로우)
const ALL_LABELS: Record<string, string> = {
  DRAFT: '임시저장',
  PENDING_APPROVAL: '승인대기',
  APPROVED: '승인완료',
  REJECTED: '반려',
  ERP_SUBMITTED: 'ERP전송완료',
  SHIPPING_ORDER: '출고지시',
  PICKING: '피킹/포장',
  SHIPPED: '출고완료',
  DELIVERED: '납품완료',
  RECEIVING_SCHEDULED: '입고예정',
  INSPECTING: '입고검수',
  RECEIVED: '입고완료',
  STOCKED: '재고반영',
};

const SALES_LABELS: Record<string, string> = {
  ERP_SUBMITTED: '판매입력완료',
  SHIPPING_ORDER: '출고지시',
  PICKING: '피킹/포장',
  SHIPPED: '출고완료',
  DELIVERED: '납품완료',
};

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
  return { ...ALL_LABELS, ...(type === 'SALES' ? SALES_LABELS : PURCHASE_LABELS) };
}

// 자동채번 (YYMMDDnnn)
function generateOrderNumber(type: string): string {
  const now = new Date();
  const prefix = type === 'SALES' ? 'S' : 'P';
  const date = now.toISOString().slice(2, 10).replace(/-/g, '');
  const seq = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
  return `${prefix}${date}${seq}`;
}

/**
 * GET /workflows - 워크플로우 목록
 */
workflows.get('/', async (c) => {
  const db = drizzle(c.env.DB);
  const type = c.req.query('type');
  const status = c.req.query('status');
  const search = c.req.query('search');
  const includeAll = c.req.query('include_all');
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
  const page = Math.max(parseInt(c.req.query('page') || '1'), 1);
  const offset = (page - 1) * limit;

  const conditions = [];
  if (type) conditions.push(eq(orderWorkflows.workflowType, type));
  if (status) conditions.push(eq(orderWorkflows.status, status));
  if (search) {
    conditions.push(
      or(
        like(orderWorkflows.custName, `%${search}%`),
        like(orderWorkflows.customerName, `%${search}%`),
        like(orderWorkflows.orderNumber, `%${search}%`),
      )
    );
  }

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
    customerName: r.customerName || r.custName,
    items: JSON.parse(r.itemsData || '[]'),
    steps: getSteps(r.workflowType).map((s) => s),
    labels: getLabels(r.workflowType),
    statusLabel: ALL_LABELS[r.status] || r.status,
  }));

  return c.json({
    status: 'success',
    data: includeAll ? { workflows: data } : data,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    meta: { allLabels: ALL_LABELS, salesLabels: SALES_LABELS, purchaseLabels: PURCHASE_LABELS },
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
    sales: { total: 0, active: 0, completed: 0, pendingApproval: 0, byStatus: {} as Record<string, number> },
    purchase: { total: 0, active: 0, completed: 0, pendingApproval: 0, byStatus: {} as Record<string, number> },
    approval: { pending: 0, approved: 0, rejected: 0 },
    workflow: { erpSubmitted: 0, warehouseProcessing: 0, completed: 0 },
  };

  const warehouseStatuses = ['SHIPPING_ORDER', 'PICKING', 'RECEIVING_SCHEDULED', 'INSPECTING'];
  const completedStatuses = ['DELIVERED', 'STOCKED', 'SHIPPED', 'RECEIVED'];

  for (const r of rows) {
    const key = r.workflowType === 'SALES' ? 'sales' : 'purchase';
    summary[key].total += r.count;
    summary[key].byStatus[r.status] = r.count;

    if (completedStatuses.includes(r.status)) {
      summary[key].completed += r.count;
      summary.workflow.completed += r.count;
    } else if (r.status === 'PENDING_APPROVAL') {
      summary[key].pendingApproval += r.count;
      summary.approval.pending += r.count;
    } else if (r.status === 'APPROVED') {
      summary.approval.approved += r.count;
    } else if (r.status === 'REJECTED') {
      summary.approval.rejected += r.count;
    } else if (r.status === 'ERP_SUBMITTED') {
      summary[key].active += r.count;
      summary.workflow.erpSubmitted += r.count;
    } else if (warehouseStatuses.includes(r.status)) {
      summary[key].active += r.count;
      summary.workflow.warehouseProcessing += r.count;
    } else if (r.status !== 'DRAFT') {
      summary[key].active += r.count;
    }
  }

  return c.json({ status: 'success', data: summary });
});

/**
 * POST /workflows - 수동 입력으로 워크플로우 생성
 */
workflows.post('/', async (c) => {
  const body = await c.req.json<{
    workflowType: 'SALES' | 'PURCHASE';
    customerName: string;
    custCd?: string;
    ioDate: string;
    items: any[];
    totalAmount?: number;
    note?: string;
    action?: 'draft' | 'submit'; // draft=임시저장, submit=승인요청
  }>();

  if (!body.workflowType || !body.ioDate || !body.items || body.items.length === 0) {
    return c.json({ status: 'error', message: '필수 항목을 입력하세요 (유형, 일자, 품목)' }, 400);
  }

  const db = drizzle(c.env.DB);
  const now = new Date().toISOString();
  const status = body.action === 'submit' ? 'PENDING_APPROVAL' : 'DRAFT';
  const orderNumber = generateOrderNumber(body.workflowType);

  const [created] = await db.insert(orderWorkflows).values({
    workflowType: body.workflowType,
    status,
    orderNumber,
    ioDate: body.ioDate,
    custCd: body.custCd || null,
    custName: body.customerName,
    customerName: body.customerName,
    itemsData: JSON.stringify(body.items),
    totalAmount: body.totalAmount || 0,
    note: body.note || null,
    createdAt: now,
    updatedAt: now,
  }).returning();

  return c.json({
    status: 'success',
    message: status === 'PENDING_APPROVAL' ? '승인 요청이 등록되었습니다' : '임시저장 되었습니다',
    data: { ...created, statusLabel: ALL_LABELS[status] },
  }, 201);
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
      customerName: row.customerName || row.custName,
      items: JSON.parse(row.itemsData || '[]'),
      steps: getSteps(row.workflowType).map((s) => s),
      labels: getLabels(row.workflowType),
      statusLabel: ALL_LABELS[row.status] || row.status,
    },
  });
});

/**
 * PUT /workflows/:id - 워크플로우 수정 (DRAFT/REJECTED 상태에서만)
 */
workflows.put('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ status: 'error', message: '잘못된 ID' }, 400);

  const db = drizzle(c.env.DB);
  const [row] = await db.select().from(orderWorkflows).where(eq(orderWorkflows.id, id)).limit(1);
  if (!row) return c.json({ status: 'error', message: '워크플로우를 찾을 수 없습니다' }, 404);

  if (!['DRAFT', 'REJECTED'].includes(row.status)) {
    return c.json({ status: 'error', message: '임시저장 또는 반려 상태에서만 수정 가능합니다' }, 400);
  }

  const body = await c.req.json<{
    customerName?: string;
    custCd?: string;
    ioDate?: string;
    items?: any[];
    totalAmount?: number;
    note?: string;
    action?: 'draft' | 'submit';
  }>();

  const now = new Date().toISOString();
  const update: Record<string, any> = { updatedAt: now };

  if (body.customerName) { update.customerName = body.customerName; update.custName = body.customerName; }
  if (body.custCd) update.custCd = body.custCd;
  if (body.ioDate) update.ioDate = body.ioDate;
  if (body.items) update.itemsData = JSON.stringify(body.items);
  if (body.totalAmount !== undefined) update.totalAmount = body.totalAmount;
  if (body.note !== undefined) update.note = body.note;

  if (body.action === 'submit') {
    update.status = 'PENDING_APPROVAL';
    update.rejectionReason = null;
  }

  await db.update(orderWorkflows).set(update).where(eq(orderWorkflows.id, id));

  return c.json({
    status: 'success',
    message: body.action === 'submit' ? '승인 요청이 등록되었습니다' : '수정되었습니다',
  });
});

/**
 * POST /workflows/:id/approve - 승인 처리
 */
workflows.post('/:id/approve', async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ status: 'error', message: '잘못된 ID' }, 400);

  const db = drizzle(c.env.DB);
  const [row] = await db.select().from(orderWorkflows).where(eq(orderWorkflows.id, id)).limit(1);
  if (!row) return c.json({ status: 'error', message: '워크플로우를 찾을 수 없습니다' }, 404);

  if (row.status !== 'PENDING_APPROVAL') {
    return c.json({ status: 'error', message: '승인대기 상태가 아닙니다' }, 400);
  }

  const body = await c.req.json<{ note?: string; items?: any[]; totalAmount?: number }>().catch(() => ({}));
  const now = new Date().toISOString();

  // 승인 → 자동으로 ERP_SUBMITTED까지 전환 (실제 ERP API 미호출)
  const update: Record<string, any> = {
    status: 'ERP_SUBMITTED',
    approvedAt: now,
    erpSubmittedAt: now,
    erpResult: JSON.stringify({
      mode: 'simulation',
      message: 'ERP 자동전송 (시뮬레이션 - 실제 미전송)',
      approvedAt: now,
      orderNumber: row.orderNumber,
    }),
    updatedAt: now,
  };
  if (body.note) update.note = body.note;
  // 수정 후 승인 지원
  if (body.items) update.itemsData = JSON.stringify(body.items);
  if (body.totalAmount !== undefined) update.totalAmount = body.totalAmount;

  await db.update(orderWorkflows).set(update).where(eq(orderWorkflows.id, id));

  return c.json({
    status: 'success',
    message: '승인 완료 → ERP 전표 자동 생성 (시뮬레이션)',
    data: { id, status: 'ERP_SUBMITTED', erpMode: 'simulation' },
  });
});

/**
 * POST /workflows/:id/reject - 반려 처리
 */
workflows.post('/:id/reject', async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ status: 'error', message: '잘못된 ID' }, 400);

  const db = drizzle(c.env.DB);
  const [row] = await db.select().from(orderWorkflows).where(eq(orderWorkflows.id, id)).limit(1);
  if (!row) return c.json({ status: 'error', message: '워크플로우를 찾을 수 없습니다' }, 404);

  if (row.status !== 'PENDING_APPROVAL') {
    return c.json({ status: 'error', message: '승인대기 상태가 아닙니다' }, 400);
  }

  const body = await c.req.json<{ reason?: string; note?: string }>().catch(() => ({}));
  const now = new Date().toISOString();

  await db.update(orderWorkflows).set({
    status: 'REJECTED',
    rejectionReason: body.reason || body.note || null,
    updatedAt: now,
  }).where(eq(orderWorkflows.id, id));

  return c.json({
    status: 'success',
    message: '반려되었습니다',
    data: { id, status: 'REJECTED' },
  });
});

/**
 * PATCH /workflows/:id/status - 상태 변경 (워크플로우 단계 진행)
 */
workflows.patch('/:id/status', async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ status: 'error', message: '잘못된 ID' }, 400);

  const db = drizzle(c.env.DB);
  const [row] = await db.select().from(orderWorkflows).where(eq(orderWorkflows.id, id)).limit(1);
  if (!row) return c.json({ status: 'error', message: '워크플로우를 찾을 수 없습니다' }, 404);

  const body = await c.req.json<{ action?: string; status?: string; note?: string }>().catch(() => ({}));

  // 직접 상태 지정 (승인관리 프론트에서 사용)
  if (body.status && ['APPROVED', 'REJECTED', 'PENDING_APPROVAL'].includes(body.status)) {
    const now = new Date().toISOString();
    const update: Record<string, any> = { status: body.status, updatedAt: now };
    if (body.note) update.note = body.note;
    if (body.status === 'APPROVED') update.approvedAt = now;
    if (body.status === 'REJECTED') update.rejectionReason = body.note || null;
    await db.update(orderWorkflows).set(update).where(eq(orderWorkflows.id, id));
    return c.json({
      status: 'success',
      message: `${ALL_LABELS[body.status]}(으)로 변경되었습니다`,
      data: { id, status: body.status, label: ALL_LABELS[body.status] },
    });
  }

  // 워크플로우 단계 진행
  const steps = getSteps(row.workflowType);
  const currentIdx = steps.indexOf(row.status as any);

  if (currentIdx < 0) {
    return c.json({ status: 'error', message: '워크플로우 단계가 아닙니다. 승인 처리를 먼저 진행하세요.' }, 400);
  }

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

  const update: Record<string, any> = { status: newStatus, updatedAt: now };
  if (body.note) update.note = body.note;
  if (newIdx === 1) update.step2At = now;
  else if (newIdx === 2) update.step3At = now;
  else if (newIdx === 3) update.step4At = now;
  else if (newIdx === 4) update.step5At = now;

  await db.update(orderWorkflows).set(update).where(eq(orderWorkflows.id, id));

  const labels = getLabels(row.workflowType);
  return c.json({
    status: 'success',
    message: `${labels[newStatus] || ALL_LABELS[newStatus]}(으)로 변경되었습니다`,
    data: { id, status: newStatus, label: labels[newStatus] || ALL_LABELS[newStatus] },
  });
});

/**
 * DELETE /workflows/:id - 워크플로우 삭제
 */
workflows.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ status: 'error', message: '잘못된 ID' }, 400);

  const db = drizzle(c.env.DB);
  const [row] = await db.select({ id: orderWorkflows.id, status: orderWorkflows.status })
    .from(orderWorkflows).where(eq(orderWorkflows.id, id)).limit(1);
  if (!row) return c.json({ status: 'error', message: '워크플로우를 찾을 수 없습니다' }, 404);

  // DRAFT/REJECTED만 삭제 가능
  if (!['DRAFT', 'REJECTED'].includes(row.status)) {
    return c.json({ status: 'error', message: '임시저장 또는 반려 상태에서만 삭제 가능합니다' }, 400);
  }

  await db.delete(orderWorkflows).where(eq(orderWorkflows.id, id));
  return c.json({ status: 'success', message: '삭제 완료' });
});

export default workflows;
