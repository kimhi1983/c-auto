'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
  deliveryAddress: string | null;
  deliveryContact: string | null;
  deliveryPhone: string | null;
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

type WarehouseCode = 'mk' | 'mansuk' | 'wellrise' | 'ecofarm' | 'playground' | 'kpros';

const WAREHOUSES: { code: WarehouseCode; label: string; color: string; gradient: string; whCodes: string[] }[] = [
  { code: 'mk', label: 'MK물류', color: '#1565C0', gradient: 'from-blue-600 to-blue-700', whCodes: ['MK', 'MK물류', 'WH-MK'] },
  { code: 'mansuk', label: '만석물류', color: '#2E7D32', gradient: 'from-green-600 to-green-700', whCodes: ['만석', '만석물류', 'WH-MS'] },
  { code: 'wellrise', label: '웰라이즈', color: '#E65100', gradient: 'from-orange-600 to-orange-700', whCodes: ['웰라이즈', 'WH-WR'] },
  { code: 'ecofarm', label: '에코스팜', color: '#7B1FA2', gradient: 'from-purple-600 to-purple-700', whCodes: ['에코스팜', 'WH-EF'] },
  { code: 'playground', label: '플레이그라운드', color: '#00838F', gradient: 'from-cyan-700 to-cyan-800', whCodes: ['플레이그라운드', 'WH-PG'] },
  { code: 'kpros', label: '케이프로스', color: '#F57F17', gradient: 'from-yellow-600 to-yellow-700', whCodes: ['케이프로스', 'KPROS', 'WH-KP'] },
];

