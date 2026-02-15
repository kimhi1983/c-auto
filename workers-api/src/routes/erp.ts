/**
 * ERP Routes - /api/v1/erp
 * 이카운트 ERP 연동 판매/구매 조회 + AI 보고서 생성
 */
import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import {
  getSales,
  getPurchases,
  getInventory,
  getInventoryItem,
  getInventoryByWarehouse,
  getProducts,
  getPurchaseOrders,
  getERPStatus,
  aggregateSales,
  aggregatePurchases,
} from "../services/ecount";
import { askAIAnalyze } from "../services/ai";
import type { Env } from "../types";

const erp = new Hono<{ Bindings: Env }>();

erp.use("*", authMiddleware);

// ─── GET /status - ERP 연동 상태 확인 ───

erp.get("/status", (c) => {
  const status = getERPStatus(c.env);
  return c.json({
    status: "success",
    data: {
      erp_connected: status.configured,
      credentials: {
        com_code: status.comCode,
        user_id: status.userId,
        api_key: status.apiKey,
      },
      message: status.configured
        ? "이카운트 ERP 연동이 설정되어 있습니다"
        : "이카운트 ERP 인증 정보를 설정해주세요 (wrangler secret put)",
    },
  });
});

// ─── GET /sales - 판매현황 조회 ───

erp.get("/sales", async (c) => {
  const status = getERPStatus(c.env);
  if (!status.configured) {
    return c.json({ status: "error", message: "ERP 인증 정보가 설정되지 않았습니다" }, 400);
  }

  const from = c.req.query("from");
  const to = c.req.query("to");

  if (!from || !to) {
    return c.json({ status: "error", message: "from, to 파라미터가 필요합니다 (YYYYMMDD)" }, 400);
  }

  try {
    const result = await getSales(c.env, from, to);
    const aggregated = aggregateSales(result.items);

    return c.json({
      status: "success",
      data: {
        period: { from, to },
        summary: {
          total_amount: aggregated.totalAmount,
          total_supply: aggregated.totalSupply,
          total_vat: aggregated.totalVat,
          total_count: aggregated.totalCount,
        },
        top_customers: aggregated.topCustomers,
        top_products: aggregated.topProducts,
        daily_trend: aggregated.dailyTrend,
        items: result.items,
        api_error: result.error || null,
      },
    });
  } catch (e: any) {
    console.error("[ERP] Sales fetch error:", e);
    return c.json({ status: "error", message: e.message || "판매현황 조회 실패" }, 500);
  }
});

// ─── GET /purchases - 구매현황 조회 ───

erp.get("/purchases", async (c) => {
  const status = getERPStatus(c.env);
  if (!status.configured) {
    return c.json({ status: "error", message: "ERP 인증 정보가 설정되지 않았습니다" }, 400);
  }

  const from = c.req.query("from");
  const to = c.req.query("to");

  if (!from || !to) {
    return c.json({ status: "error", message: "from, to 파라미터가 필요합니다 (YYYYMMDD)" }, 400);
  }

  try {
    const result = await getPurchases(c.env, from, to);
    const aggregated = aggregatePurchases(result.items);

    return c.json({
      status: "success",
      data: {
        period: { from, to },
        summary: {
          total_amount: aggregated.totalAmount,
          total_supply: aggregated.totalSupply,
          total_vat: aggregated.totalVat,
          total_count: aggregated.totalCount,
        },
        top_suppliers: aggregated.topSuppliers,
        top_products: aggregated.topProducts,
        items: result.items,
        api_error: result.error || null,
      },
    });
  } catch (e: any) {
    console.error("[ERP] Purchases fetch error:", e);
    return c.json({ status: "error", message: e.message || "구매현황 조회 실패" }, 500);
  }
});

// ─── GET /summary - 기간 요약 (판매+구매 통합) ───

erp.get("/summary", async (c) => {
  const status = getERPStatus(c.env);
  if (!status.configured) {
    return c.json({ status: "error", message: "ERP 인증 정보가 설정되지 않았습니다" }, 400);
  }

  const period = c.req.query("period") || "monthly";
  const now = new Date();
  let from: string;
  const to = now.toISOString().split("T")[0].replace(/-/g, "");

  if (period === "daily") {
    from = to;
  } else if (period === "weekly") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    from = d.toISOString().split("T")[0].replace(/-/g, "");
  } else {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 1);
    from = d.toISOString().split("T")[0].replace(/-/g, "");
  }

  try {
    const [salesResult, purchasesResult] = await Promise.all([
      getSales(c.env, from, to),
      getPurchases(c.env, from, to),
    ]);

    const salesAgg = aggregateSales(salesResult.items);
    const purchasesAgg = aggregatePurchases(purchasesResult.items);

    const profit = salesAgg.totalSupply - purchasesAgg.totalSupply;
    const profitRate = salesAgg.totalSupply > 0
      ? ((profit / salesAgg.totalSupply) * 100).toFixed(1)
      : "0.0";

    return c.json({
      status: "success",
      data: {
        period: { type: period, from, to },
        overview: {
          sales_amount: salesAgg.totalAmount,
          sales_supply: salesAgg.totalSupply,
          sales_count: salesAgg.totalCount,
          purchase_amount: purchasesAgg.totalAmount,
          purchase_supply: purchasesAgg.totalSupply,
          purchase_count: purchasesAgg.totalCount,
          gross_profit: profit,
          profit_rate: parseFloat(profitRate),
        },
        sales: {
          top_customers: salesAgg.topCustomers,
          top_products: salesAgg.topProducts,
          daily_trend: salesAgg.dailyTrend,
        },
        purchases: {
          top_suppliers: purchasesAgg.topSuppliers,
          top_products: purchasesAgg.topProducts,
        },
      },
    });
  } catch (e: any) {
    console.error("[ERP] Summary fetch error:", e);
    return c.json({ status: "error", message: e.message || "요약 데이터 조회 실패" }, 500);
  }
});

