'use client';

import { useEffect, useState } from 'react';
import { apiUrl } from '@/lib/api';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';

interface CpoPrice {
  date: string;
  close: number;
  open: number;
  high: number;
  low: number;
  volume: number | null;
}

interface CpoData {
  ticker: string;
  name: string;
  currency: string;
  exchange: string;
  range: string;
  prices: CpoPrice[];
  current_price: number;
  previous_close: number | null;
  fifty_two_week_high: number | null;
  fifty_two_week_low: number | null;
  updated_at: string;
}

const RANGE_OPTIONS = [
  { value: '1mo', label: '1개월' },
  { value: '3mo', label: '3개월' },
  { value: '6mo', label: '6개월' },
  { value: '1y', label: '1년' },
];

export default function PalmOilPage() {
  const [data, setData] = useState<CpoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('6mo');
  const [error, setError] = useState('');
  const [usdKrw, setUsdKrw] = useState<number | null>(null);

  const fetchData = async (selectedRange: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(apiUrl(`/api/v1/commodity-prices/current?range=${selectedRange}&interval=1d`));
      if (res.ok) {
        const json = await res.json();
        if (json.status === 'success') {
          setData(json.data);
        } else {
          setError('데이터를 불러올 수 없습니다.');
        }
      } else {
        setError('서버 응답 오류');
      }
    } catch {
      setError('네트워크 오류');
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(range); }, [range]);

  useEffect(() => {
    fetch(apiUrl('/api/v1/exchange-rates/current'))
      .then(r => r.json())
      .then(j => { if (j.status === 'success') setUsdKrw(j.data.USD_KRW); })
      .catch(() => {});
  }, []);

  // 가격 변동 계산
  const priceChange = data && data.previous_close
    ? data.current_price - data.previous_close
    : null;
  const priceChangePercent = priceChange !== null && data?.previous_close
    ? (priceChange / data.previous_close) * 100
    : null;

  // 기간 내 최고/최저
  const periodHigh = data ? Math.max(...data.prices.map(p => p.close)) : 0;
  const periodLow = data ? Math.min(...data.prices.map(p => p.close)) : 0;

  // 차트 색상 결정
  const isUp = priceChange !== null ? priceChange >= 0 : true;
  const chartColor = isUp ? '#10b981' : '#ef4444';

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="animate-fadeIn">
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <span>원료 정보</span>
          <span className="text-slate-300">/</span>
          <span className="text-slate-700 font-medium">팜오일</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">팜오일 시세</h1>
        <p className="text-sm text-slate-500 mt-1">말레이시아 원유 팜유 (CPO) · CME 선물 · USD/톤</p>
      </div>

      {/* 현재가 카드 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 animate-fadeInUp">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-1">CPO=F · CME</div>
            {loading ? (
              <div className="skeleton w-48 h-12 rounded-xl" />
            ) : data ? (
              <div className="flex items-baseline gap-3">
                <span className="text-4xl font-bold text-slate-900">
                  ${data.current_price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                {priceChange !== null && priceChangePercent !== null && (
                  <div className={`flex items-center gap-1.5 ${isUp ? 'text-green-600' : 'text-red-600'}`}>
                    <span className="text-lg font-bold">
                      {isUp ? '+' : ''}{priceChange.toFixed(2)}
                    </span>
                    <span className={`text-sm font-bold px-2 py-0.5 rounded-lg ${isUp ? 'bg-green-50' : 'bg-red-50'}`}>
                      {isUp ? '+' : ''}{priceChangePercent.toFixed(2)}%
                    </span>
                  </div>
                )}
              {data.current_price && usdKrw && (
                <div className="text-sm text-slate-500 mt-1.5">
                  ≈ ₩{Math.round(data.current_price * usdKrw).toLocaleString()} <span className="text-xs text-slate-400">KRW</span>
                </div>
              )}
              </div>
            ) : (
              <div className="text-sm text-slate-400">데이터 없음</div>
            )}
            {data && (
              <div className="text-xs text-slate-400 mt-1">
                업데이트: {new Date(data.updated_at).toLocaleString('ko-KR')}
              </div>
            )}
          </div>

          {/* 기간 선택 */}
          <div className="flex gap-1.5 bg-slate-100 p-1 rounded-xl">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setRange(opt.value)}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  range === opt.value
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 차트 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 animate-fadeInUp delay-1">
        {loading ? (
          <div className="flex items-center justify-center h-80">
            <div className="text-sm text-slate-400">차트 데이터 로딩 중...</div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-80">
            <div className="text-sm text-red-500">{error}</div>
          </div>
        ) : data && data.prices.length > 0 ? (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.prices}>
                <defs>
                  <linearGradient id="colorClose" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartColor} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickFormatter={(val: string) => {
                    const d = new Date(val);
                    return `${d.getMonth() + 1}/${d.getDate()}`;
                  }}
                  interval={Math.floor(data.prices.length / 7)}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tickLine={false}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickFormatter={(val: number) => `$${val.toLocaleString()}`}
                  axisLine={false}
                  tickLine={false}
                  width={70}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    fontSize: '13px',
                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                    padding: '12px',
                  }}
                  labelFormatter={(label) => {
                    const d = new Date(String(label));
                    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
                  }}
                  formatter={(value) => [`$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, '종가']}
                />
                <Area
                  type="monotone"
                  dataKey="close"
                  stroke={chartColor}
                  strokeWidth={2}
                  fill="url(#colorClose)"
                  dot={false}
                  activeDot={{ r: 5, fill: chartColor, stroke: '#fff', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex items-center justify-center h-80">
            <div className="text-sm text-slate-400">차트 데이터 없음</div>
          </div>
        )}
      </div>

      {/* 통계 카드 */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fadeInUp delay-2">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5">
            <div className="text-xs text-slate-500 font-medium mb-1">현재가</div>
            <div className="text-xl font-bold text-slate-900">
              ${data.current_price?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5">
            <div className="text-xs text-slate-500 font-medium mb-1">기간 내 최고</div>
            <div className="text-xl font-bold text-green-600">
              ${periodHigh.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5">
            <div className="text-xs text-slate-500 font-medium mb-1">기간 내 최저</div>
            <div className="text-xl font-bold text-red-600">
              ${periodLow.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5">
            <div className="text-xs text-slate-500 font-medium mb-1">52주 범위</div>
            <div className="text-sm font-bold text-slate-700">
              ${data.fifty_two_week_low?.toLocaleString()} ~ ${data.fifty_two_week_high?.toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {/* 최근 시세 테이블 */}
      {data && data.prices.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 animate-fadeInUp delay-3">
          <h3 className="text-base font-bold text-slate-900 mb-4">최근 시세</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase">날짜</th>
                  <th className="text-right py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase">시가</th>
                  <th className="text-right py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase">고가</th>
                  <th className="text-right py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase">저가</th>
                  <th className="text-right py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase">종가</th>
                  <th className="text-right py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase">변동</th>
                </tr>
              </thead>
              <tbody>
                {[...data.prices].reverse().slice(0, 20).map((p, i, arr) => {
                  const prev = arr[i + 1];
                  const change = prev ? p.close - prev.close : 0;
                  const changePct = prev ? (change / prev.close) * 100 : 0;
                  return (
                    <tr key={p.date} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="py-2.5 px-3 text-slate-700 font-medium">
                        {new Date(p.date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-600">${p.open?.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-right text-slate-600">${p.high?.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-right text-slate-600">${p.low?.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-900">${p.close.toFixed(2)}</td>
                      <td className={`py-2.5 px-3 text-right font-semibold ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {change !== 0 ? `${change >= 0 ? '+' : ''}${changePct.toFixed(2)}%` : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
