/**
 * 이카운트 ERP API 연동 서비스
 *
 * 인증 흐름: ZONE 조회 → 로그인(SESSION_ID 발급) → API 호출
 * 세션 캐싱: KV Store (24시간 TTL)
 *
 * 공식 OpenAPI URL 목록 (이카운트 ERP 문서 기준):
 * - ZoneAPI:            POST https://oapi.ecount.com/OAPI/V2/Zone
 * - 로그인API:          POST https://oapi{ZONE}.ecount.com/OAPI/V2/OAPILogin
 * - 거래처등록:         /OAPI/V2/AccountBasic/SaveBasicCust
 * - 거래처조회:         /OAPI/V2/AccountBasic/GetBasicCustList
 * - 거래처단건조회:     /OAPI/V2/AccountBasic/ViewBasicCust
 * - 품목등록:           /OAPI/V2/InventoryBasic/SaveBasicProduct
 * - 품목조회(단건):     /OAPI/V2/InventoryBasic/ViewBasicProduct
 * - 품목조회:           /OAPI/V2/InventoryBasic/GetBasicProductsList
 * - 견적서입력:         /OAPI/V2/Quotation/SaveQuotation
 * - 주문서입력:         /OAPI/V2/SaleOrder/SaveSaleOrder
 * - 판매조회:           /OAPI/V2/Sale/GetListSale
 * - 판매입력:           /OAPI/V2/Sale/SaveSale
 * - 구매조회:           /OAPI/V2/Purchase/GetListPurchase
 * - 발주서조회:         /OAPI/V2/Purchases/GetPurchasesOrderList
 * - 구매입력:           /OAPI/V2/Purchases/SavePurchases
 * - 작업지시서입력:     /OAPI/V2/JobOrder/SaveJobOrder
 * - 생산불출입력:       /OAPI/V2/GoodsIssued/SaveGoodsIssued
 * - 생산입고:           /OAPI/V2/GoodsReceipt/SaveGoodsReceipt
 * - 매출매입전표자동분개: /OAPI/V2/InvoiceAuto/SaveInvoiceAuto
 * - 재고현황(단건):     /OAPI/V2/InventoryBalance/ViewInventoryBalanceStatus
 * - 재고현황:           /OAPI/V2/InventoryBalance/GetListInventoryBalanceStatus
 * - 창고별재고(단건):   /OAPI/V2/InventoryBalance/ViewInventoryBalanceStatusByLocation
 * - 창고별재고현황:     /OAPI/V2/InventoryBalance/GetListInventoryBalanceStatusByLocation
 *
 * SESSION_ID는 쿼리 파라미터로 전달 (공식 문서 기준)
 */

import type { Env } from "../types";

const ECOUNT_BASE = "https://oapi.ecount.com";

interface EcountResponse {
  Status: string | number;
  Error: any;
  Data: any;
}

export interface SaleItem {
  IO_DATE: string;
  CUST_CD: string;
  CUST_DES: string;
  PROD_CD: string;
  PROD_DES: string;
  QTY: string;
  PRICE: string;
  SUPPLY_AMT: string;
  VAT_AMT: string;
  TOTAL_AMT: string;
  WH_CD: string;
  REMARKS: string;
}

export interface PurchaseItem {
  IO_DATE: string;
  CUST_CD: string;
  CUST_DES: string;
  PROD_CD: string;
  PROD_DES: string;
  QTY: string;
  PRICE: string;
  SUPPLY_AMT: string;
  VAT_AMT: string;
  TOTAL_AMT: string;
  WH_CD: string;
  REMARKS: string;
}

export interface ProductItem {
  PROD_CD: string;
  PROD_DES: string;
  PROD_DES2?: string;
  UNIT: string;
  PRICE?: string;
  COST?: string;
  CLASS_CD?: string;
  CLASS_DES?: string;
  USE_YN?: string;
}

export interface InventoryBalanceItem {
  PROD_CD: string;
  PROD_DES: string;
  WH_CD?: string;
  WH_DES?: string;
  UNIT?: string;
  BAL_QTY: string;
  IN_QTY?: string;
  OUT_QTY?: string;
  PRICE?: string;
  BAL_AMT?: string;
}

// ─── ZONE 조회 ───

