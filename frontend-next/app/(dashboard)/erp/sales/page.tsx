'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiUrl, authHeaders, authJsonHeaders } from '@/lib/api';

// ─── Types ───

interface ProductItem {
  PROD_CD: string;
  PROD_DES: string;
  UNIT?: string;
  PRICE?: string;
  COST?: string;
}

interface CompanyResult {
  companyCd: string;
  companyNm: string;
  ceoNm?: string;
  bizType?: string;
}

// 출고방식 옵션
const SHIP_METHODS = ['', '택배', '직배송', '화물', '퀵서비스', '직접수령'] as const;

interface SaleRow {
  id: string;
  PROD_CD: string;
  PROD_DES: string;
  SPEC: string;
  QTY: string;
  PRICE: string;
  REMARKS: string;
  ADD_COST: string;
}

interface RecentSaleItem {
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
}

// ─── Helpers ───

function todayParts() {
  const now = new Date();
  return {
    year: String(now.getFullYear()),
    month: String(now.getMonth() + 1).padStart(2, '0'),
    day: String(now.getDate()).padStart(2, '0'),
  };
}

function toYMD(y: string, m: string, d: string) {
  return `${y}${m}${d}`;
}

function weekAgoYMD() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().split('T')[0].replace(/-/g, '');
}

function genId() {
  return Math.random().toString(36).slice(2, 9);
}

function emptyRow(): SaleRow {
  return { id: genId(), PROD_CD: '', PROD_DES: '', SPEC: '', QTY: '', PRICE: '', REMARKS: '', ADD_COST: '' };
}

const YEARS = Array.from({ length: 5 }, (_, i) => String(2024 + i));
const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));
const DEFAULT_ROWS = 10;

// ─── Component ───

