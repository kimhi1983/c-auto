'use client';

import { useEffect, useState } from 'react';
import { apiUrl, authHeaders, authJsonHeaders } from '@/lib/api';

interface User {
  id: number;
  email: string;
  full_name: string;
  role: string;
  department: string;
  is_active: boolean;
  created_at: string;
  menu_permissions?: string | null;
}

// 메뉴 권한 설정용 목록
const MENU_ITEMS: { key: string; label: string; section: string }[] = [
  { key: '/erp/sales', label: '판매입력', section: '업무' },
  { key: '/erp/purchases', label: '구매입력', section: '업무' },
  { key: '/approvals', label: '승인관리', section: '업무' },
  { key: '/warehouse-portal', label: '출고/입고 관리', section: '창고 포털' },
  { key: '/inventory/coa', label: '성적서(CoA)', section: '창고 포털' },
  { key: '/workflows', label: '주문처리', section: '관리' },
  { key: '/inventory', label: '재고 현황', section: '관리' },
  { key: '/kpros', label: '거래처 관리', section: '관리' },
  { key: '/products', label: '품목 관리', section: '관리' },
  { key: '/materials', label: '원료 정보', section: '정보' },
  { key: '/archives', label: '리포트', section: '정보' },
  { key: '/emails', label: '이메일', section: '시스템' },
];
const MENU_SECTIONS = ['업무', '창고 포털', '관리', '정보', '시스템'];

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    full_name: '',
    role: 'staff',
    department: '',
  });
  const [editForm, setEditForm] = useState({
    full_name: '',
    role: '',
    department: '',
    is_active: true,
    password: '',
    menu_permissions: null as string[] | null,
  });

  const loadUsers = async () => {
    setLoading(true);
    try {
      const response = await fetch(apiUrl('/api/v1/users'), {
        headers: authHeaders(),
      });

      if (response.status === 403) {
        setError('관리자 권한이 필요합니다.');
        return;
      }
      if (!response.ok) throw new Error('사용자 목록 조회 실패');

      const data = await response.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message || '사용자 목록을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    setError('');

    try {
      const response = await fetch(apiUrl('/api/v1/auth/register'), {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify(newUser),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || '사용자 생성 실패');
      }

      setShowForm(false);
      setNewUser({ email: '', password: '', full_name: '', role: 'staff', department: '' });
      loadUsers();
    } catch (err: any) {
      setError(err.message || '사용자 생성에 실패했습니다.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setFormLoading(true);
    setError('');

    try {
      const body: Record<string, any> = {
        full_name: editForm.full_name,
        role: editForm.role,
        department: editForm.department,
        is_active: editForm.is_active,
        menu_permissions: editForm.menu_permissions,
      };
      if (editForm.password) body.password = editForm.password;

      const response = await fetch(apiUrl(`/api/v1/users/${editingUser.id}`), {
        method: 'PATCH',
        headers: authJsonHeaders(),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || '사용자 수정 실패');
      }

      setEditingUser(null);
      loadUsers();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteUser = async (user: User) => {
    if (!confirm(`"${user.full_name}" 사용자를 삭제하시겠습니까?`)) return;

    try {
      const response = await fetch(apiUrl(`/api/v1/users/${user.id}`), {
        method: 'DELETE',
        headers: authHeaders(),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || '삭제 실패');
      }

      loadUsers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const startEdit = (user: User) => {
    setEditingUser(user);
    let parsedPerms: string[] | null = null;
    if (user.menu_permissions) {
      try { parsedPerms = JSON.parse(user.menu_permissions); } catch { parsedPerms = null; }
    }
    setEditForm({
      full_name: user.full_name,
      role: user.role,
      department: user.department || '',
      is_active: user.is_active,
      password: '',
      menu_permissions: parsedPerms,
    });
    setShowForm(false);
  };

  const roleLabel: Record<string, string> = {
    admin: '관리자',
    approver: '승인자',
    staff: '직원',
    viewer: '뷰어',
  };

  const roleColor: Record<string, string> = {
    admin: 'bg-red-50 text-red-700',
    approver: 'bg-blue-50 text-blue-700',
    staff: 'bg-green-50 text-green-700',
    viewer: 'bg-slate-100 text-slate-600',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">사용자 관리</h1>
          <p className="text-slate-500 mt-1">시스템 사용자 계정 관리 (관리자 전용)</p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setEditingUser(null); }}
          className="px-4 py-2.5 rounded-2xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition"
        >
          {showForm ? '취소' : '새 사용자 추가'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-2xl text-sm border border-red-200">
          {error}
          <button onClick={() => setError('')} className="ml-2 font-bold">&times;</button>
        </div>
      )}

      {/* Create User Form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="text-base font-semibold text-slate-900 mb-4">새 사용자 등록</h3>
          <form onSubmit={handleCreateUser} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">아이디</label>
              <input
                type="text"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-200 focus:outline-none"
                placeholder="영문, 숫자 조합"
                required
                minLength={2}
                maxLength={50}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">비밀번호</label>
              <input
                type="password"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-200 focus:outline-none"
                placeholder="8자 이상"
                required
                minLength={8}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">이름</label>
              <input
                type="text"
                value={newUser.full_name}
                onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-200 focus:outline-none"
                placeholder="홍길동"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">부서</label>
              <input
                type="text"
                value={newUser.department}
                onChange={(e) => setNewUser({ ...newUser, department: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-200 focus:outline-none"
                placeholder="경영지원팀"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">역할</label>
              <select
                value={newUser.role}
                onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-200 focus:outline-none"
              >
                <option value="staff">직원</option>
                <option value="approver">승인자</option>
                <option value="viewer">뷰어</option>
                <option value="admin">관리자</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={formLoading}
                className="w-full px-4 py-2 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition disabled:opacity-50"
              >
                {formLoading ? '생성 중...' : '사용자 생성'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit User Form */}
      {editingUser && (
        <div className="bg-white rounded-2xl border border-blue-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-slate-900">사용자 수정 - {editingUser.full_name}</h3>
            <button onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-slate-600 text-lg font-bold">&times;</button>
          </div>
          <form onSubmit={handleEditUser} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">아이디</label>
              <div className="w-full rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                {editingUser.email}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">새 비밀번호 (변경 시만 입력)</label>
              <input
                type="password"
                value={editForm.password}
                onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-200 focus:outline-none"
                placeholder="변경하지 않으려면 비워두세요"
                minLength={8}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">이름</label>
              <input
                type="text"
                value={editForm.full_name}
                onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-200 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">부서</label>
              <input
                type="text"
                value={editForm.department}
                onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-200 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">역할</label>
              <select
                value={editForm.role}
                onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-200 focus:outline-none"
              >
                <option value="staff">직원</option>
                <option value="approver">승인자</option>
                <option value="viewer">뷰어</option>
                <option value="admin">관리자</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">상태</label>
              <div className="flex items-center gap-3 mt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={editForm.is_active} onChange={() => setEditForm({ ...editForm, is_active: true })}
                    className="w-4 h-4 text-green-600" />
                  <span className="text-sm text-slate-700">활성</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={!editForm.is_active} onChange={() => setEditForm({ ...editForm, is_active: false })}
                    className="w-4 h-4 text-red-600" />
                  <span className="text-sm text-slate-700">비활성</span>
                </label>
              </div>
            </div>
            {/* 메뉴 접근 권한 */}
            <div className="md:col-span-2 border-t border-slate-100 pt-4 mt-2">
              <div className="flex items-center justify-between mb-3">
                <label className="block text-xs font-semibold text-slate-700">메뉴 접근 권한</label>
                {editForm.role !== 'admin' && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editForm.menu_permissions === null}
                      onChange={(e) => {
                        setEditForm({
                          ...editForm,
                          menu_permissions: e.target.checked ? null : MENU_ITEMS.map(m => m.key),
                        });
                      }}
                      className="w-4 h-4 rounded text-brand-500"
                    />
                    <span className="text-xs text-slate-600">전체 메뉴 접근</span>
                  </label>
                )}
              </div>
              {editForm.role === 'admin' ? (
                <p className="text-xs text-slate-400">관리자는 모든 메뉴에 접근할 수 있습니다.</p>
              ) : editForm.menu_permissions === null ? (
                <p className="text-xs text-slate-400">전체 메뉴에 접근할 수 있습니다. 특정 메뉴만 허용하려면 체크를 해제하세요.</p>
              ) : (
                <div className="space-y-3">
                  {MENU_SECTIONS.map(section => {
                    const sectionItems = MENU_ITEMS.filter(m => m.section === section);
                    const allChecked = sectionItems.every(m => editForm.menu_permissions!.includes(m.key));
                    return (
                      <div key={section}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              const perms = editForm.menu_permissions!;
                              const keys = sectionItems.map(m => m.key);
                              if (allChecked) {
                                setEditForm({ ...editForm, menu_permissions: perms.filter(k => !keys.includes(k)) });
                              } else {
                                setEditForm({ ...editForm, menu_permissions: [...new Set([...perms, ...keys])] });
                              }
                            }}
                            className="text-[10px] font-bold text-slate-400 uppercase tracking-wider hover:text-slate-600"
                          >
                            {section}
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {sectionItems.map(item => {
                            const checked = editForm.menu_permissions!.includes(item.key);
                            return (
                              <label
                                key={item.key}
                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer transition ${
                                  checked
                                    ? 'bg-brand-50 border-brand-200 text-brand-700'
                                    : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    const perms = editForm.menu_permissions!;
                                    setEditForm({
                                      ...editForm,
                                      menu_permissions: e.target.checked
                                        ? [...perms, item.key]
                                        : perms.filter(k => k !== item.key),
                                    });
                                  }}
                                  className="w-3.5 h-3.5 rounded text-brand-500"
                                />
                                {item.label}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="md:col-span-2 flex gap-2 justify-end">
              <button type="button" onClick={() => setEditingUser(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition">
                취소
              </button>
              <button type="submit" disabled={formLoading}
                className="px-6 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50">
                {formLoading ? '저장 중...' : '저장'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Users Table */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="text-sm text-slate-400">사용자 목록을 불러오는 중...</div>
        </div>
      ) : users.length > 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">이름</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">아이디</th>
                <th className="text-center px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">역할</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">부서</th>
                <th className="text-center px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">상태</th>
                <th className="text-center px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50 transition">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-brand-100 rounded-full flex items-center justify-center">
                        <span className="text-brand-600 font-semibold text-xs">
                          {user.full_name?.charAt(0) || 'U'}
                        </span>
                      </div>
                      <span className="text-sm font-medium text-slate-900">{user.full_name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">{user.email}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${roleColor[user.role] || roleColor.viewer}`}>
                      {roleLabel[user.role] || user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">{user.department || '-'}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-block w-2 h-2 rounded-full ${user.is_active ? 'bg-green-500' : 'bg-slate-300'}`} />
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => startEdit(user)}
                        className="px-2.5 py-1 rounded-lg text-xs font-medium text-blue-600 hover:bg-blue-50 transition"
                        title="수정"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user)}
                        className="px-2.5 py-1 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50 transition"
                        title="삭제"
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="text-4xl mb-3">👥</div>
          <h3 className="text-lg font-semibold text-slate-900 mb-1">사용자가 없습니다</h3>
          <p className="text-sm text-slate-500">&quot;새 사용자 추가&quot; 버튼을 클릭하여 사용자를 생성하세요.</p>
        </div>
      )}
    </div>
  );
}
