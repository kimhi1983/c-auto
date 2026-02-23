'use client';

import { useState, useEffect } from 'react';
import { apiUrl, authHeaders } from '@/lib/api';

interface PurchaseItem {
  id: number;
  kpros_idx: number;
  product_nm: string;
  bra_nm: string | null;
  company_nm: string | null;
  cost: number | null;
  income_cost: number | null;
  income_cost_unit_nm: string | null;
  lot_no: string | null;
  purchase_date: string | null;
  purchase_status: string | null;
  warehouse_nm: string | null;
  total_purchase_qty: number | null;
  pkg_unit_nm: string | null;
  manu_date: string | null;
  valid_date: string | null;
  expect_wearing_date: string | null;
  real_wearing_date: string | null;
  prch_no: string | null;
}

export default function PurchasesPage() {
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [selected, setSelected] = useState<PurchaseItem | null>(null);
  const limit = 50;

  const fetchData = async (p = 1, q = '') => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(limit) });
      if (q) params.set('search', q);
      const res = await fetch(apiUrl(`/api/v1/logistics/purchases?${params}`), { headers: authHeaders() });
      const json = await res.json();
      if (json.status === 'success') {
        setItems(json.data);
        setTotal(json.total);
        setTotalPages(json.totalPages);
      }
    } catch (e) {
      console.error('매입 데이터 로드 실패:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(page, search); }, [page]);

  const handleSearch = () => {
    setPage(1);
    fetchData(1, search);
  };

  const statusColor = (status: string | null) => {
    if (!status) return 'bg-slate-100 text-slate-600';
    if (status.includes('완료') || status === 'COMPLETE') return 'bg-green-100 text-green-700';
    if (status.includes('대기') || status === 'WAIT') return 'bg-yellow-100 text-yellow-700';
    return 'bg-slate-100 text-slate-600';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">매입등록</h1>
        <p className="text-sm text-slate-500 mt-1">KPROS 매입 데이터 ({total.toLocaleString()}건)</p>
      </div>

      {/* 검색 */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="품목명, 거래처, LOT번호, 창고 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          className="flex-1 rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
        />
        <button
          onClick={handleSearch}
          className="px-5 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors"
        >
          검색
        </button>
      </div>

      {/* 테이블 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-semibold text-slate-600">매입일</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">품목명</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">거래처</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">LOT</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">수량</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">창고</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">상태</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(10)].map((_, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    {[...Array(7)].map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">데이터가 없습니다. KPROS 동기화를 먼저 실행하세요.</td></tr>
              ) : (
                items.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => setSelected(item)}
                    className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{item.purchase_date || '-'}</td>
                    <td className="px-4 py-3 font-medium text-slate-800 max-w-[200px] truncate">{item.product_nm}</td>
                    <td className="px-4 py-3 text-slate-600 max-w-[150px] truncate">{item.company_nm || '-'}</td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-xs">{item.lot_no || '-'}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-800">
                      {item.total_purchase_qty?.toLocaleString() || '-'} <span className="text-xs text-slate-400">{item.pkg_unit_nm}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{item.warehouse_nm || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor(item.purchase_status)}`}>
                        {item.purchase_status || '-'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
            <span className="text-xs text-slate-500">
              {total.toLocaleString()}건 중 {(page - 1) * limit + 1}-{Math.min(page * limit, total)}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-sm rounded-lg border border-slate-200 hover:bg-white disabled:opacity-40 transition"
              >
                이전
              </button>
              <span className="px-3 py-1 text-sm text-slate-600">{page} / {totalPages}</span>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 text-sm rounded-lg border border-slate-200 hover:bg-white disabled:opacity-40 transition"
              >
                다음
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 상세 모달 */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">매입 상세</h3>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="space-y-3">
              {[
                ['품목명', selected.product_nm],
                ['브랜드', selected.bra_nm],
                ['거래처', selected.company_nm],
                ['매입일', selected.purchase_date],
                ['LOT번호', selected.lot_no],
                ['수량', `${selected.total_purchase_qty?.toLocaleString() || '-'} ${selected.pkg_unit_nm || ''}`],
                ['단가', selected.cost?.toLocaleString()],
                ['입고단가', `${selected.income_cost?.toLocaleString() || '-'} ${selected.income_cost_unit_nm || ''}`],
                ['창고', selected.warehouse_nm],
                ['상태', selected.purchase_status],
                ['매입번호', selected.prch_no],
                ['제조일', selected.manu_date],
                ['유효일', selected.valid_date],
                ['입고예정일', selected.expect_wearing_date],
                ['실입고일', selected.real_wearing_date],
              ].map(([label, value]) => (
                <div key={label as string} className="flex">
                  <span className="w-24 text-sm text-slate-500 shrink-0">{label}</span>
                  <span className="text-sm font-medium text-slate-800">{value || '-'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
