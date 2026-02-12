'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface User {
  id: number;
  email: string;
  full_name: string;
  role: string;
  department: string;
  is_active: boolean;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      const token = localStorage.getItem('access_token');

      if (!token) {
        router.push('/login');
        return;
      }

      try {
        const response = await fetch('http://localhost:8001/api/v1/auth/me', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('인증 실패');
        }

        const data = await response.json();
        setUser(data);
      } catch (err) {
        localStorage.removeItem('access_token');
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-600">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">C-Auto</h1>
          <div className="flex items-center gap-4">
            <div className="text-sm">
              <div className="font-semibold text-slate-900">{user?.full_name}</div>
              <div className="text-slate-600">{user?.role}</div>
            </div>
            <button
              onClick={handleLogout}
              className="bg-slate-100 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-200 transition"
            >
              로그아웃
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="bg-white rounded-2xl border border-slate-200 p-8">
          <h2 className="text-2xl font-bold text-slate-900 mb-4">
            대시보드
          </h2>
          <p className="text-slate-600">
            Phase 1: 인증 시스템이 성공적으로 작동 중입니다! 🎉
          </p>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-gradient-to-br from-brand-50 to-slate-50 rounded-xl p-6 border border-brand-100">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">사용자 정보</h3>
              <div className="space-y-2 text-sm">
                <div><span className="font-medium">이메일:</span> {user?.email}</div>
                <div><span className="font-medium">이름:</span> {user?.full_name}</div>
                <div><span className="font-medium">역할:</span> {user?.role}</div>
                <div><span className="font-medium">부서:</span> {user?.department}</div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-slate-50 to-brand-50 rounded-xl p-6 border border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">시스템 상태</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  <span>인증 시스템 정상</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  <span>데이터베이스 연결됨</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  <span>API 서버 실행 중</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
