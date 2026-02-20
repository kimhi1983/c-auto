'use client';

import { useState } from 'react';
import { apiUrl, authHeaders } from '@/lib/api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface TrendReport {
  content: string;
  generated_at: string;
  date: string;
  commodities_fetched: number;
}

export default function TrendsPage() {
  const [report, setReport] = useState<TrendReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const generateReport = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(apiUrl('/api/v1/commodity-trends/generate'), {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.status === 'success') {
          setReport(json.data);
        } else {
          setError(json.message || '보고서 생성 실패');
        }
      } else {
        const errJson = await res.json().catch(() => null);
        setError(errJson?.message || `서버 오류 (${res.status})`);
      }
    } catch {
      setError('네트워크 오류');
    }
    setLoading(false);
  };

  const fetchLatest = async () => {
    try {
      const res = await fetch(apiUrl('/api/v1/commodity-trends/latest'), {
        headers: authHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.status === 'success' && json.data) {
          setReport(json.data);
        }
      }
    } catch { /* ignore */ }
  };

  // 페이지 진입 시 캐시된 보고서 로드
  useState(() => { fetchLatest(); });

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="animate-fadeIn">
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <span>원료 정보</span>
          <span className="text-slate-300">/</span>
          <span className="text-slate-700 font-medium">원료가격트렌드</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">원료가격트렌드 분석</h1>
            <p className="text-sm text-slate-500 mt-1">
              5개 원자재 시세 + 실시간 뉴스 기반 AI 종합 분석 보고서
            </p>
          </div>
          <button
            onClick={generateReport}
            disabled={loading}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
              loading
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm hover:shadow-md'
            }`}
          >
            {loading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                AI 분석 중...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                보고서 생성
              </>
            )}
          </button>
        </div>
      </div>

      {/* 로딩 상태 */}
      {loading && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 animate-fadeInUp">
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-slate-800">AI가 보고서를 작성하고 있습니다</p>
              <p className="text-sm text-slate-500 mt-1">5개 원자재 시세 수집 + 실시간 뉴스 검색 + 분석 중...</p>
              <p className="text-xs text-slate-400 mt-2">약 15~30초 소요됩니다</p>
            </div>
          </div>
        </div>
      )}

      {/* 에러 */}
      {error && !loading && (
        <div className="bg-red-50 rounded-2xl border border-red-200 p-6 animate-fadeInUp">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-red-800">보고서 생성 실패</p>
              <p className="text-sm text-red-600 mt-0.5">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* 보고서 없을 때 안내 */}
      {!report && !loading && !error && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 animate-fadeInUp">
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center">
              <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <p className="text-base font-semibold text-slate-700">아직 생성된 보고서가 없습니다</p>
              <p className="text-sm text-slate-500 mt-1">
                &quot;보고서 생성&quot; 버튼을 클릭하여 AI 트렌드 분석 보고서를 생성하세요
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 mt-2">
              {['팜오일', '납사', 'WTI', '메탈 실리콘', 'DMC'].map((name) => (
                <span key={name} className="px-3 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded-full">
                  {name}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 보고서 결과 */}
      {report && !loading && (
        <div className="animate-fadeInUp space-y-4">
          {/* 메타 정보 */}
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5 text-slate-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>기준일: {report.date}</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>생성: {new Date(report.generated_at).toLocaleString('ko-KR')}</span>
            </div>
            {report.commodities_fetched !== undefined && (
              <div className="flex items-center gap-1.5 text-green-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{report.commodities_fetched}/5 원자재 데이터 반영</span>
              </div>
            )}
          </div>

          {/* 보고서 본문 */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-8">
            <article className="prose prose-slate prose-sm max-w-none
              prose-headings:text-slate-900 prose-headings:font-bold
              prose-h1:text-2xl prose-h1:border-b prose-h1:border-slate-200 prose-h1:pb-3 prose-h1:mb-6
              prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-4
              prose-h3:text-lg prose-h3:mt-6 prose-h3:mb-3
              prose-p:text-slate-700 prose-p:leading-relaxed
              prose-strong:text-slate-900
              prose-table:border-collapse prose-table:w-full
              prose-th:bg-slate-50 prose-th:border prose-th:border-slate-200 prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:text-xs prose-th:font-semibold prose-th:text-slate-600 prose-th:uppercase
              prose-td:border prose-td:border-slate-200 prose-td:px-3 prose-td:py-2 prose-td:text-sm
              prose-li:text-slate-700
              prose-a:text-blue-600
            ">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {report.content}
              </ReactMarkdown>
            </article>
          </div>
        </div>
      )}
    </div>
  );
}
