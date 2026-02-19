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

  const downloadReportAsExcel = async (report: ReportData) => {
    setDownloadingReport(true);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();

      const summaryRows = [
        ['KPROS 업무 리포트'],
        ['리포트 유형', report.type_label],
        ['기간', report.period],
        ['생성일시', new Date(report.generated_at).toLocaleString('ko-KR')],
        [],
        ['전체 이메일', report.overview.total_emails],
        ['기간 내 이메일', report.overview.period_emails],
        ['승인 필요', report.overview.approval_needed],
        ['주요 이메일', report.overview.key_emails_count],
        [],
        ['카테고리별 통계'],
        ['코드', '카테고리', '건수'],
        ...report.categories.map(c => [c.code, c.name, c.count]),
        [],
        ['우선순위별 통계'],
        ['긴급', report.priorities.high],
        ['일반', report.priorities.medium],
        ['낮음', report.priorities.low],
      ];
      const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
      XLSX.utils.book_append_sheet(wb, summarySheet, '요약');

      if (report.ai_insight) {
        const insightRows = [['AI 인사이트'], [], [report.ai_insight]];
        const insightSheet = XLSX.utils.aoa_to_sheet(insightRows);
        XLSX.utils.book_append_sheet(wb, insightSheet, 'AI 인사이트');
      }

      if (report.approval_items && report.approval_items.length > 0) {
        const approvalRows = [
          ['번호', '카테고리', '제목', '발신자', '회사', '요약'],
          ...report.approval_items.map((item, i) => [i + 1, item.category || '', item.subject || '', item.sender || '', item.company || '', item.summary || '']),
        ];
        const approvalSheet = XLSX.utils.aoa_to_sheet(approvalRows);
        XLSX.utils.book_append_sheet(wb, approvalSheet, '승인필요');
      }

      if (report.key_emails && report.key_emails.length > 0) {
        const keyEmailRows = [
          ['번호', '카테고리', '우선순위', '제목', '발신자', '회사', '요약'],
          ...report.key_emails.map((item, i) => [i + 1, item.category || '', item.priority || '', item.subject || '', item.sender || '', item.company || '', item.summary || '']),
        ];
        const keyEmailSheet = XLSX.utils.aoa_to_sheet(keyEmailRows);
        XLSX.utils.book_append_sheet(wb, keyEmailSheet, '주요이메일');
      }

      if (report.email_details && report.email_details.length > 0) {
        const detailRows = [
          ['번호', '수신일시', '카테고리', '코드', '발신자', '회사', '제목', '요약', '우선순위', '상태', '조치사항', '승인필요'],
          ...report.email_details.map(e => [e.no, e.received_at, e.category, e.code, e.sender, e.company, e.subject, e.summary, e.priority, e.status, e.action_items || '', e.needs_approval ? 'O' : '']),
        ];
        const detailSheet = XLSX.utils.aoa_to_sheet(detailRows);
        XLSX.utils.book_append_sheet(wb, detailSheet, '이메일상세');
      }

      const fileName = `KPROS_${report.type_label}_리포트_${report.period}.xlsx`;
      XLSX.writeFile(wb, fileName);
      setMessage('리포트 다운로드 완료');
    } catch (err) {
      console.error('엑셀 생성 오류:', err);
      setMessage('엑셀 생성 중 오류 발생');
    }
    setDownloadingReport(false);
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
            onClick={() => downloadReportAsExcel(selectedReport)}
            disabled={downloadingReport}
            className="px-6 py-2.5 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl font-semibold hover:from-green-600 hover:to-emerald-600 transition disabled:opacity-50 text-sm"
          >
            {downloadingReport ? '다운로드 중...' : 'Excel 다운로드'}
          </button>
        </div>

        {message && <div className="px-4 py-3 bg-brand-50 border border-brand-200 text-brand-700 text-sm rounded-2xl">{message}</div>}

        {reportLoading ? (
          <div className="text-center py-20 text-slate-400 text-sm">불러오는 중...</div>
        ) : (
          <>
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
          </>
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
                <div className="text-xs text-slate-400">{formatDate(r.report_date)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