// ─── GET /inventory - 이카운트 재고현황 조회 ───

erp.get("/inventory", async (c) => {
  const status = getERPStatus(c.env);
  if (!status.configured) {
    return c.json({ status: "error", message: "ERP 인증 정보가 설정되지 않았습니다" }, 400);
  }

  try {
    const result = await getInventory(c.env);
    return c.json({
      status: "success",
      data: { items: result.items, total_count: result.totalCount, api_error: result.error || null },
    });
  } catch (e: any) {
    console.error("[ERP] Inventory fetch error:", e);
    return c.json({ status: "error", message: e.message || "재고현황 조회 실패" }, 500);
  }
});

// ─── GET /inventory/:prodCode - 이카운트 재고현황 단건 조회 ───

erp.get("/inventory/:prodCode", async (c) => {
  const status = getERPStatus(c.env);
  if (!status.configured) {
    return c.json({ status: "error", message: "ERP 인증 정보가 설정되지 않았습니다" }, 400);
  }

  const prodCode = c.req.param("prodCode");

  try {
    const item = await getInventoryItem(c.env, prodCode);
    if (!item) {
      return c.json({ status: "error", message: "품목을 찾을 수 없습니다" }, 404);
    }
    return c.json({ status: "success", data: item });
  } catch (e: any) {
    console.error("[ERP] Inventory item fetch error:", e);
    return c.json({ status: "error", message: e.message || "재고현황 단건 조회 실패" }, 500);
  }
});

// ─── GET /inventory-by-warehouse - 창고별 재고현황 조회 ───

erp.get("/inventory-by-warehouse", async (c) => {
  const status = getERPStatus(c.env);
  if (!status.configured) {
    return c.json({ status: "error", message: "ERP 인증 정보가 설정되지 않았습니다" }, 400);
  }

  try {
    const { items, totalCount } = await getInventoryByWarehouse(c.env);
    return c.json({
      status: "success",
      data: { items, total_count: totalCount },
    });
  } catch (e: any) {
    console.error("[ERP] Warehouse inventory fetch error:", e);
    return c.json({ status: "error", message: e.message || "창고별 재고현황 조회 실패" }, 500);
  }
});

// ─── GET /products - 이카운트 품목 목록 조회 ───

erp.get("/products", async (c) => {
  const status = getERPStatus(c.env);
  if (!status.configured) {
    return c.json({ status: "error", message: "ERP 인증 정보가 설정되지 않았습니다" }, 400);
  }

  try {
    const { items, totalCount } = await getProducts(c.env);
    return c.json({
      status: "success",
      data: { items, total_count: totalCount },
    });
  } catch (e: any) {
    console.error("[ERP] Products fetch error:", e);
    return c.json({ status: "error", message: e.message || "품목 조회 실패" }, 500);
  }
});

// ─── GET /purchase-orders - 발주서 조회 ───

erp.get("/purchase-orders", async (c) => {
  const status = getERPStatus(c.env);
  if (!status.configured) {
    return c.json({ status: "error", message: "ERP 인증 정보가 설정되지 않았습니다" }, 400);
  }

  const from = c.req.query("from");
  const to = c.req.query("to");

  if (!from || !to) {
    return c.json({ status: "error", message: "from, to 파라미터가 필요합니다 (YYYYMMDD)" }, 400);
  }

  try {
    const { items, totalCount } = await getPurchaseOrders(c.env, from, to);
    return c.json({
      status: "success",
      data: { items, total_count: totalCount },
    });
  } catch (e: any) {
    console.error("[ERP] Purchase orders fetch error:", e);
    return c.json({ status: "error", message: e.message || "발주서 조회 실패" }, 500);
  }
});

// ─── POST /generate-report - AI ERP 보고서 생성 ───

