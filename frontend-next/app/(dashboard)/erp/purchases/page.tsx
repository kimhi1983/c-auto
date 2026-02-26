'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiUrl, authHeaders, authJsonHeaders } from '@/lib/api';

interface CompanyResult {
  companyCd: string;
  companyNm: string;
  ceoNm?: string;
}

// ─── Types ───

interface ProductItem {
  PROD_CD: string;
  PROD_DES: string;
  UNIT?: string;
  PRICE?: string;
  COST?: string;
}

interface PurchaseRow {
  id: string;
  PROD_CD: string;
  PROD_DES: string;
  SPEC: string;
  QTY: string;
  PRICE: string;
  REMARKS: string;
  ADD_COST: string;
}

interface RecentPurchaseItem {
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

function emptyRow(): PurchaseRow {
  return { id: genId(), PROD_CD: '', PROD_DES: '', SPEC: '', QTY: '', PRICE: '', REMARKS: '', ADD_COST: '' };
}

const YEARS = Array.from({ length: 5 }, (_, i) => String(2024 + i));
const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));
const DEFAULT_ROWS = 10;

// ─── Component ───

export default function PurchasesInputPage() {
  const searchParams = useSearchParams();
  const editId = searchParams?.get('edit');
  const [editingWorkflowId, setEditingWorkflowId] = useState<number | null>(null);

  // 헤더 상태 (이카운트 동일 필드)
  const [date, setDate] = useState(todayParts());
  const [custCd, setCustCd] = useState('');
  const [custDes, setCustDes] = useState('');
  const [whCd, setWhCd] = useState('');
  const [whDes, setWhDes] = useState('');

  // 테이블 행 (기본 3행)
  const [rows, setRows] = useState<PurchaseRow[]>(
    Array.from({ length: DEFAULT_ROWS }, () => emptyRow())
  );

  // 데이터
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [recentPurchases, setRecentPurchases] = useState<RecentPurchaseItem[]>([]);
  const [recentSuppliers, setRecentSuppliers] = useState<Array<{ code: string; name: string }>>([]);

  // 메모리(학습) 데이터
  const [memoryCusts, setMemoryCusts] = useState<Array<{ custCd: string; custDes: string; frequency: number }>>([]);
  const [memoryPrices, setMemoryPrices] = useState<Record<string, string>>({});

  // 거래처 자동완성 상태
  const [custSearch, setCustSearch] = useState('');
  const [custResults, setCustResults] = useState<CompanyResult[]>([]);
  const [custLoading, setCustLoading] = useState(false);
  const [showCustDropdown, setShowCustDropdown] = useState(false);
  const custDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 입고창고 드롭다운
  const [warehouseList, setWarehouseList] = useState<Array<{ code: string; name: string }>>([]);
  const [showWhDropdown, setShowWhDropdown] = useState(false);

  // UI 상태
  const [productsLoading, setProductsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showList, setShowList] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [prodSearch, setProdSearch] = useState<Record<string, string>>({});

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

  const fetchRecentPurchases = useCallback(async () => {
    try {
      const todayStr = toYMD(date.year, date.month, date.day);
      const res = await fetch(
        apiUrl(`/api/v1/erp/purchases?from=${weekAgoYMD()}&to=${todayStr}`),
        { headers: authHeaders() }
      );
      const json = await res.json();
      if (json.status === 'success') {
        setRecentPurchases(json.data.items || []);
        const custMap = new Map<string, string>();
        for (const item of json.data.items || []) {
          if (item.CUST_CD && item.CUST_DES) custMap.set(item.CUST_CD, item.CUST_DES);
        }
        setRecentSuppliers(Array.from(custMap, ([code, name]) => ({ code, name })));
      }
    } catch { /* ignore */ }
  }, [date]);

  // 학습된 거래처 로드
  const fetchMemoryCustomers = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/v1/memory?type=CUSTOMER&limit=30'), { headers: authHeaders() });
      const json = await res.json();
      if (json.status === 'success') setMemoryCusts(json.data.items || []);
    } catch { /* ignore */ }
  }, []);

  // 거래처별 학습된 단가 로드
  const fetchMemoryPrices = useCallback(async (cCd: string) => {
    if (!cCd) return;
    try {
      const res = await fetch(apiUrl(`/api/v1/memory?type=PRODUCT_PRICE&custCd=${encodeURIComponent(cCd)}`), { headers: authHeaders() });
      const json = await res.json();
      if (json.status === 'success') {
        const priceMap: Record<string, string> = {};
        for (const item of json.data.items || []) {
          if (item.prodCd && item.price) priceMap[item.prodCd] = item.price;
        }
        setMemoryPrices(priceMap);
      }
    } catch { /* ignore */ }
  }, []);

  // 거래처별 학습된 창고 자동 배정
  const fetchMemoryWarehouse = useCallback(async (cCd: string) => {
    if (!cCd) return;
    try {
      const res = await fetch(apiUrl(`/api/v1/memory?type=WAREHOUSE&custCd=${encodeURIComponent(cCd)}`), { headers: authHeaders() });
      const json = await res.json();
      if (json.status === 'success' && json.data.items?.length > 0) {
        const wh = json.data.items[0];
        if (wh.whCd && !whCd) {
          setWhCd(wh.whCd);
          setWhDes(wh.whDes || wh.whCd);
        }
      }
    } catch { /* ignore */ }
  }, [whCd]);

  // 거래처 debounced 검색
  useEffect(() => {
    if (custDebounceRef.current) clearTimeout(custDebounceRef.current);
    if (custSearch.length < 2) { setCustResults([]); return; }
    setCustLoading(true);
    custDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(apiUrl(`/api/v1/kpros/companies?search=${encodeURIComponent(custSearch)}&limit=10`), { headers: authHeaders() });
        const json = await res.json();
        if (json.status === 'success') setCustResults(json.data?.companies || []);
      } catch { /* ignore */ } finally { setCustLoading(false); }
    }, 300);
    return () => { if (custDebounceRef.current) clearTimeout(custDebounceRef.current); };
  }, [custSearch]);

  // 창고 목록 로드
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

  useEffect(() => {
    fetchProducts();
    fetchRecentPurchases();
    fetchMemoryCustomers();
    fetchWarehouses();
  }, [fetchProducts, fetchRecentPurchases, fetchMemoryCustomers]);

  // 편집 모드: ?edit=workflowId 로 기존 워크플로우 로드
  useEffect(() => {
    if (!editId) return;
    const loadWorkflow = async () => {
      try {
        const res = await fetch(apiUrl(`/api/v1/workflows?limit=200`), { headers: authHeaders() });
        const json = await res.json();
        if (json.status !== 'success') return;
        const wf = (json.data || []).find((w: any) => w.id === Number(editId));
        if (!wf) return;
        setEditingWorkflowId(wf.id);
        if (wf.custCd) setCustCd(wf.custCd);
        if (wf.customerName || wf.custName) setCustDes(wf.customerName || wf.custName);
        if (wf.ioDate) {
          const d = wf.ioDate.replace(/-/g, '');
          if (d.length === 8) setDate({ year: d.slice(0, 4), month: d.slice(4, 6), day: d.slice(6, 8) });
        }
        const items = wf.items || JSON.parse(wf.itemsData || '[]');
        if (items.length > 0) {
          const loadedRows: PurchaseRow[] = items.map((item: any) => ({
            id: genId(),
            PROD_CD: item.PROD_CD || '',
            PROD_DES: item.PROD_DES || '',
            SPEC: item.UNIT || '',
            QTY: String(item.QTY || ''),
            PRICE: String(item.PRICE || item.UNIT_PRICE || ''),
            REMARKS: item.REMARKS || '',
          }));
          while (loadedRows.length < DEFAULT_ROWS) loadedRows.push(emptyRow());
          setRows(loadedRows);
        }
        if (items[0]?.WH_CD) { setWhCd(items[0].WH_CD); setWhDes(items[0].WH_CD); }
      } catch { /* silent */ }
    };
    loadWorkflow();
  }, [editId]);

  // ─── 거래처 선택 ───

  const selectCustomer = (company: CompanyResult) => {
    setCustCd(company.companyCd);
    setCustDes(company.companyNm);
    setCustSearch('');
    setShowCustDropdown(false);
    fetchMemoryPrices(company.companyCd);
    fetchMemoryWarehouse(company.companyCd);
  };

  const selectRecentSupplier = (c: { code: string; name: string }) => {
    setCustCd(c.code);
    setCustDes(c.name);
    setCustSearch('');
    setShowCustDropdown(false);
    fetchMemoryPrices(c.code);
    fetchMemoryWarehouse(c.code);
  };

  const selectMemoryCust = (mc: { custCd: string; custDes: string }) => {
    setCustCd(mc.custCd);
    setCustDes(mc.custDes);
    setCustSearch('');
    setShowCustDropdown(false);
    fetchMemoryPrices(mc.custCd);
    fetchMemoryWarehouse(mc.custCd);
  };

  // ─── 행 관리 ───

  const updateRow = (id: string, field: keyof PurchaseRow, value: string) => {
    setRows(rows.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const addRow = () => setRows([...rows, emptyRow()]);
  const removeRow = (id: string) => {
    if (rows.length <= 1) return;
    setRows(rows.filter(r => r.id !== id));
  };

  const selectProduct = (rowId: string, product: ProductItem) => {
    const memPrice = memoryPrices[product.PROD_CD];
    const price = memPrice || product.COST || product.PRICE || '';
    setRows(rows.map(r =>
      r.id === rowId
        ? { ...r, PROD_CD: product.PROD_CD, PROD_DES: product.PROD_DES, SPEC: product.UNIT || '', PRICE: price || r.PRICE }
        : r
    ));
    setOpenDropdown(null);
    setProdSearch(prev => ({ ...prev, [rowId]: '' }));
  };

  // ─── 계산 ───

  const calcRow = (row: PurchaseRow) => {
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
      const res = await fetch(apiUrl('/api/v1/erp/purchases'), {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify({ items }),
      });
      const json = await res.json();
      if (json.status === 'success') {
        setSuccessMsg(json.message || `${items.length}건 구매 입력 완료`);
        // ERP 전송 성공 시 패턴 학습
        fetch(apiUrl('/api/v1/memory/learn'), {
          method: 'POST', headers: authJsonHeaders(),
          body: JSON.stringify({
            custCd, custDes, whCd, whDes, workflowType: 'PURCHASE',
            items: validRows.map(r => ({ PROD_CD: r.PROD_CD, PROD_DES: r.PROD_DES, PRICE: r.PRICE, UNIT: r.SPEC })),
          }),
        }).catch(() => {});
        handleReset();
        fetchRecentPurchases();
      } else {
        setErrorMsg(json.message || '구매 입력 실패');
      }
    } catch {
      setErrorMsg('서버 연결 오류');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── 승인 워크플로우 저장 ───

  const handleWorkflowSave = async (action: 'draft' | 'submit') => {
    if (validRows.length === 0) { setErrorMsg('품목을 입력하세요'); return; }
    if (!custCd && !custDes) { setErrorMsg('거래처를 선택하세요'); return; }

    setSubmitting(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    const items = validRows.map(r => ({
      PROD_CD: r.PROD_CD,
      PROD_DES: r.PROD_DES,
      QTY: r.QTY,
      PRICE: r.PRICE,
      UNIT: r.SPEC,
      SUPPLY_AMT: String((parseFloat(r.QTY) || 0) * (parseFloat(r.PRICE) || 0)),
      WH_CD: whCd || whDes || '',
      REMARKS: r.REMARKS,
    }));

    try {
      const payload = {
        workflowType: 'PURCHASE',
        customerName: custDes || custCd,
        custCd,
        ioDate: `${date.year}-${date.month}-${date.day}`,
        items,
        totalAmount: totals.supply + totals.vat,
        action,
      };

      const isEdit = !!editingWorkflowId;
      const url = isEdit ? apiUrl(`/api/v1/workflows/${editingWorkflowId}`) : apiUrl('/api/v1/workflows');
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.status === 'success') {
        setSuccessMsg(json.message || (action === 'submit' ? '승인 요청 완료' : isEdit ? '수정 완료' : '임시저장 완료'));
        fetch(apiUrl('/api/v1/memory/learn'), {
          method: 'POST', headers: authJsonHeaders(),
          body: JSON.stringify({ custCd, custDes, whCd, whDes, items, workflowType: 'PURCHASE' }),
        }).catch(() => {});
        fetchMemoryCustomers();
        if (action === 'submit') {
          handleReset();
          setEditingWorkflowId(null);
          if (isEdit) window.history.replaceState({}, '', '/erp/purchases');
        }
      } else {
        setErrorMsg(json.message || '저장 실패');
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

  // (handleCustChange는 드롭다운 선택으로 대체됨)

  // ─── 셀 스타일 ───
  const inputCls = 'w-full px-3 py-2.5 text-sm border-0 bg-transparent focus:outline-none focus:bg-orange-50/50';
  const headerInputCls = 'rounded border border-slate-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400 focus:border-orange-400';
  const headerSelectCls = 'rounded border border-slate-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400';

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

        {/* 편집 모드 배너 */}
        {editingWorkflowId && (
          <div className="px-5 py-3 bg-blue-50 border-b border-blue-200 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-blue-800">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              <span className="font-semibold">워크플로우 #{editingWorkflowId} 수정 중</span>
            </div>
            <a href="/erp/purchases" className="text-xs text-blue-600 hover:text-blue-800 font-medium">새 문서 작성</a>
          </div>
        )}

        {/* 제목 바 */}
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-amber-400 text-lg">★</span>
            <h1 className="text-base font-bold text-slate-900">구매입력</h1>
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
                    <div className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
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
                            className="w-full text-left px-3 py-2 hover:bg-orange-50 text-sm flex items-center gap-2 transition border-b border-slate-100 last:border-0"
                          >
                            <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 shrink-0">{c.companyCd}</code>
                            <span className="text-slate-800 truncate flex-1">{c.companyNm}</span>
                            {c.ceoNm && <span className="text-xs text-slate-400 shrink-0">{c.ceoNm}</span>}
                          </button>
                        ))
                      )
                    ) : (
                      <>
                        {memoryCusts.length > 0 && (
                          <>
                            <div className="px-3 py-1.5 text-xs text-amber-600 bg-amber-50/50 border-b border-slate-100 flex items-center gap-1">
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a6 6 0 00-6 6c0 1.8.8 3.4 2 4.5V15a1 1 0 001 1h6a1 1 0 001-1v-2.5A6 6 0 0010 2zm-1 14v1a1 1 0 102 0v-1H9z"/></svg>
                              학습된 거래처
                            </div>
                            {memoryCusts.map(mc => (
                              <button
                                key={mc.custCd}
                                onClick={() => selectMemoryCust(mc)}
                                className="w-full text-left px-3 py-2 hover:bg-amber-50 text-sm flex items-center gap-2 transition border-b border-slate-100 last:border-0"
                              >
                                <code className="text-xs bg-amber-100 px-1.5 py-0.5 rounded text-amber-700 shrink-0">{mc.custCd}</code>
                                <span className="text-slate-800 truncate flex-1">{mc.custDes}</span>
                                <span className="text-xs text-slate-400 shrink-0">{mc.frequency}회</span>
                              </button>
                            ))}
                          </>
                        )}
                        {recentSuppliers.length > 0 && (
                          <>
                            <div className="px-3 py-1.5 text-xs text-slate-400 bg-slate-50 border-b border-slate-100">최근 거래처 (ERP)</div>
                            {recentSuppliers.map(c => (
                              <button
                                key={c.code}
                                onClick={() => selectRecentSupplier(c)}
                                className="w-full text-left px-3 py-2 hover:bg-orange-50 text-sm flex items-center gap-2 transition border-b border-slate-100 last:border-0"
                              >
                                <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 shrink-0">{c.code}</code>
                                <span className="text-slate-800 truncate flex-1">{c.name}</span>
                              </button>
                            ))}
                          </>
                        )}
                        {memoryCusts.length === 0 && recentSuppliers.length === 0 && (
                          <div className="px-3 py-3 text-xs text-slate-400 text-center">거래처명을 2자 이상 입력하세요</div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
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

            {/* 입고창고 - KPROS 창고 드롭다운 */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-500 w-16 shrink-0">입고창고</label>
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
                          className={`w-full text-left px-3 py-2 hover:bg-orange-50 text-sm transition border-b border-slate-100 last:border-0 ${whCd === w.code ? 'bg-orange-50 text-orange-700 font-medium' : 'text-slate-700'}`}
                        >
                          {w.name}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
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
                <th className="px-3 py-3 text-right text-indigo-700 font-semibold border-r border-slate-200 w-24">기본수량</th>
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
                  <tr key={row.id} className="border-b border-slate-200 hover:bg-orange-50/30 group">
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
                              className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-orange-400"
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
                                className="w-full text-left px-3 py-2 hover:bg-orange-50 text-sm flex items-center gap-2 transition border-b border-slate-100 last:border-0"
                              >
                                <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 shrink-0">{p.PROD_CD}</code>
                                <span className="text-slate-800 truncate flex-1">{p.PROD_DES}</span>
                                {(p.COST || p.PRICE) && parseFloat(p.COST || p.PRICE || '0') > 0 && (
                                  <span className="text-xs text-red-500 shrink-0">₩{parseFloat(p.COST || p.PRICE || '0').toLocaleString()}</span>
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
                    {/* 기본수량 */}
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

        {/* ─── 액션 바 ─── */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center gap-2 flex-wrap">
          <button
            onClick={() => handleWorkflowSave('draft')}
            disabled={validRows.length === 0 || submitting}
            className="px-4 py-2 bg-white border border-slate-300 text-sm font-semibold text-slate-700 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            임시저장
          </button>
          <button
            onClick={() => handleWorkflowSave('submit')}
            disabled={!canSubmit || submitting}
            className="px-5 py-2 bg-brand-500 text-white font-bold text-sm rounded-lg hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm"
          >
            {submitting ? '처리 중...' : '승인요청 →'}
          </button>
          <div className="w-px h-6 bg-slate-300 mx-1" />
          <button
            onClick={() => setShowConfirm(true)}
            disabled={!canSubmit || submitting}
            className="px-4 py-2 bg-amber-400 text-slate-900 font-bold text-sm rounded-lg hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm"
            title="이카운트 ERP 직접 전송"
          >
            ERP 전송
          </button>
          <button
            onClick={handleReset}
            className="px-4 py-2 bg-white border border-slate-300 text-sm text-slate-700 rounded-lg hover:bg-slate-100 transition"
          >
            다시 작성
          </button>
          <button
            onClick={() => setShowList(!showList)}
            className={`px-4 py-2 border text-sm rounded-lg transition ${showList ? 'bg-orange-50 border-orange-300 text-orange-700' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'}`}
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

      {/* ─── 최근 구매 내역 (리스트) ─── */}
      {showList && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-700">거래내역보기(구매) — 최근 1주일</h2>
            <button onClick={fetchRecentPurchases} className="text-xs text-slate-500 hover:text-slate-700">
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
                {recentPurchases.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400 text-sm">최근 1주일 구매 데이터가 없습니다</td></tr>
                ) : (
                  recentPurchases.slice(0, 30).map((item, i) => (
                    <tr key={i} className="border-b border-slate-200 hover:bg-orange-50/30 transition">
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
            <h3 className="text-lg font-bold text-slate-900 mb-2">구매 전송 확인</h3>
            <div className="text-sm text-slate-600 mb-4 space-y-1">
              <p>일자: <strong>{date.year}/{date.month}/{date.day}</strong></p>
              <p>거래처: <strong>{custCd}</strong> {custDes}</p>
              <p>건수: <strong>{validRows.length}건</strong></p>
              <p>공급가액: <strong>{totals.supply.toLocaleString()}</strong></p>
              <p>부가세: <strong>{totals.vat.toLocaleString()}</strong></p>
              <p className="text-base mt-2">합계: <strong className="text-orange-700 text-lg">₩{(totals.supply + totals.vat).toLocaleString()}</strong></p>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowConfirm(false)} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition">취소</button>
              <button onClick={handleSubmit} className="px-5 py-2 text-sm font-medium text-white bg-orange-600 rounded-xl hover:bg-orange-700 transition">전송</button>
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
