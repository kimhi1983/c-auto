/**
 * KPROS ERP API Client Service
 * kpros.erns.co.kr 재고/품목/거래처/물류 데이터 연동
 */
import type { Env } from '../types';

const KPROS_BASE = 'http://kpros.erns.co.kr';
const KV_SESSION_KEY = 'kpros:session';
const KV_STOCK_KEY = 'kpros:stock_data';
const KV_COMPANIES_KEY = 'kpros:companies';
const SESSION_TTL = 60 * 25;  // 25분
const STOCK_CACHE_TTL = 60 * 30; // 30분
const MASTER_CACHE_TTL = 60 * 60; // 1시간 (마스터 데이터)
const LOGISTICS_CACHE_TTL = 60 * 30; // 30분 (물류 데이터)

export interface KprosStockItem {
  productIdx: number;
  warehouseIdx: number;
  productNm: string;
  warehouseNm: string;
  sumStockQty: number;
  pkgUnitNm: string;
  manuNmList: string | null;
  braNmList: string | null;
}

export interface KprosStockAggregated {
  items: KprosStockItem[];
  totalCount: number;
  totalQty: number;
  warehouses: { name: string; itemCount: number; totalQty: number }[];
  brands: { name: string; itemCount: number; totalQty: number }[];
  zeroStockCount: number;
  fetchedAt: string;
}

export function isKprosConfigured(env: Env): boolean {
  return !!(env.KPROS_USER_ID && env.KPROS_PASSWORD);
}

/**
 * KPROS 로그인 → userKey+userInfo 쿠키 문자열 반환
 */
async function loginKpros(env: Env): Promise<string> {
  const res = await fetch(`${KPROS_BASE}/login/doLogin.do`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `userId=${env.KPROS_USER_ID}&userPassword=${env.KPROS_PASSWORD}&userStatus=1`,
  });

  const body = await res.json() as any;
  if (body.result !== 'SUCCESS') {
    throw new Error('KPROS 로그인 실패: ' + (body.returnMessage || ''));
  }

  // Set-Cookie에서 userKey, userInfo 추출 (값에 base64 =+/ 포함)
  const allCookies = res.headers.getSetCookie();
  let userKey = '';
  let userInfo = '';

  for (const header of allCookies) {
    const keyMatch = header.match(/^userKey=([^;]+)/);
    const infoMatch = header.match(/^userInfo=([^;]+)/);
    if (keyMatch) userKey = keyMatch[1];
    if (infoMatch) userInfo = infoMatch[1];
  }

  // getSetCookie가 빈 배열이면 get('Set-Cookie') fallback
  if (!userKey || !userInfo) {
    const raw = res.headers.get('Set-Cookie') || '';
    const keyMatch = raw.match(/userKey=([^;]+)/);
    const infoMatch = raw.match(/userInfo=([^;]+)/);
    if (keyMatch) userKey = keyMatch[1];
    if (infoMatch) userInfo = infoMatch[1];
  }

  if (!userKey || !userInfo) {
    throw new Error('KPROS 로그인 성공했으나 인증 쿠키를 받지 못했습니다');
  }

  return `userKey=${userKey}; userInfo=${userInfo}`;
}

/**
 * KV 캐시된 세션 또는 새 로그인
 */
async function getSession(env: Env): Promise<string> {
  if (env.CACHE) {
    const cached = await env.CACHE.get(KV_SESSION_KEY);
    if (cached) return cached;
  }

  const sessionId = await loginKpros(env);

  if (env.CACHE) {
    await env.CACHE.put(KV_SESSION_KEY, sessionId, { expirationTtl: SESSION_TTL });
  }

  return sessionId;
}

/**
 * 세션 무효화 후 재로그인
 */
async function refreshSession(env: Env): Promise<string> {
  if (env.CACHE) {
    await env.CACHE.delete(KV_SESSION_KEY);
  }
  return getSession(env);
}

/**
 * KPROS 재고 목록 API 호출
 */