async function getZone(comCode: string): Promise<string> {
  const res = await fetch(`${ECOUNT_BASE}/OAPI/V2/Zone`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ COM_CODE: comCode }),
  });

  if (!res.ok) {
    throw new Error(`이카운트 ZONE 조회 실패 (${res.status})`);
  }

  const data = (await res.json()) as EcountResponse;
  if (String(data.Status) !== "200" || !data.Data?.ZONE) {
    throw new Error(`이카운트 ZONE 조회 오류: ${JSON.stringify(data.Error)}`);
  }

  return data.Data.ZONE;
}

// ─── 로그인 (세션 발급) ───

async function login(
  comCode: string,
  userId: string,
  apiKey: string,
  zone: string
): Promise<string> {
  const res = await fetch(`https://oapi${zone}.ecount.com/OAPI/V2/OAPILogin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      COM_CODE: comCode,
      USER_ID: userId,
      API_CERT_KEY: apiKey,
      LAN_TYPE: "ko-KR",
      ZONE: zone,
    }),
  });

  if (!res.ok) {
    throw new Error(`이카운트 로그인 실패 (${res.status})`);
  }

  const data = (await res.json()) as EcountResponse;
  if (String(data.Status) !== "200") {
    throw new Error(`이카운트 로그인 오류: ${JSON.stringify(data.Error)}`);
  }

  // 테스트용 인증키: Code "204", SESSION_ID 없음
  const code = data.Data?.Datas?.Code || data.Data?.Code;
  if (code === "204" || code === 204) {
    throw new Error("테스트용 인증키입니다. 실제 인증키를 발급받아 등록해주세요.");
  }

  if (!data.Data?.Datas?.SESSION_ID) {
    throw new Error(`이카운트 세션 발급 실패: ${JSON.stringify(data.Data)}`);
  }

  return data.Data.Datas.SESSION_ID;
}

// ─── 세션 관리 (KV 캐싱) ───

const KV_SESSION_KEY = "ecount:session";
const KV_ZONE_KEY = "ecount:zone";
const SESSION_TTL = 60 * 60 * 24; // 24시간

async function getSession(env: Env): Promise<{ sessionId: string; zone: string }> {
  const comCode = env.ECOUNT_COM_CODE;
  const userId = env.ECOUNT_USER_ID;
  const apiKey = env.ECOUNT_API_CERT_KEY;

  if (!comCode || !userId || !apiKey) {
    throw new Error("이카운트 ERP 인증 정보가 설정되지 않았습니다");
  }

  // KV에서 캐싱된 세션 조회
  if (env.CACHE) {
    const cachedSession = await env.CACHE.get(KV_SESSION_KEY);
    const cachedZone = await env.CACHE.get(KV_ZONE_KEY);
    if (cachedSession && cachedZone) {
      return { sessionId: cachedSession, zone: cachedZone };
    }
  }

  // 새 세션 발급
  const zone = await getZone(comCode);
  const sessionId = await login(comCode, userId, apiKey, zone);

  // KV에 캐싱
  if (env.CACHE) {
    await env.CACHE.put(KV_SESSION_KEY, sessionId, { expirationTtl: SESSION_TTL });
    await env.CACHE.put(KV_ZONE_KEY, zone, { expirationTtl: SESSION_TTL });
  }

  return { sessionId, zone };
}

/**
 * 세션 무효화 후 재로그인
 */
async function refreshSession(env: Env): Promise<{ sessionId: string; zone: string }> {
  if (env.CACHE) {
    await env.CACHE.delete(KV_SESSION_KEY);
    await env.CACHE.delete(KV_ZONE_KEY);
  }
  return getSession(env);
}

// ─── API 호출 공통 ───
// 공식 문서: SESSION_ID를 쿼리 파라미터로 전달

async function apiCall(
  env: Env,
  endpoint: string,
  params: Record<string, any>,
  retry = true
): Promise<any> {
  const { sessionId, zone } = await getSession(env);

  // SESSION_ID를 쿼리 파라미터로 전달 (공식 API 문서 기준)
  const url = `https://oapi${zone}.ecount.com${endpoint}?SESSION_ID=${sessionId}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    // 인증 만료 시 재로그인 후 재시도
    if ((res.status === 401 || res.status === 403) && retry) {
      await refreshSession(env);
      return apiCall(env, endpoint, params, false);
    }
    throw new Error(`이카운트 API 호출 실패 (${res.status}): ${endpoint}`);
  }

  const data = (await res.json()) as EcountResponse;

  // 세션 만료 / "Please login" 에러 시 재로그인
  if (String(data.Status) !== "200" && retry) {
    const errorMsg = data.Error?.Message || data.Errors?.[0]?.Message || "";
    const errorCode = data.Error?.Code;
    if (
      errorCode === "-1" ||
      errorCode === "SESSION_EXPIRED" ||
      errorMsg === "Please login."
    ) {
      await refreshSession(env);
      return apiCall(env, endpoint, params, false);
    }
  }

  // 인증되지 않은 API 에러
  if (String(data.Status) !== "200") {
    const errorMsg = data.Error?.Message || data.Errors?.[0]?.Message || "Unknown error";
    throw new Error(`이카운트 API 오류: ${errorMsg} (${endpoint})`);
  }

  return data;
}

