'use client'

import { useState, useEffect, useCallback } from 'react'
import { apiUrl, authHeaders, authJsonHeaders } from '@/lib/api'

interface Company {
  id: number
  companyCd: string | null
  companyNm: string
  ceoNm: string | null
  bizNo: string | null
  tel: string | null
  fax: string | null
  email: string | null
  addr: string | null
  memo: string | null
  managerNm: string | null
  managerTel: string | null
  managerEmail: string | null
  companyType: string | null
  isActive: boolean
  kprosIdx: number | null
  createdAt: string
  updatedAt: string
}

interface CompanyForm {
  company_cd: string
  company_nm: string
  ceo_nm: string
  biz_no: string
  tel: string
  fax: string
  email: string
  addr: string
  memo: string
  manager_nm: string
  manager_tel: string
  manager_email: string
  company_type: string
}

const EMPTY_FORM: CompanyForm = {
  company_cd: '', company_nm: '', ceo_nm: '', biz_no: '',
  tel: '', fax: '', email: '', addr: '', memo: '',
  manager_nm: '', manager_tel: '', manager_email: '', company_type: '',
}

const TYPE_LABELS: Record<string, string> = {
  customer: '매출처',
  supplier: '매입처',
  both: '매입/매출',
}

export default function KprosPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState('')

  // 모달
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<CompanyForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // 동기화
  const [syncing, setSyncing] = useState(false)

  const fetchCompanies = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('limit', '50')
      if (searchTerm) params.set('search', searchTerm)
      if (typeFilter) params.set('type', typeFilter)

      const res = await fetch(apiUrl(`/api/v1/kpros/companies?${params}`), { headers: authHeaders() })
      const json = await res.json()
      if (json.status === 'success') {
        setCompanies(json.data || [])
        setTotal(json.total || 0)
        setTotalPages(json.totalPages || 1)
      } else {
        setError(json.message || '조회 실패')
      }
    } catch (e: any) {
      setError(e.message || '네트워크 오류')
    } finally {
      setLoading(false)
    }
  }, [page, searchTerm, typeFilter])

  useEffect(() => { fetchCompanies() }, [fetchCompanies])

  const handleSave = async () => {
    if (!form.company_nm.trim()) {
      setError('거래처명은 필수입니다')
      return
    }
    setSaving(true)
    setError('')
    try {
      const url = editingId
        ? apiUrl(`/api/v1/kpros/companies/${editingId}`)
        : apiUrl('/api/v1/kpros/companies')
      const method = editingId ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: authJsonHeaders(),
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (json.status === 'success') {
        setShowModal(false)
        setEditingId(null)
        setForm(EMPTY_FORM)
        fetchCompanies()
      } else {
        setError(json.message || '저장 실패')
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`"${name}" 거래처를 비활성화하시겠습니까?`)) return
    try {
      const res = await fetch(apiUrl(`/api/v1/kpros/companies/${id}`), {
        method: 'DELETE',
        headers: authHeaders(),
      })
      const json = await res.json()
      if (json.status === 'success') fetchCompanies()
      else setError(json.message)
    } catch (e: any) {
      setError(e.message)
    }
  }

  const handleSyncKpros = async () => {
    setSyncing(true)
    setError('')
    try {
      const res = await fetch(apiUrl('/api/v1/kpros/companies/sync-kpros'), {
        method: 'POST',
        headers: authHeaders(),
      })
      const json = await res.json()
      if (json.status === 'success') {
        fetchCompanies()
        alert(json.message || 'KPROS 동기화 완료')
      } else {
        setError(json.message)
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSyncing(false)
    }
  }

  const openEdit = (c: Company) => {
    setEditingId(c.id)
    setForm({
      company_cd: c.companyCd || '',
      company_nm: c.companyNm,
      ceo_nm: c.ceoNm || '',
      biz_no: c.bizNo || '',
      tel: c.tel || '',
      fax: c.fax || '',
      email: c.email || '',
      addr: c.addr || '',
      memo: c.memo || '',
      manager_nm: c.managerNm || '',
      manager_tel: c.managerTel || '',
      manager_email: c.managerEmail || '',
      company_type: c.companyType || '',
    })
    setShowModal(true)
  }

  const openCreate = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowModal(true)
  }

  const updateField = (field: keyof CompanyForm, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    fetchCompanies()
  }

  // 요약 통계
  const activeCount = companies.filter(c => c.isActive).length
  const emailCount = companies.filter(c => c.email).length
  const managerCount = companies.filter(c => c.managerNm).length

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">거래처 관리</h1>
          <p className="text-sm text-slate-500 mt-1">거래처 등록, 수정, 조회 및 KPROS 동기화</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSyncKpros}
            disabled={syncing}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            <svg className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            KPROS 동기화
          </button>
          <button
            onClick={openCreate}
            className="px-4 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            거래처 추가
          </button>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-gradient-to-br from-brand-50 to-blue-50 rounded-xl p-4 border border-brand-100">
          <div className="text-xs text-slate-500">전체 거래처</div>
          <div className="text-2xl font-bold text-brand-700">{total}</div>
        </div>
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-4 border border-green-100">
          <div className="text-xs text-slate-500">활성</div>
          <div className="text-2xl font-bold text-green-700">{activeCount}</div>
        </div>
        <div className="bg-gradient-to-br from-violet-50 to-purple-50 rounded-xl p-4 border border-violet-100">
          <div className="text-xs text-slate-500">이메일 보유</div>
          <div className="text-2xl font-bold text-violet-700">{emailCount}</div>
        </div>
        <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl p-4 border border-orange-100">
          <div className="text-xs text-slate-500">담당자 지정</div>
          <div className="text-2xl font-bold text-orange-700">{managerCount}</div>
        </div>
      </div>

      {/* 메인 카드 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm">
        {/* 검색 + 필터 */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 border-b border-slate-100">
          <form onSubmit={handleSearch} className="relative flex-1 max-w-md">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="거래처명, 담당자, 이메일 검색..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400"
            />
          </form>
          <select
            value={typeFilter}
            onChange={e => { setTypeFilter(e.target.value); setPage(1) }}
            className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400"
          >
            <option value="">전체 유형</option>
            <option value="customer">매출처</option>
            <option value="supplier">매입처</option>
            <option value="both">매입/매출</option>
          </select>
        </div>

        {/* 에러 */}
        {error && (
          <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        )}

        {/* 로딩 */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-[3px] border-brand-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-slate-500">거래처 조회 중...</span>
            </div>
          </div>
        )}

        {/* 테이블 */}
        {!loading && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">거래처명</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">유형</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">대표자</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">담당자</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">연락처</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">이메일</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-24">관리</th>
                </tr>
              </thead>
              <tbody>
                {companies.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-16">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                          <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                        </div>
                        <div className="text-sm text-slate-500">등록된 거래처가 없습니다</div>
                        <button onClick={openCreate} className="text-sm text-brand-600 hover:text-brand-700 font-medium">
                          + 첫 번째 거래처 등록하기
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  companies.map(c => (
                    <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{c.companyNm}</div>
                        {c.companyCd && <div className="text-xs text-slate-400 mt-0.5">{c.companyCd}</div>}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        {c.companyType ? (
                          <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${
                            c.companyType === 'customer' ? 'bg-blue-50 text-blue-700' :
                            c.companyType === 'supplier' ? 'bg-orange-50 text-orange-700' :
                            'bg-purple-50 text-purple-700'
                          }`}>{TYPE_LABELS[c.companyType] || c.companyType}</span>
                        ) : <span className="text-slate-300">-</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{c.ceoNm || '-'}</td>
                      <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{c.managerNm || '-'}</td>
                      <td className="px-4 py-3 text-slate-500 hidden lg:table-cell text-xs">{c.tel || c.managerTel || '-'}</td>
                      <td className="px-4 py-3 text-slate-500 hidden lg:table-cell text-xs">{c.email || c.managerEmail || '-'}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(c)}
                            className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                            title="수정"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDelete(c.id, c.companyNm)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="비활성화"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* 페이지네이션 */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <div className="text-xs text-slate-400">
              전체 {total}건 / {page} of {totalPages} 페이지
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                이전
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                다음
              </button>
            </div>
          </div>
        )}

        {/* 하단 건수 */}
        {!loading && companies.length > 0 && totalPages <= 1 && (
          <div className="px-4 py-3 border-t border-slate-100 text-xs text-slate-400">
            전체: {total}건
          </div>
        )}
      </div>

      {/* 등록/수정 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">
                {editingId ? '거래처 수정' : '거래처 등록'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Row 1: 거래처명 + 코드 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">거래처명 <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={form.company_nm}
                    onChange={e => updateField('company_nm', e.target.value)}
                    placeholder="거래처명 입력"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">거래처코드</label>
                  <input
                    type="text"
                    value={form.company_cd}
                    onChange={e => updateField('company_cd', e.target.value)}
                    placeholder="코드 (선택)"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400"
                  />
                </div>
              </div>

              {/* Row 2: 대표자 + 사업자번호 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">대표자</label>
                  <input
                    type="text"
                    value={form.ceo_nm}
                    onChange={e => updateField('ceo_nm', e.target.value)}
                    placeholder="대표자명"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">사업자번호</label>
                  <input
                    type="text"
                    value={form.biz_no}
                    onChange={e => updateField('biz_no', e.target.value)}
                    placeholder="000-00-00000"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400"
                  />
                </div>
              </div>

              {/* Row 3: 전화 + 팩스 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">전화</label>
                  <input
                    type="text"
                    value={form.tel}
                    onChange={e => updateField('tel', e.target.value)}
                    placeholder="02-0000-0000"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">팩스</label>
                  <input
                    type="text"
                    value={form.fax}
                    onChange={e => updateField('fax', e.target.value)}
                    placeholder="02-0000-0000"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400"
                  />
                </div>
              </div>

              {/* Row 4: 이메일 + 유형 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">이메일</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => updateField('email', e.target.value)}
                    placeholder="example@company.com"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">거래 유형</label>
                  <select
                    value={form.company_type}
                    onChange={e => updateField('company_type', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400"
                  >
                    <option value="">미지정</option>
                    <option value="customer">매출처</option>
                    <option value="supplier">매입처</option>
                    <option value="both">매입/매출</option>
                  </select>
                </div>
              </div>

              {/* Row 5: 주소 */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">주소</label>
                <input
                  type="text"
                  value={form.addr}
                  onChange={e => updateField('addr', e.target.value)}
                  placeholder="주소 입력"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400"
                />
              </div>

              {/* 구분선 */}
              <div className="border-t border-slate-100 pt-4">
                <div className="text-xs font-medium text-slate-500 mb-3">담당자 정보</div>
              </div>

              {/* Row 6: 담당자명 + 담당자전화 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">담당자명</label>
                  <input
                    type="text"
                    value={form.manager_nm}
                    onChange={e => updateField('manager_nm', e.target.value)}
                    placeholder="담당자 이름"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">담당자 전화</label>
                  <input
                    type="text"
                    value={form.manager_tel}
                    onChange={e => updateField('manager_tel', e.target.value)}
                    placeholder="010-0000-0000"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400"
                  />
                </div>
              </div>

              {/* Row 7: 담당자 이메일 */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">담당자 이메일</label>
                <input
                  type="email"
                  value={form.manager_email}
                  onChange={e => updateField('manager_email', e.target.value)}
                  placeholder="manager@company.com"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400"
                />
              </div>

              {/* Row 8: 메모 */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">메모</label>
                <textarea
                  value={form.memo}
                  onChange={e => updateField('memo', e.target.value)}
                  placeholder="비고 또는 메모..."
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 resize-none"
                />
              </div>
            </div>

            {/* 모달 하단 버튼 */}
            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {editingId ? '수정' : '등록'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