async function fetchStockPage(cookieStr: string, limit: number, offset: number): Promise<{ items: KprosStockItem[]; totalCount: number }> {
  const res = await fetch(`${KPROS_BASE}/stock/stockPagingList.do`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookieStr,
    },
    body: `limit=${limit}&offset=${offset}&searchSelect=&searchVal=&sortType=&sesUserAuth=ADMIN&manuBrandIdx=&status=&warehouseIdx=0`,
  });

  const data = await res.json() as any;

  if (data.result !== 'SUCCESS') {
    throw new Error('KPROS 재고 조회 실패: ' + (data.returnMessage || ''));
  }

  return {
    items: (data.returnData || []) as KprosStockItem[],
    totalCount: data.totalCount || 0,
  };
}

/**
 * 전체 재고 조회 (페이지네이션 처리)
 */
async function fetchAllStock(env: Env): Promise<KprosStockItem[]> {
  let cookieStr = await getSession(env);
  const LIMIT = 500;

  // 첫 번째 시도
  let result = await fetchStockPage(cookieStr, LIMIT, 0);

  // 세션 만료 체크: 데이터가 빈 경우 재로그인 시도
  if (result.items.length === 0 && result.totalCount === 0) {
    cookieStr = await refreshSession(env);
    result = await fetchStockPage(cookieStr, LIMIT, 0);
  }

  let allItems = [...result.items];

  // 500개 이상이면 추가 페이지 fetch
  while (allItems.length < result.totalCount) {
    const page = await fetchStockPage(cookieStr, LIMIT, allItems.length);
    allItems.push(...page.items);
    if (page.items.length === 0) break;
  }

  return allItems;
}

/**
 * 재고 데이터 집계
 */
function aggregateStock(items: KprosStockItem[]): KprosStockAggregated {
  const totalQty = items.reduce((sum, i) => sum + (i.sumStockQty || 0), 0);
  const zeroStockCount = items.filter(i => !i.sumStockQty || i.sumStockQty === 0).length;

  // 창고별 집계
  const whMap = new Map<string, { itemCount: number; totalQty: number }>();
  for (const item of items) {
    const name = item.warehouseNm || '미지정';
    const curr = whMap.get(name) || { itemCount: 0, totalQty: 0 };
    curr.itemCount++;
    curr.totalQty += item.sumStockQty || 0;
    whMap.set(name, curr);
  }
  const warehouses = Array.from(whMap.entries())
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.totalQty - a.totalQty);

  // 브랜드별 집계
  const brMap = new Map<string, { itemCount: number; totalQty: number }>();
  for (const item of items) {
    const name = item.braNmList || '미지정';
    const curr = brMap.get(name) || { itemCount: 0, totalQty: 0 };
    curr.itemCount++;
    curr.totalQty += item.sumStockQty || 0;
    brMap.set(name, curr);
  }
  const brands = Array.from(brMap.entries())
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.totalQty - a.totalQty);

  return {
    items,
    totalCount: items.length,
    totalQty,
    warehouses,
    brands,
    zeroStockCount,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * KPROS 재고 데이터 조회 (KV 캐시 포함)
 */
export async function getKprosStock(env: Env, forceRefresh = false): Promise<KprosStockAggregated> {
  // 캐시 확인
  if (!forceRefresh && env.CACHE) {
    const cached = await env.CACHE.get(KV_STOCK_KEY, 'json') as KprosStockAggregated | null;
    if (cached) return cached;
  }

  // 실시간 조회
  const items = await fetchAllStock(env);
  const aggregated = aggregateStock(items);

  // 캐시 저장
  if (env.CACHE) {
    await env.CACHE.put(KV_STOCK_KEY, JSON.stringify(aggregated), { expirationTtl: STOCK_CACHE_TTL });
  }

  return aggregated;
}

// ═══════════════════════════════════════════
// 거래처정보 조회
// ═══════════════════════════════════════════

export interface KprosCompany {
  companyIdx: number;
  companyCd: string;
  companyNm: string;
  ceoNm: string | null;
  bizNo: string | null;
  tel: string | null;
  fax: string | null;
  email: string | null;
  addr: string | null;
  memo: string | null;
  managerNm: string | null;
  managerTel: string | null;
  managerEmail: string | null;
  status: string | null;
}

async function fetchCompanyPage(cookieStr: string, limit: number, offset: number, search?: string): Promise<{ items: KprosCompany[]; totalCount: number }> {
  const res = await fetch(`${KPROS_BASE}/company/companyPagingList.do`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookieStr,
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': `${KPROS_BASE}/company/companyList.do?menu=basicInfo`,
    },
    body: `paging=Y&limit=${limit}&offset=${offset}&searchSelect=&searchVal=${encodeURIComponent(search || '')}&sellYn=&buyYn=&sortType=&availableYn=`,
  });

  const text = await res.text();

  // 빈 응답 → KPROS 서버 측 권한 제한 (에러 아닌 빈 결과 반환)
  if (!text) {
    console.warn('[KPROS Companies] 빈 응답 — 계정 권한 확인 필요');
    return { items: [], totalCount: 0 };
  }

  if (text.startsWith('<!') || text.startsWith('<html')) {
    throw new Error('KPROS 거래처 조회: 인증 실패 (HTML 응답)');
  }

  const data = JSON.parse(text);
  if (data.result !== 'SUCCESS') {
    throw new Error('KPROS 거래처 조회 실패: ' + (data.returnMessage || JSON.stringify(data)));
  }

  return {
    items: (data.returnData || []) as KprosCompany[],
    totalCount: data.totalCount || 0,
  };
}