// ─── 판매현황 조회 ───
// 공식 엔드포인트: /OAPI/V2/Sale/GetListSale

export async function getSales(
  env: Env,
  dateFrom: string,
  dateTo: string,
  options?: { CUST?: string; PROD_CD?: string }
): Promise<{ items: SaleItem[]; totalCount: number; error?: string }> {
  const params: Record<string, string> = {
    FROM_DATE: dateFrom,
    TO_DATE: dateTo,
    LAN_TYPE: "ko-KR",
    CUST: options?.CUST || "",
    PROD_CD: options?.PROD_CD || "",
  };
  try {
    const data = await apiCall(env, "/OAPI/V2/Sale/GetListSale", params);
    const items: SaleItem[] = data.Data?.Result || data.Data?.Datas || data.Data || [];
    return { items: Array.isArray(items) ? items : [], totalCount: data.Data?.TotalCnt || items.length };
  } catch (e: any) {
    const msg = e.message || "";
    if (msg.includes("Not Found") || msg.includes("인증되지 않은")) {
      console.warn("[ERP] GetListSale API 미인증 - 이카운트 OAPI 관리에서 인증 필요:", msg);
      return { items: [], totalCount: 0, error: "판매조회 API(GetListSale)가 아직 인증되지 않았습니다. 이카운트 OAPI 관리 페이지에서 API 인증을 완료해주세요." };
    }
    throw e;
  }
}

// ─── 구매현황 조회 ───
// 공식 엔드포인트: /OAPI/V2/Purchase/GetListPurchase

export async function getPurchases(
  env: Env,
  dateFrom: string,
  dateTo: string,
  options?: { CUST?: string; PROD_CD?: string }
): Promise<{ items: PurchaseItem[]; totalCount: number; error?: string }> {
  const params: Record<string, string> = {
    FROM_DATE: dateFrom,
    TO_DATE: dateTo,
    LAN_TYPE: "ko-KR",
    CUST: options?.CUST || "",
    PROD_CD: options?.PROD_CD || "",
  };
  try {
    const data = await apiCall(env, "/OAPI/V2/Purchase/GetListPurchase", params);
    const items: PurchaseItem[] = data.Data?.Result || data.Data?.Datas || data.Data || [];
    return { items: Array.isArray(items) ? items : [], totalCount: data.Data?.TotalCnt || items.length };
  } catch (e: any) {
    const msg = e.message || "";
    if (msg.includes("Not Found") || msg.includes("인증되지 않은")) {
      console.warn("[ERP] GetListPurchase API 미인증 - 이카운트 OAPI 관리에서 인증 필요:", msg);
      return { items: [], totalCount: 0, error: "구매조회 API(GetListPurchase)가 아직 인증되지 않았습니다. 이카운트 OAPI 관리 페이지에서 API 인증을 완료해주세요." };
    }
    throw e;
  }
}

// ─── 재고현황 조회 (목록) ───
// 공식 엔드포인트: /OAPI/V2/InventoryBalance/GetListInventoryBalanceStatus

export async function getInventory(
  env: Env,
  baseDate?: string,
  options?: { WH_CD?: string; PROD_CD?: string; ZERO_FLAG?: string; BAL_FLAG?: string }
): Promise<{ items: InventoryBalanceItem[]; totalCount: number; error?: string }> {
  const today = baseDate || new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const params: Record<string, string> = {
    BASE_DATE: today,
    ...(options?.WH_CD && { WH_CD: options.WH_CD }),
    ...(options?.PROD_CD && { PROD_CD: options.PROD_CD }),
    ...(options?.ZERO_FLAG && { ZERO_FLAG: options.ZERO_FLAG }),
    ...(options?.BAL_FLAG && { BAL_FLAG: options.BAL_FLAG }),
  };
  try {
    const data = await apiCall(env, "/OAPI/V2/InventoryBalance/GetListInventoryBalanceStatus", params);
    const items: InventoryBalanceItem[] = data.Data?.Result || data.Data?.Datas || data.Data || [];
    return { items: Array.isArray(items) ? items : [], totalCount: data.Data?.TotalCnt || items.length };
  } catch (e: any) {
    const msg = e.message || "";
    if (msg.includes("Not Found") || msg.includes("인증되지 않은")) {
      console.warn("[ERP] GetListInventoryBalanceStatus API 미인증:", msg);
      return { items: [], totalCount: 0, error: "재고현황 API가 아직 인증되지 않았습니다. 이카운트 OAPI 관리 페이지에서 API 인증을 완료해주세요." };
    }
    throw e;
  }
}

