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
  report_data?: ReportData | null;
  created_at: string;
}

interface ReportData {
  title: string;
  type: string;
  type_label: string;
  period: string;
  start_date: string;
  end_date: string;
  generated_at: string;
  overview: {
    total_emails: number;
    period_emails: number;
    approval_needed: number;
    key_emails_count: number;
  };
  categories: Array<{ code: string; name: string; count: number }>;
  priorities: { high: number; medium: number; low: number };
  key_emails: Array<{ category: string; subject: string; sender: string; company: string; summary: string; priority: string }>;
  approval_items: Array<{ subject: string; sender: string; company: string; summary: string; category: string }>;
  ai_insight: string;
  email_details: Array<{
    no: number; received_at: string; category: string; code: string;
    sender: string; company: string; subject: string; summary: string;
    priority: string; status: string; action_items: string; needs_approval: boolean;
  }>;
  legacy_text?: string;
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

function formatShortDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return dateStr.split('T')[0];
}

/** summaryText를 ReportData로 파싱 */
function parseReportData(summary: string | null): ReportData | null {
  if (!summary) return null;
  try {
    const parsed = JSON.parse(summary);
    if (parsed && parsed.title) return parsed as ReportData;
  } catch {
    // legacy plain text
  }
  return { legacy_text: summary } as ReportData;
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

const REPORT_CAT_COLORS: Record<string, { bg: string; text: string; bar: string }> = {
  '자료대응': { bg: 'bg-blue-50', text: 'text-blue-700', bar: 'bg-blue-500' },
  '영업기회': { bg: 'bg-red-50', text: 'text-red-700', bar: 'bg-red-500' },
  '스케줄링': { bg: 'bg-pink-50', text: 'text-pink-700', bar: 'bg-pink-500' },
  '정보수집': { bg: 'bg-amber-50', text: 'text-amber-700', bar: 'bg-amber-500' },
  '필터링': { bg: 'bg-gray-50', text: 'text-gray-600', bar: 'bg-gray-400' },
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
  const [expandedReportId, setExpandedReportId] = useState<number | null>(null);
  const [reportDataCache, setReportDataCache] = useState<Record<number, ReportData>>({});
  const [selectedReportIds, setSelectedReportIds] = useState<Set<number>>(new Set());
  const [deletingReport, setDeletingReport] = useState(false);

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
      if (res.ok) {
        const data = await res.json();
        const list: Report[] = (data.reports || []).map((r: any) => ({
          ...r,
          report_data: r.report_data || parseReportData(r.summary),
        }));
        setReports(list);
      }
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
      if (res.ok) {
        const data = await res.json();
        const typeLabel = type === 'daily' ? '일간' : type === 'weekly' ? '주간' : '월간';
        setMessage(`${typeLabel} 리포트 생성 완료`);
        if (data.data?.id) {
          setExpandedReportId(data.data.id);
          const rd = data.data.report_data || parseReportData(data.data.summary);
          if (rd) setReportDataCache((prev) => ({ ...prev, [data.data.id]: rd }));
        }
        loadReports(); loadStats();
      } else { setMessage('리포트 생성 실패'); }
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

  const deleteReport = async (id: number) => {
    if (!confirm('이 리포트를 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(apiUrl(`/api/v1/archives/reports/${id}`), { method: 'DELETE', headers: getAuthHeaders() });
      if (res.ok) {
        setMessage('리포트 삭제 완료');
        if (expandedReportId === id) setExpandedReportId(null);
        setSelectedReportIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
        loadReports(); loadStats();
      } else { setMessage('리포트 삭제 실패'); }
    } catch { setMessage('리포트 삭제 오류'); }
    setTimeout(() => setMessage(''), 3000);
  };

  const bulkDeleteReports = async () => {
    const ids = Array.from(selectedReportIds);
    const isAll = ids.length === 0;
    const msg = isAll ? '모든 리포트를 삭제하시겠습니까?' : `선택한 ${ids.length}건의 리포트를 삭제하시겠습니까?`;
    if (!confirm(msg)) return;
    setDeletingReport(true);
    try {
      const url = isAll ? '/api/v1/archives/reports' : `/api/v1/archives/reports?ids=${ids.join(',')}`;
      const res = await fetch(apiUrl(url), { method: 'DELETE', headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setMessage(`${data.data?.deleted_count || 0}건 리포트 삭제 완료`);
        setExpandedReportId(null);
        setSelectedReportIds(new Set());
        loadReports(); loadStats();
      } else { setMessage('일괄 삭제 실패'); }
    } catch { setMessage('일괄 삭제 오류'); }
    setDeletingReport(false);
    setTimeout(() => setMessage(''), 3000);
  };

  const toggleReportSelect = (id: number) => {
    setSelectedReportIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedReportIds.size === reports.length) {
      setSelectedReportIds(new Set());
    } else {
      setSelectedReportIds(new Set(reports.map((r) => r.id)));
    }
  };

  const viewReport = async (report: Report) => {
    if (expandedReportId === report.id) { setExpandedReportId(null); return; }
    setExpandedReportId(report.id);
    // 이미 캐시된 데이터 있으면 재사용
    if (reportDataCache[report.id]) return;
    // report_data가 이미 있으면 캐시
    const existing = report.report_data || parseReportData(report.summary);
    if (existing) { setReportDataCache((prev) => ({ ...prev, [report.id]: existing })); return; }
    try {
      const res = await fetch(apiUrl(`/api/v1/archives/reports/${report.id}`), { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        const rd = data.data?.report_data || parseReportData(data.data?.summary);
        if (rd) setReportDataCache((prev) => ({ ...prev, [report.id]: rd }));
      }
    } catch { /* silent */ }
  };

  /** Excel 다운로드 (xlsx 라이브러리 동적 import) */
  const downloadExcel = async (report: Report) => {
    const rd = reportDataCache[report.id] || report.report_data || parseReportData(report.summary);
    if (!rd || rd.legacy_text) {
      // 레거시: TXT 다운로드
      downloadTxt(report);
      return;
    }

    try {
      const XLSX = await import('xlsx');

      const wb = XLSX.utils.book_new();

      // Sheet 1: 리포트 요약
      const summaryRows = [
        ['KPROS 업무 리포트'],
        [],
        ['리포트 유형', rd.type_label],
        ['기간', rd.period],
        ['생성일시', rd.generated_at ? formatDate(rd.generated_at) : ''],
        [],
        ['전체 현황'],
        ['전체 이메일', `${rd.overview.total_emails}건`],
        ['기간 내 수신', `${rd.overview.period_emails}건`],
        ['이사님 확인 필요', `${rd.overview.approval_needed}건`],
        ['주요 이메일(영업/긴급)', `${rd.overview.key_emails_count}건`],
        [],
        ['카테고리별 분류'],
        ['코드', '카테고리', '건수'],
        ...rd.categories.filter((c) => c.count > 0).map((c) => [c.code, c.name, `${c.count}건`]),
        [],
        ['중요도별 분류'],
        ['긴급(High)', `${rd.priorities.high}건`],
        ['일반(Medium)', `${rd.priorities.medium}건`],
        ['낮음(Low)', `${rd.priorities.low}건`],
      ];
      if (rd.ai_insight) {
        summaryRows.push([], ['AI 분석 요약'], [rd.ai_insight]);
      }
      const ws1 = XLSX.utils.aoa_to_sheet(summaryRows);
      // 열 너비 설정
      ws1['!cols'] = [{ wch: 22 }, { wch: 40 }, { wch: 12 }];
      // 타이틀 행 병합
      ws1['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];
      XLSX.utils.book_append_sheet(wb, ws1, '리포트 요약');

      // Sheet 2: 이메일 상세 목록
      if (rd.email_details && rd.email_details.length > 0) {
        const detailHeader = ['No', '수신일', '분류코드', '카테고리', '발신자', '회사명', '제목', '핵심요약', '중요도', '처리상태', '이사님확인', '처리내용'];
        const detailRows = rd.email_details.map((e) => [
          e.no, formatShortDate(e.received_at), e.code, e.category, e.sender, e.company,
          e.subject, e.summary, e.priority, e.status,
          e.needs_approval ? 'O' : '', e.action_items,
        ]);
        const ws2 = XLSX.utils.aoa_to_sheet([detailHeader, ...detailRows]);
        ws2['!cols'] = [
          { wch: 5 }, { wch: 12 }, { wch: 6 }, { wch: 10 }, { wch: 25 }, { wch: 15 },
          { wch: 40 }, { wch: 50 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 50 },
        ];
        XLSX.utils.book_append_sheet(wb, ws2, '이메일 상세');
      }

      // Sheet 3: 주요 이메일
      if (rd.key_emails && rd.key_emails.length > 0) {
        const keyHeader = ['카테고리', '발신자', '회사명', '제목', '요약', '중요도'];
        const keyRows = rd.key_emails.map((e) => [e.category, e.sender, e.company, e.subject, e.summary, e.priority]);
        const ws3 = XLSX.utils.aoa_to_sheet([keyHeader, ...keyRows]);
        ws3['!cols'] = [{ wch: 10 }, { wch: 25 }, { wch: 15 }, { wch: 40 }, { wch: 50 }, { wch: 8 }];
        XLSX.utils.book_append_sheet(wb, ws3, '주요 이메일');
      }

      // Sheet 4: 이사님 확인 필요
      if (rd.approval_items && rd.approval_items.length > 0) {
        const appHeader = ['카테고리', '발신자', '회사명', '제목', '보고 요약'];
        const appRows = rd.approval_items.map((e) => [e.category, e.sender, e.company, e.subject, e.summary]);
        const ws4 = XLSX.utils.aoa_to_sheet([appHeader, ...appRows]);
        ws4['!cols'] = [{ wch: 10 }, { wch: 25 }, { wch: 15 }, { wch: 40 }, { wch: 50 }];
        XLSX.utils.book_append_sheet(wb, ws4, '이사님 확인');
      }

      // 다운로드
      const fileName = (report.file_name || `KPROS_리포트_${report.report_date}`).replace(/\.(txt|csv)$/i, '') + '.xlsx';
      XLSX.writeFile(wb, fileName);
    } catch (err) {
      console.error('Excel generation failed:', err);
      setMessage('엑셀 생성 실패. TXT로 다운로드합니다.');
      downloadTxt(report);
      setTimeout(() => setMessage(''), 3000);
    }
  };

  /** TXT 다운로드 (폴백) */
  const downloadTxt = (report: Report) => {
    const rd = reportDataCache[report.id] || report.report_data || parseReportData(report.summary);
    let content = '';
    if (rd?.legacy_text) {
      content = rd.legacy_text;
    } else if (rd && rd.title) {
      content = renderReportText(rd);
    } else {
      content = report.summary || '';
    }
    const bom = '\uFEFF';
    const blob = new Blob([bom + content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (report.file_name || `KPROS_리포트_${report.report_date}`).replace('.xlsx', '.txt');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /** 구조화된 데이터를 텍스트로 렌더링 */
  function renderReportText(rd: ReportData): string {
    let t = '';
    t += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    t += `  ${rd.title}\n`;
    t += `  기간: ${rd.period}\n`;
    t += `  생성일시: ${rd.generated_at ? formatDate(rd.generated_at) : ''}\n`;
    t += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    t += `■ 전체 현황\n`;
    t += `  전체 이메일: ${rd.overview.total_emails}건\n`;
    t += `  기간 내 수신: ${rd.overview.period_emails}건\n`;
    t += `  이사님 확인 필요: ${rd.overview.approval_needed}건\n\n`;
    t += `■ 카테고리별 분류\n`;
    for (const c of rd.categories) {
      if (c.count > 0) t += `  ${c.code}. ${c.name}: ${c.count}건\n`;
    }
    t += `\n■ 중요도별 분류\n`;
    t += `  긴급: ${rd.priorities.high}건 / 일반: ${rd.priorities.medium}건 / 낮음: ${rd.priorities.low}건\n\n`;
    if (rd.key_emails.length > 0) {
      t += `■ 주요 이메일\n`;
      for (const e of rd.key_emails) {
        t += `  [${e.category}] ${e.subject} (${e.sender})\n`;
        if (e.summary) t += `    → ${e.summary}\n`;
      }
      t += '\n';
    }
    if (rd.approval_items.length > 0) {
      t += `■ 이사님 확인 필요\n`;
      for (const e of rd.approval_items) {
        t += `  - ${e.subject} (${e.sender})\n`;
        if (e.summary) t += `    → ${e.summary}\n`;
      }
      t += '\n';
    }
    if (rd.ai_insight) {
      t += `■ AI 분석 요약\n${rd.ai_insight}\n\n`;
    }
    t += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    t += `  KPROS Smart Email System v3.0\n`;
    t += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
    return t;
  }

  /** 구조화된 보고서 뷰 렌더링 */
  function renderReportView(rd: ReportData) {
    // 레거시 plain text
    if (rd.legacy_text) {
      return <pre className="text-xs text-slate-700 bg-white rounded-xl p-5 max-h-[600px] overflow-y-auto whitespace-pre-wrap font-mono leading-relaxed border border-slate-200">{rd.legacy_text}</pre>;
    }

    const totalPeriod = rd.overview.period_emails || 1;

    return (
      <div className="space-y-5">
        {/* 리포트 헤더 */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-700 text-white rounded-xl p-5">
          <div className="text-lg font-bold">{rd.title}</div>
          <div className="flex gap-6 mt-2 text-sm text-slate-300">
            <span>기간: {rd.period}</span>
            <span>생성: {rd.generated_at ? formatDate(rd.generated_at) : ''}</span>
          </div>
        </div>

        {/* 전체 현황 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <div className="text-2xl font-bold text-slate-900">{rd.overview.total_emails}</div>
            <div className="text-xs text-slate-500 mt-1">전체 이메일</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <div className="text-2xl font-bold text-brand-600">{rd.overview.period_emails}</div>
            <div className="text-xs text-slate-500 mt-1">기간 내 수신</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <div className="text-2xl font-bold text-red-600">{rd.overview.approval_needed}</div>
            <div className="text-xs text-slate-500 mt-1">이사님 확인 필요</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <div className="text-2xl font-bold text-amber-600">{rd.overview.key_emails_count}</div>
            <div className="text-xs text-slate-500 mt-1">주요 이메일</div>
          </div>
        </div>

        {/* 카테고리별 분류 - 수평 바 차트 */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h4 className="text-sm font-bold text-slate-900 mb-4">카테고리별 분류</h4>
          <div className="space-y-3">
            {rd.categories.filter((c) => c.count > 0).map((c) => {
              const colors = REPORT_CAT_COLORS[c.name] || { bg: 'bg-gray-50', text: 'text-gray-600', bar: 'bg-gray-400' };
              const pct = Math.round((c.count / totalPeriod) * 100);
              return (
                <div key={c.code} className="flex items-center gap-3">
                  <div className={`w-24 shrink-0 px-2.5 py-1 rounded-lg text-xs font-bold ${colors.bg} ${colors.text}`}>
                    {c.code}. {c.name}
                  </div>
                  <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                    <div className={`h-full rounded-full ${colors.bar} transition-all duration-500`} style={{ width: `${Math.max(pct, 2)}%` }} />
                  </div>
                  <div className="w-20 text-right text-xs font-bold text-slate-700">{c.count}건 ({pct}%)</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 중요도별 분류 */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h4 className="text-sm font-bold text-slate-900 mb-3">중요도별 분류</h4>
          <div className="flex gap-4">
            <div className="flex-1 bg-red-50 rounded-xl p-3 text-center">
              <div className="text-xl font-bold text-red-600">{rd.priorities.high}</div>
              <div className="text-xs text-red-500 mt-0.5">긴급</div>
            </div>
            <div className="flex-1 bg-amber-50 rounded-xl p-3 text-center">
              <div className="text-xl font-bold text-amber-600">{rd.priorities.medium}</div>
              <div className="text-xs text-amber-500 mt-0.5">일반</div>
            </div>
            <div className="flex-1 bg-green-50 rounded-xl p-3 text-center">
              <div className="text-xl font-bold text-green-600">{rd.priorities.low}</div>
              <div className="text-xs text-green-500 mt-0.5">낮음</div>
            </div>
          </div>
        </div>

        {/* 주요 이메일 테이블 */}
        {rd.key_emails.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h4 className="text-sm font-bold text-slate-900 mb-3">주요 이메일 (영업기회 / 긴급)</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 px-2 text-slate-500 font-medium">카테고리</th>
                    <th className="text-left py-2 px-2 text-slate-500 font-medium">발신자</th>
                    <th className="text-left py-2 px-2 text-slate-500 font-medium">회사</th>
                    <th className="text-left py-2 px-2 text-slate-500 font-medium">제목</th>
                    <th className="text-left py-2 px-2 text-slate-500 font-medium">요약</th>
                  </tr>
                </thead>
                <tbody>
                  {rd.key_emails.map((e, i) => (
                    <tr key={i} className="border-b border-slate-100 last:border-0">
                      <td className="py-2 px-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${(REPORT_CAT_COLORS[e.category] || { bg: 'bg-gray-50', text: 'text-gray-600' }).bg} ${(REPORT_CAT_COLORS[e.category] || { text: 'text-gray-600' }).text}`}>{e.category}</span>
                      </td>
                      <td className="py-2 px-2 text-slate-700">{e.sender}</td>
                      <td className="py-2 px-2 text-slate-500">{e.company}</td>
                      <td className="py-2 px-2 text-slate-900 font-medium max-w-[200px] truncate">{e.subject}</td>
                      <td className="py-2 px-2 text-slate-600 max-w-[250px]">{e.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 이사님 확인 필요 건 */}
        {rd.approval_items.length > 0 && (
          <div className="bg-red-50 rounded-xl border border-red-200 p-5">
            <h4 className="text-sm font-bold text-red-700 mb-3">이사님 확인 필요 ({rd.approval_items.length}건)</h4>
            <div className="space-y-2.5">
              {rd.approval_items.map((e, i) => (
                <div key={i} className="bg-white rounded-lg p-3 border border-red-100">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-red-600">[{e.category}]</span>
                    <span className="text-xs font-semibold text-slate-900">{e.subject}</span>
                  </div>
                  <div className="text-xs text-slate-500">{e.sender} {e.company && `(${e.company})`}</div>
                  {e.summary && <div className="text-xs text-slate-700 mt-1.5 bg-red-50 rounded p-2">{e.summary}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI 분석 요약 */}
        {rd.ai_insight && (
          <div className="bg-gradient-to-r from-violet-50 to-purple-50 rounded-xl border border-violet-200 p-5">
            <h4 className="text-sm font-bold text-violet-700 mb-3">AI 분석 요약</h4>
            <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{rd.ai_insight}</div>
          </div>
        )}

        {/* 이메일 상세 목록 (접기/펼치기) */}
        {rd.email_details && rd.email_details.length > 0 && (
          <details className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <summary className="p-4 cursor-pointer text-sm font-bold text-slate-900 hover:bg-slate-50 transition">
              이메일 상세 목록 ({rd.email_details.length}건)
            </summary>
            <div className="overflow-x-auto border-t border-slate-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="py-2 px-2 text-left text-slate-500 font-medium">No</th>
                    <th className="py-2 px-2 text-left text-slate-500 font-medium">수신일</th>
                    <th className="py-2 px-2 text-left text-slate-500 font-medium">코드</th>
                    <th className="py-2 px-2 text-left text-slate-500 font-medium">카테고리</th>
                    <th className="py-2 px-2 text-left text-slate-500 font-medium">발신자</th>
                    <th className="py-2 px-2 text-left text-slate-500 font-medium">회사</th>
                    <th className="py-2 px-2 text-left text-slate-500 font-medium">제목</th>
                    <th className="py-2 px-2 text-left text-slate-500 font-medium">요약</th>
                    <th className="py-2 px-2 text-left text-slate-500 font-medium">중요도</th>
                    <th className="py-2 px-2 text-left text-slate-500 font-medium">상태</th>
                    <th className="py-2 px-2 text-center text-slate-500 font-medium">확인</th>
                  </tr>
                </thead>
                <tbody>
                  {rd.email_details.map((e) => (
                    <tr key={e.no} className={`border-b border-slate-100 last:border-0 ${e.needs_approval ? 'bg-red-50/50' : ''}`}>
                      <td className="py-2 px-2 text-slate-400">{e.no}</td>
                      <td className="py-2 px-2 text-slate-500 whitespace-nowrap">{formatShortDate(e.received_at)}</td>
                      <td className="py-2 px-2 font-bold text-slate-700">{e.code}</td>
                      <td className="py-2 px-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${(REPORT_CAT_COLORS[e.category] || { bg: 'bg-gray-50', text: 'text-gray-600' }).bg} ${(REPORT_CAT_COLORS[e.category] || { text: 'text-gray-600' }).text}`}>{e.category}</span>
                      </td>
                      <td className="py-2 px-2 text-slate-700 max-w-[120px] truncate">{e.sender}</td>
                      <td className="py-2 px-2 text-slate-500 max-w-[80px] truncate">{e.company}</td>
                      <td className="py-2 px-2 text-slate-900 font-medium max-w-[180px] truncate">{e.subject}</td>
                      <td className="py-2 px-2 text-slate-600 max-w-[200px] truncate">{e.summary}</td>
                      <td className="py-2 px-2">
                        <span className={`text-[10px] font-bold ${e.priority === '긴급' ? 'text-red-600' : e.priority === '낮음' ? 'text-green-600' : 'text-slate-500'}`}>{e.priority}</span>
                      </td>
                      <td className="py-2 px-2 text-slate-500">{e.status}</td>
                      <td className="py-2 px-2 text-center">{e.needs_approval && <span className="text-red-500 font-bold">O</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </div>
    );
  }

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
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900">리포트 생성</h3>
              {reports.length > 0 && (
                <div className="flex items-center gap-2">
                  {selectedReportIds.size > 0 && (
                    <button onClick={bulkDeleteReports} disabled={deletingReport} className="px-4 py-2 text-xs font-medium rounded-xl bg-red-500 text-white hover:bg-red-600 transition disabled:opacity-50">
                      {deletingReport ? '삭제 중...' : `선택 삭제 (${selectedReportIds.size}건)`}
                    </button>
                  )}
                  <button onClick={() => { setSelectedReportIds(new Set()); bulkDeleteReports(); }} disabled={deletingReport} className="px-4 py-2 text-xs font-medium rounded-xl border border-red-200 text-red-600 hover:bg-red-50 transition disabled:opacity-50">
                    {deletingReport ? '삭제 중...' : '전체 삭제'}
                  </button>
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => generateReport('daily')} disabled={generating} className="px-5 py-2.5 bg-brand-500 text-white text-sm font-medium rounded-xl hover:bg-brand-600 transition disabled:opacity-50">{generating ? '생성 중...' : '일간 리포트'}</button>
              <button onClick={() => generateReport('weekly')} disabled={generating} className="px-5 py-2.5 bg-indigo-500 text-white text-sm font-medium rounded-xl hover:bg-indigo-600 transition disabled:opacity-50">{generating ? '생성 중...' : '주간 리포트'}</button>
              <button onClick={() => generateReport('monthly')} disabled={generating} className="px-5 py-2.5 bg-purple-500 text-white text-sm font-medium rounded-xl hover:bg-purple-600 transition disabled:opacity-50">{generating ? '생성 중...' : '월간 리포트'}</button>
            </div>
          </div>
          {reports.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-14 text-center"><div className="text-4xl mb-3">📊</div><div className="text-slate-500 text-sm font-medium">생성된 리포트가 없습니다</div></div>
          ) : (
            <>
            {/* 전체 선택 */}
            {reports.length > 1 && (
              <div className="flex items-center gap-2 px-1 mb-3">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-500 hover:text-slate-700">
                  <input
                    type="checkbox"
                    checked={selectedReportIds.size === reports.length}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-slate-300 text-brand-500 focus:ring-brand-500"
                  />
                  전체 선택
                </label>
              </div>
            )}
            <div className="space-y-3">
              {reports.map((r) => {
                const isExpanded = expandedReportId === r.id;
                const isSelected = selectedReportIds.has(r.id);
                const rd = reportDataCache[r.id] || r.report_data || parseReportData(r.summary);
                return (
                  <div key={r.id} className={`bg-white rounded-2xl border overflow-hidden transition ${isSelected ? 'border-brand-400 ring-1 ring-brand-200' : 'border-slate-200'}`}>
                    <div className="p-5">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3 flex-1">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleReportSelect(r.id)}
                            className="w-4 h-4 mt-1 rounded border-slate-300 text-brand-500 focus:ring-brand-500 shrink-0"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${r.report_type === 'daily' ? 'bg-brand-100 text-brand-700' : r.report_type === 'weekly' ? 'bg-indigo-100 text-indigo-700' : 'bg-purple-100 text-purple-700'}`}>
                                {r.report_type === 'daily' ? '일간' : r.report_type === 'weekly' ? '주간' : '월간'}
                              </span>
                              <span className="text-xs text-slate-500">이메일 {r.email_count}건</span>
                              {rd && !rd.legacy_text && rd.overview && (
                                <>
                                  {rd.overview.approval_needed > 0 && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-600">확인필요 {rd.overview.approval_needed}</span>}
                                  {rd.overview.key_emails_count > 0 && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-600">주요 {rd.overview.key_emails_count}</span>}
                                </>
                              )}
                            </div>
                            <div className="text-sm font-semibold text-slate-900">{r.file_name}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-xs text-slate-400 mr-2">{formatDate(r.report_date)}</div>
                          <button onClick={() => viewReport(r)} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${isExpanded ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                            {isExpanded ? '접기' : '보기'}
                          </button>
                          <button onClick={() => downloadExcel(r)} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition" title="Excel 다운로드">
                            Excel
                          </button>
                          <button onClick={() => downloadTxt(r)} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition" title="TXT 다운로드">
                            TXT
                          </button>
                          <button onClick={() => deleteReport(r.id)} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition" title="삭제">
                            삭제
                          </button>
                        </div>
                      </div>
                    </div>
                    {isExpanded && rd && (
                      <div className="border-t border-slate-100 bg-slate-50 p-5 animate-fadeIn">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="text-xs font-bold text-slate-700">리포트 내용</h4>
                          <div className="flex gap-2">
                            <button onClick={() => { const text = rd.legacy_text || renderReportText(rd); navigator.clipboard.writeText(text); setMessage('클립보드에 복사되었습니다'); setTimeout(() => setMessage(''), 2000); }} className="px-3 py-1 text-xs font-medium rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 transition">
                              복사
                            </button>
                            <button onClick={() => downloadExcel(r)} className="px-3 py-1 text-xs font-medium rounded-lg bg-green-500 text-white hover:bg-green-600 transition">
                              Excel 다운로드
                            </button>
                          </div>
                        </div>
                        {renderReportView(rd)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            </>
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
