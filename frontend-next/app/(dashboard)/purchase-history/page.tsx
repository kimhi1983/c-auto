'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiUrl, authHeaders } from '@/lib/api';

// ─── Types ───

interface ErpPurchaseItem {
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

function dateToYMD(d: Date) {
  return d.toISOString().split('T')[0].replace(/-/g, '');
}

function formatYMD(ymd: string) {
  if (!ymd) return '-';
  if (ymd.length === 8) return `${ymd.slice(0, 4)}.${ymd.slice(4, 6)}.${ymd.slice(6, 8)}`;
  if (ymd.includes('-')) return ymd.replace(/-/g, '.');
  return ymd;
}

function formatAmount(v: string | number) {
  return Number(v || 0).toLocaleString();
}

function periodRange(period: string): { from: string; to: string } {
  const now = new Date();
  const to = dateToYMD(now);
  let from: Date;
  switch (period) {
    case 'today': from = new Date(now); break;
    case 'week': from = new Date(now); from.setDate(from.getDate() - 6); break;
    case 'month': from = new Date(now.getFullYear(), now.getMonth(), 1); break;
    case '3months': from = new Date(now); from.setMonth(from.getMonth() - 3); break;
    default: from = new Date(now.getFullYear(), now.getMonth(), 1); break;
  }
  return { from: dateToYMD(from), to };
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: '임시저장', PENDING_APPROVAL: '승인대기', APPROVED: '승인완료', REJECTED: '반려',
  ERP_SUBMITTED: 'ERP전송', RECEIVING_SCHEDULED: '입고예정', INSPECTING: '입고검수', RECEIVED: '입고완료', STOCKED: '재고반영',
};

function statusColor(status: string) {
  switch (status) {
    case 'STOCKED': return 'bg-green-100 text-green-700';
    case 'RECEIVED': case 'INSPECTING': return 'bg-blue-100 text-blue-700';
    case 'ERP_SUBMITTED': case 'RECEIVING_SCHEDULED': return 'bg-emerald-100 text-emerald-700';
    case 'PENDING_APPROVAL': return 'bg-amber-100 text-amber-700';
    case 'REJECTED': return 'bg-red-100 text-red-700';
    case 'DRAFT': return 'bg-slate-100 text-slate-600';
    default: return 'bg-slate-100 text-slate-600';
  }
}

// ─── Component ───

export default function PurchaseHistoryPage() {
  const [tab, setTab] = useState<'erp' | 'workflow'>('erp');
  const [period, setPeriod] = useState('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // ERP data
  const [erpItems, setErpItems] = useState<ErpPurchaseItem[]>([]);
  const [erpSummary, setErpSummary] = useState<{ total_amount: number; total_supply: number; total_vat: number; total_count: number } | null>(null);
  const [erpTopCustomers, setErpTopCustomers] = useState<{ name: string; amount: number; count: number }[]>([]);
  const [erpTopProducts, setErpTopProducts] = useState<{ name: string; amount: number; qty: number }[]>([]);
  const [erpError, setErpError] = useState('');

  // Workflow data
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [wfLoading, setWfLoading] = useState(true);

  const getRange = useCallback(() => {
    if (period === 'custom' && customFrom && customTo) {
      return { from: customFrom.replace(/-/g, ''), to: customTo.replace(/-/g, '') };
    }
    return periodRange(period);
  }, [period, customFrom, customTo]);

  const loadErpData = useCallback(async () => {
    setLoading(true);
    setErpError('');
    try {
      const { from, to } = getRange();
      const res = await fetch(apiUrl(`/api/v1/erp/purchases?from=${from}&to=${to}`), { headers: authHeaders() });
      const json = await res.json();
      if (json.status === 'success' && json.data) {
        setErpItems(json.data.items || []);
        setErpSummary(json.data.summary || null);
        setErpTopCustomers(json.data.top_customers || []);
        setErpTopProducts(json.data.top_products || []);
      } else {
        setErpError(json.data?.api_error || json.error || 'ERP 조회 실패');
      }
    } catch {
      setErpError('네트워크 오류');
    }
    setLoading(false);
  }, [getRange]);

  const loadWorkflows = useCallback(async () => {
    setWfLoading(true);
    try {
      const res = await fetch(apiUrl('/api/v1/workflows?type=PURCHASE&limit=100'), { headers: authHeaders() });
      const json = await res.json();
      if (json.status === 'success') setWorkflows(json.data || []);
    } catch { /* silent */ }
    setWfLoading(false);
  }, []);

  useEffect(() => { loadErpData(); }, [loadErpData]);
  useEffect(() => { loadWorkflows(); }, [loadWorkflows]);

  // 검색 필터
  const filteredErp = erpItems.filter(item => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (item.CUST_DES || '').toLowerCase().includes(q)
      || (item.PROD_DES || '').toLowerCase().includes(q)
      || (item.PROD_CD || '').toLowerCase().includes(q);
  });

  const filteredWf = workflows.filter(w => {
    if (!search) return true;
    const q = search.toLowerCase();
    const name = (w.customerName || w.custName || '').toLowerCase();
    const items = (w.items || []).map(i => (i.PROD_DES || '').toLowerCase()).join(' ');
    return name.includes(q) || items.includes(q) || (w.orderNumber || '').toLowerCase().includes(q);
  });

  // 워크플로우 요약 계산
  const wfTotal = workflows.reduce((s, w) => s + (w.totalAmount || 0), 0);
  const wfCusts = new Set(workflows.map(w => w.customerName || w.custName)).size;

  // CSV 내보내기
  const exportCsv = () => {
    const rows = tab === 'erp' ? filteredErp : [];
    if (tab === 'erp' && rows.length > 0) {
      const header = '날짜,거래처코드,거래처명,품목코드,품목명,수량,단가,공급가,부가세,합계';
      const body = rows.map(r =>
        `${formatYMD(r.IO_DATE)},${r.CUST_CD},${r.CUST_DES},${r.PROD_CD},${r.PROD_DES},${r.QTY},${r.PRICE},${r.SUPPLY_AMT},${r.VAT_AMT},${r.TOTAL_AMT}`
      ).join('\n');
      const csv = '\uFEFF' + header + '\n' + body;
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `구매현황_${getRange().from}-${getRange().to}.csv`; a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="animate-fadeIn">
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <span>관리</span>
          <span className="text-slate-300">/</span>
          <span className="text-slate-700 font-medium">구매현황</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">구매현황</h1>
            <p className="text-sm text-slate-500 mt-1">ERP 구매 실적 및 워크플로우 기록 조회</p>
          </div>
          {tab === 'erp' && filteredErp.length > 0 && (
            <button onClick={exportCsv} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              CSV 내보내기
            </button>
          )}
        </div>
      </div>

      {/* 기간 필터 */}
      <div className="flex flex-wrap items-center gap-3 animate-fadeIn">
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {[
            { key: 'today', label: '오늘' },
            { key: 'week', label: '이번주' },
            { key: 'month', label: '이번달' },
            { key: '3months', label: '3개월' },
            { key: 'custom', label: '직접입력' },
          ].map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                period === p.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-sm" />
            <span className="text-slate-400">~</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-sm" />
            <button onClick={loadErpData} className="px-3 py-1.5 text-sm font-medium text-white bg-slate-900 rounded-xl hover:bg-slate-800 transition">조회</button>
          </div>
        )}
        <div className="flex-1" />
        <input
          type="text"
          placeholder="거래처 · 품목 검색"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-4 py-2 rounded-xl border border-slate-200 bg-slate-50/50 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-300"
        />
      </div>

      {/* 요약 카드 */}
      {tab === 'erp' && erpSummary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-fadeInUp">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4">
            <div className="text-xs text-slate-500 mb-1">총 구매액</div>
            <div className="text-xl font-bold text-amber-600">{formatAmount(erpSummary.total_amount)}<span className="text-sm font-normal text-slate-400 ml-0.5">원</span></div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4">
            <div className="text-xs text-slate-500 mb-1">건수</div>
            <div className="text-xl font-bold text-slate-900">{erpSummary.total_count}<span className="text-sm font-normal text-slate-400 ml-0.5">건</span></div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4">
            <div className="text-xs text-slate-500 mb-1">상위 거래처</div>
            <div className="text-sm font-semibold text-slate-700 truncate">{erpTopCustomers[0]?.name || '-'}</div>
            <div className="text-xs text-slate-400">{erpTopCustomers[0] ? formatAmount(erpTopCustomers[0].amount) + '원' : ''}</div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4">
            <div className="text-xs text-slate-500 mb-1">상위 품목</div>
            <div className="text-sm font-semibold text-slate-700 truncate">{erpTopProducts[0]?.name || '-'}</div>
            <div className="text-xs text-slate-400">{erpTopProducts[0] ? formatAmount(erpTopProducts[0].qty) + '개' : ''}</div>
          </div>
        </div>
      )}
      {tab === 'workflow' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-fadeInUp">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4">
            <div className="text-xs text-slate-500 mb-1">총 금액</div>
            <div className="text-xl font-bold text-amber-600">{formatAmount(wfTotal)}<span className="text-sm font-normal text-slate-400 ml-0.5">원</span></div>
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
            <div className="text-xs text-slate-500 mb-1">재고반영</div>
            <div className="text-xl font-bold text-green-600">{workflows.filter(w => w.status === 'STOCKED').length}<span className="text-sm font-normal text-slate-400 ml-0.5">건</span></div>
          </div>
        </div>
      )}

