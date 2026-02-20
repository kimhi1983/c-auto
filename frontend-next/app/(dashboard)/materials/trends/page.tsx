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

export default function TrendsPage() {
  const [data, setData] = useState<TrendData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedChart, setSelectedChart] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const generate = async () => {
    setLoading(true);
    setError('');
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
      await (html2pdf().set({
        margin: [12, 10, 12, 10],
        filename: `KPROS_원료가격트렌드_${data?.date || 'report'}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      }) as any).from(el).save();
    } catch (e: any) {
      alert('PDF 다운로드 실패: ' + (e.message || ''));
    }
    setDownloading(false);
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

  const sym = (c: string) => c === 'USD' ? '$' : '¥';
  const selectedCommodity = data?.commodities?.find(c => c.key === selectedChart);

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
            {data && (
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

      {/* === 데이터 표시 === */}
      {data && !loading && (
        <div id="trends-report" className="space-y-6 animate-fadeInUp">

          {/* 기준일 */}
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <span>기준일 {data.date}</span>
            <span>|</span>
            <span>생성 {new Date(data.generated_at).toLocaleString('ko-KR')}</span>
            {data.exchange_rates.USD_KRW && (
              <>
                <span>|</span>
                <span>USD/KRW {data.exchange_rates.USD_KRW.toLocaleString()}</span>
              </>
            )}
            {data.exchange_rates.CNY_KRW && (
              <>
                <span>CNY/KRW {data.exchange_rates.CNY_KRW.toLocaleString()}</span>
              </>
            )}
          </div>

          {/* 원자재 카드 5개 */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {(data.commodities || []).map((c) => {
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
          {data.analysis && (
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
                  {data.analysis}
                </ReactMarkdown>
              </article>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
