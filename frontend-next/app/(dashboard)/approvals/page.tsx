'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiUrl, authHeaders, authJsonHeaders } from '@/lib/api';

// ─── Types ───

interface ApprovalItem {
  id: number;
  workflowType: 'SALES' | 'PURCHASE';
  orderNumber: string;
  customerName: string;
  status: string;
  totalAmount: number;
  ioDate: string;
  itemsData: string;
  note: string;
  createdAt: string;
  updatedAt: string;
  step1At: string | null;
}

type TabFilter = 'pending' | 'history';
type StatusFilter = 'ALL' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT: { label: '임시저장', color: 'text-slate-600', bg: 'bg-slate-100' },
  PENDING_APPROVAL: { label: '승인대기', color: 'text-amber-700', bg: 'bg-amber-50' },
  APPROVED: { label: '승인완료', color: 'text-emerald-700', bg: 'bg-emerald-50' },
  REJECTED: { label: '반려', color: 'text-red-700', bg: 'bg-red-50' },
  ERP_SUBMITTED: { label: 'ERP전송완료', color: 'text-blue-700', bg: 'bg-blue-50' },
};

const TYPE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  SALES: { label: '판매', color: 'text-blue-700', bg: 'bg-blue-50' },
  PURCHASE: { label: '구매', color: 'text-violet-700', bg: 'bg-violet-50' },
};