// ─── 재고현황 조회 (단건) ───
// 공식 엔드포인트: /OAPI/V2/InventoryBalance/ViewInventoryBalanceStatus

export async function getInventoryItem(
  env: Env,
  prodCode: string,
  baseDate?: string
): Promise<InventoryBalanceItem | null> {
  const today = baseDate || new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const data = await apiCall(env, "/OAPI/V2/InventoryBalance/ViewInventoryBalanceStatus", {
    PROD_CD: prodCode,
    BASE_DATE: today,
  });

  const item = data.Data?.Result?.[0] || data.Data?.Datas?.[0] || data.Data || null;
  return item;
}

// ─── 창고별 재고현황 조회 (목록) ───
// 공식 엔드포인트: /OAPI/V2/InventoryBalance/GetListInventoryBalanceStatusByLocation

export async function getInventoryByWarehouse(
  env: Env,
  baseDate?: string
): Promise<{ items: InventoryBalanceItem[]; totalCount: number }> {
  const today = baseDate || new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const data = await apiCall(env, "/OAPI/V2/InventoryBalance/GetListInventoryBalanceStatusByLocation", {
    BASE_DATE: today,
  });

  const items: InventoryBalanceItem[] = data.Data?.Result || data.Data?.Datas || data.Data || [];
  return { items: Array.isArray(items) ? items : [], totalCount: data.Data?.TotalCnt || items.length };
}

// ─── 창고별 재고현황 조회 (단건) ───
// 공식 엔드포인트: /OAPI/V2/InventoryBalance/ViewInventoryBalanceStatusByLocation

export async function getInventoryByWarehouseItem(
  env: Env,
  prodCode: string,
  baseDate?: string
): Promise<InventoryBalanceItem | null> {
  const today = baseDate || new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const data = await apiCall(env, "/OAPI/V2/InventoryBalance/ViewInventoryBalanceStatusByLocation", {
    PROD_CD: prodCode,
    BASE_DATE: today,
  });

  const item = data.Data?.Result?.[0] || data.Data?.Datas?.[0] || data.Data || null;
  return item;
}

// ─── 품목 조회 (목록) ───
// 공식 엔드포인트: /OAPI/V2/InventoryBasic/GetBasicProductsList

export async function getProducts(
  env: Env,
  pageNum = 1,
  perPage = 1000
): Promise<{ items: ProductItem[]; totalCount: number }> {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const data = await apiCall(env, "/OAPI/V2/InventoryBasic/GetBasicProductsList", {
    BASE_DATE: today,
    PAGE_NUM: String(pageNum),
    PER_PAGE_NUM: String(perPage),
  });

  // 실제 응답: Data.Result 배열, Data.TotalCnt
  const items: ProductItem[] = data.Data?.Result || data.Data?.Datas || [];
  const totalCount = data.Data?.TotalCnt || items.length;
  return { items: Array.isArray(items) ? items : [], totalCount };
}

// ─── 품목 조회 (단건) ───
// 공식 엔드포인트: /OAPI/V2/InventoryBasic/ViewBasicProduct

export async function getProductItem(
  env: Env,
  prodCode: string
): Promise<ProductItem | null> {
  const data = await apiCall(env, "/OAPI/V2/InventoryBasic/ViewBasicProduct", {
    PROD_CD: prodCode,
  });

  const item = data.Data?.Datas?.[0] || data.Data || null;
  return item;
}

// ─── 품목 등록 ───
// 공식 엔드포인트: /OAPI/V2/InventoryBasic/SaveBasicProduct

export async function saveProduct(
  env: Env,
  product: {
    PROD_CD: string;
    PROD_DES: string;
    UNIT?: string;
    PRICE?: string;
  }
): Promise<any> {
  return apiCall(env, "/OAPI/V2/InventoryBasic/SaveBasicProduct", product);
}

// ─── 판매 입력 ───
// 공식 엔드포인트: /OAPI/V2/Sale/SaveSale

