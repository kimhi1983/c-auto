'use client';

import { useEffect, useState } from 'react';
import { apiUrl, authJsonHeaders } from '@/lib/api';

interface Report {
  id: number;
  report_date: string;
  report_type: string;
  file_name: string;
  email_count: number;
  summary: string | null;
  created_at: string;
}

interface ReportData {
  title: string;
  type: string;
  type_label: string;
  period: string;
  generated_at: string;
  overview: {
    total_emails: number;
    period_emails: number;
    approval_needed: number;
    key_emails_count: number;
  };
  categories: Array<{ code: string; name: string; count: number }>;
  priorities: { high: number; medium: number; low: number };
  key_emails: Array<any>;
  approval_items: Array<any>;
  ai_insight: string;
  email_details: Array<any>;
}

function getAuthHeaders(): Record<string, string> {
  return authJsonHeaders();
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function ArchivesPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<ReportData | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState('');
  const [downloadingReport, setDownloadingReport] = useState(false);

  useEffect(() => { loadReports(); }, []);

  const loadReports = async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/api/v1/archives/reports'), { headers: getAuthHeaders() });
      if (res.ok) { const data = await res.json(); setReports(data.reports || []); }
    } catch { /* silent */ }
    setLoading(false);
  };

  const viewReportDetail = async (reportId: number) => {
    setReportLoading(true);
    setSelectedReport(null);
    try {
      const res = await fetch(apiUrl(`/api/v1/archives/reports/${reportId}`), { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setSelectedReport(data.data.report_data || JSON.parse(data.data.summary || '{}'));
      }
    } catch (err) {
      console.error('리포트 조회 오류:', err);
    }
    setReportLoading(false);
  };

  const downloadReportAsPdf = async () => {
    setDownloadingReport(true);
    try {
      const html2pdf = (await import('html2pdf.js')).default;
      const element = document.getElementById('report-content');
      if (!element) throw new Error('리포트 콘텐츠를 찾을 수 없습니다');

      const fileName = `KPROS_${selectedReport!.type_label}_리포트_${selectedReport!.period}.pdf`;
      await html2pdf().set({
        margin: [10, 10, 10, 10],
        filename: fileName,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      } as any).from(element).save();

      setMessage('PDF 다운로드 완료');
    } catch (err) {
      console.error('PDF 생성 오류:', err);
      setMessage('PDF 생성 중 오류 발생');
    }
    setDownloadingReport(false);
    setTimeout(() => setMessage(''), 3000);
  };

  const deleteReport = async (e: React.MouseEvent, reportId: number) => {
    e.stopPropagation();
    if (!confirm('이 리포트를 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(apiUrl(`/api/v1/archives/reports/${reportId}`), { method: 'DELETE', headers: getAuthHeaders() });
      if (res.ok) { setMessage('리포트 삭제 완료'); loadReports(); } else { setMessage('리포트 삭제 실패'); }
    } catch { setMessage('리포트 삭제 오류'); }
    setTimeout(() => setMessage(''), 3000);
  };

  const generateReport = async (type: string) => {
    setGenerating(true); setMessage('');
    try {
      const res = await fetch(apiUrl(`/api/v1/archives/generate-report?report_type=${type}`), { method: 'POST', headers: getAuthHeaders() });
      if (res.ok) { setMessage(`${type} 리포트 생성 완료`); loadReports(); } else { setMessage('리포트 생성 실패'); }
    } catch { setMessage('리포트 생성 오류'); }
    setGenerating(false); setTimeout(() => setMessage(''), 3000);
  };

  // 리포트 상세 전체 페이지 뷰
  if (selectedReport) {
    return (
      <div className="space-y-6 animate-fadeIn">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => setSelectedReport(null)} className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition">
              &larr; 목록으로
            </button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{selectedReport.type_label} 리포트</h1>
              <p className="text-sm text-slate-500 mt-0.5">{selectedReport.period}</p>
            </div>
          </div>
          <button
            onClick={downloadReportAsPdf}
            disabled={downloadingReport}
            className="px-6 py-2.5 bg-gradient-to-r from-red-500 to-rose-500 text-white rounded-xl font-semibold hover:from-red-600 hover:to-rose-600 transition disabled:opacity-50 text-sm"
          >
            {downloadingReport ? '다운로드 중...' : 'PDF 다운로드'}
          </button>
        </div>

        {message && <div className="px-4 py-3 bg-brand-50 border border-brand-200 text-brand-700 text-sm rounded-2xl">{message}</div>}

        {reportLoading ? (
          <div className="text-center py-20 text-slate-400 text-sm">불러오는 중...</div>
        ) : (
          <div id="report-content">
            {/* 통계 카드 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-5 text-center">
                <div className="text-3xl font-bold text-blue-700">{selectedReport.overview.period_emails}</div>
                <div className="text-xs text-slate-500 mt-1">기간 내 이메일</div>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-5 text-center">
                <div className="text-3xl font-bold text-red-700">{selectedReport.overview.approval_needed}</div>
                <div className="text-xs text-slate-500 mt-1">승인 필요</div>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-5 text-center">
                <div className="text-3xl font-bold text-yellow-600">{selectedReport.priorities.high}</div>
                <div className="text-xs text-slate-500 mt-1">긴급 이메일</div>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-5 text-center">
                <div className="text-3xl font-bold text-green-700">{selectedReport.overview.key_emails_count}</div>
                <div className="text-xs text-slate-500 mt-1">주요 이메일</div>
              </div>
            </div>

            {/* AI 인사이트 */}
            {selectedReport.ai_insight && (
              <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-2xl p-6">
                <h3 className="font-bold text-slate-900 mb-3 flex items-center gap-2 text-base">
                  AI 인사이트
                </h3>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{selectedReport.ai_insight}</p>
              </div>
            )}

            {/* 카테고리 + 우선순위 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <h3 className="font-bold text-slate-900 mb-4 text-base">카테고리별 분포</h3>
                <div className="space-y-3">
                  {selectedReport.categories.filter(c => c.count > 0).map((cat) => {
                    const total = selectedReport.overview.period_emails;
                    const percentage = total > 0 ? ((cat.count / total) * 100).toFixed(1) : '0';
                    return (
                      <div key={cat.code} className="flex items-center gap-3">
                        <div className="w-24 text-sm text-slate-600 font-semibold">{cat.code} {cat.name}</div>
                        <div className="flex-1 h-9 bg-slate-100 rounded-lg overflow-hidden relative">
                          <div className="h-full bg-gradient-to-r from-brand-400 to-brand-500 transition-all" style={{ width: `${percentage}%` }} />
                          <div className="absolute inset-0 flex items-center justify-end px-3">
                            <span className="text-xs font-bold text-slate-700">{cat.count}건</span>
                          </div>
                        </div>
                        <div className="w-14 text-sm text-slate-500 text-right">{percentage}%</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <h3 className="font-bold text-slate-900 mb-4 text-base">우선순위 분포</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-center">
                    <div className="text-2xl font-bold text-red-700">{selectedReport.priorities.high}</div>
                    <div className="text-xs text-red-600 mt-1">긴급</div>
                  </div>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5 text-center">
                    <div className="text-2xl font-bold text-yellow-700">{selectedReport.priorities.medium}</div>
                    <div className="text-xs text-yellow-600 mt-1">일반</div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-center">
                    <div className="text-2xl font-bold text-slate-700">{selectedReport.priorities.low}</div>
                    <div className="text-xs text-slate-600 mt-1">낮음</div>
                  </div>
                </div>
              </div>
            </div>

            {/* 승인 필요 + 주요 이메일 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {selectedReport.approval_items && selectedReport.approval_items.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 p-6">
                  <h3 className="font-bold text-slate-900 mb-4 text-base">승인 필요 항목 ({selectedReport.approval_items.length}건)</h3>
                  <div className="space-y-2.5">
                    {selectedReport.approval_items.map((item, idx) => (
                      <div key={idx} className="bg-red-50 border border-red-200 rounded-xl p-4">
                        <div className="text-xs font-bold text-red-700 mb-1">{item.category}</div>
                        <div className="text-sm font-semibold text-slate-900">{item.subject}</div>
                        <div className="text-xs text-slate-600 mt-1">{item.sender} | {item.company}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedReport.key_emails && selectedReport.key_emails.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 p-6">
                  <h3 className="font-bold text-slate-900 mb-4 text-base">주요 이메일 ({selectedReport.key_emails.length}건)</h3>
                  <div className="space-y-2.5">
                    {selectedReport.key_emails.map((item, idx) => (
                      <div key={idx} className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold text-blue-700">{item.category}</span>
                          <span className={`text-xs font-semibold ${item.priority === '긴급' ? 'text-red-600' : 'text-slate-500'}`}>{item.priority}</span>
                        </div>
                        <div className="text-sm font-semibold text-slate-900">{item.subject}</div>
                        <div className="text-xs text-slate-600 mt-1">{item.sender} | {item.company}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // 리포트 목록
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">리포트</h1>
        <p className="text-sm text-slate-500 mt-1">이메일 업무 리포트 생성 및 관리</p>
      </div>

      {message && <div className="px-4 py-3 bg-brand-50 border border-brand-200 text-brand-700 text-sm rounded-2xl animate-fadeIn">{message}</div>}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5"><div className="text-2xl font-bold text-purple-600">{reports.length}</div><div className="text-xs text-slate-500 mt-1">전체 리포트</div></div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5"><div className="text-2xl font-bold text-brand-600">{reports.filter(r => r.report_type === 'daily').length}</div><div className="text-xs text-slate-500 mt-1">일간 리포트</div></div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5"><div className="text-2xl font-bold text-indigo-600">{reports.filter(r => r.report_type === 'weekly').length + reports.filter(r => r.report_type === 'monthly').length}</div><div className="text-xs text-slate-500 mt-1">주간/월간 리포트</div></div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h3 className="text-sm font-bold text-slate-900 mb-4">리포트 생성</h3>
        <div className="flex gap-3">
          <button onClick={() => generateReport('daily')} disabled={generating} className="px-5 py-2.5 bg-brand-500 text-white text-sm font-medium rounded-xl hover:bg-brand-600 transition disabled:opacity-50">{generating ? '생성 중...' : '일간 리포트'}</button>
          <button onClick={() => generateReport('weekly')} disabled={generating} className="px-5 py-2.5 bg-indigo-500 text-white text-sm font-medium rounded-xl hover:bg-indigo-600 transition disabled:opacity-50">{generating ? '생성 중...' : '주간 리포트'}</button>
          <button onClick={() => generateReport('monthly')} disabled={generating} className="px-5 py-2.5 bg-purple-500 text-white text-sm font-medium rounded-xl hover:bg-purple-600 transition disabled:opacity-50">{generating ? '생성 중...' : '월간 리포트'}</button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-14 text-slate-400 text-sm">불러오는 중...</div>
      ) : reports.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-14 text-center"><div className="text-4xl mb-3">📊</div><div className="text-slate-500 text-sm font-medium">생성된 리포트가 없습니다</div></div>
      ) : (
        <div className="space-y-2.5">
          {reports.map((r) => (
            <div key={r.id} onClick={() => viewReportDetail(r.id)} className="bg-white rounded-2xl border border-slate-200 p-5 cursor-pointer transition-all hover:shadow-md hover:border-purple-300">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${r.report_type === 'daily' ? 'bg-brand-100 text-brand-700' : r.report_type === 'weekly' ? 'bg-indigo-100 text-indigo-700' : 'bg-purple-100 text-purple-700'}`}>{r.report_type === 'daily' ? '일간' : r.report_type === 'weekly' ? '주간' : '월간'}</span>
                    <span className="text-xs text-slate-500">이메일 {r.email_count}건</span>
                  </div>
                  <div className="text-sm font-semibold text-slate-900">{r.file_name}</div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-xs text-slate-400">{formatDate(r.report_date)}</div>
                  <button onClick={(e) => deleteReport(e, r.id)} className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition" title="삭제">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
