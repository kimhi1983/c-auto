'use client';

import { useState, useEffect } from 'react';
import { apiUrl, authHeaders } from '@/lib/api';

interface WarehouseInItem {
  id: number;
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

interface WarehouseOutItem {
  id: number;
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

type Tab = 'in' | 'out';

export default function WarehousePage() {
  const [tab, setTab] = useState<Tab>('in');
  const [inItems, setInItems] = useState<WarehouseInItem[]>([]);
  const [outItems, setOutItems] = useState<WarehouseOutItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const limit = 50;

  const fetchData = async (t: Tab, p = 1, q = '') => {
    setLoading(true);
    try {
      const endpoint = t === 'in' ? '/api/v1/logistics/warehouse/in' : '/api/v1/logistics/warehouse/out';
      const params = new URLSearchParams({ page: String(p), limit: String(limit) });
      if (q) params.set('search', q);
      const res = await fetch(apiUrl(`${endpoint}?${params}`), { headers: authHeaders() });
      const json = await res.json();
      if (json.status === 'success') {
        if (t === 'in') setInItems(json.data);
        else setOutItems(json.data);
        setTotal(json.total);
        setTotalPages(json.totalPages);
      }
    } catch (e) {
      console.error('창고 데이터 로드 실패:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(tab, page, search); }, [tab, page]);

  const handleSearch = () => {
    setPage(1);
    fetchData(tab, 1, search);
  };

  const handleTabChange = (t: Tab) => {
    setTab(t);
    setPage(1);
    setSearch('');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">창고 입출고</h1>
        <p className="text-sm text-slate-500 mt-1">KPROS 창고 입고/출고 반영 데이터</p>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => handleTabChange('in')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === 'in' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          창고입고
        </button>
        <button
          onClick={() => handleTabChange('out')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === 'out' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          창고출고
        </button>
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
          {tab === 'in' ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">입고일</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">품목명</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">브랜드</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">거래처</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">창고</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">수량</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">LOT</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">상태</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(10)].map((_, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      {[...Array(8)].map((_, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 rounded animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                ) : inItems.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400">데이터가 없습니다. KPROS 동기화를 먼저 실행하세요.</td></tr>
                ) : (
                  inItems.map((item) => (
                    <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{item.realWearingDate || item.purchaseDate || '-'}</td>
                      <td className="px-4 py-3 font-medium text-slate-800 max-w-[180px] truncate">{item.productNm}</td>
                      <td className="px-4 py-3 text-slate-600">{item.braNm || '-'}</td>
                      <td className="px-4 py-3 text-slate-600 max-w-[120px] truncate">{item.companyNm || '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{item.warehouseNm || '-'}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-800">{item.totalPurchaseQty?.toLocaleString() || '-'}</td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-xs">{item.lotNo || '-'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          item.purchaseStatus?.includes('완료') ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {item.purchaseStatus || '-'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">출고일</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">품목명</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">납품처</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">창고</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">예정수량</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">실수량</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">LOT</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">상태</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(10)].map((_, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      {[...Array(8)].map((_, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 rounded animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                ) : outItems.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400">데이터가 없습니다. KPROS 동기화를 먼저 실행하세요.</td></tr>
                ) : (
                  outItems.map((item) => (
                    <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{item.dueDate || '-'}</td>
                      <td className="px-4 py-3 font-medium text-slate-800 max-w-[180px] truncate">{item.productNm}</td>
                      <td className="px-4 py-3 text-slate-600 max-w-[120px] truncate">{item.companyToNm || '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{item.warehouseNm || '-'}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{item.expectQty?.toLocaleString() || '-'}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-800">{item.realQty?.toLocaleString() || '-'}</td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-xs">{item.lotNo || '-'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          item.deliveryStatus?.includes('완료') || item.deliveryStatus === 'COMPLETE' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {item.deliveryStatus || '-'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
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
    </div>
  );
}
