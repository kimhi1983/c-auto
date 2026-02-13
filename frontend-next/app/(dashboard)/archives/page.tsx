'use client';

import { useEffect, useState } from 'react';
import { apiUrl, authJsonHeaders } from '@/lib/api';

interface Archive {
  id: number;
  email_id: number | null;
  document_type: string;
  file_name: string;
  file_path: string;
  file_size: number;
  company_name: string | null;
  category: string | null;
  description: string | null;
  archived_date: string | null;
}

interface ArchiveDetail extends Archive {
  content: string | null;
}

interface ArchiveStats {
  total_archives: number;
  recent_7days: number;
  total_size_bytes: number;
  total_size_mb: number;
  total_reports: number;
  by_type: Record<string, number>;
  by_category: Record<string, number>;
}

interface Report {
  id: number;
  report_date: string;
  report_type: string;
  file_name: string;
  email_count: number;
  summary: string | null;
  created_at: string;
}

function getAuthHeaders(): Record<string, string> {
  return authJsonHeaders();
}

function formatSize(size: number): string {
  if (!size || isNaN(size)) return '-';
  if (size < 1024) return `${size} B`;
  if (size < 1048576) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1048576).toFixed(1)} MB`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const DOC_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  email: { label: '이메일', color: 'bg-blue-100 text-blue-700' },
  pdf: { label: 'PDF', color: 'bg-red-100 text-red-700' },
  excel: { label: 'Excel', color: 'bg-green-100 text-green-700' },
  report: { label: '리포트', color: 'bg-purple-100 text-purple-700' },
  ai_document: { label: 'AI 문서', color: 'bg-violet-100 text-violet-700' },
};

const CATEGORY_COLORS: Record<string, string> = {
  '발주': 'bg-orange-100 text-orange-700',
  '요청': 'bg-blue-100 text-blue-700',
  '견적요청': 'bg-indigo-100 text-indigo-700',
  '문의': 'bg-cyan-100 text-cyan-700',
  '공지': 'bg-green-100 text-green-700',
  '미팅': 'bg-yellow-100 text-yellow-700',
  '클레임': 'bg-red-100 text-red-700',
  '기타': 'bg-gray-100 text-gray-700',
};

export default function ArchivesPage() {
  const [archives, setArchives] = useState<Archive[]>([]);
  const [stats, setStats] = useState<ArchiveStats | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedArchive, setSelectedArchive] = useState<ArchiveDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [activeTab, setActiveTab] = useState<'archives' | 'reports'>('archives');
  const [generating, setGenerating] = useState(false);
  const [bulkArchiving, setBulkArchiving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => { loadStats(); loadArchives(); loadReports(); }, []);
  useEffect(() => { loadArchives(); }, [page, typeFilter, categoryFilter]);

  const loadStats = async () => {
    try {
      const res = await fetch(apiUrl('/api/v1/archives/stats'), { headers: getAuthHeaders() });
      if (res.ok) { const data = await res.json(); if (data.status === 'success') setStats(data.data); }
    } catch { /* silent */ }
  };

  const loadArchives = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: '20' });
      if (typeFilter) params.set('document_type', typeFilter);
      if (categoryFilter) params.set('category', categoryFilter);
      if (search) params.set('search', search);
      const res = await fetch(apiUrl(`/api/v1/archives/?${params}`), { headers: getAuthHeaders() });
      if (res.ok) { const data = await res.json(); setArchives(data.archives || []); setTotal(data.total || 0); setTotalPages(data.total_pages || 1); }
    } catch { /* silent */ }
    setLoading(false);
  };

  const loadReports = async () => {
    try {
      const res = await fetch(apiUrl('/api/v1/archives/reports'), { headers: getAuthHeaders() });
      if (res.ok) { const data = await res.json(); setReports(data.reports || []); }
    } catch { /* silent */ }
  };

  const viewDetail = async (id: number) => {
    setDetailLoading(true);
    try { const res = await fetch(apiUrl(`/api/v1/archives/${id}`), { headers: getAuthHeaders() }); if (res.ok) { const data = await res.json(); setSelectedArchive(data.data); } } catch { /* silent */ }
    setDetailLoading(false);
  };

  const deleteArchive = async (id: number) => {
    if (!confirm('이 아카이브를 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(apiUrl(`/api/v1/archives/${id}`), { method: 'DELETE', headers: getAuthHeaders() });
      if (res.ok) { setMessage('아카이브 삭제 완료'); setSelectedArchive(null); loadArchives(); loadStats(); setTimeout(() => setMessage(''), 3000); }
    } catch { /* silent */ }
  };

  const generateReport = async (type: string) => {
    setGenerating(true); setMessage('');
    try {
      const res = await fetch(apiUrl(`/api/v1/archives/generate-report?report_type=${type}`), { method: 'POST', headers: getAuthHeaders() });
      if (res.ok) { setMessage(`${type} 리포트 생성 완료`); loadReports(); loadStats(); } else { setMessage('리포트 생성 실패'); }
    } catch { setMessage('리포트 생성 오류'); }
    setGenerating(false); setTimeout(() => setMessage(''), 3000);
  };

  const bulkArchive = async () => {
    if (!confirm('발송 완료된 모든 이메일을 아카이브하시겠습니까?')) return;
    setBulkArchiving(true); setMessage('');
    try {
      const res = await fetch(apiUrl('/api/v1/archives/bulk-archive-emails?status_filter=sent'), { method: 'POST', headers: getAuthHeaders() });
      if (res.ok) { const data = await res.json(); setMessage(`일괄 아카이브 완료: ${data.data?.archived_count || 0}건 처리`); loadArchives(); loadStats(); } else { setMessage('일괄 아카이브 실패'); }
    } catch { setMessage('일괄 아카이브 오류'); }
    setBulkArchiving(false); setTimeout(() => setMessage(''), 4000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">문서 아카이브</h1>
          <p className="text-sm text-slate-500 mt-1">이메일 및 문서의 자동 아카이브 관리</p>
        </div>
        <button onClick={bulkArchive} disabled={bulkArchiving} className="px-5 py-2 bg-slate-700 text-white text-sm font-medium rounded-2xl hover:bg-slate-800 transition disabled:opacity-50">
          {bulkArchiving ? '처리 중...' : '일괄 아카이브'}
        </button>
      </div>

      {message && <div className="px-4 py-3 bg-brand-50 border border-brand-200 text-brand-700 text-sm rounded-2xl animate-fadeIn">{message}</div>}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5"><div className="text-2xl font-bold text-slate-900">{stats?.total_archives || 0}</div><div className="text-xs text-slate-500 mt-1">전체 아카이브</div></div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5"><div className="text-2xl font-bold text-brand-600">{stats?.recent_7days || 0}</div><div className="text-xs text-slate-500 mt-1">최근 7일</div></div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5"><div className="text-2xl font-bold text-slate-900">{stats?.total_size_mb || 0} MB</div><div className="text-xs text-slate-500 mt-1">총 용량</div></div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5"><div className="text-2xl font-bold text-purple-600">{stats?.total_reports || 0}</div><div className="text-xs text-slate-500 mt-1">생성 리포트</div></div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5"><div className="text-2xl font-bold text-green-600">{Object.keys(stats?.by_category || {}).length}</div><div className="text-xs text-slate-500 mt-1">카테고리</div></div>
      </div>

      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        <button onClick={() => setActiveTab('archives')} className={`px-5 py-2 text-sm font-medium rounded-xl transition ${activeTab === 'archives' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>아카이브 ({total})</button>
        <button onClick={() => setActiveTab('reports')} className={`px-5 py-2 text-sm font-medium rounded-xl transition ${activeTab === 'reports' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>리포트 ({reports.length})</button>
      </div>

      {activeTab === 'archives' ? (
        <div className="flex gap-5">
          <div className="flex-1 space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <form onSubmit={(e) => { e.preventDefault(); setPage(1); loadArchives(); }} className="flex gap-3 items-end flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <label className="text-xs text-slate-500 mb-1.5 block font-medium">검색</label>
                  <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="파일명, 설명, 회사명..." className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 outline-none transition" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1.5 block font-medium">유형</label>
                  <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm">
                    <option value="">전체</option><option value="email">이메일</option><option value="pdf">PDF</option><option value="excel">Excel</option><option value="report">리포트</option><option value="ai_document">AI 문서</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1.5 block font-medium">카테고리</label>
                  <select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }} className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm">
                    <option value="">전체</option>{Object.keys(CATEGORY_COLORS).map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
                <button type="submit" className="px-5 py-2.5 bg-brand-500 text-white text-sm rounded-xl hover:bg-brand-600 transition font-medium">검색</button>
              </form>
            </div>

            {loading ? (
              <div className="text-center py-14 text-slate-400 text-sm">불러오는 중...</div>
            ) : archives.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-14 text-center">
                <div className="text-4xl mb-3">🗂️</div>
                <div className="text-slate-500 text-sm font-medium">아카이브가 없습니다</div>
                <div className="text-slate-400 text-xs mt-1">이메일을 아카이브하거나 리포트를 생성해 보세요</div>
              </div>
            ) : (
              <div className="space-y-2.5">
                {archives.map((a) => {
                  const typeInfo = DOC_TYPE_LABELS[a.document_type] || { label: a.document_type, color: 'bg-gray-100 text-gray-700' };
                  const catColor = CATEGORY_COLORS[a.category || ''] || 'bg-gray-100 text-gray-700';
                  return (
                    <div key={a.id} onClick={() => viewDetail(a.id)} className={`bg-white rounded-2xl border p-5 cursor-pointer transition-all hover:shadow-sm ${selectedArchive?.id === a.id ? 'border-brand-400 ring-1 ring-brand-200' : 'border-slate-200'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${typeInfo.color}`}>{typeInfo.label}</span>
                            {a.category && <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${catColor}`}>{a.category}</span>}
                            {a.company_name && a.company_name !== '미분류' && <span className="text-xs text-slate-500">{a.company_name}</span>}
                          </div>
                          <div className="text-sm font-semibold text-slate-900 truncate">{a.file_name}</div>
                          {a.description && <div className="text-xs text-slate-500 mt-1 truncate">{a.description}</div>}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-xs text-slate-400">{formatDate(a.archived_date)}</div>
                          <div className="text-xs text-slate-400 mt-0.5">{formatSize(a.file_size)}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-5">
                <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} className="px-4 py-2 border border-slate-200 rounded-xl text-sm disabled:opacity-40 hover:bg-slate-50 transition font-medium">이전</button>
                <span className="text-sm text-slate-500 px-2">{page} / {totalPages}</span>
                <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="px-4 py-2 border border-slate-200 rounded-xl text-sm disabled:opacity-40 hover:bg-slate-50 transition font-medium">다음</button>
              </div>
            )}
          </div>

          {selectedArchive && (
            <div className="w-[420px] shrink-0">
              <div className="bg-white rounded-2xl border border-slate-200 p-6 sticky top-20 animate-fadeIn">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-sm font-bold text-slate-900">아카이브 상세</h3>
                  <button onClick={() => setSelectedArchive(null)} className="text-slate-400 hover:text-slate-600 text-lg">&times;</button>
                </div>
                {detailLoading ? <div className="text-center py-8 text-sm text-slate-400">불러오는 중...</div> : (
                  <div className="space-y-4">
                    <div><div className="text-xs text-slate-500 font-medium">파일명</div><div className="text-sm text-slate-900 font-semibold break-all mt-1">{selectedArchive.file_name}</div></div>
                    <div className="grid grid-cols-2 gap-4">
                      <div><div className="text-xs text-slate-500 font-medium">유형</div><div className="text-sm text-slate-900 mt-1">{DOC_TYPE_LABELS[selectedArchive.document_type]?.label || selectedArchive.document_type}</div></div>
                      <div><div className="text-xs text-slate-500 font-medium">카테고리</div><div className="text-sm text-slate-900 mt-1">{selectedArchive.category || '-'}</div></div>
                      <div><div className="text-xs text-slate-500 font-medium">회사</div><div className="text-sm text-slate-900 mt-1">{selectedArchive.company_name || '-'}</div></div>
                      <div><div className="text-xs text-slate-500 font-medium">크기</div><div className="text-sm text-slate-900 mt-1">{formatSize(selectedArchive.file_size)}</div></div>
                    </div>
                    <div><div className="text-xs text-slate-500 font-medium">아카이브 일시</div><div className="text-sm text-slate-900 mt-1">{formatDate(selectedArchive.archived_date)}</div></div>
                    {selectedArchive.description && <div><div className="text-xs text-slate-500 font-medium">설명</div><div className="text-sm text-slate-700 mt-1">{selectedArchive.description}</div></div>}
                    {selectedArchive.content && <div><div className="text-xs text-slate-500 font-medium mb-1.5">내용 미리보기</div><pre className="text-xs text-slate-600 bg-slate-50 rounded-xl p-4 max-h-[300px] overflow-y-auto whitespace-pre-wrap font-mono">{selectedArchive.content}</pre></div>}
                    <div className="pt-3 border-t border-slate-100"><button onClick={() => deleteArchive(selectedArchive.id)} className="w-full px-4 py-2.5 text-red-600 text-sm border border-red-200 rounded-xl hover:bg-red-50 transition font-medium">아카이브 삭제</button></div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">리포트 생성</h3>
            <div className="flex gap-3">
              <button onClick={() => generateReport('daily')} disabled={generating} className="px-5 py-2.5 bg-brand-500 text-white text-sm font-medium rounded-xl hover:bg-brand-600 transition disabled:opacity-50">{generating ? '생성 중...' : '일간 리포트'}</button>
              <button onClick={() => generateReport('weekly')} disabled={generating} className="px-5 py-2.5 bg-indigo-500 text-white text-sm font-medium rounded-xl hover:bg-indigo-600 transition disabled:opacity-50">{generating ? '생성 중...' : '주간 리포트'}</button>
              <button onClick={() => generateReport('monthly')} disabled={generating} className="px-5 py-2.5 bg-purple-500 text-white text-sm font-medium rounded-xl hover:bg-purple-600 transition disabled:opacity-50">{generating ? '생성 중...' : '월간 리포트'}</button>
            </div>
          </div>
          {reports.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-14 text-center"><div className="text-4xl mb-3">📊</div><div className="text-slate-500 text-sm font-medium">생성된 리포트가 없습니다</div></div>
          ) : (
            <div className="space-y-2.5">
              {reports.map((r) => (
                <div key={r.id} className="bg-white rounded-2xl border border-slate-200 p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${r.report_type === 'daily' ? 'bg-brand-100 text-brand-700' : r.report_type === 'weekly' ? 'bg-indigo-100 text-indigo-700' : 'bg-purple-100 text-purple-700'}`}>{r.report_type === 'daily' ? '일간' : r.report_type === 'weekly' ? '주간' : '월간'}</span>
                        <span className="text-xs text-slate-500">이메일 {r.email_count}건</span>
                      </div>
                      <div className="text-sm font-semibold text-slate-900">{r.file_name}</div>
                    </div>
                    <div className="text-xs text-slate-400">{formatDate(r.report_date)}</div>
                  </div>
                  {r.summary && <pre className="text-xs text-slate-500 mt-3 bg-slate-50 rounded-xl p-4 max-h-[150px] overflow-y-auto whitespace-pre-wrap font-mono">{r.summary}</pre>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {stats && Object.keys(stats.by_category).length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="text-sm font-bold text-slate-900 mb-4">카테고리별 아카이브</h3>
          <div className="flex flex-wrap gap-2.5">
            {Object.entries(stats.by_category).map(([cat, count]) => (
              <div key={cat} className={`px-3.5 py-2 rounded-xl text-xs font-bold ${CATEGORY_COLORS[cat] || 'bg-gray-100 text-gray-700'}`}>{cat}: {count}건</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