export async function saveSale(
  env: Env,
  sale: {
    SaleList: Array<{
      IO_DATE: string;
      CUST_CD: string;
      PROD_CD: string;
      QTY: string;
      PRICE: string;
      WH_CD?: string;
      REMARKS?: string;
    }>;
  }
): Promise<any> {
  return apiCall(env, "/OAPI/V2/Sale/SaveSale", sale);
}

// ─── 발주서 조회 ───
// 공식 엔드포인트: /OAPI/V2/Purchases/GetPurchasesOrderList

export async function getPurchaseOrders(
  env: Env,
  dateFrom: string,
  dateTo: string
): Promise<{ items: any[]; totalCount: number }> {
  const data = await apiCall(env, "/OAPI/V2/Purchases/GetPurchasesOrderList", {
    FROM_DATE: dateFrom,
    TO_DATE: dateTo,
    LAN_TYPE: "ko-KR",
    CUST: "",
    PROD_CD: "",
  });

  const items = data.Data?.Result || data.Data?.Datas || data.Data || [];
  return { items: Array.isArray(items) ? items : [], totalCount: data.Data?.TotalCnt || items.length };
}

// ─── 견적서 입력 ───
// 공식 엔드포인트: /OAPI/V2/Quotation/SaveQuotation

export async function saveQuotation(
  env: Env,
  quotation: Record<string, any>
): Promise<any> {
  return apiCall(env, "/OAPI/V2/Quotation/SaveQuotation", quotation);
}

// ─── 주문서 입력 ───
// 공식 엔드포인트: /OAPI/V2/SaleOrder/SaveSaleOrder

export async function saveSaleOrder(
  env: Env,
  order: Record<string, any>
): Promise<any> {
  return apiCall(env, "/OAPI/V2/SaleOrder/SaveSaleOrder", order);
}

// ─── 구매 입력 ───
// 공식 엔드포인트: /OAPI/V2/Purchases/SavePurchases

export async function savePurchase(
  env: Env,
  purchase: Record<string, any>
): Promise<any> {
  return apiCall(env, "/OAPI/V2/Purchases/SavePurchases", purchase);
}

// ─── 거래처 조회 (목록) ───
// 공식 엔드포인트: /OAPI/V2/AccountBasic/GetBasicCustList

export interface CustomerItem {
  CUST_CD: string;
  CUST_DES: string;
  BOSS_NAME?: string;
  BUSINESS_NO?: string;
  TEL_NO?: string;
  FAX_NO?: string;
  EMAIL?: string;
  ADDR?: string;
  UPTAE?: string;
  JONGMOK?: string;
  REMARK?: string;
  USE_YN?: string;
}

export async function getCustomers(
  env: Env,
  pageNum = 1,
  perPage = 1000
): Promise<{ items: CustomerItem[]; totalCount: number; error?: string }> {
  try {
    const data = await apiCall(env, "/OAPI/V2/AccountBasic/GetBasicCustList", {
      PAGE_NUM: String(pageNum),
      PER_PAGE_NUM: String(perPage),
    });

    const items: CustomerItem[] = data.Data?.Result || data.Data?.Datas || [];
    const totalCount = data.Data?.TotalCnt || items.length;
    return { items: Array.isArray(items) ? items : [], totalCount };
  } catch (e: any) {
    const msg = e.message || "";
    if (msg.includes("Not Found") || msg.includes("인증되지 않은")) {
      console.warn("[ERP] GetBasicCustList API 미인증:", msg);
      return { items: [], totalCount: 0, error: "거래처조회 API(GetBasicCustList)가 아직 인증되지 않았습니다. 이카운트 OAPI 관리 페이지에서 API 인증을 완료해주세요." };
    }
    throw e;
  }
}

// ─── 거래처 전체 조회 (페이지네이션 자동) ───

export async function getAllCustomers(
  env: Env
): Promise<{ items: CustomerItem[]; totalCount: number; error?: string }> {
  const allItems: CustomerItem[] = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const result = await getCustomers(env, page, perPage);
    if (result.error) return result;

    allItems.push(...result.items);

    // 전체 데이터를 다 가져왔으면 종료
    if (allItems.length >= result.totalCount || result.items.length < perPage) {
      return { items: allItems, totalCount: result.totalCount };
    }
    page++;

    // 안전장치: 최대 50페이지
    if (page > 50) break;
  }

  return { items: allItems, totalCount: allItems.length };
}

// ─── 거래처 등록 ───
// 공식 엔드포인트: /OAPI/V2/AccountBasic/SaveBasicCust

