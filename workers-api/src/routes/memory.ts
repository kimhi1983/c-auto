/**
 * Workflow Memory - /api/v1/memory
 * 과거 입력 패턴을 학습하여 자동완성 제공
 *
 * memory_type:
 *   CUSTOMER       — 거래처 (key: custCd, value: { custCd, custDes })
 *   PRODUCT_PRICE  — 거래처별 품목 단가 (key: custCd:prodCd, value: { prodCd, prodDes, price, unit })
 *   WAREHOUSE      — 거래처별 창고 배정 (key: custCd, value: { whCd, whDes })
 */
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and, like, desc, sql } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth';
import { workflowMemory } from '../db/schema';
import type { Env } from '../types';

const memory = new Hono<{ Bindings: Env }>();

memory.use('*', authMiddleware);

// ─── GET / — 타입별 학습 데이터 조회 (자동완성) ───
memory.get('/', async (c) => {
  const db = drizzle(c.env.DB);
  const type = c.req.query('type') || 'CUSTOMER';
  const q = (c.req.query('q') || '').trim();
  const custCd = c.req.query('custCd') || '';
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 50);

  try {
    let results;

    if (type === 'CUSTOMER') {
      // 거래처 자동완성: 빈도순, 이름/코드 검색
      if (q) {
        results = await db
          .select()
          .from(workflowMemory)
          .where(and(
            eq(workflowMemory.memoryType, 'CUSTOMER'),
            like(workflowMemory.memoryValue, `%${q}%`)
          ))
          .orderBy(desc(workflowMemory.frequency))
          .limit(limit);
      } else {
        // 검색어 없으면 최근+빈도순 상위
        results = await db
          .select()
          .from(workflowMemory)
          .where(eq(workflowMemory.memoryType, 'CUSTOMER'))
          .orderBy(desc(workflowMemory.frequency))
          .limit(limit);
      }
    } else if (type === 'PRODUCT_PRICE' && custCd) {
      // 거래처별 품목+단가 이력
      results = await db
        .select()
        .from(workflowMemory)
        .where(and(
          eq(workflowMemory.memoryType, 'PRODUCT_PRICE'),
          like(workflowMemory.memoryKey, `${custCd}:%`)
        ))
        .orderBy(desc(workflowMemory.frequency))
        .limit(limit);
    } else if (type === 'PRODUCT_PRICE' && q) {
      // 품목 검색 (모든 거래처)
      results = await db
        .select()
        .from(workflowMemory)
        .where(and(
          eq(workflowMemory.memoryType, 'PRODUCT_PRICE'),
          like(workflowMemory.memoryValue, `%${q}%`)
        ))
        .orderBy(desc(workflowMemory.frequency))
        .limit(limit);
    } else if (type === 'WAREHOUSE') {
      // 거래처별 창고 배정
      if (custCd) {
        results = await db
          .select()
          .from(workflowMemory)
          .where(and(
            eq(workflowMemory.memoryType, 'WAREHOUSE'),
            eq(workflowMemory.memoryKey, custCd)
          ))
          .limit(1);
      } else {
        results = await db
          .select()
          .from(workflowMemory)
          .where(eq(workflowMemory.memoryType, 'WAREHOUSE'))
          .orderBy(desc(workflowMemory.frequency))
          .limit(limit);
      }
    } else {
      results = [];
    }

    // memoryValue JSON 파싱
    const items = results.map(r => {
      try {
        return { ...JSON.parse(r.memoryValue), frequency: r.frequency, lastUsedAt: r.lastUsedAt };
      } catch {
        return { raw: r.memoryValue, frequency: r.frequency, lastUsedAt: r.lastUsedAt };
      }
    });

    return c.json({ status: 'success', data: { items, total: items.length } });
  } catch (err: any) {
    return c.json({ status: 'error', error: err.message }, 500);
  }
});

// ─── POST /learn — 워크플로우 데이터에서 패턴 학습 ───
memory.post('/learn', async (c) => {
  const db = drizzle(c.env.DB);
  const body = await c.req.json();
  const { custCd, custDes, whCd, whDes, items, workflowType } = body;
  const now = new Date().toISOString().replace('T', ' ').split('.')[0];

  try {
    let learned = 0;

    // 1. 거래처 학습
    if (custCd && custDes) {
      await db.run(sql`
        INSERT INTO workflow_memory (memory_type, memory_key, memory_value, frequency, last_used_at)
        VALUES ('CUSTOMER', ${custCd}, ${JSON.stringify({ custCd, custDes })}, 1, ${now})
        ON CONFLICT(memory_type, memory_key) DO UPDATE SET
          memory_value = ${JSON.stringify({ custCd, custDes })},
          frequency = frequency + 1,
          last_used_at = ${now}
      `);
      learned++;
    }

    // 2. 거래처별 창고 배정 학습
    if (custCd && whCd) {
      await db.run(sql`
        INSERT INTO workflow_memory (memory_type, memory_key, memory_value, frequency, last_used_at)
        VALUES ('WAREHOUSE', ${custCd}, ${JSON.stringify({ whCd, whDes: whDes || whCd })}, 1, ${now})
        ON CONFLICT(memory_type, memory_key) DO UPDATE SET
          memory_value = ${JSON.stringify({ whCd, whDes: whDes || whCd })},
          frequency = frequency + 1,
          last_used_at = ${now}
      `);
      learned++;
    }

    // 3. 거래처별 품목+단가 학습
    if (custCd && Array.isArray(items)) {
      for (const item of items) {
        const prodCd = item.PROD_CD || item.prodCd;
        const prodDes = item.PROD_DES || item.prodDes;
        const price = item.PRICE || item.price;
        const unit = item.UNIT || item.unit || item.SPEC || '';

        if (!prodCd) continue;

        const key = `${custCd}:${prodCd}`;
        const value = JSON.stringify({
          prodCd,
          prodDes: prodDes || '',
          price: price || '',
          unit,
          workflowType: workflowType || '',
        });

        await db.run(sql`
          INSERT INTO workflow_memory (memory_type, memory_key, memory_value, frequency, last_used_at)
          VALUES ('PRODUCT_PRICE', ${key}, ${value}, 1, ${now})
          ON CONFLICT(memory_type, memory_key) DO UPDATE SET
            memory_value = ${value},
            frequency = frequency + 1,
            last_used_at = ${now}
        `);
        learned++;
      }
    }

    return c.json({ status: 'success', data: { learned } });
  } catch (err: any) {
    return c.json({ status: 'error', error: err.message }, 500);
  }
});

// ─── GET /stats — 학습 통계 ───
memory.get('/stats', async (c) => {
  const db = drizzle(c.env.DB);

  try {
    const stats = await db.all(sql`
      SELECT memory_type, COUNT(*) as count, SUM(frequency) as total_freq
      FROM workflow_memory
      GROUP BY memory_type
    `);

    return c.json({ status: 'success', data: { stats } });
  } catch (err: any) {
    return c.json({ status: 'error', error: err.message }, 500);
  }
});

export default memory;