export default function SalesInputPage() {
  // 헤더 상태 (이카운트 동일 필드)
  const [date, setDate] = useState(todayParts());
  const [custCd, setCustCd] = useState('');
  const [custDes, setCustDes] = useState('');
  const [whCd, setWhCd] = useState('');
  const [whDes, setWhDes] = useState('');
  const [shipMethod, setShipMethod] = useState('');

  // 테이블 행 (기본 3행)
  const [rows, setRows] = useState<SaleRow[]>(
    Array.from({ length: DEFAULT_ROWS }, () => emptyRow())
  );

  // 데이터
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [recentSales, setRecentSales] = useState<RecentSaleItem[]>([]);
  const [recentCustomers, setRecentCustomers] = useState<Array<{ code: string; name: string }>>([]);

  // UI 상태
  const [productsLoading, setProductsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showList, setShowList] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [prodSearch, setProdSearch] = useState<Record<string, string>>({});

  // 거래처 자동완성 상태
  const [custSearch, setCustSearch] = useState('');
  const [custResults, setCustResults] = useState<CompanyResult[]>([]);
  const [custLoading, setCustLoading] = useState(false);
  const [showCustDropdown, setShowCustDropdown] = useState(false);
  const custDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 출하창고 드롭다운 상태
  const [warehouseList, setWarehouseList] = useState<Array<{ code: string; name: string }>>([]);
  const [showWhDropdown, setShowWhDropdown] = useState(false);

  // ─── 데이터 로딩 ───

  const fetchProducts = useCallback(async () => {
    setProductsLoading(true);
    try {
      const res = await fetch(apiUrl('/api/v1/erp/products'), { headers: authHeaders() });
      const json = await res.json();
      if (json.status === 'success') setProducts(json.data.items || []);
    } catch { /* ignore */ } finally {
      setProductsLoading(false);
    }
  }, []);

  const fetchRecentSales = useCallback(async () => {
    try {
      const todayStr = toYMD(date.year, date.month, date.day);
      const res = await fetch(
        apiUrl(`/api/v1/erp/sales?from=${weekAgoYMD()}&to=${todayStr}`),
        { headers: authHeaders() }
      );
      const json = await res.json();
      if (json.status === 'success') {
        setRecentSales(json.data.items || []);
        const custMap = new Map<string, string>();
        for (const item of json.data.items || []) {
          if (item.CUST_CD && item.CUST_DES) custMap.set(item.CUST_CD, item.CUST_DES);
        }
        setRecentCustomers(Array.from(custMap, ([code, name]) => ({ code, name })));
      }
    } catch { /* ignore */ }
  }, [date]);

  useEffect(() => {
    fetchProducts();
    fetchRecentSales();
    fetchWarehouses();
  }, [fetchProducts, fetchRecentSales]);

  // 거래처 debounced 검색
  useEffect(() => {
    if (custDebounceRef.current) clearTimeout(custDebounceRef.current);
    if (custSearch.length < 2) {
      setCustResults([]);
      return;
    }
    setCustLoading(true);
    custDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          apiUrl(`/api/v1/kpros/companies?search=${encodeURIComponent(custSearch)}&limit=10`),
          { headers: authHeaders() }
        );
        const json = await res.json();
        if (json.status === 'success') {
          setCustResults(json.data?.companies || []);
        }
      } catch { /* ignore */ } finally {
        setCustLoading(false);
      }
    }, 300);
    return () => { if (custDebounceRef.current) clearTimeout(custDebounceRef.current); };
  }, [custSearch]);

  // 출하창고 목록 로드
  const fetchWarehouses = async () => {
    try {
      const res = await fetch(apiUrl('/api/v1/inventory/kpros-stock'), { headers: authHeaders() });
      const json = await res.json();
      if (json.status === 'success' && json.data?.warehouses) {
        const HIDDEN_WH = '카이코스텍';
        setWarehouseList(
          json.data.warehouses
            .filter((w: { name: string }) => w.name !== HIDDEN_WH)
            .map((w: { name: string; code?: string }) => ({ code: w.code || w.name, name: w.name }))
        );
      }
    } catch { /* ignore */ }
  };

  // ─── 행 관리 ───

  const updateRow = (id: string, field: keyof SaleRow, value: string) => {
    setRows(rows.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const addRow = () => setRows([...rows, emptyRow()]);
  const removeRow = (id: string) => {
    if (rows.length <= 1) return;
    setRows(rows.filter(r => r.id !== id));
  };

  const selectProduct = (rowId: string, product: ProductItem) => {
    setRows(rows.map(r =>
      r.id === rowId
        ? { ...r, PROD_CD: product.PROD_CD, PROD_DES: product.PROD_DES, SPEC: product.UNIT || '', PRICE: product.PRICE || r.PRICE }
        : r
    ));
    setOpenDropdown(null);
    setProdSearch(prev => ({ ...prev, [rowId]: '' }));
  };

  // ─── 계산 ───

  const calcRow = (row: SaleRow) => {
    const qty = parseFloat(row.QTY) || 0;
    const price = parseFloat(row.PRICE) || 0;
    const addCost = parseFloat(row.ADD_COST) || 0;
    const supply = qty * price;
    const vat = Math.round(supply * 0.1);
    return { qty, supply, vat, addCost };
  };

  const totals = rows.reduce(
    (acc, row) => {
      const c = calcRow(row);
      return { qty: acc.qty + c.qty, supply: acc.supply + c.supply, vat: acc.vat + c.vat, addCost: acc.addCost + c.addCost };
    },
    { qty: 0, supply: 0, vat: 0, addCost: 0 }
  );

  // ─── 전송 ───

  const validRows = rows.filter(r => r.PROD_CD && r.QTY && r.PRICE);
  const canSubmit = validRows.length > 0 && custCd.trim() !== '';

  const handleSubmit = async () => {
    setShowConfirm(false);
    setSubmitting(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    const items = validRows.map(r => ({
      IO_DATE: toYMD(date.year, date.month, date.day),
      CUST_CD: custCd,
      PROD_CD: r.PROD_CD,
      QTY: r.QTY,
      PRICE: r.PRICE,
      ...(whCd ? { WH_CD: whCd } : {}),
      ...(r.REMARKS ? { REMARKS: r.REMARKS } : {}),
    }));

    try {
      const res = await fetch(apiUrl('/api/v1/erp/sales'), {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify({ items }),
      });
      const json = await res.json();
      if (json.status === 'success') {
        setSuccessMsg(json.message || `${items.length}건 판매 입력 완료`);
        handleReset();
        fetchRecentSales();
      } else {
        setErrorMsg(json.message || '판매 입력 실패');
      }
    } catch {
      setErrorMsg('서버 연결 오류');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setCustCd('');
    setCustDes('');
    setWhCd('');
    setWhDes('');
    setShipMethod('');
    setRows(Array.from({ length: DEFAULT_ROWS }, () => emptyRow()));
    setDate(todayParts());
  };

  // ─── 품목 검색 ───

  const getFilteredProducts = (rowId: string) => {
    const q = (prodSearch[rowId] || '').toLowerCase();
    if (!q) return products.slice(0, 50);
    return products.filter(
      p => p.PROD_CD.toLowerCase().includes(q) || p.PROD_DES.toLowerCase().includes(q)
    ).slice(0, 50);
  };

  // 거래처 선택
  const selectCustomer = (company: CompanyResult) => {
    setCustCd(company.companyCd);
    setCustDes(company.companyNm);
    setCustSearch('');
    setShowCustDropdown(false);
  };

  // 최근 거래처 선택
  const selectRecentCust = (c: { code: string; name: string }) => {
    setCustCd(c.code);
    setCustDes(c.name);
    setCustSearch('');
    setShowCustDropdown(false);
  };

  // ─── 셀 스타일 ───
  const inputCls = 'w-full px-3 py-2.5 text-sm border-0 bg-transparent focus:outline-none focus:bg-blue-50/50';
  const headerInputCls = 'rounded border border-slate-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400';
  const headerSelectCls = 'rounded border border-slate-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400';

  // ─── Render ───

  return (
    <div className="space-y-4">
      {/* 알림 메시지 */}
      {successMsg && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-3">
          <svg className="w-5 h-5 text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          <p className="text-sm font-medium text-green-800 flex-1">{successMsg}</p>
          <button onClick={() => setSuccessMsg(null)} className="text-green-400 hover:text-green-600">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-3">
          <svg className="w-5 h-5 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <p className="text-sm font-medium text-red-800 flex-1">{errorMsg}</p>
          <button onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-red-600">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {/* 메인 카드 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card overflow-hidden">

        {/* 제목 바 */}
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-amber-400 text-lg">★</span>
            <h1 className="text-base font-bold text-slate-900">판매입력</h1>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
            ERP 연동됨
          </span>
        </div>

        {/* ─── 헤더 폼 (이카운트 동일) ─── */}
        <div className="px-5 py-4 border-b border-slate-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-3">
            {/* 일자 */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-500 w-16 shrink-0">일자</label>
              <select value={date.year} onChange={e => setDate({ ...date, year: e.target.value })} className={headerSelectCls}>
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <span className="text-slate-400">/</span>
              <select value={date.month} onChange={e => setDate({ ...date, month: e.target.value })} className={`${headerSelectCls} w-16`}>
                {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <span className="text-slate-400">/</span>
              <select value={date.day} onChange={e => setDate({ ...date, day: e.target.value })} className={`${headerSelectCls} w-16`}>
                {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            {/* 거래처 - 자동완성 */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-500 w-16 shrink-0">거래처</label>
              <input
                type="text"
                value={custCd}
                readOnly
                placeholder="코드"
                className={`${headerInputCls} w-28 bg-slate-50 cursor-default`}
              />
              <div className="relative flex-1">
                <input
                  type="text"
                  value={showCustDropdown ? custSearch : custDes}
                  onChange={e => { setCustSearch(e.target.value); setShowCustDropdown(true); }}
                  onFocus={() => setShowCustDropdown(true)}
                  placeholder="거래처명 검색 (2자 이상)"
                  className={`${headerInputCls} w-full`}
                />
                {custLoading && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                {showCustDropdown && (
                  <div className="absolute z-50 top-full left-0 mt-0.5 w-full bg-white border border-slate-300 rounded-lg shadow-xl max-h-52 overflow-y-auto">
                    {custSearch.length >= 2 ? (
                      custResults.length === 0 && !custLoading ? (
                        <div className="px-3 py-3 text-xs text-slate-400 text-center">검색 결과 없음</div>
                      ) : (
                        custResults.map(c => (
                          <button
                            key={c.companyCd}
                            onClick={() => selectCustomer(c)}
                            className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm flex items-center gap-2 transition border-b border-slate-100 last:border-0"
                          >
                            <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 shrink-0">{c.companyCd}</code>
                            <span className="text-slate-800 truncate flex-1">{c.companyNm}</span>
                            {c.ceoNm && <span className="text-xs text-slate-400 shrink-0">{c.ceoNm}</span>}
                          </button>
                        ))
                      )
                    ) : (
                      /* 검색어 없을 때 최근 거래처 목록 */
                      recentCustomers.length > 0 ? (
                        <>
                          <div className="px-3 py-1.5 text-xs text-slate-400 bg-slate-50 border-b border-slate-100">최근 거래처</div>
                          {recentCustomers.map(c => (
                            <button
                              key={c.code}
                              onClick={() => selectRecentCust(c)}
                              className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm flex items-center gap-2 transition border-b border-slate-100 last:border-0"
                            >
                              <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 shrink-0">{c.code}</code>
                              <span className="text-slate-800 truncate flex-1">{c.name}</span>
                            </button>
                          ))}
                        </>
                      ) : (
                        <div className="px-3 py-3 text-xs text-slate-400 text-center">거래처명을 2자 이상 입력하세요</div>
                      )
                    )}
                  </div>
                )}
              </div>
              {/* 선택 해제 버튼 */}
              {custCd && (
                <button
                  onClick={() => { setCustCd(''); setCustDes(''); setCustSearch(''); }}
                  className="w-6 h-6 rounded-full bg-slate-200 inline-flex items-center justify-center hover:bg-slate-300 transition shrink-0"
                >
                  <svg className="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>

            {/* 담당자 (표시만) */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-500 w-16 shrink-0">담당자</label>
              <input type="text" placeholder="담당자" className={`${headerInputCls} w-28`} />
              <input type="text" placeholder="" className={`${headerInputCls} flex-1 bg-slate-50`} readOnly />
            </div>

            {/* 출하창고 - KPROS 창고 드롭다운 */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-500 w-16 shrink-0">출하창고</label>
              <input
                type="text"
                value={whCd}
                readOnly
                placeholder="코드"
                className={`${headerInputCls} w-28 bg-slate-50 cursor-default`}
              />
              <div className="relative flex-1">
                <button
                  type="button"
                  onClick={() => setShowWhDropdown(!showWhDropdown)}
                  className={`${headerInputCls} w-full text-left flex items-center justify-between cursor-pointer`}
                >
                  <span className={whDes ? 'text-slate-800' : 'text-slate-400'}>{whDes || '창고 선택'}</span>
                  <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
                {showWhDropdown && (
                  <div className="absolute z-50 top-full left-0 mt-0.5 w-full bg-white border border-slate-300 rounded-lg shadow-xl max-h-52 overflow-y-auto">
                    {warehouseList.length === 0 ? (
                      <div className="px-3 py-3 text-xs text-slate-400 text-center">창고 목록 로딩 중...</div>
                    ) : (
                      warehouseList.map(w => (
                        <button
                          key={w.code}
                          onClick={() => { setWhCd(w.code); setWhDes(w.name); setShowWhDropdown(false); }}
                          className={`w-full text-left px-3 py-2 hover:bg-blue-50 text-sm transition border-b border-slate-100 last:border-0 ${whCd === w.code ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700'}`}
                        >
                          {w.name}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              {/* 선택 해제 */}
              {whCd && (
                <button
                  onClick={() => { setWhCd(''); setWhDes(''); }}
                  className="w-6 h-6 rounded-full bg-slate-200 inline-flex items-center justify-center hover:bg-slate-300 transition shrink-0"
                >
                  <svg className="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>

            {/* 거래유형 */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-500 w-16 shrink-0">거래유형</label>
              <select className={`${headerSelectCls} flex-1`}>
                <option>부가세율 적용</option>
              </select>
            </div>

            {/* 통화 */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-500 w-16 shrink-0">통화</label>
              <select className={`${headerSelectCls} w-28`}>
                <option>내자</option>
              </select>
            </div>

            {/* 출고방식 - 드롭다운 */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-500 w-16 shrink-0">출고방식</label>
              <select
                value={shipMethod}
                onChange={e => setShipMethod(e.target.value)}
                className={`${headerSelectCls} flex-1`}
              >
                <option value="">선택안함</option>
                {SHIP_METHODS.filter(m => m !== '').map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* ─── 테이블 (이카운트 동일 컬럼) ─── */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b-2 border-slate-300">
                <th className="px-1 py-3 text-center text-slate-400 w-8 border-r border-slate-200"></th>
                <th className="px-1 py-3 w-8 border-r border-slate-200"></th>
                <th className="px-3 py-3 text-left text-indigo-700 font-semibold border-r border-slate-200 w-32">품목코드</th>
                <th className="px-3 py-3 text-left text-indigo-700 font-semibold border-r border-slate-200 min-w-[240px]">품목명</th>
                <th className="px-3 py-3 text-left text-indigo-700 font-semibold border-r border-slate-200 w-24">규격</th>
                <th className="px-3 py-3 text-right text-indigo-700 font-semibold border-r border-slate-200 w-24">수량</th>
                <th className="px-3 py-3 text-right text-red-600 font-semibold border-r border-slate-200 w-28">단가</th>
                <th className="px-3 py-3 text-right text-indigo-700 font-semibold border-r border-slate-200 w-32">공급가액</th>
                <th className="px-3 py-3 text-right text-indigo-700 font-semibold border-r border-slate-200 w-28">부가세</th>
                <th className="px-3 py-3 text-left text-indigo-700 font-semibold border-r border-slate-200 w-28">적요</th>
                <th className="px-3 py-3 text-right text-indigo-700 font-semibold border-r border-slate-200 w-28">부대비용</th>
                <th className="px-1 py-3 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const calc = calcRow(row);
                return (
                  <tr key={row.id} className="border-b border-slate-200 hover:bg-blue-50/30 group">
                    {/* 행 번호 */}
                    <td className="px-1 py-1 text-center text-slate-400 text-xs border-r border-slate-200">
                      {idx + 1}
                    </td>
                    {/* 품목 검색 버튼 */}
                    <td className="px-1 py-1 border-r border-slate-200 text-center">
                      <button
                        onClick={() => setOpenDropdown(openDropdown === row.id ? null : row.id)}
                        className="w-6 h-6 bg-blue-500 rounded inline-flex items-center justify-center hover:bg-blue-600 transition"
                      >
                        <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 12 12" fill="currentColor"><path d="M6 9L1 4h10L6 9z" /></svg>
                      </button>
                    </td>
                    {/* 품목코드 */}
                    <td className="py-1 border-r border-slate-200 relative">
                      <input
                        type="text"
                        value={openDropdown === row.id ? (prodSearch[row.id] ?? row.PROD_CD) : row.PROD_CD}
                        onChange={e => {
                          const val = e.target.value;
                          updateRow(row.id, 'PROD_CD', val);
                          setProdSearch(prev => ({ ...prev, [row.id]: val }));
                          setOpenDropdown(row.id);
                        }}
                        onFocus={() => setOpenDropdown(row.id)}
                        placeholder={productsLoading ? '로딩...' : ''}
                        className={inputCls}
                      />
                      {/* 품목 드롭다운 */}
                      {openDropdown === row.id && (
                        <div className="absolute z-50 top-full left-0 mt-0.5 w-80 bg-white border border-slate-300 rounded-lg shadow-xl max-h-52 overflow-y-auto">
                          <div className="sticky top-0 bg-white px-3 py-2 border-b border-slate-200">
                            <input
                              type="text"
                              value={prodSearch[row.id] || ''}
                              onChange={e => setProdSearch(prev => ({ ...prev, [row.id]: e.target.value }))}
                              placeholder="품목코드/명 검색..."
                              className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                              autoFocus
                            />
                          </div>
                          {getFilteredProducts(row.id).length === 0 ? (
                            <div className="px-3 py-3 text-xs text-slate-400 text-center">검색 결과 없음</div>
                          ) : (
                            getFilteredProducts(row.id).map(p => (
                              <button
                                key={p.PROD_CD}
                                onClick={() => selectProduct(row.id, p)}
                                className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm flex items-center gap-2 transition border-b border-slate-100 last:border-0"
                              >
                                <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 shrink-0">{p.PROD_CD}</code>
                                <span className="text-slate-800 truncate flex-1">{p.PROD_DES}</span>
                                {p.PRICE && parseFloat(p.PRICE) > 0 && (
                                  <span className="text-xs text-red-500 shrink-0">₩{parseFloat(p.PRICE).toLocaleString()}</span>
                                )}
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </td>
                    {/* 품목명 */}
                    <td className="py-1 border-r border-slate-200">
                      <input type="text" value={row.PROD_DES} readOnly className={`${inputCls} bg-transparent text-slate-700`} />
                    </td>
                    {/* 규격 */}
                    <td className="py-1 border-r border-slate-200">
                      <input type="text" value={row.SPEC} readOnly className={`${inputCls} text-slate-500`} />
                    </td>
                    {/* 수량 */}
                    <td className="py-1 border-r border-slate-200">
                      <input
                        type="number"
                        value={row.QTY}
                        onChange={e => updateRow(row.id, 'QTY', e.target.value)}
                        className={`${inputCls} text-right`}
                      />
                    </td>
                    {/* 단가 */}
                    <td className="py-1 border-r border-slate-200">
                      <input
                        type="number"
                        value={row.PRICE}
                        onChange={e => updateRow(row.id, 'PRICE', e.target.value)}
                        className={`${inputCls} text-right text-red-600`}
                      />
                    </td>
                    {/* 공급가액 */}
                    <td className="px-3 py-2.5 text-right border-r border-slate-200 text-slate-700 tabular-nums">
                      {calc.supply > 0 ? calc.supply.toLocaleString() : ''}
                    </td>
                    {/* 부가세 */}
                    <td className="px-3 py-2.5 text-right border-r border-slate-200 text-slate-700 tabular-nums">
                      {calc.vat > 0 ? calc.vat.toLocaleString() : ''}
                    </td>
                    {/* 적요 */}
                    <td className="py-1 border-r border-slate-200">
                      <input
                        type="text"
                        value={row.REMARKS}
                        onChange={e => updateRow(row.id, 'REMARKS', e.target.value)}
                        className={inputCls}
                      />
                    </td>
                    {/* 부대비용 */}
                    <td className="px-3 py-2.5 text-right border-r border-slate-200 text-slate-500 tabular-nums">
                      0
                    </td>
                    {/* 삭제 */}
                    <td className="px-1 py-1 text-center">
                      {rows.length > 1 && (
                        <button
                          onClick={() => removeRow(row.id)}
                          className="w-6 h-6 rounded inline-flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 transition opacity-0 group-hover:opacity-100"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {/* 합계 행 */}
              <tr className="bg-slate-100 font-semibold border-t-2 border-slate-300">
                <td colSpan={5} className="px-3 py-3 border-r border-slate-200"></td>
                <td className="px-3 py-3 text-right border-r border-slate-200 text-slate-800 tabular-nums">{totals.qty || 0}</td>
                <td className="px-3 py-3 border-r border-slate-200"></td>
                <td className="px-3 py-3 text-right border-r border-slate-200 text-slate-800 tabular-nums">{totals.supply > 0 ? totals.supply.toLocaleString() : 0}</td>
                <td className="px-3 py-3 text-right border-r border-slate-200 text-slate-800 tabular-nums">{totals.vat > 0 ? totals.vat.toLocaleString() : 0}</td>
                <td className="px-3 py-3 border-r border-slate-200"></td>
                <td className="px-3 py-3 text-right border-r border-slate-200 text-slate-800 tabular-nums">0</td>
                <td className="px-1 py-3"></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ─── 액션 바 (이카운트 동일) ─── */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowConfirm(true)}
            disabled={!canSubmit || submitting}
            className="px-5 py-2 bg-amber-400 text-slate-900 font-bold text-sm rounded-lg hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm"
          >
            {submitting ? '저장 중...' : '저장(F8)'}
          </button>
          <button
            onClick={handleReset}
            className="px-4 py-2 bg-white border border-slate-300 text-sm text-slate-700 rounded-lg hover:bg-slate-100 transition"
          >
            다시 작성
          </button>
          <button
            onClick={() => setShowList(!showList)}
            className={`px-4 py-2 border text-sm rounded-lg transition ${showList ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'}`}
          >
            리스트
          </button>
          <button
            onClick={addRow}
            className="ml-auto px-4 py-2 bg-white border border-slate-300 text-sm text-slate-700 rounded-lg hover:bg-slate-100 transition"
          >
            + 행 추가
          </button>
        </div>
      </div>

      {/* ─── 최근 판매 내역 (리스트) ─── */}
      {showList && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-700">거래내역보기(판매) — 최근 1주일</h2>
            <button onClick={fetchRecentSales} className="text-xs text-slate-500 hover:text-slate-700">
              새로고침
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b-2 border-slate-300">
                  <th className="px-3 py-2 text-left text-indigo-700 font-semibold border-r border-slate-200">날짜</th>
                  <th className="px-3 py-2 text-left text-indigo-700 font-semibold border-r border-slate-200">거래처</th>
                  <th className="px-3 py-2 text-left text-indigo-700 font-semibold border-r border-slate-200">품목</th>
                  <th className="px-3 py-2 text-right text-indigo-700 font-semibold border-r border-slate-200">수량</th>
                  <th className="px-3 py-2 text-right text-red-600 font-semibold border-r border-slate-200">단가</th>
                  <th className="px-3 py-2 text-right text-indigo-700 font-semibold border-r border-slate-200">공급가액</th>
                  <th className="px-3 py-2 text-right text-indigo-700 font-semibold border-r border-slate-200">부가세</th>
                  <th className="px-3 py-2 text-right text-indigo-700 font-semibold">합계</th>
                </tr>
              </thead>
              <tbody>
                {recentSales.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400 text-sm">최근 1주일 판매 데이터가 없습니다</td></tr>
                ) : (
                  recentSales.slice(0, 30).map((item, i) => (
                    <tr key={i} className="border-b border-slate-200 hover:bg-blue-50/30 transition">
                      <td className="px-3 py-2 text-slate-600 border-r border-slate-200">{item.IO_DATE}</td>
                      <td className="px-3 py-2 text-slate-800 font-medium border-r border-slate-200">{item.CUST_DES || item.CUST_CD}</td>
                      <td className="px-3 py-2 text-slate-700 border-r border-slate-200">{item.PROD_DES || item.PROD_CD}</td>
                      <td className="px-3 py-2 text-right text-slate-600 border-r border-slate-200 tabular-nums">{item.QTY}</td>
                      <td className="px-3 py-2 text-right text-red-600 border-r border-slate-200 tabular-nums">{parseFloat(item.PRICE || '0').toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-slate-700 border-r border-slate-200 tabular-nums">{parseFloat(item.SUPPLY_AMT || '0').toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-slate-700 border-r border-slate-200 tabular-nums">{parseFloat(item.VAT_AMT || '0').toLocaleString()}</td>
                      <td className="px-3 py-2 text-right font-bold text-slate-800 tabular-nums">{parseFloat(item.TOTAL_AMT || '0').toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 확인 모달 */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowConfirm(false)}>
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 mb-2">판매 전송 확인</h3>
            <div className="text-sm text-slate-600 mb-4 space-y-1">
              <p>일자: <strong>{date.year}/{date.month}/{date.day}</strong></p>
              <p>거래처: <strong>{custCd}</strong> {custDes}</p>
              <p>건수: <strong>{validRows.length}건</strong></p>
              <p>공급가액: <strong>{totals.supply.toLocaleString()}</strong></p>
              <p>부가세: <strong>{totals.vat.toLocaleString()}</strong></p>
              <p className="text-base mt-2">합계: <strong className="text-blue-700 text-lg">₩{(totals.supply + totals.vat).toLocaleString()}</strong></p>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowConfirm(false)} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition">취소</button>
              <button onClick={handleSubmit} className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition">전송</button>
            </div>
          </div>
        </div>
      )}

      {/* 드롭다운 닫기용 오버레이 */}
      {(openDropdown || showCustDropdown || showWhDropdown) && (
        <div className="fixed inset-0 z-40" onClick={() => { setOpenDropdown(null); setShowCustDropdown(false); setShowWhDropdown(false); }} />
      )}
    </div>
  );
}
