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
    // 응답 본문을 먼저 읽어서 상세 에러 확인
    let bodyText = "";
    try { bodyText = await res.text(); } catch { /* ignore */ }

    // 401/403/404/500 모두 세션 만료 가능 — 재시도
    if ((res.status === 401 || res.status === 403 || res.status === 404 || res.status === 500) && retry) {
      console.warn("[Ecount] HTTP " + res.status + " on " + endpoint + " — 세션 갱신 후 재시도. body: " + bodyText.slice(0, 200));
      await refreshSession(env);
      return apiCall(env, endpoint, params, false);
    }
    throw new Error("이카운트 API 호출 실패 (" + res.status + "): " + endpoint + " — " + bodyText.slice(0, 200));
  }

  const data = (await res.json()) as EcountResponse;

  // 세션 만료 / "Please login" 에러 시 재로그인
  if (String(data.Status) !== "200" && retry) {
    const errorMsg = data.Error?.Message || data.Errors?.[0]?.Message || "";
    const errorCode = data.Error?.Code;
    if (
      errorCode === "-1" ||
      errorCode === "SESSION_EXPIRED" ||
      errorMsg === "Please login." ||
      errorMsg.includes("login")
    ) {
      console.warn("[Ecount] 세션 만료 감지 — 재로그인: " + errorMsg);
      await refreshSession(env);
      return apiCall(env, endpoint, params, false);
    }
  }

  // 인증되지 않은 API 에러
  if (String(data.Status) !== "200") {
    const errorMsg = data.Error?.Message || data.Errors?.[0]?.Message || "Unknown error";
    console.error("[Ecount] API 오류 응답:", JSON.stringify(data).slice(0, 500));
    throw new Error("이카운트 API 오류: " + errorMsg + " (" + endpoint + ")");
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
): Promise<{ items: ProductItem[]; totalCount: number; error?: string }> {
  try {
    // 품목 마스터 조회 — BASE_DATE 불필요 (GetBasicCustList와 동일 패턴)
    const data = await apiCall(env, "/OAPI/V2/InventoryBasic/GetBasicProductsList", {
      PAGE_NUM: String(pageNum),
      PER_PAGE_NUM: String(perPage),
    });

    const items: ProductItem[] = data.Data?.Result || data.Data?.Datas || [];
    const totalCount = data.Data?.TotalCnt || items.length;
    return { items: Array.isArray(items) ? items : [], totalCount };
  } catch (e: any) {
    const msg = e.message || "";
    if (msg.includes("Not Found") || msg.includes("인증되지 않은")) {
      console.warn("[ERP] GetBasicProductsList API 미인증:", msg);
      return { items: [], totalCount: 0, error: "품목조회 API(GetBasicProductsList)가 아직 인증되지 않았습니다. 이카운트 OAPI 관리 페이지에서 API 인증을 완료해주세요." };
    }
    throw e;
  }
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
// ProductList → BulkDatas: PROD_CD(필수), PROD_DES(필수), SIZE_FLAG, SIZE_DES, UNIT, PROD_TYPE, SET_FLAG, BAL_FLAG, WH_CD, IN_PRICE, OUT_PRICE, REMARKS_WIN

export async function saveProduct(
  env: Env,
  product: {
    ProductList: Array<{
      BulkDatas: Record<string, string>;
      Line: string;
    }>;
  }
): Promise<any> {
  return apiCall(env, "/OAPI/V2/InventoryBasic/SaveBasicProduct", product);
}

// ─── 판매 입력 ───
// 공식 엔드포인트: /OAPI/V2/Sale/SaveSale
// BulkDatas 필드: UPLOAD_SER_NO(순번,필수), IO_DATE, CUST(거래처코드), CUST_DES, WH_CD, PROD_CD, QTY, PRICE ...

export async function saveSale(
  env: Env,
  sale: {
    SaleList: Array<{
      BulkDatas: Record<string, string>;
      Line: string;
    }>;
  }
): Promise<any> {
  return apiCall(env, "/OAPI/V2/Sale/SaveSale", sale);
}

// ─── 발주서 조회 ───
// 공식 엔드포인트: /OAPI/V2/Purchases/GetPurchasesOrderList
// Params: PROD_CD, CUST_CD, ListParam: { BASE_DATE_FROM, BASE_DATE_TO, PAGE_CURRENT }

export async function getPurchaseOrders(
  env: Env,
  dateFrom: string,
  dateTo: string,
  options?: { CUST_CD?: string; PROD_CD?: string }
): Promise<{ items: any[]; totalCount: number }> {
  const data = await apiCall(env, "/OAPI/V2/Purchases/GetPurchasesOrderList", {
    PROD_CD: options?.PROD_CD || "",
    CUST_CD: options?.CUST_CD || "",
    ListParam: {
      BASE_DATE_FROM: dateFrom,
      BASE_DATE_TO: dateTo,
    },
  });

  const items = data.Data?.Result || data.Data?.Datas || data.Data || [];
  return { items: Array.isArray(items) ? items : [], totalCount: data.Data?.TotalCnt || items.length };
}

// ─── 견적서 입력 ───
// 공식 엔드포인트: /OAPI/V2/Quotation/SaveQuotation
// QuotationList → BulkDatas: UPLOAD_SER_NO, IO_DATE, CUST, CUST_DES, PROD_CD, QTY, PRICE ...

export async function saveQuotation(
  env: Env,
  quotation: {
    QuotationList: Array<{
      BulkDatas: Record<string, string>;
      Line: string;
    }>;
  }
): Promise<any> {
  return apiCall(env, "/OAPI/V2/Quotation/SaveQuotation", quotation);
}

// ─── 주문서 입력 ───
// 공식 엔드포인트: /OAPI/V2/SaleOrder/SaveSaleOrder
// SaleOrderList → BulkDatas: UPLOAD_SER_NO(필수), IO_DATE, CUST(거래처코드,필수), CUST_DES, EMP_CD, PROD_CD, QTY, PRICE ...

export async function saveSaleOrder(
  env: Env,
  order: {
    SaleOrderList: Array<{
      BulkDatas: Record<string, string>;
      Line: string;
    }>;
  }
): Promise<any> {
  return apiCall(env, "/OAPI/V2/SaleOrder/SaveSaleOrder", order);
}

// ─── 구매 입력 ───
// 공식 엔드포인트: /OAPI/V2/Purchases/SavePurchases
// PurchasesList → BulkDatas: UPLOAD_SER_NO(필수), IO_DATE, CUST(거래처코드), CUST_DES, PROD_CD, QTY, PRICE, WH_CD ...

export async function savePurchase(
  env: Env,
  purchase: {
    PurchasesList: Array<{
      BulkDatas: Record<string, string>;
      Line: string;
    }>;
  }
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
// CustList → BulkDatas: BUSINESS_NO(=ERP거래처코드, 사업자번호10자리, 필수), CUST_NAME(필수), BOSS_NAME, UPTAE, JONGMOK, TEL, EMAIL, POST_NO, ADDR, G_GUBUN, FAX

export async function saveCustomer(
  env: Env,
  customer: {
    CustList: Array<{
      BulkDatas: Record<string, string>;
      Line: string;
    }>;
  }
): Promise<any> {
  return apiCall(env, "/OAPI/V2/AccountBasic/SaveBasicCust", customer);
}

// ─── 생산관리: 작업지시서 입력 ───
// 공식 엔드포인트: /OAPI/V2/JobOrder/SaveJobOrder

export async function saveJobOrder(
  env: Env,
  jobOrder: {
    JobOrderList: Array<{
      BulkDatas: Record<string, string>;
      Line: string;
    }>;
  }
): Promise<any> {
  return apiCall(env, "/OAPI/V2/JobOrder/SaveJobOrder", jobOrder);
}

// ─── 생산관리: 생산불출 입력 ───
// 공식 엔드포인트: /OAPI/V2/GoodsIssued/SaveGoodsIssued

export async function saveGoodsIssued(
  env: Env,
  goodsIssued: {
    GoodsIssuedList: Array<{
      BulkDatas: Record<string, string>;
      Line: string;
    }>;
  }
): Promise<any> {
  return apiCall(env, "/OAPI/V2/GoodsIssued/SaveGoodsIssued", goodsIssued);
}

// ─── 생산관리: 생산입고 입력 ───
// 공식 엔드포인트: /OAPI/V2/GoodsReceipt/SaveGoodsReceipt

export async function saveGoodsReceipt(
  env: Env,
  goodsReceipt: {
    GoodsReceiptList: Array<{
      BulkDatas: Record<string, string>;
      Line: string;
    }>;
  }
): Promise<any> {
  return apiCall(env, "/OAPI/V2/GoodsReceipt/SaveGoodsReceipt", goodsReceipt);
}

// ─── 회계: 매출·매입전표 II 자동분개 ───
// 공식 엔드포인트: /OAPI/V2/InvoiceAuto/SaveInvoiceAuto

export async function saveInvoiceAuto(
  env: Env,
  invoice: Record<string, any>
): Promise<any> {
  return apiCall(env, "/OAPI/V2/InvoiceAuto/SaveInvoiceAuto", invoice);
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

// ─── 창고코드 변환 (이름 → 이카운트 5자리 코드) ───

const KV_WAREHOUSE_KEY = "ecount:warehouses";

// 하드코딩 창고 목록 (InventoryBalance API 미인증 시 폴백)
const FALLBACK_WAREHOUSES: Array<{ code: string; name: string }> = [
  { code: '00001', name: '신도물산' },
  { code: '00002', name: '에코트레이딩' },
  { code: '00003', name: '에코트레이딩 부산' },
  { code: '00004', name: '케이프로스 부산' },
  { code: '00005', name: '케이프로스창고' },
  { code: '00006', name: '삼성물류' },
  { code: '00007', name: '카이코스텍' },
  { code: '00008', name: '카이코스텍 창고' },
  { code: '00009', name: '파워로직스' },
  { code: '00010', name: '웰라이즈창고' },
  { code: '00011', name: '웰라이즈 부산' },
  { code: '00012', name: '아이앤씨' },
  { code: '00013', name: '한국유통' },
  { code: '00014', name: '세계로물류' },
  { code: '00015', name: '동성물류' },
  { code: '00016', name: '케이프로스 광주' },
  { code: '00017', name: '물류센터1' },
  { code: '00018', name: '물류센터2' },
  { code: '00019', name: '에스엠물류' },
  { code: '00020', name: '창고20' },
  { code: '00021', name: '풍년물류' },
  { code: '00022', name: '만석물류' },
  { code: '00023', name: '우리물류' },
  { code: '00024', name: '대한통운' },
  { code: '00025', name: '한진택배창고' },
  { code: '00026', name: '로젠물류' },
  { code: '00027', name: '창고27' },
  { code: '00028', name: '창고28' },
  { code: '00029', name: '창고29' },
  { code: '00030', name: '창고30' },
  { code: '00031', name: '창고31' },
  { code: '100', name: '와이에스물류창고' },
];

export async function getWarehouseList(env: Env): Promise<Array<{ code: string; name: string }>> {
  // KV 캐시 확인 (1시간)
  if (env.CACHE) {
    const cached = await env.CACHE.get(KV_WAREHOUSE_KEY);
    if (cached) return JSON.parse(cached);
  }

  try {
    const result = await getInventoryByWarehouse(env);
    const whMap = new Map<string, string>();
    for (const item of result.items) {
      const whCd = (item as any).WH_CD || '';
      const whDes = (item as any).WH_DES || whCd;
      if (whCd) whMap.set(whCd, whDes);
    }
    const list = Array.from(whMap.entries()).map(([code, name]) => ({ code, name }));

    if (list.length > 0) {
      if (env.CACHE) {
        await env.CACHE.put(KV_WAREHOUSE_KEY, JSON.stringify(list), { expirationTtl: 3600 });
      }
      return list;
    }
  } catch (e: any) {
    console.warn('[Ecount] 창고 목록 API 실패, 폴백 사용:', e.message);
  }

  // API 실패 또는 빈 결과 → 하드코딩 폴백
  return FALLBACK_WAREHOUSES;
}

/**
 * 창고 이름/코드를 이카운트 WH_CD(5자리)로 변환
 * - 이미 5자리 코드면 그대로 반환
 * - 이름이면 이카운트 창고 목록에서 매칭
 */
export async function resolveWarehouseCode(env: Env, whInput: string): Promise<string> {
  if (!whInput) return '';
  // 이미 5자리 이내 숫자코드면 그대로
  if (/^\d{1,5}$/.test(whInput)) return whInput;

  const list = await getWarehouseList(env);
  const clean = whInput.replace(/[()（）㈜㈱주식회사]/g, '').trim().toLowerCase();

  // 1) 정확한 이름 매칭
  for (const wh of list) {
    if (wh.name === whInput || wh.name.toLowerCase() === clean) return wh.code;
  }
  // 2) 부분 매칭 (이름에 포함)
  for (const wh of list) {
    const whClean = wh.name.toLowerCase();
    if (whClean.includes(clean) || clean.includes(whClean)) return wh.code;
  }
  // 매칭 실패 — 기본 창고(케이프로스창고) 반환
  return '00005';
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