erp.post("/generate-report", async (c) => {
  const status = getERPStatus(c.env);
  if (!status.configured) {
    return c.json({ status: "error", message: "ERP 인증 정보가 설정되지 않았습니다" }, 400);
  }

  const reportType = c.req.query("type") || "daily";
  const now = new Date();
  let from: string;
  const to = now.toISOString().split("T")[0].replace(/-/g, "");

  if (reportType === "daily") {
    from = to;
  } else if (reportType === "weekly") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    from = d.toISOString().split("T")[0].replace(/-/g, "");
  } else {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 1);
    from = d.toISOString().split("T")[0].replace(/-/g, "");
  }

  const typeLabel = reportType === "daily" ? "일간" : reportType === "weekly" ? "주간" : "월간";
  const fromFormatted = `${from.slice(0, 4)}-${from.slice(4, 6)}-${from.slice(6, 8)}`;
  const toFormatted = `${to.slice(0, 4)}-${to.slice(4, 6)}-${to.slice(6, 8)}`;

  try {
    // 판매/구매 데이터 동시 조회
    const [salesResult, purchasesResult] = await Promise.all([
      getSales(c.env, from, to),
      getPurchases(c.env, from, to),
    ]);

    const salesAgg = aggregateSales(salesResult.items);
    const purchasesAgg = aggregatePurchases(purchasesResult.items);

    const profit = salesAgg.totalSupply - purchasesAgg.totalSupply;
    const profitRate = salesAgg.totalSupply > 0
      ? ((profit / salesAgg.totalSupply) * 100).toFixed(1)
      : "0.0";

    // AI 분석 프롬프트 생성
    const dataForAI = `
[KPROS ${typeLabel} ERP 데이터 (${fromFormatted} ~ ${toFormatted})]

■ 판매 현황
- 총 매출액: ₩${salesAgg.totalAmount.toLocaleString()} (공급가: ₩${salesAgg.totalSupply.toLocaleString()})
- 판매 건수: ${salesAgg.totalCount}건
- 거래처별 TOP:
${salesAgg.topCustomers.slice(0, 5).map((c, i) => `  ${i + 1}. ${c.name} - ₩${c.amount.toLocaleString()} (${c.count}건)`).join("\n")}
- 품목별 TOP:
${salesAgg.topProducts.slice(0, 5).map((p, i) => `  ${i + 1}. ${p.name} - ₩${p.amount.toLocaleString()} (${p.qty}개)`).join("\n")}

■ 구매 현황
- 총 매입액: ₩${purchasesAgg.totalAmount.toLocaleString()} (공급가: ₩${purchasesAgg.totalSupply.toLocaleString()})
- 구매 건수: ${purchasesAgg.totalCount}건
- 공급사별 TOP:
${purchasesAgg.topSuppliers.slice(0, 5).map((s, i) => `  ${i + 1}. ${s.name} - ₩${s.amount.toLocaleString()} (${s.count}건)`).join("\n")}

■ 손익 요약
- 매출총이익: ₩${profit.toLocaleString()}
- 이익률: ${profitRate}%
`;

    let aiInsight = "";
    try {
      aiInsight = await askAIAnalyze(
        c.env,
        `다음 KPROS ${typeLabel} ERP 데이터를 분석하여 이사님께 보고할 핵심 인사이트를 작성하세요.

${dataForAI}

[작성 규칙]
1. 핵심 요약 3줄 (매출 동향, 수익성, 주목할 점)
2. 주의사항 또는 리스크 요인 (있는 경우)
3. 추천 액션 2~3개
4. 숫자는 ₩ 단위, 천 단위 콤마 포함
5. 이사님이 1분 내에 파악할 수 있도록 간결하게`,
        "당신은 KPROS(화장품 원료 전문기업) 경영분석 AI 비서입니다. 이사님께 보고하는 톤으로, 데이터 기반의 정확하고 간결한 분석을 제공합니다.",
        1024
      );
    } catch (e) {
      console.error("[ERP] AI insight generation failed:", e);
      aiInsight = "AI 분석을 생성할 수 없습니다.";
    }

    // 구조화된 보고서 데이터
    const reportData = {
      title: `KPROS ${typeLabel} ERP 보고서`,
      type: reportType,
      type_label: typeLabel,
      period: reportType === "daily" ? toFormatted : `${fromFormatted} ~ ${toFormatted}`,
      from: fromFormatted,
      to: toFormatted,
      generated_at: new Date().toISOString(),
      overview: {
        sales_amount: salesAgg.totalAmount,
        sales_supply: salesAgg.totalSupply,
        sales_vat: salesAgg.totalVat,
        sales_count: salesAgg.totalCount,
        purchase_amount: purchasesAgg.totalAmount,
        purchase_supply: purchasesAgg.totalSupply,
        purchase_vat: purchasesAgg.totalVat,
        purchase_count: purchasesAgg.totalCount,
        gross_profit: profit,
        profit_rate: parseFloat(profitRate),
      },
      sales: {
        top_customers: salesAgg.topCustomers,
        top_products: salesAgg.topProducts,
        daily_trend: salesAgg.dailyTrend,
        items: salesResult.items,
      },
      purchases: {
        top_suppliers: purchasesAgg.topSuppliers,
        top_products: purchasesAgg.topProducts,
        items: purchasesResult.items,
      },
      ai_insight: aiInsight,
    };

    return c.json({
      status: "success",
      data: reportData,
      message: `${typeLabel} ERP 보고서 생성 완료`,
    });
  } catch (e: any) {
    console.error("[ERP] Report generation error:", e);
    return c.json({ status: "error", message: e.message || "보고서 생성 실패" }, 500);
  }
});

export default erp;
