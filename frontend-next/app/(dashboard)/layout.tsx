'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { apiUrl, authHeaders } from '@/lib/api';

interface User {
  id: number;
  email: string;
  full_name: string;
  role: string;
  department: string;
  is_active: boolean;
}

interface NavItem {
  href: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: '대시보드', icon: 'home' },
  { href: '/emails', label: '이메일', icon: 'mail' },
  { href: '/archives', label: '리포트', icon: 'archive' },
  { href: '/inventory', label: '재고 관리', icon: 'box' },
  { href: '/users', label: '사용자 관리', icon: 'users', adminOnly: true },
];

function NavIcon({ icon, className }: { icon: string; className?: string }) {
  const cls = className || 'w-5 h-5';
  switch (icon) {
    case 'home':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      );
    case 'mail':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      );
    case 'search':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      );
    case 'box':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      );
    case 'sparkles':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      );
    case 'archive':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
        </svg>
      );
    case 'users':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      );
    default:
      return null;
  }
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  useEffect(() => {
    const fetchUser = async () => {
      const token = localStorage.getItem('access_token');
      if (!token) {
        router.push('/login');
        return;
      }

      try {
        const response = await fetch(apiUrl('/api/v1/auth/me'), {
          headers: authHeaders(),
        });

        if (!response.ok) throw new Error('인증 실패');
        const data = await response.json();
        setUser(data);
      } catch {
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

  const filteredNav = NAV_ITEMS.filter(
    (item) => !item.adminOnly || user?.role === 'admin'
  );

  const roleLabel: Record<string, string> = {
    admin: '관리자',
    approver: '승인자',
    staff: '직원',
    viewer: '뷰어',
  };

  const currentPageLabel = filteredNav.find((item) => pathname?.startsWith(item.href))?.label || '대시보드';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-[3px] border-brand-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-slate-500 font-medium">로딩 중...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-30 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          ${sidebarOpen ? 'w-60' : 'w-[68px]'}
          ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          fixed lg:static inset-y-0 left-0 z-40
          bg-white border-r border-slate-200/80
          flex flex-col transition-all duration-300 shrink-0
        `}
      >
        {/* Logo */}
        <div className="h-16 flex items-center px-4 border-b border-slate-100">
          {sidebarOpen ? (
            <Link href="/dashboard" className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl flex items-center justify-center shadow-sm">
                <span className="text-white font-bold text-sm">C</span>
              </div>
              <div>
                <span className="text-base font-bold text-slate-900 block leading-tight">C-Auto</span>
              </div>
            </Link>
          ) : (
            <Link href="/dashboard" className="mx-auto">
              <div className="w-9 h-9 bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl flex items-center justify-center shadow-sm">
                <span className="text-white font-bold text-sm">C</span>
              </div>
            </Link>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1">
          {sidebarOpen && (
            <div className="px-3 py-2">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">메뉴</span>
            </div>
          )}
          {filteredNav.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname?.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-brand-50 text-brand-700 shadow-sm shadow-brand-100/50'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                }`}
                title={!sidebarOpen ? item.label : undefined}
              >
                <NavIcon
                  icon={item.icon}
                  className={`w-5 h-5 shrink-0 transition-colors ${isActive ? 'text-brand-600' : ''}`}
                />
                {sidebarOpen && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User info in sidebar */}
        {sidebarOpen && user && (
          <div className="px-3 pb-2">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-brand-100 rounded-full flex items-center justify-center shrink-0">
                  <span className="text-brand-700 font-bold text-xs">
                    {user.full_name?.charAt(0) || 'U'}
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-800 truncate">{user.full_name}</div>
                  <div className="text-xs text-slate-400">{roleLabel[user.role] || user.role}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Sidebar toggle */}
        <div className="p-3 border-t border-slate-100">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="w-full flex items-center justify-center py-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50 transition"
          >
            <svg className={`w-5 h-5 transition-transform duration-300 ${sidebarOpen ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navbar */}
        <header className="h-16 glass border-b border-slate-200/80 flex items-center justify-between px-6 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg hover:bg-slate-100 text-slate-500"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <div>
              <h2 className="text-base font-bold text-slate-900">{currentPageLabel}</h2>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:block text-right">
              <div className="text-sm font-semibold text-slate-800">{user?.full_name}</div>
              <div className="text-xs text-slate-400">{user?.department || roleLabel[user?.role || ''] || user?.role}</div>
            </div>
            <div className="w-9 h-9 bg-gradient-to-br from-brand-100 to-brand-200 rounded-full flex items-center justify-center ring-2 ring-white shadow-sm">
              <span className="text-brand-700 font-bold text-sm">
                {user?.full_name?.charAt(0) || 'U'}
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="text-sm text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors font-medium"
            >
              로그아웃
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-6">
          <div className="animate-fadeIn">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
