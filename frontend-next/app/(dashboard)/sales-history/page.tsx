'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiUrl, authHeaders } from '@/lib/api';

// ─── Types ───

interface WorkflowItem {
  id: number;
  workflowType: string;
  status: string;
  orderNumber: string | null;
  ioDate: string;
  custCd: string | null;
  custName: string | null;
  customerName: string | null;
  items: { PROD_CD?: string; PROD_DES?: string; QTY?: string; PRICE?: string; SUPPLY_AMT?: string; WH_CD?: string; REMARKS?: string }[];
  totalAmount: number;
  erpSubmittedAt: string | null;
  createdAt: string;
}

// ─── Helpers ───

function formatYMD(ymd: string) {
  if (!ymd) return '-';
  if (ymd.length === 8) return `${ymd.slice(0, 4)}.${ymd.slice(4, 6)}.${ymd.slice(6, 8)}`;
  if (ymd.includes('-')) return ymd.replace(/-/g, '.');
  return ymd;
}

function formatAmount(v: string | number) {
  return Number(v || 0).toLocaleString();
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: '임시저장', PENDING_APPROVAL: '승인대기', APPROVED: '승인완료', REJECTED: '반려',
  ERP_SUBMITTED: 'ERP전송', SHIPPING_ORDER: '출고지시', PICKING: '피킹/포장', SHIPPED: '출고완료', DELIVERED: '납품완료',
};

function statusColor(status: string) {
  switch (status) {
    case 'DELIVERED': return 'bg-green-100 text-green-700';
    case 'SHIPPED': case 'PICKING': return 'bg-blue-100 text-blue-700';
    case 'ERP_SUBMITTED': case 'SHIPPING_ORDER': return 'bg-emerald-100 text-emerald-700';
    case 'PENDING_APPROVAL': return 'bg-amber-100 text-amber-700';
    case 'REJECTED': return 'bg-red-100 text-red-700';
    case 'DRAFT': return 'bg-slate-100 text-slate-600';
    default: return 'bg-slate-100 text-slate-600';
  }
}

// ─── Component ───

export default function SalesHistoryPage() {
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const loadWorkflows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/api/v1/workflows?type=SALES&limit=100'), { headers: authHeaders() });
      const json = await res.json();
      if (json.status === 'success') setWorkflows(json.data || []);
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadWorkflows(); }, [loadWorkflows]);

  // 검색 필터
  const filtered = workflows.filter(w => {
    if (!search) return true;
    const q = search.toLowerCase();
    const name = (w.customerName || w.custName || '').toLowerCase();
    const items = (w.items || []).map(i => (i.PROD_DES || '').toLowerCase()).join(' ');
    return name.includes(q) || items.includes(q) || (w.orderNumber || '').toLowerCase().includes(q);
  });

  // 요약
  const wfTotal = workflows.reduce((s, w) => s + (w.totalAmount || 0), 0);
  const wfCusts = new Set(workflows.map(w => w.customerName || w.custName)).size;

  // Dropbox Excel 저장
  const exportToDropbox = async () => {
    setExporting(true);
    setExportResult(null);
    try {
      const res = await fetch(apiUrl('/api/v1/workflows/export-dropbox/sales'), {
        method: 'POST',
        headers: authHeaders(),
      });
      const json = await res.json();
      if (json.status === 'success') {
        setExportResult({ ok: true, msg: json.message || '저장 완료' });
      } else {
        setExportResult({ ok: false, msg: json.message || '저장 실패' });
      }
    } catch {
      setExportResult({ ok: false, msg: '네트워크 오류' });
    }
    setExporting(false);
    setTimeout(() => setExportResult(null), 4000);
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="animate-fadeIn">
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <span>관리</span>
          <span className="text-slate-300">/</span>
          <span className="text-slate-700 font-medium">판매현황</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">판매현황</h1>
            <p className="text-sm text-slate-500 mt-1">C-Auto 판매입력 기록</p>
          </div>
          <div className="flex items-center gap-2">
            {exportResult && (
              <span className={`text-xs px-3 py-1.5 rounded-lg ${exportResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {exportResult.msg}
              </span>
            )}
            <button
              onClick={exportToDropbox}
              disabled={exporting || workflows.length === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              )}
              Dropbox 저장
            </button>
          </div>
        </div>
      </div>

      {/* 검색 + 새로고침 */}
      <div className="flex flex-wrap items-center gap-3 animate-fadeIn">
        <button
          onClick={loadWorkflows}
          className="px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          새로고침
        </button>
        <div className="flex-1" />
        <input
          type="text"
          placeholder="거래처 · 품목 · 주문번호 검색"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-4 py-2 rounded-xl border border-slate-200 bg-slate-50/50 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-300"
        />
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-fadeInUp">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4">
          <div className="text-xs text-slate-500 mb-1">총 금액</div>
          <div className="text-xl font-bold text-blue-600">{formatAmount(wfTotal)}<span className="text-sm font-normal text-slate-400 ml-0.5">원</span></div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4">
          <div className="text-xs text-slate-500 mb-1">건수</div>
          <div className="text-xl font-bold text-slate-900">{workflows.length}<span className="text-sm font-normal text-slate-400 ml-0.5">건</span></div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4">
          <div className="text-xs text-slate-500 mb-1">거래처</div>
          <div className="text-xl font-bold text-slate-900">{wfCusts}<span className="text-sm font-normal text-slate-400 ml-0.5">곳</span></div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4">
          <div className="text-xs text-slate-500 mb-1">납품완료</div>
          <div className="text-xl font-bold text-green-600">{workflows.filter(w => w.status === 'DELIVERED').length}<span className="text-sm font-normal text-slate-400 ml-0.5">건</span></div>
        </div>
      </div>

      {/* 워크플로우 리스트 */}
      <div className="animate-fadeIn">
        {loading ? (
          <div className="text-center py-14 text-slate-400 text-sm">불러오는 중...</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center">
            <svg className="w-10 h-10 text-slate-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-sm text-slate-500">판매 기록이 없습니다</p>
            <p className="text-xs text-slate-400 mt-1">판매입력 시 자동으로 기록됩니다</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(w => {
              const itemCount = (w.items || []).length;
              const firstItem = (w.items || [])[0];
              return (
                <div key={w.id} className="bg-white rounded-2xl border border-slate-200 p-4 hover:shadow-md hover:border-slate-300 transition">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${statusColor(w.status)}`}>
                        {STATUS_LABELS[w.status] || w.status}
                      </span>
                      {w.orderNumber && <span className="text-xs text-slate-400 font-mono">{w.orderNumber}</span>}
                    </div>
                    <span className="text-xs text-slate-400">{formatYMD(w.ioDate)}</span>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="text-sm">
                      <span className="font-medium text-slate-900">{w.customerName || w.custName || w.custCd || '-'}</span>
                      <span className="text-slate-400 mx-2">·</span>
                      <span className="text-slate-600">{firstItem?.PROD_DES || firstItem?.PROD_CD || '-'}{itemCount > 1 ? ` 외 ${itemCount - 1}건` : ''}</span>
                    </div>
                    <span className="text-sm font-semibold text-slate-900">{formatAmount(w.totalAmount)}원</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
