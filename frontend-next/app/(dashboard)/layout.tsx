'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { apiUrl, authHeaders } from '@/lib/api';

// ─── Types ───

interface User {
  id: number;
  email: string;
  full_name: string;
  role: string;
  department: string;
  is_active: boolean;
  menu_permissions?: string | null;  // JSON 배열 문자열, null=전체 접근
}

interface NavChild {
  href: string;
  label: string;
  badge?: string;
}

interface NavItem {
  href: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
  children?: NavChild[];
}

interface NavSection {
  title: string;
  items: NavItem[];
}

// ─── Navigation Structure (v2.0) ───

const NAV_SECTIONS: NavSection[] = [
  {
    title: '',
    items: [
      { href: '/dashboard', label: '대시보드', icon: 'home' },
    ],
  },
  {
    title: '업무',
    items: [
      { href: '/erp/sales', label: '판매입력', icon: 'sale' },
      { href: '/erp/purchases', label: '구매입력', icon: 'purchase' },
      { href: '/approvals', label: '승인관리', icon: 'approval' },
    ],
  },
  {
    title: '창고 포털',
    items: [
      {
        href: '/warehouse-portal',
        label: '출고/입고 관리',
        icon: 'truck',
        children: [
          { href: '/warehouse-portal?wh=mk', label: 'MK물류', badge: '#1565C0' },
          { href: '/warehouse-portal?wh=mansuk', label: '만석물류', badge: '#2E7D32' },
          { href: '/warehouse-portal?wh=wellrise', label: '웰라이즈', badge: '#E65100' },
          { href: '/warehouse-portal?wh=ecofarm', label: '에코스팜', badge: '#7B1FA2' },
          { href: '/warehouse-portal?wh=playground', label: '플레이그라운드', badge: '#00838F' },
          { href: '/warehouse-portal?wh=kpros', label: '케이프로스', badge: '#F57F17' },
        ],
      },
      { href: '/inventory/coa', label: '성적서(CoA)', icon: 'certificate' },
    ],
  },
  {
    title: '관리',
    items: [
      { href: '/workflows', label: '주문처리', icon: 'workflow' },
      { href: '/inventory', label: '재고 현황', icon: 'box' },
      { href: '/kpros', label: '거래처 관리', icon: 'building' },
      { href: '/products', label: '품목 관리', icon: 'product' },
    ],
  },
  {
    title: '정보',
    items: [
      {
        href: '/materials',
        label: '원료 정보',
        icon: 'flask',
        children: [
          { href: '/materials/palm-oil', label: '팜오일' },
          { href: '/materials/naphtha', label: '납사' },
          { href: '/materials/wti', label: '원유 (WTI)' },
          { href: '/materials/silicon-metal', label: '메탈 실리콘' },
          { href: '/materials/dmc', label: 'DMC' },
          { href: '/materials/trends', label: '원료가격트렌드' },
        ],
      },
      { href: '/archives', label: '리포트', icon: 'archive' },
    ],
  },
  {
    title: '시스템',
    items: [
      { href: '/emails', label: '이메일', icon: 'mail' },
      { href: '/users', label: '사용자 관리', icon: 'users', adminOnly: true },
    ],
  },
];

// ─── Icon Component ───

function NavIcon({ icon, className }: { icon: string; className?: string }) {
  const cls = className || 'w-5 h-5';
  switch (icon) {
    case 'home':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      );
    case 'sale':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12A1.125 1.125 0 0119.75 22.5H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 8.25h12.974c.576 0 1.059.435 1.12 1.007z" />
        </svg>
      );
    case 'purchase':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 3.75H6.912a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H15M2.25 13.5h6.388c.636 0 1.176.461 1.28 1.09l.295 1.78a1.294 1.294 0 001.28 1.08h1.014c.636 0 1.176-.461 1.28-1.08l.295-1.78a1.294 1.294 0 011.28-1.09h6.388M9 3.75V2.25m0 1.5v5.25m6-5.25V2.25m0 1.5v5.25" />
        </svg>
      );
    case 'approval':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
        </svg>
      );
    case 'truck':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
        </svg>
      );
    case 'certificate':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      );
    case 'workflow':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25a2.25 2.25 0 01-2.25-2.25v-2.25z" />
        </svg>
      );
    case 'box':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      );
    case 'building':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
        </svg>
      );
    case 'flask':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 3h6m-5 0v5.172a2 2 0 01-.586 1.414l-3.828 3.828A4 4 0 008.414 21h7.172a4 4 0 002.828-6.586l-3.828-3.828A2 2 0 0114 9.172V3" />
        </svg>
      );
    case 'archive':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
        </svg>
      );
    case 'mail':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
        </svg>
      );
    case 'users':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
        </svg>
      );
    case 'product':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
        </svg>
      );
    default:
      return null;
  }
}