      {/* 탭 */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        <button onClick={() => setTab('erp')} className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'erp' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          ERP 실적
        </button>
        <button onClick={() => setTab('workflow')} className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'workflow' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          워크플로우 기록
        </button>
      </div>

      {/* ERP 실적 탭 */}
      {tab === 'erp' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 animate-fadeIn">
          {loading ? (
            <div className="text-center py-14 text-slate-400 text-sm">불러오는 중...</div>
          ) : erpError ? (
            <div className="p-6 text-center">
              <p className="text-sm text-red-500">{erpError}</p>
              <button onClick={loadErpData} className="mt-2 text-xs text-brand-600 hover:underline">다시 시도</button>
            </div>
          ) : filteredErp.length === 0 ? (
            <div className="p-12 text-center">
              <svg className="w-10 h-10 text-slate-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm text-slate-500">해당 기간의 구매 기록이 없습니다</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-500 bg-slate-50/50">
                    <th className="text-left px-4 py-3 font-medium">날짜</th>
                    <th className="text-left px-4 py-3 font-medium">거래처</th>
                    <th className="text-left px-4 py-3 font-medium">품목</th>
                    <th className="text-right px-4 py-3 font-medium">수량</th>
                    <th className="text-right px-4 py-3 font-medium">단가</th>
                    <th className="text-right px-4 py-3 font-medium">공급가</th>
                    <th className="text-right px-4 py-3 font-medium">VAT</th>
                    <th className="text-right px-4 py-3 font-medium">합계</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredErp.map((item, idx) => (
                    <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50/50 transition">
                      <td className="px-4 py-3 text-slate-600">{formatYMD(item.IO_DATE)}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{item.CUST_DES || item.CUST_CD}</td>
                      <td className="px-4 py-3 text-slate-700">{item.PROD_DES || item.PROD_CD}</td>
                      <td className="px-4 py-3 text-right">{formatAmount(item.QTY)}</td>
                      <td className="px-4 py-3 text-right">{formatAmount(item.PRICE)}</td>
                      <td className="px-4 py-3 text-right">{formatAmount(item.SUPPLY_AMT)}</td>
                      <td className="px-4 py-3 text-right text-slate-500">{formatAmount(item.VAT_AMT)}</td>
                      <td className="px-4 py-3 text-right font-semibold">{formatAmount(item.TOTAL_AMT)}</td>
                    </tr>
                  ))}
                </tbody>
                {erpSummary && (
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-slate-50/50">
                      <td className="px-4 py-3 font-bold" colSpan={5}>합계 ({erpSummary.total_count}건)</td>
                      <td className="px-4 py-3 text-right font-bold">{formatAmount(erpSummary.total_supply)}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-500">{formatAmount(erpSummary.total_vat)}</td>
                      <td className="px-4 py-3 text-right font-bold text-amber-600">{formatAmount(erpSummary.total_amount)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
      )}

      {/* 워크플로우 기록 탭 */}
      {tab === 'workflow' && (
        <div className="animate-fadeIn">
          {wfLoading ? (
            <div className="text-center py-14 text-slate-400 text-sm">불러오는 중...</div>
          ) : filteredWf.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center">
              <svg className="w-10 h-10 text-slate-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-sm text-slate-500">구매 워크플로우 기록이 없습니다</p>
              <p className="text-xs text-slate-400 mt-1">구매입력 시 자동으로 기록됩니다</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredWf.map(w => {
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
      )}
    </div>
  );
}
