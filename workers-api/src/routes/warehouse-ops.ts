/**
 * Warehouse Operations - /api/v1/warehouse-ops
 * 창고별 입출고 작업 처리 + 성적서(CoA) 문서 관리
 */
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, or, and, desc, sql, inArray } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth';
import { orderWorkflows, workflowDocuments } from '../db/schema';
import { isDropboxConfigured, getDropboxAccessToken, uploadAttachmentToDropbox } from '../services/dropbox';
import type { Env } from '../types';

const warehouseOps = new Hono<{ Bindings: Env }>();

warehouseOps.use('*', authMiddleware);

// 판매/구매 창고 관련 상태
const SALES_WH_STATUSES = ['SHIPPING_ORDER', 'PICKING'];
const PURCHASE_WH_STATUSES = ['RECEIVING_SCHEDULED', 'INSPECTING'];

const SALES_STEPS = ['ERP_SUBMITTED', 'SHIPPING_ORDER', 'PICKING', 'SHIPPED', 'DELIVERED'] as const;
const PURCHASE_STEPS = ['ERP_SUBMITTED', 'RECEIVING_SCHEDULED', 'INSPECTING', 'RECEIVED', 'STOCKED'] as const;

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
  return type === 'SALES' ? SALES_LABELS : PURCHASE_LABELS;
}

/**
 * GET / - 창고별 작업 목록
 */
warehouseOps.get('/', async (c) => {
  const db = drizzle(c.env.DB);
  const typeFilter = c.req.query('type');
  const warehouseFilter = c.req.query('warehouse');

  // 창고 관련 상태의 워크플로우만 조회
  const conditions = [];
  if (typeFilter === 'SALES') {
    conditions.push(
      and(eq(orderWorkflows.workflowType, 'SALES'), inArray(orderWorkflows.status, SALES_WH_STATUSES))
    );
  } else if (typeFilter === 'PURCHASE') {
    conditions.push(
      and(eq(orderWorkflows.workflowType, 'PURCHASE'), inArray(orderWorkflows.status, PURCHASE_WH_STATUSES))
    );
  } else {
    conditions.push(
      or(
        and(eq(orderWorkflows.workflowType, 'SALES'), inArray(orderWorkflows.status, SALES_WH_STATUSES)),
        and(eq(orderWorkflows.workflowType, 'PURCHASE'), inArray(orderWorkflows.status, PURCHASE_WH_STATUSES)),
      )
    );
  }

  const rows = await db.select()
    .from(orderWorkflows)
    .where(conditions[0])
    .orderBy(desc(orderWorkflows.updatedAt));

  // 문서 개수 조회
  const workflowIds = rows.map(r => r.id);
  let docCounts: Record<number, number> = {};
  if (workflowIds.length > 0) {
    const docs = await db.select({
      workflowId: workflowDocuments.workflowId,
      count: sql<number>`count(*)`,
    }).from(workflowDocuments)
      .where(inArray(workflowDocuments.workflowId, workflowIds))
      .groupBy(workflowDocuments.workflowId);
    for (const d of docs) {
      docCounts[d.workflowId] = d.count;
    }
  }

  // 창고별 그룹핑
  const warehouseMap = new Map<string, any[]>();

  for (const row of rows) {
    const items = JSON.parse(row.itemsData || '[]');
    const whCodes = new Set<string>();
    for (const item of items) {
      whCodes.add(item.WH_CD || item.WAREHOUSE_CD || '미지정');
    }
    if (whCodes.size === 0) whCodes.add('미지정');

    const task = {
      ...row,
      items,
      documentCount: docCounts[row.id] || 0,
      statusLabel: getLabels(row.workflowType)[row.status] || row.status,
    };

    for (const wh of whCodes) {
      if (warehouseFilter && wh !== warehouseFilter) continue;
      if (!warehouseMap.has(wh)) warehouseMap.set(wh, []);
      warehouseMap.get(wh)!.push(task);
    }
  }

  // Map → 배열 변환
  const warehouses = Array.from(warehouseMap.entries())
    .sort((a, b) => {
      if (a[0] === '미지정') return 1;
      if (b[0] === '미지정') return -1;
      return a[0].localeCompare(b[0]);
    })
    .map(([warehouseCd, tasks]) => ({
      warehouseCd,
      taskCount: tasks.length,
      tasks,
    }));

  const salesCount = rows.filter(r => r.workflowType === 'SALES').length;
  const purchaseCount = rows.filter(r => r.workflowType === 'PURCHASE').length;

  return c.json({
    status: 'success',
    data: {
      warehouses,
      summary: {
        totalTasks: rows.length,
        salesTasks: salesCount,
        purchaseTasks: purchaseCount,
      },
    },
  });
});

/**
 * GET /:id/documents - 워크플로우별 문서 목록
 */