export default function ApprovalsPage() {
  const [tab, setTab] = useState<TabFilter>('pending');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<ApprovalItem | null>(null);
  const [actionNote, setActionNote] = useState('');
  const [processing, setProcessing] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/api/v1/workflows?include_all=true'), { headers: authHeaders() });
      if (!res.ok) throw new Error('조회 실패');
      const data = await res.json();
      const rows = data.data?.workflows || data.data || [];
      setItems(rows);
    } catch (err) {
      console.error('승인목록 조회 실패:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // 필터링
  const filteredItems = items.filter(item => {
    if (tab === 'pending') {
      return item.status === 'PENDING_APPROVAL';
    } else {
      if (statusFilter === 'ALL') return item.status !== 'PENDING_APPROVAL';
      return item.status === statusFilter;
    }
  });

  const pendingCount = items.filter(i => i.status === 'PENDING_APPROVAL').length;

  // 승인/반려 처리
  const handleAction = async (action: 'approve' | 'reject') => {
    if (!selectedItem) return;
    setProcessing(true);
    try {
      const newStatus = action === 'approve' ? 'APPROVED' : 'REJECTED';
      const res = await fetch(apiUrl(`/api/v1/workflows/${selectedItem.id}/status`), {
        method: 'PATCH',
        headers: authJsonHeaders(),
        body: JSON.stringify({ status: newStatus, note: actionNote || undefined }),
      });
      if (!res.ok) throw new Error('처리 실패');
      setSelectedItem(null);
      setActionNote('');
      fetchItems();
    } catch (err) {
      console.error('승인 처리 실패:', err);
      alert('처리 중 오류가 발생했습니다.');
    } finally {
      setProcessing(false);
    }
  };

  const parseItems = (itemsData: string) => {
    try { return JSON.parse(itemsData || '[]'); } catch { return []; }
  };

  const formatCurrency = (n: number) => new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 }).format(n);

  // ─── Detail Modal ───
  const renderDetailModal = () => {
    if (!selectedItem) return null;
    const items = parseItems(selectedItem.itemsData);
    const typeInfo = TYPE_LABELS[selectedItem.workflowType] || { label: selectedItem.workflowType, color: '', bg: '' };
    const statusInfo = STATUS_LABELS[selectedItem.status] || { label: selectedItem.status, color: '', bg: '' };

    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => { setSelectedItem(null); setActionNote(''); }}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="px-6 py-5 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${typeInfo.bg} ${typeInfo.color}`}>{typeInfo.label}</span>
                <h3 className="text-lg font-bold text-slate-900">주문 #{selectedItem.orderNumber || selectedItem.id}</h3>
              </div>
              <button onClick={() => { setSelectedItem(null); setActionNote(''); }} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="mt-2 flex items-center gap-4 text-sm text-slate-500">
              <span>{selectedItem.ioDate}</span>
              <span>{selectedItem.customerName}</span>
              <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${statusInfo.bg} ${statusInfo.color}`}>{statusInfo.label}</span>
            </div>
          </div>

          {/* 품목 테이블 */}
          <div className="px-6 py-4">
            <h4 className="text-sm font-bold text-slate-700 mb-3">품목 내역</h4>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">품목</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500">수량</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500">단가</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500">금액</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">창고</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-50/50">
                      <td className="px-4 py-2.5 font-medium text-slate-800">{item.PROD_DES || item.PROD_CD || '-'}</td>
                      <td className="px-4 py-2.5 text-right text-slate-600">{item.QTY || '-'} {item.UNIT || ''}</td>
                      <td className="px-4 py-2.5 text-right text-slate-600">{item.PRICE ? formatCurrency(Number(item.PRICE)) : '-'}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-slate-800">{item.SUPPLY_AMT ? formatCurrency(Number(item.SUPPLY_AMT)) : '-'}</td>
                      <td className="px-4 py-2.5 text-slate-500">{item.WH_CD || '미지정'}</td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">품목 정보 없음</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {selectedItem.totalAmount > 0 && (
              <div className="mt-3 text-right">
                <span className="text-sm text-slate-500">합계: </span>
                <span className="text-lg font-bold text-slate-900">{formatCurrency(selectedItem.totalAmount)}</span>
              </div>
            )}
          </div>

          {/* 비고 */}
          {selectedItem.note && (
            <div className="px-6 pb-4">
              <div className="p-3 bg-slate-50 rounded-xl text-sm text-slate-600">
                <span className="font-semibold text-slate-700">비고: </span>{selectedItem.note}
              </div>
            </div>
          )}

          {/* 승인/반려 액션 (PENDING_APPROVAL일 때만) */}
          {selectedItem.status === 'PENDING_APPROVAL' && (
            <div className="px-6 py-5 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
              <div className="mb-3">
                <label className="text-sm font-semibold text-slate-700 block mb-1.5">승인/반려 메모</label>
                <textarea
                  value={actionNote}
                  onChange={e => setActionNote(e.target.value)}
                  placeholder="수정사항이나 반려 사유를 입력하세요 (선택)"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400"
                  rows={2}
                />
              </div>
              <div className="flex items-center gap-3 justify-end">
                <button
                  onClick={() => handleAction('reject')}
                  disabled={processing}
                  className="px-5 py-2.5 rounded-xl border border-red-200 text-red-600 bg-white hover:bg-red-50 text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  반려
                </button>
                <button
                  onClick={() => handleAction('approve')}
                  disabled={processing}
                  className="px-5 py-2.5 rounded-xl bg-brand-500 text-white hover:bg-brand-600 text-sm font-semibold transition-colors disabled:opacity-50 shadow-sm"
                >
                  {processing ? '처리 중...' : '승인'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ─── Render ───
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">승인관리</h1>
        <p className="text-sm text-slate-500 mt-1">판매/구매 전표의 승인 및 반려를 처리합니다</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
          <div className="text-sm text-slate-500 mb-1">승인 대기</div>
          <div className="text-2xl font-bold text-amber-600">{pendingCount}<span className="text-sm font-normal text-slate-400 ml-1">건</span></div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
          <div className="text-sm text-slate-500 mb-1">승인 완료</div>
          <div className="text-2xl font-bold text-emerald-600">{items.filter(i => i.status === 'APPROVED' || i.status === 'ERP_SUBMITTED').length}<span className="text-sm font-normal text-slate-400 ml-1">건</span></div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
          <div className="text-sm text-slate-500 mb-1">반려</div>
          <div className="text-2xl font-bold text-red-500">{items.filter(i => i.status === 'REJECTED').length}<span className="text-sm font-normal text-slate-400 ml-1">건</span></div>
        </div>
      </div>

      {/* Tab + Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          <button
            onClick={() => setTab('pending')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === 'pending' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            승인 대기
            {pendingCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white">{pendingCount}</span>
            )}
          </button>
          <button
            onClick={() => setTab('history')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === 'history' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            승인 이력
          </button>
        </div>

        {tab === 'history' && (
          <div className="flex gap-2">
            {(['ALL', 'APPROVED', 'REJECTED'] as StatusFilter[]).map(sf => (
              <button
                key={sf}
                onClick={() => setStatusFilter(sf)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${statusFilter === sf ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200' : 'text-slate-500 hover:bg-slate-100'}`}
              >
                {sf === 'ALL' ? '전체' : STATUS_LABELS[sf]?.label || sf}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-[3px] border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-400">불러오는 중...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center">
            <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
            <p className="text-slate-500 font-medium">
              {tab === 'pending' ? '승인 대기 건이 없습니다' : '이력이 없습니다'}
            </p>
            <p className="text-xs text-slate-400 mt-1">판매/구매입력에서 승인요청된 건이 표시됩니다</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredItems.map(item => {
              const typeInfo = TYPE_LABELS[item.workflowType] || { label: item.workflowType, color: '', bg: '' };
              const statusInfo = STATUS_LABELS[item.status] || { label: item.status, color: '', bg: '' };
              const parsedItems = parseItems(item.itemsData);
              const firstItem = parsedItems[0];

              return (
                <button
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className="w-full flex items-center gap-4 px-6 py-4 text-left hover:bg-slate-50/50 transition-colors"
                >
                  {/* Type badge */}
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 ${typeInfo.bg} ${typeInfo.color}`}>
                    {typeInfo.label}
                  </span>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800 truncate">
                        {item.customerName || '(거래처 미지정)'}
                      </span>
                      <span className="text-xs text-slate-400">#{item.orderNumber || item.id}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {firstItem?.PROD_DES || firstItem?.PROD_CD || '품목 미지정'}
                      {parsedItems.length > 1 && ` 외 ${parsedItems.length - 1}건`}
                    </div>
                  </div>

                  {/* Amount */}
                  <div className="text-right shrink-0">
                    <div className="font-semibold text-slate-800">{item.totalAmount > 0 ? formatCurrency(item.totalAmount) : '-'}</div>
                    <div className="text-xs text-slate-400">{item.ioDate}</div>
                  </div>

                  {/* Status */}
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold shrink-0 ${statusInfo.bg} ${statusInfo.color}`}>
                    {statusInfo.label}
                  </span>

                  {/* Arrow */}
                  <svg className="w-4 h-4 text-slate-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {renderDetailModal()}
    </div>
  );
}
