'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiUrl, authHeaders, authJsonHeaders } from '@/lib/api';

// ─── Types ───

interface WorkflowTask {
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
  documentCount: number;
  statusLabel: string;
  items: any[];
}

interface WarehouseGroup {
  warehouseCd: string;
  taskCount: number;
  tasks: WorkflowTask[];
}

interface CoaDoc {
  id: number;
  workflowId: number;
  documentType: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  dropboxPath: string | null;
  note: string | null;
  createdAt: string;
}

// ─── Constants ───

type WarehouseCode = 'mk' | 'mansuk' | 'wellrise';

const WAREHOUSES: { code: WarehouseCode; label: string; color: string; gradient: string; whCodes: string[] }[] = [
  { code: 'mk', label: 'MK물류', color: '#1565C0', gradient: 'from-blue-600 to-blue-700', whCodes: ['MK', 'MK물류', 'WH-MK'] },
  { code: 'mansuk', label: '만석물류', color: '#2E7D32', gradient: 'from-green-600 to-green-700', whCodes: ['만석', '만석물류', 'WH-MS'] },
  { code: 'wellrise', label: '웰라이즈', color: '#E65100', gradient: 'from-orange-600 to-orange-700', whCodes: ['웰라이즈', 'WH-WR'] },
];

type ViewTab = 'orders' | 'history' | 'coa';

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  SHIPPING_ORDER: { label: '출고지시', color: 'text-blue-700', bg: 'bg-blue-50' },
  PICKING: { label: '피킹/포장', color: 'text-indigo-700', bg: 'bg-indigo-50' },
  SHIPPED: { label: '출고완료', color: 'text-emerald-700', bg: 'bg-emerald-50' },
  DELIVERED: { label: '납품완료', color: 'text-slate-600', bg: 'bg-slate-100' },
  RECEIVING_SCHEDULED: { label: '입고예정', color: 'text-violet-700', bg: 'bg-violet-50' },
  INSPECTING: { label: '입고검수', color: 'text-purple-700', bg: 'bg-purple-50' },
  RECEIVED: { label: '입고완료', color: 'text-emerald-700', bg: 'bg-emerald-50' },
  STOCKED: { label: '재고반영', color: 'text-slate-600', bg: 'bg-slate-100' },
};