type ViewTab = 'orders' | 'history' | 'coa';

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  ERP_SUBMITTED: { label: 'ERP전송완료', color: 'text-emerald-700', bg: 'bg-emerald-50' },
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
  const [historyTasks, setHistoryTasks] = useState<WorkflowTask[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [allowedWarehouses, setAllowedWarehouses] = useState<WarehouseCode[] | null>(null);

  // 사용자 권한에 따라 접근 가능한 창고 필터링
  useEffect(() => {
    const fetchUserPermissions = async () => {
      try {
        const res = await fetch(apiUrl('/api/v1/auth/me'), { headers: authHeaders() });
        if (!res.ok) return;
        const user = await res.json();
        if (user.role === 'admin' || !user.menu_permissions) {
          setAllowedWarehouses(null); // 전체 접근
          return;
        }
        const perms: string[] = JSON.parse(user.menu_permissions);
        // 허용된 창고 코드 추출 (/warehouse-portal?wh=mk → mk)
        const whCodes = perms
          .filter((p: string) => p.startsWith('/warehouse-portal?wh='))
          .map((p: string) => p.split('=')[1] as WarehouseCode);
        setAllowedWarehouses(whCodes.length > 0 ? whCodes : []);
        // 현재 선택된 창고가 허용 목록에 없으면 첫 번째 허용 창고로 전환
        if (whCodes.length > 0 && !whCodes.includes(activeWh)) {
          setActiveWh(whCodes[0]);
        }
      } catch { /* 권한 조회 실패 시 전체 표시 */ }
    };
    fetchUserPermissions();
  }, []);

  // 권한 필터가 적용된 창고 목록
  const visibleWarehouses = allowedWarehouses === null
    ? WAREHOUSES
    : WAREHOUSES.filter(w => allowedWarehouses.includes(w.code));

  const currentWh = WAREHOUSES.find(w => w.code === activeWh) || WAREHOUSES[0];

  // 완료 이력 조회
  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch(apiUrl('/api/v1/warehouse-ops?include_completed=true'), { headers: authHeaders() });
      if (!res.ok) throw new Error('이력 조회 실패');
      const data = await res.json();
      const warehouses: WarehouseGroup[] = data.data?.warehouses || [];
      const all = warehouses.flatMap(wh => wh.tasks);
      // 완료 상태만 필터
      const completed = all.filter(t => ['SHIPPED', 'DELIVERED', 'RECEIVED', 'STOCKED'].includes(t.status));
      // 현재 창고 매칭
      const whMatch = warehouses.find(wh =>
        currentWh.whCodes.some(c => wh.warehouseCd.includes(c)) || wh.warehouseCd === currentWh.label
      );
      const whCompleted = (whMatch?.tasks || []).filter(t => ['SHIPPED', 'DELIVERED', 'RECEIVED', 'STOCKED'].includes(t.status));
      setHistoryTasks(whCompleted.length > 0 ? whCompleted : completed);
    } catch { setHistoryTasks([]); }
    finally { setHistoryLoading(false); }
  }, [currentWh]);

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
  useEffect(() => { if (viewTab === 'history') fetchHistory(); }, [viewTab, fetchHistory]);

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

  // ─── 수정/삭제 ───
  const getEditUrl = (task: WorkflowTask) =>
    `/erp/${task.workflowType === 'SALES' ? 'sales' : 'purchases'}?edit=${task.id}`;

  const handleDeleteTask = async (e: React.MouseEvent, taskId: number) => {
    e.stopPropagation();
    if (!confirm('이 내역을 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(apiUrl(`/api/v1/workflows/${taskId}`), { method: 'DELETE', headers: authHeaders() });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || '삭제 실패');
      }
      fetchTasks();
      if (viewTab === 'history') fetchHistory();
      if (selectedTask?.id === taskId) setSelectedTask(null);
    } catch (err: any) {
      alert(err.message || '삭제 중 오류 발생');
    }
  };

  // ─── 프린트 기능 ───
  const handlePrint = () => {
    if (!selectedTask) return;
    const items = selectedTask.items || [];
    const typeLabel = selectedTask.workflowType === 'SALES' ? '출고 요청서' : '입고 요청서';
    const urgent = isUrgent(selectedTask.ioDate);
    const statusInfo = STATUS_LABELS[selectedTask.status] || { label: selectedTask.status };

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${typeLabel} - ${selectedTask.orderNumber || selectedTask.id}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Pretendard',sans-serif;color:#1e293b;padding:40px;max-width:800px;margin:0 auto}
h1{font-size:28px;font-weight:800;margin-bottom:4px}
.header{border-bottom:3px solid #1e293b;padding-bottom:20px;margin-bottom:24px}
.header-top{display:flex;justify-content:space-between;align-items:flex-start}
.badge{display:inline-block;padding:4px 12px;border-radius:6px;font-size:13px;font-weight:700;background:#f1f5f9;color:#475569;margin-right:8px}
.badge-urgent{background:#fef2f2;color:#dc2626}
.meta{font-size:14px;color:#64748b;margin-top:8px}
.meta span{margin-right:16px}
.section{margin-bottom:24px}
.section-title{font-size:16px;font-weight:700;margin-bottom:12px;padding-bottom:6px;border-bottom:2px solid #e2e8f0}
.delivery-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;padding:16px;background:#f0f9ff;border:2px solid #bae6fd;border-radius:12px}
.delivery-item label{font-size:11px;color:#64748b;display:block;margin-bottom:2px}
.delivery-item p{font-size:16px;font-weight:700;color:#0f172a}
table{width:100%;border-collapse:collapse}
th{background:#f8fafc;border:1px solid #e2e8f0;padding:10px 14px;text-align:left;font-size:13px;font-weight:600;color:#475569}
td{border:1px solid #e2e8f0;padding:10px 14px;font-size:14px}
.text-right{text-align:right}
.note{padding:12px 16px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;font-size:14px;color:#92400e}
.footer{margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:12px;color:#94a3b8}
@media print{body{padding:20px}}
</style></head><body>
<div class="header">
<div class="header-top">
<div>
<span class="badge">${typeLabel}</span>
<span class="badge">#${selectedTask.orderNumber || selectedTask.id}</span>
${urgent ? '<span class="badge badge-urgent">긴급</span>' : ''}
<h1>${selectedTask.customerName}</h1>
<div class="meta">
<span>납기: ${parseDate(selectedTask.ioDate)}</span>
<span>상태: ${statusInfo.label}</span>
<span>창고: ${currentWh.label}</span>
</div>
</div>
</div>
</div>
${(selectedTask.deliveryAddress || selectedTask.deliveryContact || selectedTask.deliveryPhone) ? `
<div class="section">
<div class="section-title">배송정보</div>
<div class="delivery-grid">
<div class="delivery-item"><label>도착주소</label><p>${selectedTask.deliveryAddress || '-'}</p></div>
<div class="delivery-item"><label>담당자</label><p>${selectedTask.deliveryContact || '-'}</p></div>
<div class="delivery-item"><label>연락처</label><p>${selectedTask.deliveryPhone || '-'}</p></div>
</div>
</div>` : ''}
<div class="section">
<div class="section-title">품목 내역 (${items.length}건)</div>
<table>
<thead><tr><th>No.</th><th>품목명</th><th>품목코드</th><th class="text-right">수량</th><th>창고</th><th>비고</th></tr></thead>
<tbody>
${items.map((item: any, i: number) => `<tr>
<td>${i + 1}</td>
<td><strong>${item.PROD_DES || '-'}</strong></td>
<td>${item.PROD_CD || '-'}</td>
<td class="text-right"><strong>${item.QTY || '-'}</strong> ${item.UNIT || 'kg'}</td>
<td>${item.WH_CD || '-'}</td>
<td>${item.REMARKS || '-'}</td>
</tr>`).join('')}
</tbody>
</table>
</div>
${selectedTask.note ? `<div class="section"><div class="note"><strong>메모:</strong> ${selectedTask.note}</div></div>` : ''}
<div class="footer">
<span>C-Auto ${typeLabel}</span>
<span>출력일: ${new Date().toLocaleDateString('ko-KR')}</span>
</div>
</body></html>`;

    const w = window.open('', '_blank');
    if (w) {
      w.document.write(html);
      w.document.close();
      setTimeout(() => w.print(), 300);
    }
  };

  // ─── Detail Panel ───
  const renderDetailPanel = () => {
    if (!selectedTask) return null;
    const items = selectedTask.items || [];
    const statusInfo = STATUS_LABELS[selectedTask.status] || { label: selectedTask.status, color: '', bg: '' };

    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedTask(null)}>
        <div className="w-full max-w-6xl bg-white rounded-2xl shadow-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className={`px-8 py-5 bg-gradient-to-r ${currentWh.gradient} text-white rounded-t-2xl shrink-0`}>
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <span className="px-3 py-1 rounded-lg bg-white/20 text-sm font-bold">
                    {selectedTask.workflowType === 'SALES' ? '출고 요청서' : '입고 요청서'}
                  </span>
                  <span className="text-white/80 text-sm font-mono">#{selectedTask.orderNumber || selectedTask.id}</span>
                  {isUrgent(selectedTask.ioDate) && (
                    <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-red-500 text-white animate-pulse">긴급</span>
                  )}
                  <span className="px-2.5 py-0.5 rounded-lg bg-white/20 text-xs font-semibold">{statusInfo.label}</span>
                </div>
                <h3 className="text-2xl font-bold">{selectedTask.customerName}</h3>
                <div className="text-sm text-white/70 mt-1">납기: {parseDate(selectedTask.ioDate)} · {currentWh.label}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handlePrint}
                  className="p-2.5 rounded-xl bg-white/20 hover:bg-white/30 text-white transition"
                  title="인쇄 / PDF 다운로드"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                </button>
                <button onClick={() => setSelectedTask(null)} className="p-2.5 rounded-xl hover:bg-white/20 text-white/80 transition">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
          </div>

          {/* 스크롤 영역 */}
          <div className="overflow-y-auto flex-1 min-h-0">
            {/* 배송정보 카드 */}
            {(selectedTask.deliveryAddress || selectedTask.deliveryContact || selectedTask.deliveryPhone) && (
              <div className="px-8 py-5 border-b border-slate-100">
                <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    <h4 className="text-base font-bold text-blue-800">배송정보</h4>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <span className="text-xs text-blue-500 font-medium">도착주소</span>
                      <p className="text-lg font-bold text-slate-900 mt-0.5">{selectedTask.deliveryAddress || '-'}</p>
                    </div>
                    <div>
                      <span className="text-xs text-blue-500 font-medium">담당자</span>
                      <p className="text-lg font-bold text-slate-900 mt-0.5">{selectedTask.deliveryContact || '-'}</p>
                    </div>
                    <div>
                      <span className="text-xs text-blue-500 font-medium">연락처</span>
                      <p className="text-lg font-bold text-slate-900 mt-0.5">{selectedTask.deliveryPhone || '-'}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-0">
              {/* 좌측: 품목 내역 (3/5) */}
              <div className="lg:col-span-3 px-8 py-6 border-b lg:border-b-0 lg:border-r border-slate-100">
                <h4 className="text-base font-bold text-slate-700 mb-4">품목 내역 ({items.length}건)</h4>
                {items.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-slate-200 text-slate-500">
                        <th className="text-left py-2.5 font-semibold w-8">No.</th>
                        <th className="text-left py-2.5 font-semibold">품목명</th>
                        <th className="text-right py-2.5 font-semibold w-28">수량</th>
                        <th className="text-left py-2.5 font-semibold w-28">창고</th>
                        <th className="text-left py-2.5 font-semibold w-24">비고</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item: any, i: number) => (
                        <tr key={i} className="border-b border-slate-100">
                          <td className="py-3 text-slate-400">{i + 1}</td>
                          <td className="py-3">
                            <div className="font-bold text-slate-800">{item.PROD_DES || item.PROD_CD}</div>
                            {item.PROD_CD && item.PROD_DES && <div className="text-xs text-slate-400 mt-0.5">{item.PROD_CD}</div>}
                          </td>
                          <td className="py-3 text-right">
                            <span className="font-bold text-slate-800 text-base">{item.QTY || '-'}</span>
                            <span className="text-xs text-slate-400 ml-1">{item.UNIT || 'kg'}</span>
                          </td>
                          <td className="py-3 text-slate-600">{item.WH_CD || '-'}</td>
                          <td className="py-3 text-slate-500 text-xs">{item.REMARKS || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-sm text-slate-400 py-4">품목 정보 없음</p>
                )}

                {/* 메모 */}
                {selectedTask.note && (
                  <div className="mt-5 p-4 rounded-xl bg-amber-50 border border-amber-100">
                    <p className="text-xs text-amber-600 font-medium mb-1">메모</p>
                    <p className="text-sm text-amber-800">{selectedTask.note}</p>
                  </div>
                )}
              </div>

              {/* 우측: 성적서 + 액션 (2/5) */}
              <div className="lg:col-span-2 px-6 py-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-base font-bold text-slate-700">성적서(CoA)</h4>
                  <span className="text-sm text-slate-400">{docs.length}개 첨부</span>
                </div>

                {docsLoading ? (
                  <div className="py-8 text-center"><div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" /></div>
                ) : (
                  <>
                    {docs.map(doc => (
                      <div key={doc.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl mb-2">
                        <svg className="w-7 h-7 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

                {/* 액션 버튼 */}
                <div className="mt-6 pt-5 border-t border-slate-100">
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
                      {processing ? '처리 중...' : selectedTask.workflowType === 'SALES' ? '출고완료 처리' : '입고완료 처리'}
                    </button>
                  </div>
                </div>
              </div>
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
      <div className="flex items-center gap-3 flex-wrap">
        {visibleWarehouses.map(wh => (
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
          { key: 'orders' as ViewTab, label: '출고/입고 요청' },
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
        /* ─── 출고/입고 요청 목록 ─── */
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          {tasks.length === 0 ? (
            <div className="p-12 text-center">
              <svg className="w-16 h-16 mx-auto mb-4" style={{ color: currentWh.color + '40' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
              </svg>
              <p className="text-slate-500 font-medium">{currentWh.label} 출고/입고 요청이 없습니다</p>
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

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <a
                        href={getEditUrl(task)}
                        onClick={e => e.stopPropagation()}
                        className="p-1.5 rounded-lg text-slate-300 hover:text-blue-600 hover:bg-blue-50 transition"
                        title="수정"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </a>
                      <button
                        onClick={e => handleDeleteTask(e, task.id)}
                        className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition"
                        title="삭제"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>

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
        historyLoading ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-sm">
            <div className="w-8 h-8 border-[3px] border-t-transparent rounded-full animate-spin mx-auto mb-3" style={{ borderColor: currentWh.color, borderTopColor: 'transparent' }} />
            <p className="text-sm text-slate-400">이력 불러오는 중...</p>
          </div>
        ) : historyTasks.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-12 text-center">
            <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-slate-500 font-medium">처리 완료된 이력이 없습니다</p>
            <p className="text-xs text-slate-400 mt-1">출고완료 또는 입고완료된 건의 이력이 표시됩니다</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="divide-y divide-slate-100">
              {historyTasks.map(task => {
                const statusInfo = STATUS_LABELS[task.status] || { label: task.status, color: 'text-slate-600', bg: 'bg-slate-100' };
                const firstItem = task.items?.[0];
                return (
                  <div key={task.id} className="flex items-center gap-4 px-6 py-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${task.workflowType === 'SALES' ? 'bg-blue-50 text-blue-600' : 'bg-violet-50 text-violet-600'}`}>
                      {task.workflowType === 'SALES' ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" /></svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19.5 4.5l-15 15m0 0h11.25m-11.25 0V8.25" /></svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-slate-800">{task.customerName}</span>
                        <span className="text-xs text-slate-400">#{task.orderNumber || task.id}</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {firstItem?.PROD_DES || firstItem?.PROD_CD || '품목'}
                        {(task.items?.length || 0) > 1 && ` 외 ${task.items.length - 1}건`}
                        <span className="mx-1.5">·</span>
                        {parseDate(task.updatedAt)}
                      </div>
                    </div>
                    {task.documentCount > 0 && (
                      <span className="px-2 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 shrink-0">CoA {task.documentCount}</span>
                    )}
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold shrink-0 ${statusInfo.bg} ${statusInfo.color}`}>
                      {statusInfo.label}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <a
                        href={getEditUrl(task)}
                        className="p-1.5 rounded-lg text-slate-300 hover:text-blue-600 hover:bg-blue-50 transition"
                        title="수정"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </a>
                      <button
                        onClick={e => handleDeleteTask(e, task.id)}
                        className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition"
                        title="삭제"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )
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
                    <div className="flex items-center gap-1 shrink-0">
                      <a
                        href={getEditUrl(task)}
                        onClick={e => e.stopPropagation()}
                        className="p-1.5 rounded-lg text-slate-300 hover:text-blue-600 hover:bg-blue-50 transition"
                        title="수정"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </a>
                      <button
                        onClick={e => handleDeleteTask(e, task.id)}
                        className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition"
                        title="삭제"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                    <svg className="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Detail Panel — createPortal로 body에 렌더링하여 transform 영향 회피 */}
      {selectedTask && typeof document !== 'undefined' && createPortal(renderDetailPanel(), document.body)}

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
