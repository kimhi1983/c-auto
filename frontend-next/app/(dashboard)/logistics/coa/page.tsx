'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiUrl, authHeaders } from '@/lib/api';

interface CoaItem {
  id: number;
  product_idx: number | null;
  product_nm: string;
  warehouse_nm: string | null;
  lot_no: string | null;
  company_nm: string | null;
  manu_date: string | null;
  valid_date: string | null;
  bra_nm: string | null;
  reports_exist: number | null;
  pkg_amount: number | null;
  pkg_unit_nm: string | null;
  total_amount: number | null;
}

export default function CoaPage() {
  const searchParams = useSearchParams();
  const [items, setItems] = useState<CoaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expiringOnly, setExpiringOnly] = useState(searchParams.get('expiring') === 'true');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [selected, setSelected] = useState<CoaItem | null>(null);
  const limit = 50;

  const fetchData = async (p = 1, q = '', expiring = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(limit) });
      if (q) params.set('search', q);
      if (expiring) params.set('expiring', 'true');
      const res = await fetch(apiUrl(`/api/v1/logistics/coa?${params}`), { headers: authHeaders() });
      const json = await res.json();
      if (json.status === 'success') {
        setItems(json.data);
        setTotal(json.total);
        setTotalPages(json.totalPages);
      }
    } catch (e) {
      console.error('성적서 데이터 로드 실패:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(page, search, expiringOnly); }, [page, expiringOnly]);

  const handleSearch = () => {
    setPage(1);
    fetchData(1, search, expiringOnly);
  };

  const getDaysLeft = (validDate: string | null) => {
    if (!validDate) return null;
    return Math.ceil((new Date(validDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  };

  const expiryBadge = (validDate: string | null) => {
    const days = getDaysLeft(validDate);
    if (days === null) return <span className="text-xs text-slate-400">-</span>;
    if (days < 0) return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">만료됨</span>;
    if (days <= 30) return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">D-{days}</span>;
    if (days <= 90) return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">D-{days}</span>;
    return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">D-{days}</span>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">성적서 (CoA)</h1>
        <p className="text-sm text-slate-500 mt-1">KPROS 성적서 관리 — 만료 추적 ({total.toLocaleString()}건)</p>
      </div>

      {/* 필터 */}
      <div className="flex gap-2 flex-wrap">
        <input
          type="text"
          placeholder="품목명, 거래처, LOT번호, 브랜드 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          className="flex-1 min-w-[200px] rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
        />
        <button
          onClick={() => { setExpiringOnly(!expiringOnly); setPage(1); }}
          className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
            expiringOnly
              ? 'bg-orange-50 border-orange-300 text-orange-700'
              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          만료 임박 (90일)
        </button>
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
                <th className="text-left px-4 py-3 font-semibold text-slate-600">품목명</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">브랜드</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">거래처</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">LOT</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">제조일</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">유효일</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-600">남은기간</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">수량</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-600">성적서</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(10)].map((_, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    {[...Array(9)].map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-400">데이터가 없습니다. KPROS 동기화를 먼저 실행하세요.</td></tr>
              ) : (
                items.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => setSelected(item)}
                    className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-slate-800 max-w-[180px] truncate">{item.product_nm}</td>
                    <td className="px-4 py-3 text-slate-600">{item.bra_nm || '-'}</td>
                    <td className="px-4 py-3 text-slate-600 max-w-[120px] truncate">{item.company_nm || '-'}</td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-xs">{item.lot_no || '-'}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{item.manu_date || '-'}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{item.valid_date || '-'}</td>
                    <td className="px-4 py-3 text-center">{expiryBadge(item.valid_date)}</td>
                    <td className="px-4 py-3 text-right text-slate-800">
                      {item.total_amount?.toLocaleString() || item.pkg_amount?.toLocaleString() || '-'}
                      {item.pkg_unit_nm && <span className="text-xs text-slate-400 ml-1">{item.pkg_unit_nm}</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {item.reports_exist ? (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">있음</span>
                      ) : (
                        <span className="text-xs text-slate-400">없음</span>
                      )}
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
              <h3 className="text-lg font-bold text-slate-900">성적서 상세</h3>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="space-y-3">
              {[
                ['품목명', selected.product_nm],
                ['브랜드', selected.bra_nm],
                ['거래처', selected.company_nm],
                ['창고', selected.warehouse_nm],
                ['LOT번호', selected.lot_no],
                ['제조일', selected.manu_date],
                ['유효일', selected.valid_date],
                ['포장수량', `${selected.pkg_amount?.toLocaleString() || '-'} ${selected.pkg_unit_nm || ''}`],
                ['총수량', selected.total_amount?.toLocaleString()],
                ['성적서 유무', selected.reports_exist ? '있음' : '없음'],
              ].map(([label, value]) => (
                <div key={label as string} className="flex">
                  <span className="w-24 text-sm text-slate-500 shrink-0">{label}</span>
                  <span className="text-sm font-medium text-slate-800">{value || '-'}</span>
                </div>
              ))}
              {selected.valid_date && (
                <div className="flex">
                  <span className="w-24 text-sm text-slate-500 shrink-0">남은기간</span>
                  <span>{expiryBadge(selected.valid_date)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
