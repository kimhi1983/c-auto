'use client';

import { useEffect, useState } from 'react';
import { apiUrl, authHeaders, authJsonHeaders } from '@/lib/api';

interface WorkflowItem {
  id: number;
  workflowType: string;
  status: string;
  ioDate: string;
  custCd: string | null;
  custName: string | null;
  itemsData: string;
  items: { PROD_CD?: string; QTY?: string; PRICE?: string; WH_CD?: string; REMARKS?: string }[];
  totalAmount: number;
  erpSubmittedAt: string | null;
  step2At: string | null;
  step3At: string | null;
  step4At: string | null;
  step5At: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  steps: string[];
  labels: Record<string, string>;
}

interface Summary {
  sales: { total: number; active: number; completed: number; byStatus: Record<string, number> };
  purchase: { total: number; active: number; completed: number; byStatus: Record<string, number> };
}

const SALES_STEPS = ['ERP_SUBMITTED', 'SHIPPING_ORDER', 'PICKING', 'SHIPPED', 'DELIVERED'];
const PURCHASE_STEPS = ['ERP_SUBMITTED', 'RECEIVING_SCHEDULED', 'INSPECTING', 'RECEIVED', 'STOCKED'];

const SALES_LABELS: Record<string, string> = {
  ERP_SUBMITTED: '판매입력완료', SHIPPING_ORDER: '출고지시', PICKING: '피킹/포장', SHIPPED: '출고완료', DELIVERED: '납품완료',
};
const PURCHASE_LABELS: Record<string, string> = {
  ERP_SUBMITTED: '구매입력완료', RECEIVING_SCHEDULED: '입고예정', INSPECTING: '입고검수', RECEIVED: '입고완료', STOCKED: '재고반영',
};

function getSteps(type: string) { return type === 'SALES' ? SALES_STEPS : PURCHASE_STEPS; }
function getLabels(type: string) { return type === 'SALES' ? SALES_LABELS : PURCHASE_LABELS; }