export async function saveCustomer(
  env: Env,
  customer: Record<string, any>
): Promise<any> {
  return apiCall(env, "/OAPI/V2/AccountBasic/SaveBasicCust", customer);
}

// ─── ERP 연동 상태 확인 ───

export function getERPStatus(env: Env): {
  configured: boolean;
  comCode: boolean;
  userId: boolean;
  apiKey: boolean;
} {
  return {
    configured: !!(env.ECOUNT_COM_CODE && env.ECOUNT_USER_ID && env.ECOUNT_API_CERT_KEY),
    comCode: !!env.ECOUNT_COM_CODE,
    userId: !!env.ECOUNT_USER_ID,
    apiKey: !!env.ECOUNT_API_CERT_KEY,
  };
}

// ─── 데이터 집계 유틸리티 ───

export function aggregateSales(items: SaleItem[]) {
  let totalAmount = 0;
  let totalVat = 0;
  let totalSupply = 0;
  const byCustomer: Record<string, { name: string; amount: number; count: number }> = {};
  const byProduct: Record<string, { name: string; amount: number; qty: number }> = {};
  const byDate: Record<string, { amount: number; count: number }> = {};

  for (const item of items) {
    const amt = parseFloat(item.TOTAL_AMT || "0");
    const supply = parseFloat(item.SUPPLY_AMT || "0");
    const vat = parseFloat(item.VAT_AMT || "0");
    const qty = parseFloat(item.QTY || "0");

    totalAmount += amt;
    totalSupply += supply;
    totalVat += vat;

    // 거래처별
    const custKey = item.CUST_CD || "unknown";
    if (!byCustomer[custKey]) byCustomer[custKey] = { name: item.CUST_DES || custKey, amount: 0, count: 0 };
    byCustomer[custKey].amount += amt;
    byCustomer[custKey].count++;

    // 품목별
    const prodKey = item.PROD_CD || "unknown";
    if (!byProduct[prodKey]) byProduct[prodKey] = { name: item.PROD_DES || prodKey, amount: 0, qty: 0 };
    byProduct[prodKey].amount += amt;
    byProduct[prodKey].qty += qty;

    // 일별
    const dateKey = item.IO_DATE || "unknown";
    if (!byDate[dateKey]) byDate[dateKey] = { amount: 0, count: 0 };
    byDate[dateKey].amount += amt;
    byDate[dateKey].count++;
  }

  // TOP 정렬
  const topCustomers = Object.entries(byCustomer)
    .map(([code, d]) => ({ code, ...d }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  const topProducts = Object.entries(byProduct)
    .map(([code, d]) => ({ code, ...d }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  const dailyTrend = Object.entries(byDate)
    .map(([date, d]) => ({ date, ...d }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    totalAmount,
    totalSupply,
    totalVat,
    totalCount: items.length,
    topCustomers,
    topProducts,
    dailyTrend,
  };
}

export function aggregatePurchases(items: PurchaseItem[]) {
  let totalAmount = 0;
  let totalSupply = 0;
  let totalVat = 0;
  const bySupplier: Record<string, { name: string; amount: number; count: number }> = {};
  const byProduct: Record<string, { name: string; amount: number; qty: number }> = {};

  for (const item of items) {
    const amt = parseFloat(item.TOTAL_AMT || "0");
    const supply = parseFloat(item.SUPPLY_AMT || "0");
    const vat = parseFloat(item.VAT_AMT || "0");
    const qty = parseFloat(item.QTY || "0");

    totalAmount += amt;
    totalSupply += supply;
    totalVat += vat;

    const custKey = item.CUST_CD || "unknown";
    if (!bySupplier[custKey]) bySupplier[custKey] = { name: item.CUST_DES || custKey, amount: 0, count: 0 };
    bySupplier[custKey].amount += amt;
    bySupplier[custKey].count++;

    const prodKey = item.PROD_CD || "unknown";
    if (!byProduct[prodKey]) byProduct[prodKey] = { name: item.PROD_DES || prodKey, amount: 0, qty: 0 };
    byProduct[prodKey].amount += amt;
    byProduct[prodKey].qty += qty;
  }

  const topSuppliers = Object.entries(bySupplier)
    .map(([code, d]) => ({ code, ...d }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  const topProducts = Object.entries(byProduct)
    .map(([code, d]) => ({ code, ...d }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  return {
    totalAmount,
    totalSupply,
    totalVat,
    totalCount: items.length,
    topSuppliers,
    topProducts,
  };
}
