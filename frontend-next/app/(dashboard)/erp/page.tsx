'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiUrl, authHeaders } from '@/lib/api';

// ─── Types ───

interface ERPStatus {
  erp_connected: boolean;
  credentials: { com_code: boolean; user_id: boolean; api_key: boolean };
  message: string;
}

interface ProductItem {
  PROD_CD: string;
  PROD_DES: string;
  PROD_DES2?: string;
  UNIT?: string;
  PRICE?: string;
  COST?: string;
  CLASS_CD?: string;
  CLASS_DES?: string;
  USE_YN?: string;
}

interface InventoryItem {
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

interface SalesSummary {
  total_amount: number;
  total_supply: number;
  total_vat: number;
  total_count: number;
}

interface CustomerItem {
  code: string;
  name: string;
  amount: number;
  count: number;
}

interface ProductRankItem {
  code: string;
  name: string;
  amount: number;
  qty: number;
}

interface DailyTrend {
  date: string;
  amount: number;
  count: number;
}

interface SalesData {
  period: { from: string; to: string };
  summary: SalesSummary;
  top_customers: CustomerItem[];
  top_products: ProductRankItem[];
  daily_trend: DailyTrend[];
  items: any[];
  api_error?: string | null;
}

interface PurchasesData {
  period: { from: string; to: string };
  summary: SalesSummary;
  top_suppliers: CustomerItem[];
  top_products: ProductRankItem[];
  items: any[];
  api_error?: string | null;
}

interface ERPReport {
  title: string;
  type: string;
  type_label: string;
  period: string;
  from: string;
  to: string;
  generated_at: string;
  overview: {
    sales_amount: number;
    sales_supply: number;
    sales_count: number;
    purchase_amount: number;
    purchase_supply: number;
    purchase_count: number;
    gross_profit: number;
    profit_rate: number;
  };
  sales: {
    top_customers: CustomerItem[];
    top_products: ProductRankItem[];
    daily_trend: DailyTrend[];
    items: any[];
  };
  purchases: {
    top_suppliers: CustomerItem[];
    top_products: ProductRankItem[];
    items: any[];
  };
  ai_insight: string;
}

// ─── Helpers ───

function formatKRW(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(0)}만`;
  return n.toLocaleString();
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function todayYMD(): string {
  return new Date().toISOString().split('T')[0].replace(/-/g, '');
}

function monthAgoYMD(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().split('T')[0].replace(/-/g, '');
}

function weekAgoYMD(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().split('T')[0].replace(/-/g, '');
}

// ─── Component ───

type TabKey = 'products' | 'inventory' | 'sales' | 'purchases' | 'report';

export default function ERPPage() {
  const [erpStatus, setErpStatus] = useState<ERPStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusChecked, setStatusChecked] = useState(false);

  const [activeTab, setActiveTab] = useState<TabKey>('products');

  // 기간 선택
  const [dateFrom, setDateFrom] = useState(monthAgoYMD());
  const [dateTo, setDateTo] = useState(todayYMD());

  // 품목 데이터
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [productsTotalCount, setProductsTotalCount] = useState(0);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productSearch, setProductSearch] = useState('');

  // 재고 데이터
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventorySearch, setInventorySearch] = useState('');

  // 판매/구매 데이터
  const [salesData, setSalesData] = useState<SalesData | null>(null);
  const [purchasesData, setPurchasesData] = useState<PurchasesData | null>(null);
  const [salesLoading, setSalesLoading] = useState(false);
  const [purchasesLoading, setPurchasesLoading] = useState(false);

  // AI 보고서
  const [report, setReport] = useState<ERPReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportType, setReportType] = useState<'daily' | 'weekly' | 'monthly'>('monthly');

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ─── ERP 상태 확인 ───
  const checkStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const res = await fetch(apiUrl('/api/v1/erp/status'), { headers: authHeaders() });
      const json = await res.json();
      setErpStatus(json.data);
    } catch {
      setErpStatus({ erp_connected: false, credentials: { com_code: false, user_id: false, api_key: false }, message: '상태 확인 실패' });
    } finally {
      setStatusLoading(false);
      setStatusChecked(true);
    }
  }, []);

  // ─── 품목 조회 ───
  const fetchProducts = useCallback(async () => {
    setProductsLoading(true);
    setErrorMsg(null);
    try {
      // 전체 품목 조회 (최대 1000개)
      const res = await fetch(apiUrl('/api/v1/erp/products'), { headers: authHeaders() });
      const json = await res.json();
      if (json.status === 'success') {
        setProducts(json.data.items || []);
        setProductsTotalCount(json.data.total_count || 0);
      } else {
        setErrorMsg(json.message || '품목 조회 실패');
      }
    } catch {
      setErrorMsg('품목 조회 중 오류가 발생했습니다');
    } finally {
      setProductsLoading(false);
    }
  }, []);

  // ─── 재고현황 조회 ───
  const [inventoryApiError, setInventoryApiError] = useState<string | null>(null);
  const fetchInventory = useCallback(async () => {
    setInventoryLoading(true);
    setErrorMsg(null);
    setInventoryApiError(null);
    try {
      const res = await fetch(apiUrl('/api/v1/erp/inventory'), { headers: authHeaders() });
      const json = await res.json();
      if (json.status === 'success') {
        setInventoryItems(json.data.items || []);
        if (json.data.api_error) {
          setInventoryApiError(json.data.api_error);
        }
      } else {
        setErrorMsg(json.message || '재고현황 조회 실패');
      }
    } catch {
      setErrorMsg('재고현황 조회 중 오류가 발생했습니다');
    } finally {
      setInventoryLoading(false);
    }
  }, []);

  // ─── 판매 조회 ───
  const fetchSales = useCallback(async () => {
    setSalesLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(apiUrl(`/api/v1/erp/sales?from=${dateFrom}&to=${dateTo}`), { headers: authHeaders() });
      const json = await res.json();
      if (json.status === 'success') {
        setSalesData(json.data);
      } else {
        setErrorMsg(json.message || '판매 조회 실패');
      }
    } catch {
      setErrorMsg('판매 조회 중 오류가 발생했습니다');
    } finally {
      setSalesLoading(false);
    }
  }, [dateFrom, dateTo]);

  // ─── 구매 조회 ───
  const fetchPurchases = useCallback(async () => {
    setPurchasesLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(apiUrl(`/api/v1/erp/purchases?from=${dateFrom}&to=${dateTo}`), { headers: authHeaders() });
      const json = await res.json();
      if (json.status === 'success') {
        setPurchasesData(json.data);
      } else {
        setErrorMsg(json.message || '구매 조회 실패');
      }
    } catch {
      setErrorMsg('구매 조회 중 오류가 발생했습니다');
    } finally {
      setPurchasesLoading(false);
    }
  }, [dateFrom, dateTo]);

  // ─── AI 보고서 생성 ───
  const generateReport = useCallback(async () => {
    setReportLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(apiUrl(`/api/v1/erp/generate-report?type=${reportType}`), {
        method: 'POST',
        headers: authHeaders(),
      });
      const json = await res.json();
      if (json.status === 'success') {
        setReport(json.data);
        setActiveTab('report');
      } else {
        setErrorMsg(json.message || '보고서 생성 실패');
      }
    } catch {
      setErrorMsg('보고서 생성 중 오류가 발생했습니다');
    } finally {
      setReportLoading(false);
    }
  }, [reportType]);

  // ─── 엑셀 다운로드 ───
  const downloadExcel = useCallback(async () => {
    if (!report) return;
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();

      const summaryRows = [
        ['KPROS ERP 보고서', '', '', ''],
        ['보고서 유형', report.type_label],
        ['기간', report.period],
        ['생성일시', new Date(report.generated_at).toLocaleString('ko-KR')],
        [],
        ['구분', '금액', '건수'],
        ['매출 (공급가)', report.overview.sales_supply, report.overview.sales_count],
        ['매입 (공급가)', report.overview.purchase_supply, report.overview.purchase_count],
        ['매출총이익', report.overview.gross_profit, ''],
        ['이익률', `${report.overview.profit_rate}%`, ''],
        [],
        ['AI 분석'],
        [report.ai_insight],
      ];
      const ws1 = XLSX.utils.aoa_to_sheet(summaryRows);
      ws1['!cols'] = [{ wch: 10 }, { wch: 25 }, { wch: 18 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, ws1, '리포트 요약');

      if (report.sales.items.length > 0) {
        const saleHeaders = ['날짜', '판매처코드', '판매처', '품목코드', '품목', '수량', '단가', '공급가', '부가세', '합계'];
        const saleRows = report.sales.items.map((item: any) => [
          item.IO_DATE, item.CUST_CD, item.CUST_DES, item.PROD_CD, item.PROD_DES,
          item.QTY, item.PRICE, item.SUPPLY_AMT, item.VAT_AMT, item.TOTAL_AMT,
        ]);
        const ws2 = XLSX.utils.aoa_to_sheet([saleHeaders, ...saleRows]);
        ws2['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 12 }, { wch: 20 }, { wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 14 }];
        XLSX.utils.book_append_sheet(wb, ws2, '판매 상세');
      }

      if (report.purchases.items.length > 0) {
        const purHeaders = ['날짜', '공급사코드', '공급사', '품목코드', '품목', '수량', '단가', '공급가', '부가세', '합계'];
        const purRows = report.purchases.items.map((item: any) => [
          item.IO_DATE, item.CUST_CD, item.CUST_DES, item.PROD_CD, item.PROD_DES,
          item.QTY, item.PRICE, item.SUPPLY_AMT, item.VAT_AMT, item.TOTAL_AMT,
        ]);
        const ws3 = XLSX.utils.aoa_to_sheet([purHeaders, ...purRows]);
        ws3['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 12 }, { wch: 20 }, { wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 14 }];
        XLSX.utils.book_append_sheet(wb, ws3, '구매 상세');
      }

      const fileName = `KPROS_${report.type_label}_ERP보고서_${report.to?.replace(/-/g, '') || 'report'}.xlsx`;
      XLSX.writeFile(wb, fileName);
    } catch (e) {
      console.error('엑셀 다운로드 실패', e);
    }
  }, [report]);

  // ─── 기간 프리셋 ───
  const setPeriod = (type: 'today' | 'week' | 'month') => {
    setDateTo(todayYMD());
    if (type === 'today') setDateFrom(todayYMD());
    else if (type === 'week') setDateFrom(weekAgoYMD());
    else setDateFrom(monthAgoYMD());
  };

  // 자동 상태 확인 (최초 1회)
  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // 연동 완료 시 품목 자동 조회
  useEffect(() => {
    if (statusChecked && erpStatus?.erp_connected && products.length === 0 && !productsLoading) {
      fetchProducts();
    }
  }, [statusChecked, erpStatus, products.length, productsLoading, fetchProducts]);

  // 탭 전환 시 데이터 자동 조회
  useEffect(() => {
    if (!statusChecked || !erpStatus?.erp_connected) return;
    if (activeTab === 'inventory' && inventoryItems.length === 0 && !inventoryLoading) {
      fetchInventory();
    } else if (activeTab === 'sales' && !salesData && !salesLoading) {
      fetchSales();
    } else if (activeTab === 'purchases' && !purchasesData && !purchasesLoading) {
      fetchPurchases();
    }
  }, [activeTab, statusChecked, erpStatus]);

  // 필터링된 품목
  const filteredProducts = productSearch
    ? products.filter(
        (p) =>
          p.PROD_CD?.toLowerCase().includes(productSearch.toLowerCase()) ||
          p.PROD_DES?.toLowerCase().includes(productSearch.toLowerCase()) ||
          p.CLASS_DES?.toLowerCase().includes(productSearch.toLowerCase())
      )
    : products;

  // ─── Render: 미연동 상태 ───
  if (statusChecked && erpStatus && !erpStatus.erp_connected) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">ERP 현황</h1>
            <p className="text-sm text-slate-500 mt-1">이카운트 ERP 연동 관리</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center max-w-xl mx-auto">
          <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-2">이카운트 ERP 연동 필요</h3>
          <p className="text-sm text-slate-500 mb-6">
            ERP 기능을 사용하려면 이카운트 API 인증 정보를 설정해주세요.
          </p>

          <div className="bg-slate-50 rounded-xl p-4 text-left space-y-3 mb-6">
            <h4 className="text-sm font-semibold text-slate-700">설정 방법</h4>
            <div className="space-y-2 text-sm text-slate-600">
              {[
                { key: 'com_code', label: 'ECOUNT_COM_CODE', done: erpStatus.credentials.com_code },
                { key: 'user_id', label: 'ECOUNT_USER_ID', done: erpStatus.credentials.user_id },
                { key: 'api_key', label: 'ECOUNT_API_CERT_KEY', done: erpStatus.credentials.api_key },
              ].map((item, i) => (
                <div key={item.key} className="flex items-center gap-2">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${item.done ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                    {item.done ? '✓' : String(i + 1)}
                  </span>
                  <code className="text-xs bg-white px-2 py-0.5 rounded border">wrangler secret put {item.label}</code>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={checkStatus}
            disabled={statusLoading}
            className="mt-2 px-6 py-2.5 bg-slate-800 text-white rounded-xl text-sm font-medium hover:bg-slate-700 transition disabled:opacity-50"
          >
            {statusLoading ? '확인 중...' : '연동 상태 다시 확인'}
          </button>
        </div>
      </div>
    );
  }

  // ─── Render: 로딩 ───
  if (!statusChecked) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-[3px] border-brand-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-slate-500">ERP 연동 상태 확인 중...</span>
        </div>
      </div>
    );
  }

  // ─── Render: 연동 완료 대시보드 ───
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">ERP 현황</h1>
          <p className="text-sm text-slate-500 mt-1">이카운트 ERP 품목/판매/구매 현황</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
            ERP 연동됨
          </span>
          {productsTotalCount > 0 && (
            <span className="inline-flex items-center px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
              품목 {productsTotalCount}개
            </span>
          )}
        </div>
      </div>

      {/* 탭 + 기간 선택 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* 탭 */}
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
            {[
              { key: 'products' as TabKey, label: '품목현황' },
              { key: 'inventory' as TabKey, label: '재고현황' },
              { key: 'sales' as TabKey, label: '판매현황' },
              { key: 'purchases' as TabKey, label: '구매현황' },
              { key: 'report' as TabKey, label: 'AI 보고서' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-1.5 text-sm font-medium rounded-lg transition ${
                  activeTab === tab.key
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          {/* 기간 선택 (판매/구매 탭용) */}
          {(activeTab === 'sales' || activeTab === 'purchases') && (
            <>
              <div className="flex gap-1">
                {[
                  { label: '오늘', value: 'today' as const },
                  { label: '1주', value: 'week' as const },
                  { label: '1개월', value: 'month' as const },
                ].map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setPeriod(p.value)}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-slate-100 text-slate-600 transition"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <input
                  type="text"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  placeholder="YYYYMMDD"
                  className="w-28 px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
                />
                <span className="text-slate-400">~</span>
                <input
                  type="text"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  placeholder="YYYYMMDD"
                  className="w-28 px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* 에러 메시지 */}
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
          <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="flex-1 text-sm font-medium text-red-800">{errorMsg}</p>
          <button onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-red-600">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* ━━━ 품목현황 탭 ━━━ */}
      {activeTab === 'products' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center flex-wrap gap-3">
            <h2 className="text-lg font-bold text-slate-900">품목현황</h2>
            <div className="flex items-center gap-3">
              <div className="relative">
                <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="품목코드/품목명 검색..."
                  className="w-56 pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
                />
              </div>
              <button
                onClick={fetchProducts}
                disabled={productsLoading}
                className="px-4 py-2 bg-slate-800 text-white rounded-xl text-sm font-medium hover:bg-slate-700 transition disabled:opacity-50"
              >
                {productsLoading ? '조회 중...' : '새로고침'}
              </button>
            </div>
          </div>

          {productsLoading && products.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-[3px] border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-slate-500">품목 데이터 로딩 중...</span>
              </div>
            </div>
          ) : products.length > 0 ? (
            <>
              {/* 통계 카드 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="총 등록 품목" value={`${formatNumber(productsTotalCount)}개`} color="blue" />
                <StatCard
                  label="단가 설정됨"
                  value={`${formatNumber(products.filter((p) => p.PRICE && parseFloat(p.PRICE) > 0).length)}개`}
                  color="green"
                />
                <StatCard
                  label="분류 그룹"
                  value={`${new Set(products.map((p) => p.CLASS_DES).filter(Boolean)).size}개`}
                  color="indigo"
                />
                <StatCard
                  label="검색 결과"
                  value={productSearch ? `${filteredProducts.length}개` : '전체'}
                  color="slate"
                />
              </div>

              {/* 품목 테이블 */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-left">
                        <th className="py-3 px-4 font-semibold w-10">#</th>
                        <th className="py-3 px-4 font-semibold">품목코드</th>
                        <th className="py-3 px-4 font-semibold">품목명</th>
                        <th className="py-3 px-4 font-semibold">규격</th>
                        <th className="py-3 px-4 font-semibold">단위</th>
                        <th className="py-3 px-4 font-semibold text-right">단가</th>
                        <th className="py-3 px-4 font-semibold">분류</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProducts.slice(0, 100).map((p, i) => (
                        <tr key={p.PROD_CD || i} className="border-b border-slate-100 hover:bg-slate-50 transition">
                          <td className="py-2.5 px-4 text-slate-400 text-xs">{i + 1}</td>
                          <td className="py-2.5 px-4">
                            <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">{p.PROD_CD}</code>
                          </td>
                          <td className="py-2.5 px-4 font-medium text-slate-900">{p.PROD_DES}</td>
                          <td className="py-2.5 px-4 text-slate-500 text-xs">{p.PROD_DES2 || '-'}</td>
                          <td className="py-2.5 px-4 text-slate-600">{p.UNIT || '-'}</td>
                          <td className="py-2.5 px-4 text-right font-medium text-slate-900">
                            {p.PRICE && parseFloat(p.PRICE) > 0
                              ? `₩${parseFloat(p.PRICE).toLocaleString()}`
                              : '-'}
                          </td>
                          <td className="py-2.5 px-4">
                            {p.CLASS_DES ? (
                              <span className="inline-flex px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">{p.CLASS_DES}</span>
                            ) : (
                              <span className="text-slate-400 text-xs">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {filteredProducts.length > 100 && (
                  <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 text-center text-xs text-slate-500">
                    {filteredProducts.length}개 중 100개 표시 (검색으로 범위를 좁혀주세요)
                  </div>
                )}
              </div>
            </>
          ) : (
            <EmptyState message="품목 데이터를 불러올 수 없습니다" />
          )}
        </div>
      )}

      {/* ━━━ 재고현황 탭 ━━━ */}
      {activeTab === 'inventory' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center flex-wrap gap-3">
            <h2 className="text-lg font-bold text-slate-900">재고현황</h2>
            <div className="flex items-center gap-3">
              <div className="relative">
                <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={inventorySearch}
                  onChange={(e) => setInventorySearch(e.target.value)}
                  placeholder="품목코드/품목명 검색..."
                  className="w-56 pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
                />
              </div>
              <button
                onClick={fetchInventory}
                disabled={inventoryLoading}
                className="px-4 py-2 bg-slate-800 text-white rounded-xl text-sm font-medium hover:bg-slate-700 transition disabled:opacity-50"
              >
                {inventoryLoading ? '조회 중...' : '재고 조회'}
              </button>
            </div>
          </div>

          {inventoryLoading && inventoryItems.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-[3px] border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-slate-500">재고 데이터 로딩 중...</span>
              </div>
            </div>
          ) : inventoryItems.length > 0 ? (
            (() => {
              const filtered = inventorySearch
                ? inventoryItems.filter(
                    (item) =>
                      item.PROD_CD?.toLowerCase().includes(inventorySearch.toLowerCase()) ||
                      item.PROD_DES?.toLowerCase().includes(inventorySearch.toLowerCase())
                  )
                : inventoryItems;
              const totalBalQty = filtered.reduce((sum, i) => sum + parseFloat(i.BAL_QTY || '0'), 0);
              const positiveCount = filtered.filter((i) => parseFloat(i.BAL_QTY || '0') > 0).length;
              const negativeCount = filtered.filter((i) => parseFloat(i.BAL_QTY || '0') < 0).length;
              return (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatCard label="재고 품목 수" value={`${formatNumber(filtered.length)}개`} color="blue" />
                    <StatCard label="재고 있는 품목" value={`${positiveCount}개`} color="green" />
                    <StatCard label="마이너스 재고" value={`${negativeCount}개`} color="red" />
                    <StatCard label="총 재고수량 합계" value={formatNumber(totalBalQty)} color="indigo" />
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-left">
                            <th className="py-3 px-4 font-semibold w-10">#</th>
                            <th className="py-3 px-4 font-semibold">품목코드</th>
                            <th className="py-3 px-4 font-semibold">품목명</th>
                            <th className="py-3 px-4 font-semibold">단위</th>
                            <th className="py-3 px-4 font-semibold text-right">재고수량</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.slice(0, 200).map((item, i) => {
                            const balQty = parseFloat(item.BAL_QTY || '0');
                            return (
                              <tr key={`${item.PROD_CD}-${i}`} className="border-b border-slate-100 hover:bg-slate-50 transition">
                                <td className="py-2.5 px-4 text-slate-400 text-xs">{i + 1}</td>
                                <td className="py-2.5 px-4">
                                  <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">{item.PROD_CD}</code>
                                </td>
                                <td className="py-2.5 px-4 font-medium text-slate-900">{item.PROD_DES || '-'}</td>
                                <td className="py-2.5 px-4 text-slate-600">{item.UNIT || '-'}</td>
                                <td className={`py-2.5 px-4 text-right font-bold ${balQty > 0 ? 'text-slate-900' : balQty < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                                  {formatNumber(balQty)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {filtered.length > 200 && (
                      <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 text-center text-xs text-slate-500">
                        {filtered.length}개 중 200개 표시 (검색으로 범위를 좁혀주세요)
                      </div>
                    )}
                  </div>
                </>
              );
            })()
          ) : inventoryApiError ? (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 text-center">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h4 className="text-sm font-bold text-blue-800 mb-1">API 인증 필요</h4>
              <p className="text-xs text-blue-600">
                {inventoryApiError}<br />
                이카운트 ERP &gt; OAPI 관리 &gt; API인증현황에서 재고현황 API를 인증해주세요.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
              <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <p className="text-sm text-slate-500 mb-4">재고 조회 버튼을 클릭하여 이카운트 ERP 재고현황을 확인하세요</p>
              <button
                onClick={fetchInventory}
                disabled={inventoryLoading}
                className="px-5 py-2.5 bg-slate-800 text-white rounded-xl text-sm font-medium hover:bg-slate-700 transition disabled:opacity-50"
              >
                {inventoryLoading ? '조회 중...' : '재고현황 조회'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ━━━ 판매현황 탭 ━━━ */}
      {activeTab === 'sales' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-slate-900">판매현황</h2>
            <button
              onClick={fetchSales}
              disabled={salesLoading}
              className="px-4 py-2 bg-slate-800 text-white rounded-xl text-sm font-medium hover:bg-slate-700 transition disabled:opacity-50"
            >
              {salesLoading ? '조회 중...' : '조회'}
            </button>
          </div>

          {salesData ? (
            <>
              {/* 통계 카드 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="매출액 (합계)" value={`₩${formatKRW(salesData.summary.total_amount)}`} color="blue" />
                <StatCard label="공급가" value={`₩${formatKRW(salesData.summary.total_supply)}`} color="indigo" />
                <StatCard label="부가세" value={`₩${formatKRW(salesData.summary.total_vat)}`} color="slate" />
                <StatCard label="거래 건수" value={`${formatNumber(salesData.summary.total_count)}건`} color="green" />
              </div>

              {/* 거래처/품목 TOP */}
              {(salesData.top_customers.length > 0 || salesData.top_products.length > 0) && (
                <div className="grid md:grid-cols-2 gap-4">
                  <RankCard title="거래처별 매출 TOP" items={salesData.top_customers.map((c) => ({ name: c.name, value: c.amount, sub: `${c.count}건` }))} />
                  <RankCard title="품목별 매출 TOP" items={salesData.top_products.map((p) => ({ name: p.name, value: p.amount, sub: `${p.qty}개` }))} />
                </div>
              )}

              {/* 일별 추이 */}
              {salesData.daily_trend.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <h3 className="text-sm font-bold text-slate-700 mb-3">일별 매출 추이</h3>
                  <div className="space-y-2">
                    {salesData.daily_trend.map((d) => {
                      const maxAmt = Math.max(...salesData.daily_trend.map((t) => t.amount));
                      const pct = maxAmt > 0 ? (d.amount / maxAmt) * 100 : 0;
                      return (
                        <div key={d.date} className="flex items-center gap-3 text-sm">
                          <span className="w-24 text-slate-500 shrink-0">{d.date}</span>
                          <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                            <div className="bg-blue-500 h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="w-28 text-right font-medium text-slate-700 shrink-0">₩{formatNumber(d.amount)}</span>
                          <span className="w-12 text-right text-slate-400 shrink-0">{d.count}건</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 판매 상세 테이블 - 품목, 수량, 단가, 공급가, 판매처 */}
              {salesData.items.length > 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
                    <h3 className="text-sm font-bold text-slate-700">판매 상세 내역 ({salesData.items.length}건)</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-600 text-left bg-slate-50">
                          <th className="py-3 px-4 font-semibold">날짜</th>
                          <th className="py-3 px-4 font-semibold">판매처</th>
                          <th className="py-3 px-4 font-semibold">품목코드</th>
                          <th className="py-3 px-4 font-semibold">품목</th>
                          <th className="py-3 px-4 font-semibold text-right">수량</th>
                          <th className="py-3 px-4 font-semibold text-right">단가</th>
                          <th className="py-3 px-4 font-semibold text-right">공급가</th>
                          <th className="py-3 px-4 font-semibold text-right">부가세</th>
                          <th className="py-3 px-4 font-semibold text-right">합계</th>
                        </tr>
                      </thead>
                      <tbody>
                        {salesData.items.slice(0, 50).map((item: any, i: number) => (
                          <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="py-2.5 px-4 text-slate-600">{item.IO_DATE}</td>
                            <td className="py-2.5 px-4 font-medium">{item.CUST_DES || item.CUST_CD}</td>
                            <td className="py-2.5 px-4">
                              <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{item.PROD_CD}</code>
                            </td>
                            <td className="py-2.5 px-4">{item.PROD_DES}</td>
                            <td className="py-2.5 px-4 text-right">{item.QTY}</td>
                            <td className="py-2.5 px-4 text-right">₩{parseFloat(item.PRICE || '0').toLocaleString()}</td>
                            <td className="py-2.5 px-4 text-right">₩{parseFloat(item.SUPPLY_AMT || '0').toLocaleString()}</td>
                            <td className="py-2.5 px-4 text-right text-slate-500">₩{parseFloat(item.VAT_AMT || '0').toLocaleString()}</td>
                            <td className="py-2.5 px-4 text-right font-bold">₩{parseFloat(item.TOTAL_AMT || '0').toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {salesData.items.length > 50 && (
                      <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 text-center text-xs text-slate-500">
                        ... 외 {salesData.items.length - 50}건
                      </div>
                    )}
                  </div>
                </div>
              ) : salesData.api_error ? (
                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 text-center">
                  <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <h4 className="text-sm font-bold text-blue-800 mb-1">API 인증 필요</h4>
                  <p className="text-xs text-blue-600">
                    {salesData.api_error}<br />
                    이카운트 ERP &gt; OAPI 관리 &gt; API인증현황에서 판매조회(GetListSale) API를 인증해주세요.
                  </p>
                </div>
              ) : salesData.summary.total_count === 0 ? (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-center">
                  <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h4 className="text-sm font-bold text-amber-800 mb-1">해당 기간 판매 데이터 없음</h4>
                  <p className="text-xs text-amber-600">
                    선택한 기간({dateFrom} ~ {dateTo})에 판매 데이터가 없습니다.<br />
                    기간을 변경하여 다시 조회해 보세요.
                  </p>
                </div>
              ) : null}
            </>
          ) : (
            <EmptyState message="기간을 선택하고 조회 버튼을 클릭하세요" />
          )}
        </div>
      )}

      {/* ━━━ 구매현황 탭 ━━━ */}
      {activeTab === 'purchases' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-slate-900">구매현황</h2>
            <button
              onClick={fetchPurchases}
              disabled={purchasesLoading}
              className="px-4 py-2 bg-slate-800 text-white rounded-xl text-sm font-medium hover:bg-slate-700 transition disabled:opacity-50"
            >
              {purchasesLoading ? '조회 중...' : '조회'}
            </button>
          </div>

          {purchasesData ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="매입액 (합계)" value={`₩${formatKRW(purchasesData.summary.total_amount)}`} color="red" />
                <StatCard label="공급가" value={`₩${formatKRW(purchasesData.summary.total_supply)}`} color="orange" />
                <StatCard label="부가세" value={`₩${formatKRW(purchasesData.summary.total_vat)}`} color="slate" />
                <StatCard label="구매 건수" value={`${formatNumber(purchasesData.summary.total_count)}건`} color="amber" />
              </div>

              {(purchasesData.top_suppliers.length > 0 || purchasesData.top_products.length > 0) && (
                <div className="grid md:grid-cols-2 gap-4">
                  <RankCard title="공급사별 매입 TOP" items={purchasesData.top_suppliers.map((s) => ({ name: s.name, value: s.amount, sub: `${s.count}건` }))} />
                  <RankCard title="품목별 매입 TOP" items={purchasesData.top_products.map((p) => ({ name: p.name, value: p.amount, sub: `${p.qty}개` }))} />
                </div>
              )}

              {purchasesData.items.length > 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
                    <h3 className="text-sm font-bold text-slate-700">구매 상세 내역 ({purchasesData.items.length}건)</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-600 text-left bg-slate-50">
                          <th className="py-3 px-4 font-semibold">날짜</th>
                          <th className="py-3 px-4 font-semibold">공급사</th>
                          <th className="py-3 px-4 font-semibold">품목코드</th>
                          <th className="py-3 px-4 font-semibold">품목</th>
                          <th className="py-3 px-4 font-semibold text-right">수량</th>
                          <th className="py-3 px-4 font-semibold text-right">단가</th>
                          <th className="py-3 px-4 font-semibold text-right">공급가</th>
                          <th className="py-3 px-4 font-semibold text-right">부가세</th>
                          <th className="py-3 px-4 font-semibold text-right">합계</th>
                        </tr>
                      </thead>
                      <tbody>
                        {purchasesData.items.slice(0, 50).map((item: any, i: number) => (
                          <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="py-2.5 px-4 text-slate-600">{item.IO_DATE}</td>
                            <td className="py-2.5 px-4 font-medium">{item.CUST_DES || item.CUST_CD}</td>
                            <td className="py-2.5 px-4">
                              <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{item.PROD_CD}</code>
                            </td>
                            <td className="py-2.5 px-4">{item.PROD_DES}</td>
                            <td className="py-2.5 px-4 text-right">{item.QTY}</td>
                            <td className="py-2.5 px-4 text-right">₩{parseFloat(item.PRICE || '0').toLocaleString()}</td>
                            <td className="py-2.5 px-4 text-right">₩{parseFloat(item.SUPPLY_AMT || '0').toLocaleString()}</td>
                            <td className="py-2.5 px-4 text-right text-slate-500">₩{parseFloat(item.VAT_AMT || '0').toLocaleString()}</td>
                            <td className="py-2.5 px-4 text-right font-bold">₩{parseFloat(item.TOTAL_AMT || '0').toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {purchasesData.items.length > 50 && (
                      <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 text-center text-xs text-slate-500">
                        ... 외 {purchasesData.items.length - 50}건
                      </div>
                    )}
                  </div>
                </div>
              ) : purchasesData.api_error ? (
                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 text-center">
                  <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <h4 className="text-sm font-bold text-blue-800 mb-1">API 인증 필요</h4>
                  <p className="text-xs text-blue-600">
                    {purchasesData.api_error}<br />
                    이카운트 ERP &gt; OAPI 관리 &gt; API인증현황에서 구매조회(GetListPurchase) API를 인증해주세요.
                  </p>
                </div>
              ) : purchasesData.summary.total_count === 0 ? (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-center">
                  <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h4 className="text-sm font-bold text-amber-800 mb-1">해당 기간 구매 데이터 없음</h4>
                  <p className="text-xs text-amber-600">
                    선택한 기간({dateFrom} ~ {dateTo})에 구매 데이터가 없습니다.<br />
                    기간을 변경하여 다시 조회해 보세요.
                  </p>
                </div>
              ) : null}
            </>
          ) : (
            <EmptyState message="기간을 선택하고 조회 버튼을 클릭하세요" />
          )}
        </div>
      )}

      {/* ━━━ AI 보고서 탭 ━━━ */}
      {activeTab === 'report' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center flex-wrap gap-3">
            <h2 className="text-lg font-bold text-slate-900">AI ERP 보고서</h2>
            <div className="flex items-center gap-3">
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value as any)}
                className="px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
              >
                <option value="daily">일간 보고서</option>
                <option value="weekly">주간 보고서</option>
                <option value="monthly">월간 보고서</option>
              </select>
              <button
                onClick={generateReport}
                disabled={reportLoading}
                className="px-5 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl text-sm font-medium hover:from-violet-700 hover:to-indigo-700 transition disabled:opacity-50"
              >
                {reportLoading ? 'AI 분석 중...' : '보고서 생성'}
              </button>
              {report && (
                <button
                  onClick={downloadExcel}
                  className="px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition"
                >
                  Excel 다운로드
                </button>
              )}
            </div>
          </div>

          {report ? (
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl p-6 text-white">
                <h3 className="text-xl font-bold">{report.title}</h3>
                <p className="text-slate-300 text-sm mt-1">{report.period}</p>
                <p className="text-slate-400 text-xs mt-1">생성: {new Date(report.generated_at).toLocaleString('ko-KR')}</p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="기간 매출" value={`₩${formatKRW(report.overview.sales_amount)}`} color="blue" sub={`${report.overview.sales_count}건`} />
                <StatCard label="기간 매입" value={`₩${formatKRW(report.overview.purchase_amount)}`} color="red" sub={`${report.overview.purchase_count}건`} />
                <StatCard label="매출총이익" value={`₩${formatKRW(report.overview.gross_profit)}`} color="green" />
                <StatCard label="이익률" value={`${report.overview.profit_rate}%`} color="violet" />
              </div>

              {(report.sales.top_customers.length > 0 || report.sales.top_products.length > 0 || report.purchases.top_suppliers.length > 0) && (
                <div className="grid md:grid-cols-3 gap-4">
                  <RankCard title="거래처별 매출 TOP" items={report.sales.top_customers.map((c) => ({ name: c.name, value: c.amount, sub: `${c.count}건` }))} />
                  <RankCard title="품목별 매출 TOP" items={report.sales.top_products.map((p) => ({ name: p.name, value: p.amount, sub: `${p.qty}개` }))} />
                  <RankCard title="공급사별 매입 TOP" items={report.purchases.top_suppliers.map((s) => ({ name: s.name, value: s.amount, sub: `${s.count}건` }))} />
                </div>
              )}

              {report.sales.daily_trend.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <h3 className="text-sm font-bold text-slate-700 mb-3">일별 매출 추이</h3>
                  <div className="space-y-2">
                    {report.sales.daily_trend.map((d) => {
                      const maxAmt = Math.max(...report.sales.daily_trend.map((t) => t.amount));
                      const pct = maxAmt > 0 ? (d.amount / maxAmt) * 100 : 0;
                      return (
                        <div key={d.date} className="flex items-center gap-3 text-sm">
                          <span className="w-24 text-slate-500 shrink-0">{d.date}</span>
                          <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                            <div className="bg-indigo-500 h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="w-28 text-right font-medium text-slate-700 shrink-0">₩{formatNumber(d.amount)}</span>
                          <span className="w-12 text-right text-slate-400 shrink-0">{d.count}건</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {report.ai_insight && (
                <div className="bg-gradient-to-br from-violet-50 to-indigo-50 rounded-2xl border border-violet-200 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <svg className="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    <h3 className="text-sm font-bold text-violet-800">AI 경영 분석</h3>
                  </div>
                  <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                    {report.ai_insight}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
              <div className="w-16 h-16 bg-violet-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">AI 보고서 생성</h3>
              <p className="text-sm text-slate-500 mb-4">
                보고서 유형을 선택하고 생성 버튼을 클릭하면<br />
                이카운트 ERP 데이터를 AI가 분석하여 보고서를 생성합니다.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sub Components ───

function StatCard({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  const colorMap: Record<string, string> = {
    blue: 'text-blue-700',
    indigo: 'text-indigo-700',
    green: 'text-green-700',
    red: 'text-red-700',
    orange: 'text-orange-700',
    amber: 'text-amber-700',
    violet: 'text-violet-700',
    slate: 'text-slate-700',
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="text-xs text-slate-500 font-medium mb-1">{label}</div>
      <div className="text-xl font-bold text-slate-900">{value}</div>
      {sub && <div className={`text-xs mt-1 font-medium ${colorMap[color] || 'text-slate-500'}`}>{sub}</div>}
    </div>
  );
}

function RankCard({ title, items }: { title: string; items: Array<{ name: string; value: number; sub: string }> }) {
  if (items.length === 0) return null;
  const maxVal = Math.max(...items.map((i) => i.value));

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <h3 className="text-sm font-bold text-slate-700 mb-3">{title}</h3>
      <div className="space-y-2.5">
        {items.slice(0, 7).map((item, i) => {
          const pct = maxVal > 0 ? (item.value / maxVal) * 100 : 0;
          return (
            <div key={i}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-700 truncate max-w-[60%]">
                  <span className="text-slate-400 mr-1.5">{i + 1}.</span>
                  {item.name}
                </span>
                <span className="font-medium text-slate-900 shrink-0">₩{formatKRW(item.value)}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-blue-400 h-full rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs text-slate-400 shrink-0">{item.sub}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
      <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center mx-auto mb-3">
        <svg className="w-6 h-6 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <p className="text-sm text-slate-500">{message}</p>
    </div>
  );
}