// ─── Layout Component ───

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<string[]>([]);

  useEffect(() => {
    const fetchUser = async () => {
      const token = localStorage.getItem('access_token');
      if (!token) { router.push('/login'); return; }
      try {
        const response = await fetch(apiUrl('/api/v1/auth/me'), { headers: authHeaders() });
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

  const roleLabel: Record<string, string> = {
    admin: '관리자',
    approver: '승인자',
    staff: '직원',
    viewer: '뷰어',
  };

  // 현재 페이지 라벨 (헤더 표시용)
  const currentPageLabel = (() => {
    for (const section of NAV_SECTIONS) {
      for (const item of section.items) {
        if (item.children) {
          const child = item.children.find(c => {
            const childPath = c.href.split('?')[0];
            return pathname === childPath || pathname === c.href;
          });
          if (child) return child.label;
        }
        if (pathname === item.href || (item.href !== '/dashboard' && pathname?.startsWith(item.href))) {
          return item.label;
        }
      }
    }
    // 기존 페이지 fallback
    if (pathname?.startsWith('/warehouse-ops')) return '창고작업';
    if (pathname?.startsWith('/market-report')) return '시장 보고서';
    return '대시보드';
  })();

  // active 체크 함수
  const isItemActive = (href: string) => {
    const path = href.split('?')[0];
    if (path === '/dashboard') return pathname === '/dashboard';
    if (path === '/inventory/coa') return pathname === '/inventory/coa';
    if (path === '/inventory') return pathname === '/inventory';
    return pathname === path || pathname?.startsWith(path + '/');
  };

  const isChildActive = (href: string) => {
    const path = href.split('?')[0];
    return pathname === path || pathname?.startsWith(path + '/');
  };

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
        <div className="fixed inset-0 bg-black/30 z-30 lg:hidden" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* ─── Sidebar ─── */}
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
                <span className="text-[10px] text-slate-400">KPROS 업무자동화</span>
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
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {NAV_SECTIONS.map((section, sIdx) => {
            // adminOnly 필터링
            const visibleItems = section.items.filter(item => {
              // adminOnly 체크 (기존 로직)
              if (item.adminOnly && user?.role !== 'admin') return false;
              // admin은 모든 메뉴 표시
              if (user?.role === 'admin') return true;
              // 대시보드는 항상 표시
              if (item.href === '/dashboard') return true;
              // menu_permissions가 null이면 전체 접근
              if (!user?.menu_permissions) return true;
              // 권한 목록에서 체크
              try {
                const allowed: string[] = JSON.parse(user.menu_permissions);
                return allowed.includes(item.href);
              } catch { return true; }
            });
            if (visibleItems.length === 0) return null;

            return (
              <div key={sIdx}>
                {/* Section Header */}
                {section.title && sidebarOpen && (
                  <div className="px-3 pt-4 pb-1.5 first:pt-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em]">
                      {section.title}
                    </span>
                  </div>
                )}
                {section.title && !sidebarOpen && (
                  <div className="my-2 mx-3 border-t border-slate-100" />
                )}

                {/* Items */}
                <div className="space-y-0.5">
                  {visibleItems.map((item) => {
                    const hasChildren = item.children && item.children.length > 0;
                    const active = isItemActive(item.href);
                    const childMatch = hasChildren && item.children!.some(c => isChildActive(c.href));
                    const isActive = active || childMatch;
                    const isExpanded = expandedMenus.includes(item.href) || (hasChildren && isActive);

                    if (hasChildren) {
                      return (
                        <div key={item.href}>
                          <button
                            onClick={() => {
                              setExpandedMenus(prev =>
                                prev.includes(item.href) ? prev.filter(h => h !== item.href) : [...prev, item.href]
                              );
                            }}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                              isActive
                                ? 'bg-brand-50 text-brand-700'
                                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                            }`}
                            title={!sidebarOpen ? item.label : undefined}
                          >
                            <NavIcon
                              icon={item.icon}
                              className={`w-[18px] h-[18px] shrink-0 transition-colors ${isActive ? 'text-brand-600' : ''}`}
                            />
                            {sidebarOpen && (
                              <>
                                <span className="flex-1 text-left">{item.label}</span>
                                <svg
                                  className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              </>
                            )}
                          </button>
                          {sidebarOpen && isExpanded && (
                            <div className="ml-5 pl-3 border-l border-slate-200/80 mt-0.5 space-y-0.5">
                              {item.children!.map((child) => {
                                const cActive = isChildActive(child.href);
                                return (
                                  <Link
                                    key={child.href}
                                    href={child.href}
                                    onClick={() => setMobileMenuOpen(false)}
                                    className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[13px] transition-all duration-200 ${
                                      cActive
                                        ? 'text-brand-700 font-semibold bg-brand-50/60'
                                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                                    }`}
                                  >
                                    {child.badge && (
                                      <span
                                        className="w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-white"
                                        style={{ backgroundColor: child.badge }}
                                      />
                                    )}
                                    <span>{child.label}</span>
                                  </Link>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    }

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                          isActive
                            ? 'bg-brand-50 text-brand-700 shadow-sm shadow-brand-100/50'
                            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                        }`}
                        title={!sidebarOpen ? item.label : undefined}
                      >
                        <NavIcon
                          icon={item.icon}
                          className={`w-[18px] h-[18px] shrink-0 transition-colors ${isActive ? 'text-brand-600' : ''}`}
                        />
                        {sidebarOpen && <span>{item.label}</span>}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* User info */}
        {sidebarOpen && user && (
          <div className="px-3 pb-2">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                  {user.full_name?.charAt(0) || 'U'}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-800 truncate">{user.full_name}</div>
                  <div className="text-[11px] text-slate-400">{roleLabel[user.role] || user.role}</div>
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

      {/* ─── Main Content ─── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navbar */}
        <header className="h-14 glass border-b border-slate-200/80 flex items-center justify-between px-6 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg hover:bg-slate-100 text-slate-500"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h2 className="text-[15px] font-bold text-slate-900">{currentPageLabel}</h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:block text-right">
              <div className="text-sm font-semibold text-slate-800">{user?.full_name}</div>
              <div className="text-[11px] text-slate-400">{user?.department || roleLabel[user?.role || ''] || user?.role}</div>
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
          <div className="animate-fadeIn">{children}</div>
        </main>
      </div>
    </div>
  );
}