warehouseOps.get('/:id/documents', async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ status: 'error', message: '잘못된 ID' }, 400);

  const db = drizzle(c.env.DB);
  const docs = await db.select()
    .from(workflowDocuments)
    .where(eq(workflowDocuments.workflowId, id))
    .orderBy(desc(workflowDocuments.createdAt));

  return c.json({ status: 'success', data: docs });
});

/**
 * POST /:id/documents - CoA 파일 업로드 (base64 → Dropbox)
 */
warehouseOps.post('/:id/documents', async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ status: 'error', message: '잘못된 ID' }, 400);

  const db = drizzle(c.env.DB);

  // 워크플로우 존재 확인
  const [workflow] = await db.select()
    .from(orderWorkflows)
    .where(eq(orderWorkflows.id, id))
    .limit(1);
  if (!workflow) return c.json({ status: 'error', message: '워크플로우를 찾을 수 없습니다' }, 404);

  const body = await c.req.json<{
    fileName: string;
    contentBase64: string;
    contentType?: string;
    note?: string;
  }>();

  if (!body.fileName || !body.contentBase64) {
    return c.json({ status: 'error', message: '파일명과 파일 데이터가 필요합니다' }, 400);
  }

  // base64 → Uint8Array
  const b64 = body.contentBase64.replace(/-/g, '+').replace(/_/g, '/');
  const binStr = atob(b64);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);

  // 10MB 제한
  if (bytes.byteLength > 10 * 1024 * 1024) {
    return c.json({ status: 'error', message: '파일 크기는 10MB 이하만 가능합니다' }, 400);
  }

  let dropboxPath: string | null = null;

  // Dropbox 업로드 시도
  if (isDropboxConfigured(c.env)) {
    try {
      const accessToken = await getDropboxAccessToken(
        c.env.CACHE!,
        c.env.DROPBOX_APP_KEY!,
        c.env.DROPBOX_APP_SECRET!,
      );
      if (accessToken) {
        const dateStr = (workflow.ioDate || new Date().toISOString().split('T')[0]).replace(/-/g, '');
        const result = await uploadAttachmentToDropbox(
          accessToken, '성적서대응', dateStr, body.fileName, bytes
        );
        dropboxPath = result.path;
      }
    } catch (err: any) {
      console.error('[Warehouse] Dropbox 업로드 실패:', err.message);
    }
  }

  // D1에 메타데이터 저장
  const [doc] = await db.insert(workflowDocuments).values({
    workflowId: id,
    documentType: 'COA',
    fileName: body.fileName,
    fileSize: bytes.byteLength,
    contentType: body.contentType || 'application/pdf',
    dropboxPath,
    note: body.note || null,
  }).returning();

  return c.json({
    status: 'success',
    message: '성적서 업로드 완료',
    data: doc,
  });
});

/**
 * DELETE /documents/:docId - 문서 삭제
 */
warehouseOps.delete('/documents/:docId', async (c) => {
  const docId = parseInt(c.req.param('docId'));
  if (isNaN(docId)) return c.json({ status: 'error', message: '잘못된 ID' }, 400);

  const db = drizzle(c.env.DB);
  const [doc] = await db.select({ id: workflowDocuments.id })
    .from(workflowDocuments)
    .where(eq(workflowDocuments.id, docId))
    .limit(1);
  if (!doc) return c.json({ status: 'error', message: '문서를 찾을 수 없습니다' }, 404);

  await db.delete(workflowDocuments).where(eq(workflowDocuments.id, docId));
  return c.json({ status: 'success', message: '삭제 완료' });
});

/**
 * POST /:id/process - 작업 처리 (상태 진행/이전)
 */
warehouseOps.post('/:id/process', async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ status: 'error', message: '잘못된 ID' }, 400);

  const db = drizzle(c.env.DB);
  const [row] = await db.select()
    .from(orderWorkflows)
    .where(eq(orderWorkflows.id, id))
    .limit(1);
  if (!row) return c.json({ status: 'error', message: '워크플로우를 찾을 수 없습니다' }, 404);

  // 창고 관련 상태인지 검증
  const validStatuses = row.workflowType === 'SALES' ? SALES_WH_STATUSES : PURCHASE_WH_STATUSES;
  if (!validStatuses.includes(row.status)) {
    return c.json({ status: 'error', message: '현재 창고 작업 단계가 아닙니다' }, 400);
  }

  const body = await c.req.json<{ action?: string; note?: string }>().catch(() => ({}));
  const steps = getSteps(row.workflowType);
  const currentIdx = steps.indexOf(row.status as any);
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

  const update: Record<string, any> = {
    status: newStatus,
    updatedAt: now,
  };
  if (body.note) update.note = body.note;
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

export default warehouseOps;