export async function getKprosCompanies(env: Env, forceRefresh = false, search?: string): Promise<{ items: KprosCompany[]; totalCount: number; fetchedAt: string }> {
  if (!search && !forceRefresh && env.CACHE) {
    const cached = await env.CACHE.get(KV_COMPANIES_KEY, 'json') as { items: KprosCompany[]; totalCount: number; fetchedAt: string } | null;
    if (cached) return cached;
  }

  let cookieStr = await getSession(env);
  const LIMIT = 500;

  let result = await fetchCompanyPage(cookieStr, LIMIT, 0, search);

  if (result.items.length === 0 && result.totalCount === 0 && !search) {
    cookieStr = await refreshSession(env);
    result = await fetchCompanyPage(cookieStr, LIMIT, 0, search);
  }

  let allItems = [...result.items];
  while (allItems.length < result.totalCount) {
    const page = await fetchCompanyPage(cookieStr, LIMIT, allItems.length, search);
    allItems.push(...page.items);
    if (page.items.length === 0) break;
  }

  const data = { items: allItems, totalCount: allItems.length, fetchedAt: new Date().toISOString() };

  if (!search && env.CACHE) {
    await env.CACHE.put(KV_COMPANIES_KEY, JSON.stringify(data), { expirationTtl: MASTER_CACHE_TTL });
  }

  return data;
}

// ═══════════════════════════════════════════
// 제네릭 KPROS 페이지네이션 Fetcher
// ═══════════════════════════════════════════

interface KprosPaginatedResult<T> {
  items: T[];
  totalCount: number;
  fetchedAt: string;
}

/**
 * 모든 KPROS 페이지네이션 API를 하나의 함수로 처리
 */
async function fetchKprosPaginatedList<T>(
  env: Env,
  endpoint: string,
  cacheKey: string,
  cacheTTL: number,
  bodyParams?: string,
  forceRefresh = false,
): Promise<KprosPaginatedResult<T>> {
  // 캐시 확인
  if (!forceRefresh && env.CACHE) {
    const cached = await env.CACHE.get(cacheKey, 'json') as KprosPaginatedResult<T> | null;
    if (cached) return cached;
  }

  let cookieStr = await getSession(env);
  const LIMIT = 500;
  const baseBody = bodyParams
    ? `limit=${LIMIT}&offset=0&${bodyParams}`
    : `limit=${LIMIT}&offset=0&searchSelect=&searchVal=&sortType=`;

  // 첫 페이지 fetch
  let firstPage = await fetchKprosPage<T>(cookieStr, endpoint, baseBody);

  // 세션 만료 → 재로그인 시도
  if (firstPage.items.length === 0 && firstPage.totalCount === 0) {
    cookieStr = await refreshSession(env);
    firstPage = await fetchKprosPage<T>(cookieStr, endpoint, baseBody);
  }

  let allItems = [...firstPage.items];

  // 나머지 페이지 fetch
  while (allItems.length < firstPage.totalCount) {
    const body = bodyParams
      ? `limit=${LIMIT}&offset=${allItems.length}&${bodyParams}`
      : `limit=${LIMIT}&offset=${allItems.length}&searchSelect=&searchVal=&sortType=`;
    const page = await fetchKprosPage<T>(cookieStr, endpoint, body);
    allItems.push(...page.items);
    if (page.items.length === 0) break;
  }

  const result: KprosPaginatedResult<T> = {
    items: allItems,
    totalCount: allItems.length,
    fetchedAt: new Date().toISOString(),
  };

  // 캐시 저장
  if (env.CACHE) {
    await env.CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: cacheTTL });
  }

  return result;
}