function formatDate(d: string | null) {
  if (!d) return '-';
  return new Date(d).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatIoDate(d: string) {
  if (d.length === 8) return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`;
  return d;
}

// 상태 뱃지 색상
function statusColor(status: string, type: string) {
  const steps = getSteps(type);
  const idx = steps.indexOf(status);
  if (idx === steps.length - 1) return 'bg-green-100 text-green-700';
  if (idx >= steps.length - 2) return 'bg-blue-100 text-blue-700';
  if (idx >= 1) return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-600';
}

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'SALES' | 'PURCHASE'>('ALL');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== 'ALL') params.set('type', filter);
      if (statusFilter) params.set('status', statusFilter);
      params.set('limit', '100');

      const [wfRes, sumRes] = await Promise.all([
        fetch(apiUrl(`/api/v1/workflows?${params}`), { headers: authHeaders() }),
        fetch(apiUrl('/api/v1/workflows/summary'), { headers: authHeaders() }),
      ]);

      const wfJson = await wfRes.json();
      const sumJson = await sumRes.json();

      if (wfJson.status === 'success') setWorkflows(wfJson.data || []);
      if (sumJson.status === 'success') setSummary(sumJson.data);
    } catch { /* silent */ }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [filter, statusFilter]);

  const advanceStatus = async (id: number, action: 'next' | 'prev') => {
    setActionLoading(true);
    try {
      const res = await fetch(apiUrl(`/api/v1/workflows/${id}/status`), {
        method: 'PATCH',
        headers: authJsonHeaders(),
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (json.status === 'success') {
        setMessage(json.message);
        loadData();
      } else {
        setMessage(json.message || '상태 변경 실패');
      }
    } catch { setMessage('네트워크 오류'); }
    setActionLoading(false);
    setTimeout(() => setMessage(''), 3000);
  };

  const deleteWorkflow = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (!confirm('이 워크플로우를 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(apiUrl(`/api/v1/workflows/${id}`), { method: 'DELETE', headers: authHeaders() });
      if (res.ok) { loadData(); setMessage('삭제 완료'); if (selectedId === id) setSelectedId(null); }
    } catch { /* silent */ }
    setTimeout(() => setMessage(''), 3000);
  };

  const selected = workflows.find(w => w.id === selectedId);

  // 스텝 진행률 바
  const StepProgress = ({ workflow: w }: { workflow: WorkflowItem }) => {
    const steps = getSteps(w.workflowType);
    const labels = getLabels(w.workflowType);
    const currentIdx = steps.indexOf(w.status);
    const timestamps = [w.erpSubmittedAt, w.step2At, w.step3At, w.step4At, w.step5At];

    return (
      <div className="flex items-center gap-0 w-full">
        {steps.map((step, idx) => {
          const isDone = idx <= currentIdx;
          const isCurrent = idx === currentIdx;
          const isLast = idx === steps.length - 1;
          return (
            <div key={step} className="flex items-center flex-1 min-w-0">
              <div className="flex flex-col items-center flex-shrink-0">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  isDone
                    ? isCurrent
                      ? 'bg-slate-900 text-white ring-4 ring-slate-200'
                      : 'bg-green-500 text-white'
                    : 'bg-slate-100 text-slate-400'
                }`}>
                  {isDone && !isCurrent ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    idx + 1
                  )}
                </div>
                <div className={`text-[10px] mt-1 text-center leading-tight whitespace-nowrap ${isCurrent ? 'font-bold text-slate-900' : isDone ? 'text-green-600 font-medium' : 'text-slate-400'}`}>
                  {labels[step]}
                </div>
                {timestamps[idx] && (
                  <div className="text-[9px] text-slate-400">{formatDate(timestamps[idx])}</div>
                )}
              </div>
              {!isLast && (
                <div className={`flex-1 h-0.5 mx-1 rounded ${idx < currentIdx ? 'bg-green-400' : 'bg-slate-200'}`} />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // 상세 뷰
  if (selected) {
    const steps = getSteps(selected.workflowType);
    const labels = getLabels(selected.workflowType);
    const currentIdx = steps.indexOf(selected.status);
    const isComplete = currentIdx >= steps.length - 1;

    return (
      <div className="space-y-6 animate-fadeIn">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => setSelectedId(null)} className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition">
              <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              목록
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                {selected.workflowType === 'SALES' ? '판매' : '구매'} 주문 #{selected.id}
              </h1>
              <p className="text-sm text-slate-500">{formatIoDate(selected.ioDate)} · {selected.custName || selected.custCd}</p>
            </div>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-bold ${statusColor(selected.status, selected.workflowType)}`}>
            {labels[selected.status]}
          </span>
        </div>

        {message && <div className="px-4 py-3 bg-brand-50 border border-brand-200 text-brand-700 text-sm rounded-2xl">{message}</div>}

        {/* 진행 상태 */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6">
          <h3 className="text-sm font-bold text-slate-900 mb-5">진행 상태</h3>
          <StepProgress workflow={selected} />

          <div className="flex items-center gap-3 mt-6 pt-4 border-t border-slate-100">
            {currentIdx > 0 && (
              <button
                onClick={() => advanceStatus(selected.id, 'prev')}
                disabled={actionLoading}
                className="px-4 py-2.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition disabled:opacity-50"
              >
                이전 단계로
              </button>
            )}
            {!isComplete && (
              <button
                onClick={() => advanceStatus(selected.id, 'next')}
                disabled={actionLoading}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-slate-900 rounded-xl hover:bg-slate-800 transition disabled:opacity-50"
              >
                {actionLoading ? '처리 중...' : `${labels[steps[currentIdx + 1]]}(으)로 진행`}
              </button>
            )}
            {isComplete && (
              <span className="text-sm text-green-600 font-semibold">처리 완료</span>
            )}
          </div>
        </div>

        {/* 품목 정보 */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6">
          <h3 className="text-sm font-bold text-slate-900 mb-4">품목 내역</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-slate-500">
                  <th className="text-left py-2 font-medium">품목코드</th>
                  <th className="text-right py-2 font-medium">수량</th>
                  <th className="text-right py-2 font-medium">단가</th>
                  <th className="text-right py-2 font-medium">금액</th>
                  <th className="text-left py-2 font-medium">창고</th>
                  <th className="text-left py-2 font-medium">비고</th>
                </tr>
              </thead>
              <tbody>
                {(selected.items || []).map((item, idx) => (
                  <tr key={idx} className="border-b border-slate-50">
                    <td className="py-2.5 font-medium text-slate-900">{item.PROD_CD}</td>
                    <td className="py-2.5 text-right">{Number(item.QTY || 0).toLocaleString()}</td>
                    <td className="py-2.5 text-right">{Number(item.PRICE || 0).toLocaleString()}</td>
                    <td className="py-2.5 text-right font-semibold">{(Number(item.QTY || 0) * Number(item.PRICE || 0)).toLocaleString()}</td>
                    <td className="py-2.5 text-slate-500">{item.WH_CD || '-'}</td>
                    <td className="py-2.5 text-slate-500">{item.REMARKS || '-'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200">
                  <td className="py-2.5 font-bold" colSpan={3}>합계</td>
                  <td className="py-2.5 text-right font-bold text-slate-900">{(selected.totalAmount || 0).toLocaleString()}원</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* 타임라인 */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6">
          <h3 className="text-sm font-bold text-slate-900 mb-4">처리 이력</h3>
          <div className="space-y-3">
            {[selected.erpSubmittedAt, selected.step2At, selected.step3At, selected.step4At, selected.step5At].map((ts, idx) => {
              if (!ts) return null;
              const stepLabels = getLabels(selected.workflowType);
              const stepKeys = getSteps(selected.workflowType);
              return (
                <div key={idx} className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                  <span className="text-sm font-medium text-slate-700">{stepLabels[stepKeys[idx]]}</span>
                  <span className="text-xs text-slate-400">{new Date(ts).toLocaleString('ko-KR')}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // 목록 뷰
  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="animate-fadeIn">
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <span>ERP</span>
          <span className="text-slate-300">/</span>
          <span className="text-slate-700 font-medium">주문처리</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">주문처리 현황</h1>
        <p className="text-sm text-slate-500 mt-1">판매/구매 입력 후 출고·입고 완료까지 상태 추적</p>
      </div>

      {message && <div className="px-4 py-3 bg-brand-50 border border-brand-200 text-brand-700 text-sm rounded-2xl animate-fadeIn">{message}</div>}

      {/* 요약 카드 */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4">
            <div className="text-2xl font-bold text-blue-600">{summary.sales.active}</div>
            <div className="text-xs text-slate-500 mt-0.5">판매 진행 중</div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4">
            <div className="text-2xl font-bold text-green-600">{summary.sales.completed}</div>
            <div className="text-xs text-slate-500 mt-0.5">판매 완료</div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4">
            <div className="text-2xl font-bold text-amber-600">{summary.purchase.active}</div>
            <div className="text-xs text-slate-500 mt-0.5">구매 진행 중</div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4">
            <div className="text-2xl font-bold text-green-600">{summary.purchase.completed}</div>
            <div className="text-xs text-slate-500 mt-0.5">구매 완료</div>
          </div>
        </div>
      )}

      {/* 필터 */}
      <div className="flex items-center gap-3">
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {(['ALL', 'SALES', 'PURCHASE'] as const).map(f => (
            <button
              key={f}
              onClick={() => { setFilter(f); setStatusFilter(''); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                filter === f ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {f === 'ALL' ? '전체' : f === 'SALES' ? '판매' : '구매'}
            </button>
          ))}
        </div>

        {filter !== 'ALL' && (
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700"
          >
            <option value="">모든 상태</option>
            {(filter === 'SALES' ? SALES_STEPS : PURCHASE_STEPS).map(s => (
              <option key={s} value={s}>{(filter === 'SALES' ? SALES_LABELS : PURCHASE_LABELS)[s]}</option>
            ))}
          </select>
        )}
      </div>

      {/* 목록 */}
      {loading ? (
        <div className="text-center py-14 text-slate-400 text-sm">불러오는 중...</div>
      ) : workflows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center animate-fadeInUp">
          <svg className="w-10 h-10 text-slate-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-sm text-slate-500">처리 중인 주문이 없습니다</p>
          <p className="text-xs text-slate-400 mt-1">판매입력 또는 구매입력 시 자동으로 생성됩니다</p>
        </div>
      ) : (
        <div className="space-y-3">
          {workflows.map(w => {
            const steps = getSteps(w.workflowType);
            const labels = getLabels(w.workflowType);
            const currentIdx = steps.indexOf(w.status);
            const progress = ((currentIdx + 1) / steps.length) * 100;
            const itemCount = (w.items || []).length;

            return (
              <div
                key={w.id}
                onClick={() => setSelectedId(w.id)}
                className="bg-white rounded-2xl border border-slate-200 p-5 cursor-pointer transition-all hover:shadow-md hover:border-slate-300"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                      w.workflowType === 'SALES' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'
                    }`}>
                      {w.workflowType === 'SALES' ? '판매' : '구매'}
                    </span>
                    <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${statusColor(w.status, w.workflowType)}`}>
                      {labels[w.status]}
                    </span>
                    <span className="text-sm font-semibold text-slate-900">#{w.id}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{formatIoDate(w.ioDate)}</span>
                    <button
                      onClick={(e) => deleteWorkflow(e, w.id)}
                      className="p-1 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm text-slate-700">
                    <span className="font-medium">{w.custName || w.custCd || '-'}</span>
                    <span className="text-slate-400 mx-2">·</span>
                    <span>{itemCount}개 품목</span>
                    <span className="text-slate-400 mx-2">·</span>
                    <span className="font-semibold">{(w.totalAmount || 0).toLocaleString()}원</span>
                  </div>
                </div>

                {/* 미니 프로그레스 바 */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${currentIdx >= steps.length - 1 ? 'bg-green-500' : 'bg-slate-800'}`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 flex-shrink-0">
                    {currentIdx + 1}/{steps.length}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
