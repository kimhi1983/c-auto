'use client';

import { useEffect, useState } from 'react';
import { apiUrl, authHeaders } from '@/lib/api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface PricePoint { date: string; close: number }

interface CommodityItem {
  key: string;
  name: string;
  label: string;
  currency: string;
  unit: string;
  current_price: number;
  previous_close: number | null;
  change_pct: number | null;
  prices: PricePoint[];
}

interface TrendData {
  commodities: CommodityItem[];
  exchange_rates: Record<string, number>;
  analysis: string;
  date: string;
  generated_at: string;
}

interface HistoryItem {
  id: number;
  report_date: string;
  generated_at: string;
  summary: { label: string; price: number; change_pct: number | null; currency: string }[];
}

type ViewMode = 'current' | 'history';

export default function TrendsPage() {
  const [data, setData] = useState<TrendData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedChart, setSelectedChart] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  // 이력 관련 state
  const [viewMode, setViewMode] = useState<ViewMode>('current');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyDetail, setHistoryDetail] = useState<TrendData | null>(null);
  const [historyDetailLoading, setHistoryDetailLoading] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState<number | null>(null);

  const generate = async () => {
    setLoading(true);
    setError('');
    setViewMode('current');
    setHistoryDetail(null);
    setSelectedHistoryId(null);
    try {
      const res = await fetch(apiUrl('/api/v1/commodity-trends/generate'), {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: '{}',
      });
      const json = await res.json();
      if (json.status === 'success') {
        setData(json.data);
        if (json.data.commodities?.length) setSelectedChart(json.data.commodities[0].key);
      } else setError(json.message || '생성 실패');
    } catch { setError('네트워크 오류'); }
    setLoading(false);
  };

  const downloadPdf = async () => {
    setDownloading(true);
    try {
      const html2pdf = (await import('html2pdf.js')).default;
      const el = document.getElementById('trends-report');
      if (!el) throw new Error('콘텐츠 없음');
      const reportData = historyDetail || data;
      await (html2pdf().set({
        margin: [12, 10, 12, 10],
        filename: `KPROS_원료가격트렌드_${reportData?.date || 'report'}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      }) as any).from(el).save();
    } catch (e: any) {
      alert('PDF 다운로드 실패: ' + (e.message || ''));
    }
    setDownloading(false);
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch(apiUrl('/api/v1/commodity-trends/history'), { headers: authHeaders() });
      const json = await res.json();
      if (json.status === 'success') setHistory(json.data || []);
    } catch { /* silent */ }
    setHistoryLoading(false);
  };

  const viewHistoryDetail = async (id: number) => {
    setHistoryDetailLoading(true);
    setSelectedHistoryId(id);
    try {
      const res = await fetch(apiUrl(`/api/v1/commodity-trends/history/${id}`), { headers: authHeaders() });
      const json = await res.json();
      if (json.status === 'success') {
        setHistoryDetail(json.data);
        if (json.data.commodities?.length) setSelectedChart(json.data.commodities[0].key);
      }
    } catch { /* silent */ }
    setHistoryDetailLoading(false);
  };

  const deleteHistory = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (!confirm('이 보고서를 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(apiUrl(`/api/v1/commodity-trends/history/${id}`), {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (res.ok) {
        setHistory(prev => prev.filter(h => h.id !== id));
        if (selectedHistoryId === id) {
          setHistoryDetail(null);
          setSelectedHistoryId(null);
        }
      }
    } catch { /* silent */ }
  };

  useEffect(() => {
    fetch(apiUrl('/api/v1/commodity-trends/latest'), { headers: authHeaders() })
      .then(r => r.json())
      .then(j => {
        if (j.status === 'success' && j.data && Array.isArray(j.data.commodities)) {
          setData(j.data);
          if (j.data.commodities.length) setSelectedChart(j.data.commodities[0].key);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (viewMode === 'history') loadHistory();
  }, [viewMode]);

  const sym = (c: string) => c === 'USD' ? '$' : '¥';

  // 현재 표시할 데이터 (이력 상세 보기 중이면 해당 데이터, 아니면 최신)
  const displayData = historyDetail || data;
  const selectedCommodity = displayData?.commodities?.find(c => c.key === selectedChart);

  // 보고서 렌더링 (현재/이력 공통)
  const renderReport = (reportData: TrendData) => (
    <div id="trends-report" className="space-y-6 animate-fadeInUp">
      {/* 기준일 */}
      <div className="flex items-center gap-4 text-xs text-slate-400">
        <span>기준일 {reportData.date}</span>
        <span>|</span>
        <span>생성 {new Date(reportData.generated_at).toLocaleString('ko-KR')}</span>
        {reportData.exchange_rates.USD_KRW && (
          <>
            <span>|</span>
            <span>USD/KRW {reportData.exchange_rates.USD_KRW.toLocaleString()}</span>
          </>
        )}
        {reportData.exchange_rates.CNY_KRW && (
          <>
            <span>CNY/KRW {reportData.exchange_rates.CNY_KRW.toLocaleString()}</span>
          </>
        )}
      </div>

      {/* 원자재 카드 5개 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {(reportData.commodities || []).map((c) => {
          const isUp = (c.change_pct ?? 0) >= 0;
          const isSelected = selectedChart === c.key;
          return (
            <button
              key={c.key}
              onClick={() => setSelectedChart(c.key)}
              className={`text-left p-4 rounded-2xl border transition-all ${
                isSelected
                  ? 'bg-white border-slate-300 shadow-sm'
                  : 'bg-white/60 border-slate-200/60 hover:border-slate-300'
              }`}
            >
              <div className="text-xs text-slate-400 font-medium mb-1">{c.label}</div>
              <div className="text-lg font-bold text-slate-900">
                {c.current_price > 0 ? `${sym(c.currency)}${c.current_price.toLocaleString()}` : '-'}
              </div>
              {c.change_pct !== null && (
                <div className={`text-xs font-semibold mt-0.5 ${isUp ? 'text-green-600' : 'text-red-600'}`}>
                  {isUp ? '+' : ''}{c.change_pct}%
                </div>
              )}
              <div className="text-[10px] text-slate-400 mt-1">{c.currency}/{c.unit}</div>
            </button>
          );
        })}
      </div>

      {/* 차트 */}
      {selectedCommodity && selectedCommodity.prices.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">{selectedCommodity.name} ({selectedCommodity.label})</h3>
              <p className="text-xs text-slate-400">{selectedCommodity.currency}/{selectedCommodity.unit} · 최근 30일</p>
            </div>
            {selectedCommodity.change_pct !== null && (
              <div className={`text-sm font-bold px-3 py-1 rounded-lg ${
                selectedCommodity.change_pct >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}>
                {selectedCommodity.change_pct >= 0 ? '+' : ''}{selectedCommodity.change_pct}%
              </div>
            )}
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={selectedCommodity.prices}>
                <defs>
                  <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={(selectedCommodity.change_pct ?? 0) >= 0 ? '#10b981' : '#ef4444'} stopOpacity={0.12} />
                    <stop offset="95%" stopColor={(selectedCommodity.change_pct ?? 0) >= 0 ? '#10b981' : '#ef4444'} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickFormatter={(v: string) => { const d = new Date(v); return `${d.getMonth()+1}/${d.getDate()}`; }}
                  interval={Math.floor(selectedCommodity.prices.length / 6)}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tickLine={false}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickFormatter={(v: number) => `${sym(selectedCommodity.currency)}${v.toLocaleString()}`}
                  axisLine={false}
                  tickLine={false}
                  width={72}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '12px', padding: '8px 12px' }}
                  labelFormatter={(l) => new Date(String(l)).toLocaleDateString('ko-KR')}
                  formatter={(v) => [`${sym(selectedCommodity.currency)}${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, '가격']}
                />
                <Area
                  type="monotone"
                  dataKey="close"
                  stroke={(selectedCommodity.change_pct ?? 0) >= 0 ? '#10b981' : '#ef4444'}
                  strokeWidth={2}
                  fill="url(#trendFill)"
                  dot={false}
                  activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 전문가 분석 */}
      {reportData.analysis && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 md:p-8">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-1 h-5 bg-slate-800 rounded-full" />
            <h2 className="text-base font-bold text-slate-900">전문가 분석</h2>
          </div>
          <article className="prose prose-slate prose-sm max-w-none
            prose-headings:text-slate-800 prose-headings:font-bold prose-headings:mt-6 prose-headings:mb-3
            prose-h2:text-[15px] prose-h2:mt-0 prose-h2:mb-2 prose-h2:border-b prose-h2:border-slate-100 prose-h2:pb-2
            prose-p:text-slate-600 prose-p:leading-[1.75] prose-p:text-[13px]
            prose-strong:text-slate-800 prose-strong:font-semibold
            prose-li:text-slate-600 prose-li:text-[13px] prose-li:leading-[1.75]
            prose-ul:my-2
            prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline
          ">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {reportData.analysis}
            </ReactMarkdown>
          </article>
        </div>
      )}
    </div>
  );

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
            <h1 className="text-2xl font-bold text-slate-900">원료가격트렌드</h1>
            <p className="text-sm text-slate-500 mt-1">5개 원자재 시세 종합 분석</p>
          </div>
          <div className="flex items-center gap-2">
            {displayData && (
              <button
                onClick={downloadPdf}
                disabled={downloading}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all"
              >
                {downloading ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                )}
                PDF
              </button>
            )}
            <button
              onClick={generate}
              disabled={loading}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                loading ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm'
              }`}
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  분석 중...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  보고서 생성
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 탭 전환 */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
        <button
          onClick={() => { setViewMode('current'); setHistoryDetail(null); setSelectedHistoryId(null); if (data?.commodities?.length) setSelectedChart(data.commodities[0].key); }}
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
            viewMode === 'current' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          최신 보고서
        </button>
        <button
          onClick={() => setViewMode('history')}
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
            viewMode === 'history' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          보고서 이력 {history.length > 0 && <span className="ml-1 text-xs text-slate-400">({history.length})</span>}
        </button>
      </div>

      {/* === 최신 보고서 탭 === */}
      {viewMode === 'current' && (
        <>
          {/* 로딩 */}
          {loading && (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-12 animate-fadeInUp">
              <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-[3px] border-slate-200 border-t-slate-800 rounded-full animate-spin" />
                <div className="text-center">
                  <p className="text-sm font-semibold text-slate-700">시세 수집 및 분석 중...</p>
                  <p className="text-xs text-slate-400 mt-1">약 15~30초 소요</p>
                </div>
              </div>
            </div>
          )}

          {/* 에러 */}
          {error && !loading && (
            <div className="bg-red-50 rounded-2xl border border-red-200 p-5">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* 빈 상태 */}
          {!data && !loading && !error && (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-12 animate-fadeInUp">
              <div className="flex flex-col items-center gap-3 text-center">
                <svg className="w-10 h-10 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-sm text-slate-500">&quot;보고서 생성&quot; 버튼을 클릭하세요</p>
              </div>
            </div>
          )}

          {/* 데이터 표시 */}
          {data && !loading && renderReport(data)}
        </>
      )}

      {/* === 이력 탭 === */}
      {viewMode === 'history' && (
        <>
          {/* 이력에서 상세 보기 중일 때 */}
          {historyDetail && selectedHistoryId && (
            <div className="space-y-4">
              <button
                onClick={() => { setHistoryDetail(null); setSelectedHistoryId(null); }}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                목록으로
              </button>
              {historyDetailLoading ? (
                <div className="text-center py-14 text-slate-400 text-sm">불러오는 중...</div>
              ) : (
                renderReport(historyDetail)
              )}
            </div>
          )}

          {/* 이력 목록 */}
          {!historyDetail && (
            <>
              {historyLoading ? (
                <div className="text-center py-14 text-slate-400 text-sm">불러오는 중...</div>
              ) : history.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200/80 p-12 animate-fadeInUp">
                  <div className="flex flex-col items-center gap-3 text-center">
                    <svg className="w-10 h-10 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm text-slate-500">저장된 보고서 이력이 없습니다</p>
                    <p className="text-xs text-slate-400">보고서를 생성하면 자동으로 이력에 저장됩니다</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => viewHistoryDetail(item.id)}
                      className="bg-white rounded-2xl border border-slate-200 p-5 cursor-pointer transition-all hover:shadow-md hover:border-slate-300"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                              {item.report_date}
                            </span>
                            <span className="text-xs text-slate-400">
                              {new Date(item.generated_at).toLocaleString('ko-KR')}
                            </span>
                          </div>
                          {/* 원자재 요약 */}
                          <div className="flex flex-wrap gap-3">
                            {item.summary.map((s) => {
                              const isUp = (s.change_pct ?? 0) >= 0;
                              return (
                                <div key={s.label} className="flex items-center gap-1.5 text-xs">
                                  <span className="font-medium text-slate-600">{s.label}</span>
                                  <span className="font-bold text-slate-900">
                                    {s.currency === 'USD' ? '$' : '\u00a5'}{s.price > 0 ? s.price.toLocaleString() : '-'}
                                  </span>
                                  {s.change_pct !== null && (
                                    <span className={`font-semibold ${isUp ? 'text-green-600' : 'text-red-600'}`}>
                                      {isUp ? '+' : ''}{s.change_pct}%
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        <button
                          onClick={(e) => deleteHistory(e, item.id)}
                          className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition flex-shrink-0 ml-3"
                          title="삭제"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
