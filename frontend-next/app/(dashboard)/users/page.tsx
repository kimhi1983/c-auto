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
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    full_name: '',
    role: 'staff',
    department: '',
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
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2.5 rounded-2xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition"
        >
          {showForm ? '취소' : '새 사용자 추가'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-2xl text-sm border border-red-200">
          {error}
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