export default function WarehousePortalPage() {
  const searchParams = useSearchParams();
  const whParam = searchParams?.get('wh') as WarehouseCode | null;
  const [activeWh, setActiveWh] = useState<WarehouseCode>(whParam && WAREHOUSES.some(w => w.code === whParam) ? whParam : 'mk');
  const [viewTab, setViewTab] = useState<ViewTab>('orders');
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<WorkflowTask[]>([]);
  const [allTasks, setAllTasks] = useState<WorkflowTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<WorkflowTask | null>(null);
  const [docs, setDocs] = useState<CoaDoc[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadNote, setUploadNote] = useState('');
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);

  const currentWh = WAREHOUSES.find(w => w.code === activeWh) || WAREHOUSES[0];

  // 출고지시 조회 (현재 작업 중인 건)
  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/api/v1/warehouse-ops'), { headers: authHeaders() });
      if (!res.ok) throw new Error('조회 실패');
      const data = await res.json();
      const warehouses: WarehouseGroup[] = data.data?.warehouses || [];

      // 모든 작업을 flat하게 저장
      const all = warehouses.flatMap(wh => wh.tasks);
      setAllTasks(all);

      // 현재 창고에 매칭되는 작업만 필터
      const whMatch = warehouses.find(wh =>
        currentWh.whCodes.some(c => wh.warehouseCd.includes(c)) || wh.warehouseCd === currentWh.label
      );
      setTasks(whMatch?.tasks || []);
    } catch (err) {
      console.error('창고 작업 조회 실패:', err);
    } finally {
      setLoading(false);
    }
  }, [currentWh]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  // 문서 조회
  const fetchDocs = useCallback(async (workflowId: number) => {
    setDocsLoading(true);
    try {
      const res = await fetch(apiUrl(`/api/v1/warehouse-ops/${workflowId}/documents`), { headers: authHeaders() });
      if (!res.ok) throw new Error('문서 조회 실패');
      const data = await res.json();
      setDocs(data.data || []);
    } catch { setDocs([]); }
    finally { setDocsLoading(false); }
  }, []);

  useEffect(() => {
    if (selectedTask) fetchDocs(selectedTask.id);
  }, [selectedTask, fetchDocs]);

  // 파일 업로드
  const handleUpload = async () => {
    if (!selectedTask || !uploadFile) return;
    if (uploadFile.size > 10 * 1024 * 1024) { alert('파일 크기는 10MB 이하만 가능합니다'); return; }
    setUploading(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(uploadFile);
      });

      const res = await fetch(apiUrl(`/api/v1/warehouse-ops/${selectedTask.id}/documents`), {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify({
          fileName: uploadFile.name,
          contentBase64: base64,
          contentType: uploadFile.type || 'application/pdf',
          note: uploadNote || undefined,
        }),
      });
      if (!res.ok) throw new Error('업로드 실패');
      setUploadFile(null);
      setUploadNote('');
      fetchDocs(selectedTask.id);
      fetchTasks();
    } catch (err) {
      console.error('업로드 실패:', err);
      alert('업로드 중 오류가 발생했습니다.');
    } finally {
      setUploading(false);
    }
  };

  // 문서 삭제
  const handleDeleteDoc = async (docId: number) => {
    if (!confirm('이 성적서를 삭제하시겠습니까?')) return;
    try {
      await fetch(apiUrl(`/api/v1/warehouse-ops/documents/${docId}`), { method: 'DELETE', headers: authHeaders() });
      if (selectedTask) fetchDocs(selectedTask.id);
      fetchTasks();
    } catch { alert('삭제 실패'); }
  };

  // Dropbox 다운로드
  const handleDownload = async (dropboxPath: string, fileName: string) => {
    try {
      const res = await fetch(apiUrl('/api/v1/dropbox/link'), {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify({ path: dropboxPath }),
      });
      if (!res.ok) throw new Error('링크 생성 실패');
      const data = await res.json();
      if (data.data?.link) window.open(data.data.link, '_blank');
    } catch { alert('다운로드 링크 생성 실패'); }
  };

  // 출고 처리 (상태 진행)
  const handleProcess = async (task: WorkflowTask, action: 'next' | 'prev') => {
    setProcessing(true);
    try {
      const res = await fetch(apiUrl(`/api/v1/warehouse-ops/${task.id}/process`), {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.message || '처리 실패');
      }
      fetchTasks();
      if (selectedTask?.id === task.id) setSelectedTask(null);
    } catch (err: any) {
      alert(err.message || '처리 중 오류');
    } finally {
      setProcessing(false);
    }
  };

  const parseDate = (d: string) => {
    if (!d) return '';
    return d.split('T')[0];
  };

  const isUrgent = (ioDate: string) => {
    if (!ioDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const target = new Date(ioDate);
    return target <= tomorrow;
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // 출고완료 건 (이력)
  const completedStatuses = ['SHIPPED', 'DELIVERED', 'RECEIVED', 'STOCKED'];

  // ─── Detail Slide Panel ───
  const renderDetailPanel = () => {
    if (!selectedTask) return null;
    const items = selectedTask.items || [];
    const statusInfo = STATUS_LABELS[selectedTask.status] || { label: selectedTask.status, color: '', bg: '' };

    return (
      <div className="fixed inset-0 bg-black/30 z-50 flex justify-end" onClick={() => setSelectedTask(null)}>
        <div className="w-full max-w-xl bg-white h-full overflow-y-auto shadow-2xl animate-slideInRight" onClick={e => e.stopPropagation()}>
          {/* Header with warehouse color */}
          <div className={`px-6 py-5 bg-gradient-to-r ${currentWh.gradient} text-white`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 rounded bg-white/20 text-xs font-bold">
                    {selectedTask.workflowType === 'SALES' ? '출고' : '입고'}
                  </span>
                  <span className="text-white/80 text-xs">#{selectedTask.orderNumber || selectedTask.id}</span>
                </div>
                <h3 className="text-lg font-bold">{selectedTask.customerName}</h3>
                <div className="flex items-center gap-3 mt-1 text-sm text-white/80">
                  <span>{parseDate(selectedTask.ioDate)}</span>
                  <span className="px-2 py-0.5 rounded bg-white/20 text-xs font-semibold">{statusInfo.label}</span>
                </div>
              </div>
              <button onClick={() => setSelectedTask(null)} className="p-2 rounded-lg hover:bg-white/20 text-white/80">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>

          {/* 품목 내역 */}
          <div className="px-6 py-5 border-b border-slate-100">
            <h4 className="text-sm font-bold text-slate-700 mb-3">품목 내역</h4>
            <div className="space-y-2">
              {items.map((item: any, i: number) => (
                <div key={i} className="p-3 bg-slate-50 rounded-xl">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-sm text-slate-800">{item.PROD_DES || item.PROD_CD}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {item.QTY || '-'} {item.UNIT || ''} · {item.WH_CD || '미지정'}
                        {item.LOT_NO && <span className="ml-2">Lot: {item.LOT_NO}</span>}
                      </div>
                    </div>
                    {isUrgent(selectedTask.ioDate) && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">긴급</span>
                    )}
                  </div>
                </div>
              ))}
              {items.length === 0 && <p className="text-sm text-slate-400">품목 정보 없음</p>}
            </div>
          </div>

          {/* 성적서(CoA) 영역 */}
          <div className="px-6 py-5 border-b border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-bold text-slate-700">성적서(CoA)</h4>
              <span className="text-xs text-slate-400">{docs.length}개 첨부</span>
            </div>

            {docsLoading ? (
              <div className="py-4 text-center"><div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" /></div>
            ) : (
              <>
                {docs.map(doc => (
                  <div key={doc.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl mb-2">
                    <svg className="w-8 h-8 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800 truncate">{doc.fileName}</div>
                      <div className="text-xs text-slate-400">{formatSize(doc.fileSize || 0)} · {parseDate(doc.createdAt)}</div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {doc.dropboxPath && (
                        <button onClick={() => handleDownload(doc.dropboxPath!, doc.fileName)} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500" title="다운로드">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        </button>
                      )}
                      <button onClick={() => handleDeleteDoc(doc.id)} className="p-1.5 rounded-lg hover:bg-red-100 text-slate-400 hover:text-red-500" title="삭제">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </div>
                ))}

                {/* Upload area */}
                <div className="mt-3 p-4 border-2 border-dashed border-slate-200 rounded-xl hover:border-brand-300 transition-colors">
                  <div className="flex items-center gap-3">
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.xlsx"
                      onChange={e => setUploadFile(e.target.files?.[0] || null)}
                      className="flex-1 text-sm text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100"
                    />
                  </div>
                  {uploadFile && (
                    <div className="mt-3 space-y-2">
                      <input
                        type="text"
                        value={uploadNote}
                        onChange={e => setUploadNote(e.target.value)}
                        placeholder="비고 (선택)"
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                      />
                      <button
                        onClick={handleUpload}
                        disabled={uploading}
                        className="w-full py-2.5 rounded-xl bg-brand-500 text-white text-sm font-semibold hover:bg-brand-600 transition-colors disabled:opacity-50"
                      >
                        {uploading ? '업로드 중...' : '성적서 업로드'}
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* 액션 버튼 */}
          <div className="px-6 py-5">
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleProcess(selectedTask, 'prev')}
                disabled={processing}
                className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                이전 단계
              </button>
              <button
                onClick={() => {
                  if (docs.length === 0 && selectedTask.workflowType === 'SALES') {
                    if (!confirm('성적서가 첨부되지 않았습니다. 출고를 완료하시겠습니까?')) return;
                  }
                  handleProcess(selectedTask, 'next');
                }}
                disabled={processing}
                className={`flex-1 py-3 rounded-xl text-white text-sm font-bold transition-colors disabled:opacity-50 shadow-sm bg-gradient-to-r ${currentWh.gradient} hover:opacity-90`}
              >
                {processing ? '처리 중...' : selectedTask.workflowType === 'SALES' ? '출고완료' : '입고완료'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ─── Main Render ───
  return (
    <div className="space-y-6">
      {/* Warehouse Selector */}
      <div className="flex items-center gap-3">
        {WAREHOUSES.map(wh => (
          <button
            key={wh.code}
            onClick={() => { setActiveWh(wh.code); setSelectedTask(null); }}
            className={`flex items-center gap-2.5 px-5 py-3 rounded-2xl text-sm font-bold transition-all duration-200 ${
              activeWh === wh.code
                ? 'text-white shadow-lg scale-[1.02]'
                : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300 shadow-sm'
            }`}
            style={activeWh === wh.code ? { backgroundColor: wh.color } : undefined}
          >
            <span className="w-3 h-3 rounded-full ring-2 ring-white" style={{ backgroundColor: wh.color }} />
            {wh.label}
          </button>
        ))}
      </div>

      {/* Summary Row */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm">
          <div className="text-xs text-slate-500 mb-1">출고 대기</div>
          <div className="text-xl font-bold" style={{ color: currentWh.color }}>
            {tasks.filter(t => t.workflowType === 'SALES').length}<span className="text-sm font-normal text-slate-400 ml-1">건</span>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm">
          <div className="text-xs text-slate-500 mb-1">입고 대기</div>
          <div className="text-xl font-bold text-violet-600">
            {tasks.filter(t => t.workflowType === 'PURCHASE').length}<span className="text-sm font-normal text-slate-400 ml-1">건</span>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm">
          <div className="text-xs text-slate-500 mb-1">긴급</div>
          <div className="text-xl font-bold text-red-500">
            {tasks.filter(t => isUrgent(t.ioDate)).length}<span className="text-sm font-normal text-slate-400 ml-1">건</span>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm">
          <div className="text-xs text-slate-500 mb-1">성적서 미첨부</div>
          <div className="text-xl font-bold text-amber-600">
            {tasks.filter(t => t.documentCount === 0).length}<span className="text-sm font-normal text-slate-400 ml-1">건</span>
          </div>
        </div>
      </div>

      {/* View Tabs */}
      <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        {([
          { key: 'orders' as ViewTab, label: '출고/입고 지시' },
          { key: 'history' as ViewTab, label: '처리 이력' },
          { key: 'coa' as ViewTab, label: '성적서 관리' },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setViewTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              viewTab === t.key ? 'text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
            style={viewTab === t.key ? { backgroundColor: currentWh.color } : undefined}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-sm">
          <div className="w-8 h-8 border-[3px] border-t-transparent rounded-full animate-spin mx-auto mb-3" style={{ borderColor: currentWh.color, borderTopColor: 'transparent' }} />
          <p className="text-sm text-slate-400">불러오는 중...</p>
        </div>
      ) : viewTab === 'orders' ? (
        /* ─── 출고/입고 지시 목록 ─── */
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          {tasks.length === 0 ? (
            <div className="p-12 text-center">
              <svg className="w-16 h-16 mx-auto mb-4" style={{ color: currentWh.color + '40' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
              </svg>
              <p className="text-slate-500 font-medium">{currentWh.label} 출고/입고 지시가 없습니다</p>
              <p className="text-xs text-slate-400 mt-1">승인 완료된 주문이 이곳에 표시됩니다</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {tasks.map(task => {
                const statusInfo = STATUS_LABELS[task.status] || { label: task.statusLabel || task.status, color: 'text-slate-600', bg: 'bg-slate-100' };
                const urgent = isUrgent(task.ioDate);
                const firstItem = task.items?.[0];

                return (
                  <button
                    key={task.id}
                    onClick={() => setSelectedTask(task)}
                    className={`w-full flex items-center gap-4 px-6 py-4 text-left hover:bg-slate-50/50 transition-colors ${urgent ? 'bg-red-50/30' : ''}`}
                  >
                    {/* 유형 */}
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${task.workflowType === 'SALES' ? 'bg-blue-50 text-blue-600' : 'bg-violet-50 text-violet-600'}`}>
                      {task.workflowType === 'SALES' ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" /></svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19.5 4.5l-15 15m0 0h11.25m-11.25 0V8.25" /></svg>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800 truncate">{task.customerName}</span>
                        {urgent && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">긴급</span>}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {firstItem?.PROD_DES || firstItem?.PROD_CD || '품목'}
                        {(task.items?.length || 0) > 1 && ` 외 ${task.items.length - 1}건`}
                        <span className="mx-1.5">·</span>
                        납기 {parseDate(task.ioDate)}
                      </div>
                    </div>

                    {/* CoA status */}
                    <div className="shrink-0">
                      {task.documentCount > 0 ? (
                        <span className="px-2 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700">CoA {task.documentCount}</span>
                      ) : (
                        <span className="px-2 py-1 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700">미첨부</span>
                      )}
                    </div>

                    {/* Status */}
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold shrink-0 ${statusInfo.bg} ${statusInfo.color}`}>
                      {statusInfo.label}
                    </span>

                    <svg className="w-4 h-4 text-slate-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : viewTab === 'history' ? (
        /* ─── 처리 이력 ─── */
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-12 text-center">
          <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-slate-500 font-medium">출고/입고 처리 이력</p>
          <p className="text-xs text-slate-400 mt-1">출고완료 또는 입고완료된 건의 이력이 표시됩니다</p>
        </div>
      ) : (
        /* ─── 성적서 관리 ─── */
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="divide-y divide-slate-100">
            {tasks.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-slate-500 font-medium">성적서 관리 대상이 없습니다</p>
              </div>
            ) : (
              tasks.map(task => {
                const firstItem = task.items?.[0];
                return (
                  <button
                    key={task.id}
                    onClick={() => setSelectedTask(task)}
                    className="w-full flex items-center gap-4 px-6 py-4 text-left hover:bg-slate-50/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-slate-800">{task.customerName}</div>
                      <div className="text-xs text-slate-500">{firstItem?.PROD_DES || '-'} · {parseDate(task.ioDate)}</div>
                    </div>
                    {task.documentCount > 0 ? (
                      <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700">첨부완료 ({task.documentCount})</span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-50 text-red-700">미첨부</span>
                    )}
                    <svg className="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Detail Panel */}
      {renderDetailPanel()}

      <style jsx global>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slideInRight {
          animation: slideInRight 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
