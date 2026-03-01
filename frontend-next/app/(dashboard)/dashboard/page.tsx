'use client';

import { useEffect, useState } from 'react';
import { apiUrl, authHeaders } from '@/lib/api';

interface EmailStats {
  total: number;
  unread: number;
  in_review: number;
  approved: number;
  sent: number;
  categories: Record<string, number>;
}

interface ExchangeRate {
  USD_KRW: number;
  CNY_KRW: number;
  USD_CNY: number;
  updated_at: string;
}

interface WorkflowSummary {
  sales: { total: number; active: number; completed: number; pendingApproval: number; byStatus: Record<string, number> };
  purchase: { total: number; active: number; completed: number; pendingApproval: number; byStatus: Record<string, number> };
  approval: { pending: number; approved: number; rejected: number };
  workflow: { erpSubmitted: number; warehouseProcessing: number; completed: number };
}

interface ArchiveStats {
  total_archives: number;
  recent_7days: number;
  total_reports: number;
}

interface DocHistory {
  id: number;
  category: string;
  description: string;
  created_at: string;
}

function getAuthHeaders(): Record<string, string> {
  return authHeaders();
}

/* ========================================
   Skeleton Components
   ======================================== */

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="skeleton w-10 h-10 rounded-xl mb-3" />
      <div className="skeleton w-16 h-7 mb-2" />
      <div className="skeleton w-20 h-4" />
    </div>
  );
}

function SkeletonBlock({ className }: { className?: string }) {
  return <div className={`bg-white rounded-2xl border border-slate-200 p-6 ${className || ''}`}>
    <div className="skeleton w-24 h-5 mb-4" />
    <div className="space-y-3">
      <div className="skeleton w-full h-12 rounded-xl" />
      <div className="skeleton w-full h-12 rounded-xl" />
      <div className="skeleton w-3/4 h-12 rounded-xl" />
    </div>
  </div>;
}

/* ========================================
   Stat Card
   ======================================== */

function StatCard({ title, value, icon, color, bgColor, subtitle, delay }: {
  title: string; value: string | number; icon: string; color: string; bgColor: string; subtitle?: string; delay?: number;
}) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200/80 p-5 card-hover animate-fadeInUp ${delay ? `delay-${delay}` : ''}`}>
      <div className="flex items-center justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bgColor}`}>
          <span className="text-lg">{icon}</span>
        </div>
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-sm text-slate-500 mt-1 font-medium">{title}</div>
      {subtitle && <div className="text-xs text-slate-400 mt-1">{subtitle}</div>}
    </div>
  );
}

/* ========================================
   Main Dashboard
   ======================================== */

