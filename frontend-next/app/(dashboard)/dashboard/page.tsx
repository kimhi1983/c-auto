'use client';

import { useEffect, useState } from 'react';

interface Stats {
  emailCount: number;
  inventoryItems: number;
  recentActivity: string[];
}

interface ExchangeRate {
  USD_KRW: number;
  CNY_KRW: number;
  USD_CNY: number;
  updated_at: string;
}

function StatCard({ title, value, icon, color }: { title: string; value: string | number; icon: string; color: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <span className="text-lg">{icon}</span>
        </div>
      </div>
      <div className="text-2xl font-bold text-slate-900">{value}</div>
      <div className="text-sm text-slate-500 mt-1">{title}</div>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({
    emailCount: 0,
    inventoryItems: 0,
    recentActivity: [],
  });
  const [rates, setRates] = useState<ExchangeRate | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [invRes, logRes, rateRes] = await Promise.allSettled([
          fetch('/api/inventory'),
          fetch('/work-log'),
          fetch('/api/v1/exchange-rates/current'),
        ]);

        // 재고
        if (invRes.status === 'fulfilled' && invRes.value.ok) {
          const invData = await invRes.value.json();
          if (invData.status === 'success' && invData.data) {
            setStats((prev) => ({ ...prev, inventoryItems: invData.data.length }));
          }
        }

        // 업무 기록
        if (logRes.status === 'fulfilled' && logRes.value.ok) {
          const logData = await logRes.value.json();
          if (logData.status === 'success' && logData.data) {
            setStats((prev) => ({
              ...prev,
              emailCount: logData.data.length,
              recentActivity: logData.data.slice(-5).map((r: any) => r['제목'] || r['subject'] || ''),
            }));
          }
        }

        // 환율
        if (rateRes.status === 'fulfilled' && rateRes.value.ok) {
          const rateData = await rateRes.value.json();
          if (rateData.status === 'success' && rateData.data) {
            setRates(rateData.data);
          }
        }
      } catch {
        // 데이터 로드 실패 시 기본값 유지
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">대시보드</h1>
        <p className="text-slate-500 mt-1">C-Auto 스마트 이메일 분석 시스템 현황</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="처리된 이메일"
          value={loading ? '-' : stats.emailCount}
          icon="📧"
          color="bg-blue-50"
        />
        <StatCard
          title="재고 품목"
          value={loading ? '-' : stats.inventoryItems}
          icon="📦"
          color="bg-green-50"
        />
        <StatCard
          title="시스템 상태"
          value="정상"
          icon="✅"
          color="bg-emerald-50"
        />
        <StatCard
          title="AI 엔진"
          value="활성"
          icon="🤖"
          color="bg-purple-50"
        />
      </div>

      {/* Exchange Rate + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Exchange Rates */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">실시간 환율</h3>
          {rates ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-xl">
                <div>
                  <div className="text-xs font-medium text-blue-600">USD/KRW</div>
                  <div className="text-xs text-blue-500 mt-0.5">미국 달러</div>
                </div>
                <div className="text-xl font-bold text-blue-700">
                  {rates.USD_KRW.toLocaleString()}
                </div>
              </div>
              <div className="flex items-center justify-between p-3 bg-red-50 rounded-xl">
                <div>
                  <div className="text-xs font-medium text-red-600">CNY/KRW</div>
                  <div className="text-xs text-red-500 mt-0.5">중국 위안</div>
                </div>
                <div className="text-xl font-bold text-red-700">
                  {rates.CNY_KRW.toLocaleString()}
                </div>
              </div>
              <div className="text-xs text-slate-400 text-center">
                {rates.updated_at ? `업데이트: ${new Date(rates.updated_at).toLocaleDateString('ko-KR')}` : ''}
              </div>
            </div>
          ) : loading ? (
            <div className="text-sm text-slate-400">환율 정보를 불러오는 중...</div>
          ) : (
            <div className="text-sm text-slate-400">환율 정보를 불러올 수 없습니다.</div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">빠른 실행</h3>
          <div className="grid grid-cols-2 gap-3">
            <QuickAction href="/emails" label="이메일 확인" desc="새 이메일 분석" />
            <QuickAction href="/files" label="파일 검색" desc="드롭박스 검색" />
            <QuickAction href="/inventory" label="재고 관리" desc="입출고 처리" />
            <QuickAction href="/users" label="사용자 관리" desc="계정 설정" />
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">최근 활동</h3>
          {loading ? (
            <div className="text-sm text-slate-400">로딩 중...</div>
          ) : stats.recentActivity.length > 0 ? (
            <div className="space-y-3">
              {stats.recentActivity.map((activity, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <div className="w-2 h-2 bg-brand-500 rounded-full shrink-0" />
                  <span className="text-slate-600 truncate">{activity}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-slate-400">아직 활동 기록이 없습니다.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function QuickAction({ href, label, desc }: { href: string; label: string; desc: string }) {
  return (
    <a
      href={href}
      className="block p-4 rounded-xl border border-slate-100 hover:border-brand-200 hover:bg-brand-50/30 transition-all group"
    >
      <div className="text-sm font-semibold text-slate-900 group-hover:text-brand-600">{label}</div>
      <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
    </a>
  );
}