/**
 * KPROS 단일 페이지 fetch 유틸리티
 */
async function fetchKprosPage<T>(
  cookieStr: string,
  endpoint: string,
  body: string,
): Promise<{ items: T[]; totalCount: number }> {
  const res = await fetch(`${KPROS_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookieStr,
      'X-Requested-With': 'XMLHttpRequest',
    },
    body,
  });

  const text = await res.text();
  if (!text || text.startsWith('<!') || text.startsWith('<html')) {
    return { items: [], totalCount: 0 };
  }

  const data = JSON.parse(text);
  if (data.result !== 'SUCCESS') {
    return { items: [], totalCount: 0 };
  }

  return {
    items: (data.returnData || []) as T[],
    totalCount: data.totalCount || 0,
  };
}

// ═══════════════════════════════════════════
// 물류 모듈 인터페이스 정의
// ═══════════════════════════════════════════

export interface KprosPurchaseItem {
  idx: number;
  productNm: string;
  braNm: string | null;
  companyNm: string | null;
  cost: number | null;
  incomeCost: number | null;
  incomeCostUnitNm: string | null;
  lotNo: string | null;
  purchaseDate: string | null;
  purchaseStatus: string | null;
  warehouseNm: string | null;
  totalPurchaseQty: number | null;
  pkgUnitNm: string | null;
  manuDate: string | null;
  validDate: string | null;
  expectWearingDate: string | null;
  realWearingDate: string | null;
  prchNo: string | null;
}

export interface KprosDeliveryItem {
  idx: number;
  companyFromNm: string | null;
  companyToNm: string | null;
  productNm: string;
  dueDate: string | null;
  deliveryStatus: string | null;
  deliveryStatusStr: string | null;
  deliveryBigo: string | null;
  warehouseNm: string | null;
  expectQty: number | null;
  realQty: number | null;
  lotNo: string | null;
  dvrNo: string | null;
  orderDate: string | null;
  orderMethod: string | null;
  pkgUnitNm: string | null;
}

export interface KprosInboundItem {
  idx: number;
  purchaseIdx: number | null;
  productNm: string;
  braNm: string | null;
  companyNm: string | null;
  warehouseNm: string | null;
  totalPurchaseQty: number | null;
  lotNo: string | null;
  purchaseDate: string | null;
  purchaseStatus: string | null;
  expectWearingDate: string | null;
  realWearingDate: string | null;
}

export interface KprosOutboundItem {
  idx: number;
  deliveryIdx: number | null;
  companyToNm: string | null;
  productNm: string;
  warehouseNm: string | null;
  expectQty: number | null;
  realQty: number | null;
  lotNo: string | null;
  dueDate: string | null;
  deliveryStatus: string | null;
}

export interface KprosWarehouseInItem {
  idx: number;
  productNm: string;
  braNm: string | null;
  warehouseNm: string | null;
  companyNm: string | null;
  totalPurchaseQty: number | null;
  lotNo: string | null;
  purchaseDate: string | null;
  realWearingDate: string | null;
  purchaseStatus: string | null;
}

export interface KprosWarehouseOutItem {
  idx: number;
  companyToNm: string | null;
  productNm: string;
  warehouseNm: string | null;
  expectQty: number | null;
  realQty: number | null;
  lotNo: string | null;
  dueDate: string | null;
  deliveryStatus: string | null;
  dvrNo: string | null;
}

export interface KprosCoaItem {
  productIdx: number | null;
  productNm: string;
  warehouseNm: string | null;
  lotNo: string | null;
  companyNm: string | null;
  manuDate: string | null;
  validDate: string | null;
  braNm: string | null;
  reportsExist: number | null;
  pkgAmount: number | null;
  pkgUnitNm: string | null;
  totalAmount: number | null;
}

// ═══════════════════════════════════════════
// 물류 모듈별 데이터 조회 함수
// ═══════════════════════════════════════════

/** 매입등록 목록 조회 */
export async function getKprosPurchases(
  env: Env, forceRefresh = false,
): Promise<KprosPaginatedResult<KprosPurchaseItem>> {
  return fetchKprosPaginatedList<KprosPurchaseItem>(
    env,
    '/purchase/purchasePagingList.do',
    'kpros:purchases',
    LOGISTICS_CACHE_TTL,
    'searchSelect=&searchVal=&sortType=&sesUserAuth=ADMIN',
    forceRefresh,
  );
}

/** 납품등록 목록 조회 */
export async function getKprosDeliveries(
  env: Env, forceRefresh = false,
): Promise<KprosPaginatedResult<KprosDeliveryItem>> {
  return fetchKprosPaginatedList<KprosDeliveryItem>(
    env,
    '/delivery/deliveryPagingList.do',
    'kpros:deliveries',
    LOGISTICS_CACHE_TTL,
    'searchSelect=&searchVal=&sortType=&sesUserAuth=ADMIN',
    forceRefresh,
  );
}

/** 입고반영 목록 조회 */
export async function getKprosInbound(
  env: Env, forceRefresh = false,
): Promise<KprosPaginatedResult<KprosInboundItem>> {
  return fetchKprosPaginatedList<KprosInboundItem>(
    env,
    '/purchase/wearingApplyPagingList.do',
    'kpros:inbound',
    LOGISTICS_CACHE_TTL,
    'searchSelect=&searchVal=&sortType=&sesUserAuth=ADMIN',
    forceRefresh,
  );
}

/** 출고반영 목록 조회 */
export async function getKprosOutbound(
  env: Env, forceRefresh = false,
): Promise<KprosPaginatedResult<KprosOutboundItem>> {
  return fetchKprosPaginatedList<KprosOutboundItem>(
    env,
    '/delivery/releaseApplyPagingList.do',
    'kpros:outbound',
    LOGISTICS_CACHE_TTL,
    'searchSelect=&searchVal=&sortType=&sesUserAuth=ADMIN',
    forceRefresh,
  );
}

/** 창고입고 목록 조회 */
export async function getKprosWarehouseIn(
  env: Env, forceRefresh = false,
): Promise<KprosPaginatedResult<KprosWarehouseInItem>> {
  return fetchKprosPaginatedList<KprosWarehouseInItem>(
    env,
    '/warehouse/wearingPagingList.do',
    'kpros:warehouse_in',
    LOGISTICS_CACHE_TTL,
    'searchSelect=&searchVal=&sortType=&sesUserAuth=ADMIN&warehouseIdx=0',
    forceRefresh,
  );
}

/** 창고출고 목록 조회 */
export async function getKprosWarehouseOut(
  env: Env, forceRefresh = false,
): Promise<KprosPaginatedResult<KprosWarehouseOutItem>> {
  return fetchKprosPaginatedList<KprosWarehouseOutItem>(
    env,
    '/delivery/releasePagingList.do',
    'kpros:warehouse_out',
    LOGISTICS_CACHE_TTL,
    'searchSelect=&searchVal=&sortType=&sesUserAuth=ADMIN',
    forceRefresh,
  );
}

/** 성적서(CoA) 목록 조회 */
export async function getKprosCoa(
  env: Env, forceRefresh = false,
): Promise<KprosPaginatedResult<KprosCoaItem>> {
  return fetchKprosPaginatedList<KprosCoaItem>(
    env,
    '/product/reportListLoad.do',
    'kpros:coa',
    MASTER_CACHE_TTL,
    'paging=Y&searchSelect=&searchVal=&sortType=',
    forceRefresh,
  );
}