export default function DashboardPage() {
  const [emailStats, setEmailStats] = useState<EmailStats | null>(null);
  const [inventoryCount, setInventoryCount] = useState(0);
  const [rates, setRates] = useState<ExchangeRate | null>(null);
  const [recentEmails, setRecentEmails] = useState<any[]>([]);
  const [archiveStats, setArchiveStats] = useState<ArchiveStats | null>(null);
  const [recentDocs, setRecentDocs] = useState<DocHistory[]>([]);
  const [wfSummary, setWfSummary] = useState<WorkflowSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [emailStatsRes, emailListRes, invRes, rateRes, archiveRes, docsRes, wfRes] = await Promise.allSettled([
          fetch(apiUrl('/api/v1/emails/stats'), { headers: getAuthHeaders() }),
          fetch(apiUrl('/api/v1/emails/?limit=10'), { headers: getAuthHeaders() }),
          fetch(apiUrl('/api/v1/inventory/stats'), { headers: getAuthHeaders() }),
          fetch(apiUrl('/api/v1/exchange-rates/current')),
          fetch(apiUrl('/api/v1/archives/stats'), { headers: getAuthHeaders() }),
          fetch(apiUrl('/api/v1/ai-docs/history?page_size=3'), { headers: getAuthHeaders() }),
          fetch(apiUrl('/api/v1/workflows/summary'), { headers: getAuthHeaders() }),
        ]);

        if (emailStatsRes.status === 'fulfilled' && emailStatsRes.value.ok) {
          const data = await emailStatsRes.value.json();
          if (data.status === 'success') setEmailStats(data.data);
        }

        if (emailListRes.status === 'fulfilled' && emailListRes.value.ok) {
          const data = await emailListRes.value.json();
          if (data.status === 'success') setRecentEmails(data.data || []);
        }

        if (invRes.status === 'fulfilled' && invRes.value.ok) {
          const invData = await invRes.value.json();
          if (invData.status === 'success' && invData.data) {
            setInventoryCount(invData.data.total_items || 0);
          }
        }

        if (rateRes.status === 'fulfilled' && rateRes.value.ok) {
          const rateData = await rateRes.value.json();
          if (rateData.status === 'success' && rateData.data) {
            setRates(rateData.data);
          }
        }

        if (archiveRes.status === 'fulfilled' && archiveRes.value.ok) {
          const archData = await archiveRes.value.json();
          if (archData.status === 'success') setArchiveStats(archData.data);
        }

        if (docsRes.status === 'fulfilled' && docsRes.value.ok) {
          const docsData = await docsRes.value.json();
          if (docsData.status === 'success') setRecentDocs(docsData.documents || []);
        }

        if (wfRes.status === 'fulfilled' && wfRes.value.ok) {
          const wfData = await wfRes.value.json();
          if (wfData.status === 'success') setWfSummary(wfData.data);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, []);

  const categoryColors: Record<string, string> = {
    '발주': 'text-blue-600',
    '요청': 'text-indigo-600',
    '견적요청': 'text-purple-600',
    '문의': 'text-yellow-600',
    '공지': 'text-slate-600',
    '미팅': 'text-pink-600',
    '클레임': 'text-red-600',
    '기타': 'text-gray-600',
  };

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="animate-fadeIn">
        <h1 className="text-2xl font-bold text-slate-900">대시보드</h1>
        <p className="text-sm text-slate-500 mt-1">C-Auto 스마트 이메일 분석 시스템 현황</p>
      </div>

      {/* Workflow Summary */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : wfSummary && (wfSummary.sales.total + wfSummary.purchase.total) > 0 ? (
        <div className="animate-fadeInUp">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-bold text-slate-900">주문 워크플로우 현황</h3>
            <a href="/approvals" className="text-sm text-brand-600 hover:text-brand-700 font-medium">승인관리 &rarr;</a>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard title="판매 주문" value={wfSummary.sales.total} icon="📦" color="text-blue-700" bgColor="bg-blue-50" subtitle={`진행 ${wfSummary.sales.active} · 완료 ${wfSummary.sales.completed}`} />
            <StatCard title="구매 주문" value={wfSummary.purchase.total} icon="🛒" color="text-indigo-700" bgColor="bg-indigo-50" subtitle={`진행 ${wfSummary.purchase.active} · 완료 ${wfSummary.purchase.completed}`} />
            <StatCard title="승인 대기" value={wfSummary.approval.pending} icon="⏳" color={wfSummary.approval.pending > 0 ? 'text-amber-700' : 'text-slate-500'} bgColor={wfSummary.approval.pending > 0 ? 'bg-amber-50' : 'bg-slate-50'} />
            <StatCard title="ERP 전송" value={wfSummary.workflow.erpSubmitted} icon="📤" color="text-emerald-700" bgColor="bg-emerald-50" subtitle="시뮬레이션" />
            <StatCard title="창고 처리중" value={wfSummary.workflow.warehouseProcessing} icon="🏭" color="text-orange-700" bgColor="bg-orange-50" />
            <StatCard title="처리 완료" value={wfSummary.workflow.completed} icon="✅" color="text-green-700" bgColor="bg-green-50" />
          </div>
        </div>
      ) : null}

      {/* Exchange Rate + Recent Emails */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <SkeletonBlock className="lg:col-span-4" />
          <SkeletonBlock className="lg:col-span-8" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Exchange Rates */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 card-hover animate-fadeInUp delay-1 lg:col-span-4">
            <h3 className="text-base font-bold text-slate-900 mb-4">실시간 환율</h3>
            {rates ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3.5 bg-gradient-to-r from-blue-50 to-blue-100/50 rounded-xl">
                  <div>
                    <div className="text-xs font-semibold text-blue-600 uppercase tracking-wide">USD/KRW</div>
                    <div className="text-xs text-blue-500 mt-0.5">미국 달러</div>
                  </div>
                  <div className="text-xl font-bold text-blue-700">
                    {rates.USD_KRW.toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center justify-between p-3.5 bg-gradient-to-r from-red-50 to-red-100/50 rounded-xl">
                  <div>
                    <div className="text-xs font-semibold text-red-600 uppercase tracking-wide">CNY/KRW</div>
                    <div className="text-xs text-red-500 mt-0.5">중국 위안</div>
                  </div>
                  <div className="text-xl font-bold text-red-700">
                    {rates.CNY_KRW.toLocaleString()}
                  </div>
                </div>
                <div className="text-xs text-slate-400 text-center pt-1">
                  {rates.updated_at ? `업데이트: ${new Date(rates.updated_at).toLocaleDateString('ko-KR')}` : ''}
                </div>

                {/* 환율 계산기 */}
                <CurrencyCalculator rates={rates} />
              </div>
            ) : (
              <div className="text-sm text-slate-400 text-center py-8">환율 정보를 불러올 수 없습니다.</div>
            )}
          </div>

          {/* Recent Emails */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 animate-fadeInUp delay-2 lg:col-span-8">
            <h3 className="text-base font-bold text-slate-900 mb-4">최근 이메일</h3>
            {recentEmails.length > 0 ? (
              <div className="space-y-2.5">
                {recentEmails.map((email: any, i: number) => (
                  <a
                    key={i}
                    href="/emails"
                    className="flex items-center gap-2.5 text-sm hover:bg-slate-50 rounded-xl p-2.5 -mx-2 transition-colors"
                  >
                    <span className={`text-xs font-bold shrink-0 ${categoryColors[email.category] || 'text-gray-600'}`}>
                      [{email.category}]
                    </span>
                    <span className="text-slate-700 truncate flex-1">{email.subject}</span>
                  </a>
                ))}
              </div>
            ) : (
              <div className="text-center py-6">
                <div className="text-3xl mb-2">📭</div>
                <div className="text-sm text-slate-400">아직 처리된 이메일이 없습니다</div>
                <a href="/emails" className="text-sm text-brand-600 hover:text-brand-700 mt-2 inline-block font-medium">
                  이메일 가져오기 →
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Category Breakdown */}
      {emailStats && Object.keys(emailStats.categories).length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 animate-fadeInUp">
          <h3 className="text-base font-bold text-slate-900 mb-4">카테고리별 이메일</h3>
          <div className="flex gap-3 flex-wrap">
            {Object.entries(emailStats.categories).map(([cat, count]) => (
              <div key={cat} className="flex items-center gap-2.5 px-4 py-2 bg-slate-50 rounded-xl border border-slate-100">
                <span className={`text-sm font-bold ${categoryColors[cat] || 'text-gray-600'}`}>{cat}</span>
                <span className="text-base font-bold text-slate-900">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent AI Documents */}
      {recentDocs.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 animate-fadeInUp">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-slate-900">최근 AI 생성 문서</h3>
            <a href="/ai-docs" className="text-sm text-brand-600 hover:text-brand-700 font-medium">전체보기 &rarr;</a>
          </div>
          <div className="space-y-2.5">
            {recentDocs.map((doc) => (
              <div key={doc.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors">
                <div className="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center shrink-0">
                  <span className="text-lg">💡</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-900">{doc.category}</div>
                  <div className="text-xs text-slate-500 truncate mt-0.5">{doc.description}</div>
                </div>
                <div className="text-xs text-slate-400 shrink-0">
                  {doc.created_at ? new Date(doc.created_at).toLocaleDateString('ko-KR') : '-'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CurrencyCalculator({ rates }: { rates: ExchangeRate }) {
  const [amount, setAmount] = useState('');
  const [from, setFrom] = useState('USD');
  const [to, setTo] = useState('KRW');

  const convert = (val: number, fromCur: string, toCur: string): number => {
    if (fromCur === toCur) return val;
    // 모든 통화를 KRW 기준으로 변환
    const toKRW: Record<string, number> = { KRW: 1, USD: rates.USD_KRW, CNY: rates.CNY_KRW };
    const krwAmount = val * toKRW[fromCur];
    return krwAmount / toKRW[toCur];
  };

  const result = amount && !isNaN(Number(amount)) ? convert(Number(amount), from, to) : null;

  const swap = () => { setFrom(to); setTo(from); };

  const currencies = [
    { code: 'USD', label: '달러 (USD)' },
    { code: 'CNY', label: '위안 (CNY)' },
    { code: 'KRW', label: '원화 (KRW)' },
  ];

  const formatResult = (val: number) => {
    if (to === 'KRW') return Math.round(val).toLocaleString();
    return val.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  return (
    <div className="border-t border-slate-100 pt-4 mt-1">
      <h4 className="text-sm font-bold text-slate-900 mb-3">환율 계산기</h4>
      <div className="space-y-2.5">
        <div className="flex gap-2">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="금액 입력"
            className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-brand-300 focus:border-brand-400 outline-none"
          />
          <select value={from} onChange={(e) => setFrom(e.target.value)} className="px-2 py-2 border border-slate-200 rounded-lg text-sm bg-white">
            {currencies.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
          </select>
        </div>
        <div className="flex items-center justify-center">
          <button onClick={swap} className="p-1.5 rounded-lg hover:bg-slate-100 transition text-slate-400 hover:text-slate-600 text-xs">
            ↕ 전환
          </button>
        </div>
        <div className="flex gap-2 items-center">
          <div className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-900 min-h-[38px] flex items-center">
            {result !== null ? formatResult(result) : <span className="text-slate-400 font-normal">결과</span>}
          </div>
          <select value={to} onChange={(e) => setTo(e.target.value)} className="px-2 py-2 border border-slate-200 rounded-lg text-sm bg-white">
            {currencies.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}

