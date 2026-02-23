'use client';

import { useState, useEffect } from 'react';
import { apiUrl, authHeaders } from '@/lib/api';
import Link from 'next/link';

interface DashboardData {
  summary: {
    purchases: number;
    deliveries: number;
    inbound: number;
    outbound: number;
    warehouseIn: number;
    warehouseOut: number;
    coa: number;
  };
  recentPurchases: any[];
  recentDeliveries: any[];
  expiringCoa: any[];
}

export default function LogisticsDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);

  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/api/v1/logistics/dashboard'), { headers: authHeaders() });
      const json = await res.json();
      if (json.status === 'success') setData(json.data);
    } catch (e) {
      console.error('대시보드 로드 실패:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDashboard(); }, []);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch(apiUrl('/api/v1/logistics/sync'), {
        method: 'POST',
        headers: authHeaders(),
      });
      const json = await res.json();
      setSyncResult(json.data);
      await fetchDashboard();
    } catch (e) {
      console.error('동기화 실패:', e);
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-slate-200 rounded-lg w-48 animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="h-24 bg-white rounded-2xl border border-slate-200/80 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const s = data?.summary;

  const flowCards = [
    { label: '매입등록', count: s?.purchases || 0, href: '/logistics/purchases', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    { label: '입고반영', count: s?.inbound || 0, href: '#', color: 'bg-sky-50 text-sky-700 border-sky-200' },
    { label: '창고입고', count: s?.warehouseIn || 0, href: '/logistics/warehouse', color: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
    { label: '납품등록', count: s?.deliveries || 0, href: '/logistics/deliveries', color: 'bg-orange-50 text-orange-700 border-orange-200' },
    { label: '출고반영', count: s?.outbound || 0, href: '#', color: 'bg-amber-50 text-amber-700 border-amber-200' },
    { label: '창고출고', count: s?.warehouseOut || 0, href: '/logistics/warehouse', color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
    { label: '성적서(CoA)', count: s?.coa || 0, href: '/logistics/coa', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  ];

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">물류 관리 대시보드</h1>
          <p className="text-sm text-slate-500 mt-1">KPROS 물류 데이터 통합 조회</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="px-4 py-2 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {syncing ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                동기화 중...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                KPROS 동기화
              </>
            )}
          </button>
          <button
            onClick={fetchDashboard}
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            새로고침
          </button>
        </div>
      </div>

      {/* 동기화 결과 */}
      {syncResult && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
          <p className="text-sm font-medium text-green-800 mb-2">동기화 완료</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {Object.entries(syncResult).map(([key, val]: [string, any]) => (
              <div key={key} className="text-xs text-green-700">
                <span className="font-medium">{key}</span>: {val.synced || 0}건
                {val.error && <span className="text-red-600 ml-1">({val.error})</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {flowCards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className={`rounded-2xl border p-4 transition-all hover:shadow-md ${card.color}`}
          >
            <div className="text-2xl font-bold">{card.count.toLocaleString()}</div>
            <div className="text-xs font-medium mt-1">{card.label}</div>
          </Link>
        ))}
      </div>

      {/* 물류 흐름도 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6">
        <h3 className="text-sm font-bold text-slate-700 mb-4">물류 흐름</h3>
        <div className="space-y-4">
          {/* 입고 흐름 */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-blue-600 w-16">입고</span>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs font-medium text-blue-700">
                매입등록 ({s?.purchases || 0})
              </span>
              <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              <span className="px-3 py-1.5 bg-sky-50 border border-sky-200 rounded-lg text-xs font-medium text-sky-700">
                입고반영 ({s?.inbound || 0})
              </span>
              <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              <span className="px-3 py-1.5 bg-cyan-50 border border-cyan-200 rounded-lg text-xs font-medium text-cyan-700">
                창고입고 ({s?.warehouseIn || 0})
              </span>
              <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              <span className="px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg text-xs font-medium text-green-700">
                재고 증가
              </span>
            </div>
          </div>
          {/* 출고 흐름 */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-orange-600 w-16">출고</span>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-3 py-1.5 bg-orange-50 border border-orange-200 rounded-lg text-xs font-medium text-orange-700">
                납품등록 ({s?.deliveries || 0})
              </span>
              <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              <span className="px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs font-medium text-amber-700">
                출고반영 ({s?.outbound || 0})
              </span>
              <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              <span className="px-3 py-1.5 bg-yellow-50 border border-yellow-200 rounded-lg text-xs font-medium text-yellow-700">
                창고출고 ({s?.warehouseOut || 0})
              </span>
              <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              <span className="px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg text-xs font-medium text-red-700">
                재고 감소
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 최근 데이터 3열 */}
      <div className="grid md:grid-cols-3 gap-4">
        {/* 최근 매입 */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-700">최근 매입</h3>
            <Link href="/logistics/purchases" className="text-xs text-brand-600 hover:text-brand-700 font-medium">전체보기</Link>
          </div>
          {data?.recentPurchases?.length ? (
            <div className="space-y-2.5">
              {data.recentPurchases.map((item, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-800 truncate">{item.product_nm}</div>
                    <div className="text-xs text-slate-500">{item.company_nm} · {item.purchase_date}</div>
                  </div>
                  <span className="text-xs font-medium text-slate-600 shrink-0 ml-2">
                    {item.total_purchase_qty?.toLocaleString()} {item.pkg_unit_nm}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">동기화 후 표시됩니다</p>
          )}
        </div>

        {/* 최근 납품 */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-700">최근 납품</h3>
            <Link href="/logistics/deliveries" className="text-xs text-brand-600 hover:text-brand-700 font-medium">전체보기</Link>
          </div>
          {data?.recentDeliveries?.length ? (
            <div className="space-y-2.5">
              {data.recentDeliveries.map((item, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-800 truncate">{item.product_nm}</div>
                    <div className="text-xs text-slate-500">{item.company_to_nm} · {item.due_date}</div>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ml-2 ${
                    item.delivery_status === 'COMPLETE' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {item.delivery_status_str || item.delivery_status || '-'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">동기화 후 표시됩니다</p>
          )}
        </div>

        {/* 만료 임박 성적서 */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-700">만료 임박 성적서</h3>
            <Link href="/logistics/coa?expiring=true" className="text-xs text-brand-600 hover:text-brand-700 font-medium">전체보기</Link>
          </div>
          {data?.expiringCoa?.length ? (
            <div className="space-y-2.5">
              {data.expiringCoa.map((item, i) => {
                const daysLeft = item.valid_date
                  ? Math.ceil((new Date(item.valid_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                  : null;
                return (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-800 truncate">{item.product_nm}</div>
                      <div className="text-xs text-slate-500">{item.lot_no} · {item.valid_date}</div>
                    </div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ml-2 ${
                      daysLeft !== null && daysLeft <= 30 ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
                    }`}>
                      D-{daysLeft}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-400">만료 임박 성적서 없음</p>
          )}
        </div>
      </div>
    </div>
  );
}
