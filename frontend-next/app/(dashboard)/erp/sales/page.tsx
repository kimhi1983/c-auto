'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiUrl, authHeaders, authJsonHeaders } from '@/lib/api';

// ─── Types ───

interface ProductItem {
  PROD_CD: string;
  PROD_DES: string;
  UNIT?: string;
  PRICE?: string;
}

interface SaleInputRow {
  id: string;
  IO_DATE: string;
  CUST_CD: string;
  PROD_CD: string;
  PROD_DES: string;
  QTY: string;
  PRICE: string;
  WH_CD: string;
  REMARKS: string;
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

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function toYMD(dateStr: string): string {
  return dateStr.replace(/-/g, '');
}

function weekAgoYMD(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().split('T')[0].replace(/-/g, '');
}

function genId(): string {
  return Math.random().toString(36).slice(2, 9);
}

function emptyRow(): SaleInputRow {
  return {
    id: genId(),
    IO_DATE: todayISO(),
    CUST_CD: '',
    PROD_CD: '',
    PROD_DES: '',
    QTY: '',
    PRICE: '',
    WH_CD: '',
    REMARKS: '',
  };
}

// ─── Component ───

export default function SalesInputPage() {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [rows, setRows] = useState<SaleInputRow[]>([emptyRow()]);
  const [recentSales, setRecentSales] = useState<RecentSaleItem[]>([]);
  const [recentCustomers, setRecentCustomers] = useState<Array<{ code: string; name: string }>>([]);

  const [productsLoading, setProductsLoading] = useState(false);
  const [recentLoading, setRecentLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 품목 검색 상태 (각 행별)
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

  const fetchRecentSales = useCallback(async () => {
    setRecentLoading(true);
    try {
      const res = await fetch(
        apiUrl(`/api/v1/erp/sales?from=${weekAgoYMD()}&to=${toYMD(todayISO())}`),
        { headers: authHeaders() }
      );
      const json = await res.json();
      if (json.status === 'success') {
        setRecentSales(json.data.items || []);
        // 거래처 목록 추출
        const custMap = new Map<string, string>();
        for (const item of json.data.items || []) {
          if (item.CUST_CD && item.CUST_DES) custMap.set(item.CUST_CD, item.CUST_DES);
        }
        setRecentCustomers(Array.from(custMap, ([code, name]) => ({ code, name })));
      }
    } catch { /* ignore */ } finally {
      setRecentLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
    fetchRecentSales();
  }, [fetchProducts, fetchRecentSales]);

  // ─── 행 관리 ───

  const addRow = () => setRows([...rows, emptyRow()]);

  const removeRow = (id: string) => {
    if (rows.length <= 1) return;
    setRows(rows.filter((r) => r.id !== id));
  };

  const updateRow = (id: string, field: keyof SaleInputRow, value: string) => {
    setRows(rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const selectProduct = (rowId: string, product: ProductItem) => {
    setRows(rows.map((r) =>
      r.id === rowId
        ? { ...r, PROD_CD: product.PROD_CD, PROD_DES: product.PROD_DES, PRICE: product.PRICE || r.PRICE }
        : r
    ));
    setOpenDropdown(null);
    setProdSearch((prev) => ({ ...prev, [rowId]: '' }));
  };

  // ─── 계산 ───

  const calcRow = (row: SaleInputRow) => {
    const qty = parseFloat(row.QTY) || 0;
    const price = parseFloat(row.PRICE) || 0;
    const supply = qty * price;
    const vat = Math.round(supply * 0.1);
    return { supply, vat, total: supply + vat };
  };

  const totalCalc = rows.reduce(
    (acc, row) => {
      const c = calcRow(row);
      return { supply: acc.supply + c.supply, vat: acc.vat + c.vat, total: acc.total + c.total };
    },
    { supply: 0, vat: 0, total: 0 }
  );

  // ─── 전송 ───

  const canSubmit = rows.every((r) => r.IO_DATE && r.CUST_CD && r.PROD_CD && r.QTY && r.PRICE);

  const handleSubmit = async () => {
    setShowConfirm(false);
    setSubmitting(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    const items = rows.map((r) => ({
      IO_DATE: toYMD(r.IO_DATE),
      CUST_CD: r.CUST_CD,
      PROD_CD: r.PROD_CD,
      QTY: r.QTY,
      PRICE: r.PRICE,
      ...(r.WH_CD ? { WH_CD: r.WH_CD } : {}),
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
        setSuccessMsg(json.message || '판매 입력 완료');
        setRows([emptyRow()]);
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

  // ─── 품목 필터링 ───

  const getFilteredProducts = (rowId: string) => {
    const q = (prodSearch[rowId] || '').toLowerCase();
    if (!q) return products.slice(0, 50);
    return products.filter(
      (p) => p.PROD_CD.toLowerCase().includes(q) || p.PROD_DES.toLowerCase().includes(q)
    ).slice(0, 50);
  };

  // ─── Render ───

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">판매입력</h1>
          <p className="text-sm text-slate-500 mt-1">이카운트 ERP에 판매 데이터를 입력합니다</p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium">
          <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
          ERP 연동됨
        </span>
      </div>

      {/* 알림 메시지 */}
      {successMsg && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center gap-3">
          <svg className="w-5 h-5 text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          <p className="text-sm font-medium text-green-800 flex-1">{successMsg}</p>
          <button onClick={() => setSuccessMsg(null)} className="text-green-400 hover:text-green-600"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
      )}
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3">
          <svg className="w-5 h-5 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <p className="text-sm font-medium text-red-800 flex-1">{errorMsg}</p>
          <button onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-red-600"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
      )}

      {/* 입력 폼 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-700">판매 항목 입력</h2>
          <button
            onClick={addRow}
            className="px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition text-slate-600"
          >
            + 행 추가
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/50">
                <th className="text-left px-3 py-2.5 font-semibold text-slate-600 w-[130px]">날짜</th>
                <th className="text-left px-3 py-2.5 font-semibold text-slate-600 w-[140px]">판매처코드</th>
                <th className="text-left px-3 py-2.5 font-semibold text-slate-600 min-w-[200px]">품목</th>
                <th className="text-right px-3 py-2.5 font-semibold text-slate-600 w-[90px]">수량</th>
                <th className="text-right px-3 py-2.5 font-semibold text-slate-600 w-[110px]">단가</th>
                <th className="text-right px-3 py-2.5 font-semibold text-slate-600 w-[110px]">공급가</th>
                <th className="text-left px-3 py-2.5 font-semibold text-slate-600 w-[100px]">비고</th>
                <th className="w-[40px]"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const calc = calcRow(row);
                return (
                  <tr key={row.id} className="border-b border-slate-100">
                    {/* 날짜 */}
                    <td className="px-3 py-2">
                      <input
                        type="date"
                        value={row.IO_DATE}
                        onChange={(e) => updateRow(row.id, 'IO_DATE', e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                      />
                    </td>
                    {/* 판매처 */}
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={row.CUST_CD}
                        onChange={(e) => updateRow(row.id, 'CUST_CD', e.target.value)}
                        placeholder="거래처코드"
                        list={`cust-list-${row.id}`}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                      />
                      <datalist id={`cust-list-${row.id}`}>
                        {recentCustomers.map((c) => (
                          <option key={c.code} value={c.code}>{c.name}</option>
                        ))}
                      </datalist>
                    </td>
                    {/* 품목 */}
                    <td className="px-3 py-2 relative">
                      <div className="relative">
                        <input
                          type="text"
                          value={openDropdown === row.id ? (prodSearch[row.id] || '') : (row.PROD_CD ? `${row.PROD_CD} - ${row.PROD_DES}` : '')}
                          onChange={(e) => {
                            setProdSearch((prev) => ({ ...prev, [row.id]: e.target.value }));
                            setOpenDropdown(row.id);
                          }}
                          onFocus={() => setOpenDropdown(row.id)}
                          placeholder={productsLoading ? '품목 로딩중...' : '품목코드/명 검색'}
                          className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                        />
                        {openDropdown === row.id && (
                          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                            {getFilteredProducts(row.id).length === 0 ? (
                              <div className="px-3 py-2 text-xs text-slate-400">검색 결과 없음</div>
                            ) : (
                              getFilteredProducts(row.id).map((p) => (
                                <button
                                  key={p.PROD_CD}
                                  onClick={() => selectProduct(row.id, p)}
                                  className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm flex items-center gap-2 transition"
                                >
                                  <code className="text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-600">{p.PROD_CD}</code>
                                  <span className="text-slate-800 truncate">{p.PROD_DES}</span>
                                  {p.PRICE && parseFloat(p.PRICE) > 0 && (
                                    <span className="text-xs text-slate-400 ml-auto shrink-0">₩{parseFloat(p.PRICE).toLocaleString()}</span>
                                  )}
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    {/* 수량 */}
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={row.QTY}
                        onChange={(e) => updateRow(row.id, 'QTY', e.target.value)}
                        placeholder="0"
                        className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                      />
                    </td>
                    {/* 단가 */}
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={row.PRICE}
                        onChange={(e) => updateRow(row.id, 'PRICE', e.target.value)}
                        placeholder="0"
                        className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                      />
                    </td>
                    {/* 공급가 */}
                    <td className="px-3 py-2 text-right font-medium text-slate-700">
                      {calc.supply > 0 ? `₩${calc.supply.toLocaleString()}` : '-'}
                    </td>
                    {/* 비고 */}
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={row.REMARKS}
                        onChange={(e) => updateRow(row.id, 'REMARKS', e.target.value)}
                        placeholder=""
                        className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                      />
                    </td>
                    {/* 삭제 */}
                    <td className="px-2 py-2">
                      {rows.length > 1 && (
                        <button onClick={() => removeRow(row.id)} className="text-slate-300 hover:text-red-500 transition">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 합계 + 전송 */}
        <div className="px-5 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-6 text-sm">
            <span className="text-slate-500">공급가 <strong className="text-slate-800">₩{totalCalc.supply.toLocaleString()}</strong></span>
            <span className="text-slate-500">부가세 <strong className="text-slate-800">₩{totalCalc.vat.toLocaleString()}</strong></span>
            <span className="text-slate-500">합계 <strong className="text-blue-700 text-base">₩{totalCalc.total.toLocaleString()}</strong></span>
          </div>
          <button
            onClick={() => setShowConfirm(true)}
            disabled={!canSubmit || submitting}
            className="px-6 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? '전송 중...' : '이카운트 전송'}
          </button>
        </div>
      </div>

      {/* 최근 판매 내역 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-700">최근 판매 내역 (1주일)</h2>
          <button onClick={fetchRecentSales} disabled={recentLoading} className="text-xs text-slate-500 hover:text-slate-700">
            {recentLoading ? '로딩...' : '새로고침'}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/50">
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600">날짜</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600">판매처</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600">품목</th>
                <th className="text-right px-4 py-2.5 font-semibold text-slate-600">수량</th>
                <th className="text-right px-4 py-2.5 font-semibold text-slate-600">단가</th>
                <th className="text-right px-4 py-2.5 font-semibold text-slate-600">합계</th>
              </tr>
            </thead>
            <tbody>
              {recentLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    {[...Array(6)].map((_, j) => (
                      <td key={j} className="px-4 py-2.5"><div className="h-4 bg-slate-100 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : recentSales.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-sm">최근 1주일 판매 데이터가 없습니다</td></tr>
              ) : (
                recentSales.slice(0, 20).map((item, i) => (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 transition">
                    <td className="px-4 py-2.5 text-slate-600">{item.IO_DATE}</td>
                    <td className="px-4 py-2.5 text-slate-800 font-medium">{item.CUST_DES || item.CUST_CD}</td>
                    <td className="px-4 py-2.5 text-slate-700">{item.PROD_DES || item.PROD_CD}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{item.QTY}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">₩{parseFloat(item.PRICE || '0').toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-slate-800">₩{parseFloat(item.TOTAL_AMT || '0').toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 확인 모달 */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowConfirm(false)}>
          <div className="bg-white rounded-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 mb-2">판매 전송 확인</h3>
            <p className="text-sm text-slate-600 mb-4">
              <strong>{rows.length}건</strong>의 판매 데이터를 이카운트 ERP에 전송합니다.<br />
              합계: <strong className="text-blue-700">₩{totalCalc.total.toLocaleString()}</strong>
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowConfirm(false)} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition">취소</button>
              <button onClick={handleSubmit} className="px-5 py-2 text-sm font-medium text-white bg-brand-500 rounded-xl hover:bg-brand-600 transition">전송</button>
            </div>
          </div>
        </div>
      )}

      {/* 드롭다운 닫기용 오버레이 */}
      {openDropdown && (
        <div className="fixed inset-0 z-40" onClick={() => setOpenDropdown(null)} />
      )}
    </div>
  );
}
