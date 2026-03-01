'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { apiUrl, authHeaders, authJsonHeaders } from '@/lib/api'
import { setCache, getCache } from '@/lib/cache'

// ── 타입 정의 ──
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
  sync_ecount: boolean
}

const EMPTY_FORM: CompanyForm = {
  company_cd: '', company_nm: '', ceo_nm: '', biz_no: '',
  tel: '', fax: '', email: '', addr: '', memo: '',
  manager_nm: '', manager_tel: '', manager_email: '', company_type: '',
  sync_ecount: true,
}

const TYPE_LABELS: Record<string, string> = {
  customer: '매출처', supplier: '매입처', both: '매입/매출',
}

const TYPE_COLORS: Record<string, string> = {
  customer: 'bg-blue-50 text-blue-700 border-blue-200',
  supplier: 'bg-orange-50 text-orange-700 border-orange-200',
  both: 'bg-purple-50 text-purple-700 border-purple-200',
}

// 소스 판별 함수
function getSource(c: Company): 'kpros' | 'ecount' | 'manual' {
  if (c.kprosIdx) return 'kpros'
  if (c.companyCd && !c.kprosIdx) return 'ecount'
  return 'manual'
}

const SOURCE_LABELS: Record<string, string> = {
  kpros: 'KPROS', ecount: '이카운트', manual: '직접등록',
}
const SOURCE_COLORS: Record<string, string> = {
  kpros: 'bg-cyan-50 text-cyan-700',
  ecount: 'bg-emerald-50 text-emerald-700',
  manual: 'bg-slate-100 text-slate-600',
}

// ── 탭 정의 ──
type TabKey = 'all' | 'active' | 'customer' | 'supplier' | 'both'
const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'all', label: '전체', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
  { key: 'active', label: '활성', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
  { key: 'customer', label: '매출처', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' },
  { key: 'supplier', label: '매입처', icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z' },
  { key: 'both', label: '매입/매출', icon: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4' },
]

export default function KprosPage() {
  // ── 데이터 상태 ──
  const [companies, setCompanies] = useState<Company[]>([])
  const [allCompanies, setAllCompanies] = useState<Company[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // ── 필터/검색 ──
  const [activeTab, setActiveTab] = useState<TabKey>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')

  // ── 모달/패널 ──
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<CompanyForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null)

  // ── 액션 ──
  const [exporting, setExporting] = useState(false)
  const [ecountMsg, setEcountMsg] = useState<{ type: 'success' | 'warning' | 'info'; text: string } | null>(null)
  const [usingCache, setUsingCache] = useState(false)
  const [cacheAge, setCacheAge] = useState('')

  // ── 탭별 카운트 (전체 데이터 기반) ──
  const tabCounts = useMemo(() => {
    const all = allCompanies
    return {
      all: all.length,
      active: all.filter(c => c.isActive).length,
      customer: all.filter(c => c.companyType === 'customer').length,
      supplier: all.filter(c => c.companyType === 'supplier').length,
      both: all.filter(c => c.companyType === 'both').length,
    }
  }, [allCompanies])

  // ── 전체 데이터 로드 (탭 카운트용) ──
  const fetchAllCompanies = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/v1/kpros/companies?limit=9999&active=false'), { headers: authHeaders() })
      const json = await res.json()
      if (json.status === 'success') {
        setAllCompanies(json.data || [])
        setCache('cache:kpros:companies', json.data || [])
        setUsingCache(false)
      }
    } catch {
      // API 실패 시 캐시 fallback
      const cached = getCache<Company[]>('cache:kpros:companies')
      if (cached) {
        setAllCompanies(cached.data)
        setUsingCache(true)
        setCacheAge(cached.age)
      }
    }
  }, [])

  // ── 페이지 데이터 로드 ──
  const fetchCompanies = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('limit', '50')
      if (searchTerm) params.set('search', searchTerm)

      // 탭별 필터
      if (activeTab === 'active') {
        params.set('active', 'true')
      } else {
        params.set('active', 'false')
      }
      if (activeTab === 'customer' || activeTab === 'supplier' || activeTab === 'both') {
        params.set('type', activeTab)
      } else if (typeFilter) {
        params.set('type', typeFilter)
      }

      const res = await fetch(apiUrl(`/api/v1/kpros/companies?${params}`), { headers: authHeaders() })
      const json = await res.json()
      if (json.status === 'success') {
        let data = json.data as Company[] || []
        // 클라이언트 소스 필터
        if (sourceFilter) {
          data = data.filter(c => getSource(c) === sourceFilter)
        }
        setCompanies(data)
        setTotal(sourceFilter ? data.length : (json.total || 0))
        setTotalPages(sourceFilter ? 1 : (json.totalPages || 1))
      } else {
        setError(json.message || '조회 실패')
      }
    } catch (e: any) {
      setError(e.message || '네트워크 오류')
    } finally {
      setLoading(false)
    }
  }, [page, searchTerm, activeTab, typeFilter, sourceFilter])

  useEffect(() => { fetchCompanies() }, [fetchCompanies])
  useEffect(() => { fetchAllCompanies() }, [fetchAllCompanies])

  // ── 핸들러 ──
  const handleSave = async () => {
    if (!form.company_nm.trim()) { setError('거래처명은 필수입니다'); return }
    setSaving(true)
    setError('')
    try {
      const url = editingId
        ? apiUrl(`/api/v1/kpros/companies/${editingId}`)
        : apiUrl('/api/v1/kpros/companies')
      const method = editingId ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: authJsonHeaders(), body: JSON.stringify(form) })
      const json = await res.json()
      if (json.status === 'success') {
        setShowModal(false)
        setEditingId(null)
        setForm(EMPTY_FORM)
        fetchCompanies()
        fetchAllCompanies()
        // 이카운트 연동 결과
        if (!editingId && json.ecount) {
          const ec = json.ecount
          if (ec.success) setEcountMsg({ type: 'success', text: ec.message })
          else if (!ec.skipped) setEcountMsg({ type: 'warning', text: ec.message })
          else if (ec.message) setEcountMsg({ type: 'info', text: ec.message })
          setTimeout(() => setEcountMsg(null), 5000)
        }
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
      const res = await fetch(apiUrl(`/api/v1/kpros/companies/${id}`), { method: 'DELETE', headers: authHeaders() })
      const json = await res.json()
      if (json.status === 'success') { fetchCompanies(); fetchAllCompanies(); setSelectedCompany(null) }
      else setError(json.message)
    } catch (e: any) { setError(e.message) }
  }

  const handleExportCSV = async () => {
    setExporting(true)
    try {
      const res = await fetch(apiUrl('/api/v1/kpros/companies?limit=9999&active=false'), { headers: authHeaders() })
      const json = await res.json()
      if (json.status !== 'success' || !json.data?.length) { setError('내보낼 데이터가 없습니다'); return }
      const allData = json.data as Company[]
      const BOM = '\uFEFF'
      const headers = ['거래처코드','거래처명','대표자','사업자번호','전화','팩스','이메일','주소','담당자명','담당자전화','담당자이메일','거래유형','소스','메모']
      const rows = allData.map(c => [
        c.companyCd||'', c.companyNm, c.ceoNm||'', c.bizNo||'',
        c.tel||'', c.fax||'', c.email||'', c.addr||'',
        c.managerNm||'', c.managerTel||'', c.managerEmail||'',
        TYPE_LABELS[c.companyType||'']||c.companyType||'',
        SOURCE_LABELS[getSource(c)],
        (c.memo||'').replace(/"/g, '""'),
      ])
      const csv = BOM + [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `거래처목록_${new Date().toISOString().split('T')[0]}.csv`
      link.click()
      URL.revokeObjectURL(url)
    } catch (e: any) { setError(e.message || 'CSV 내보내기 실패') }
    finally { setExporting(false) }
  }

  const openEdit = (c: Company) => {
    setEditingId(c.id)
    setForm({
      company_cd: c.companyCd || '', company_nm: c.companyNm, ceo_nm: c.ceoNm || '',
      biz_no: c.bizNo || '', tel: c.tel || '', fax: c.fax || '',
      email: c.email || '', addr: c.addr || '', memo: c.memo || '',
      manager_nm: c.managerNm || '', manager_tel: c.managerTel || '',
      manager_email: c.managerEmail || '', company_type: c.companyType || '',
      sync_ecount: true,
    })
    setShowModal(true)
  }

  const openCreate = () => { setEditingId(null); setForm(EMPTY_FORM); setShowModal(true) }
  const updateField = (field: keyof CompanyForm, value: string | boolean) => setForm(prev => ({ ...prev, [field]: value }))
  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); setPage(1) }

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab)
    setPage(1)
    setTypeFilter('')
    setSelectedCompany(null)
  }

  // ── 인라인 컴포넌트: 입력 필드 ──
  const InputField = ({ label, required, ...props }: { label: string; required?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) => (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        {...props}
        className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400"
      />
    </div>
  )

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* ── 메인 영역 ── */}
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${selectedCompany ? 'mr-0' : ''}`}>
        {/* 헤더 */}
        <div className="flex-shrink-0 px-6 pt-6 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">거래처 관리</h1>
              <p className="text-sm text-slate-500 mt-1">거래처 통합 관리 (이카운트 ERP 연동)</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportCSV}
                disabled={exporting || total === 0}
                className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {exporting ? '내보내기...' : 'CSV'}
              </button>
              <button
                onClick={openCreate}
                className="px-4 py-2 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                거래처 추가
              </button>
            </div>
          </div>

          {/* 캐시 데이터 배너 */}
          {usingCache && (
            <div className="mt-4 p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-amber-700">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                </svg>
                <span>오프라인 캐시 데이터를 표시 중 ({cacheAge} 저장)</span>
              </div>
              <button onClick={() => { fetchCompanies(); fetchAllCompanies() }} className="text-xs font-medium text-amber-800 hover:text-amber-900 underline">새로고침</button>
            </div>
          )}

          {/* 이카운트 연동 결과 배너 */}
          {ecountMsg && (
            <div className={`mt-4 p-3 rounded-xl text-sm flex items-center justify-between ${
              ecountMsg.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700'
              : ecountMsg.type === 'warning' ? 'bg-orange-50 border border-orange-200 text-orange-700'
              : 'bg-blue-50 border border-blue-200 text-blue-700'
            }`}>
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {ecountMsg.type === 'success'
                    ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />}
                </svg>
                <span>{ecountMsg.text}</span>
              </div>
              <button onClick={() => setEcountMsg(null)} className="opacity-60 hover:opacity-100 ml-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* 탭 필터 */}
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {TABS.map(tab => {
              const isActive = activeTab === tab.key
              const cnt = tabCounts[tab.key]
              return (
                <button
                  key={tab.key}
                  onClick={() => handleTabChange(tab.key)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-brand-500 text-white shadow-sm'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
                  </svg>
                  {tab.label}
                  <span className={`text-xs px-1.5 py-0.5 rounded-md ${
                    isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                  }`}>{cnt}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* 메인 카드 */}
        <div className="flex-1 mx-6 mb-6 bg-white rounded-2xl border border-slate-200/80 shadow-sm flex flex-col min-h-0">
          {/* 검색 + 필터 바 */}
          <div className="flex-shrink-0 flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 border-b border-slate-100">
            <form onSubmit={handleSearch} className="relative flex-1 max-w-md">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="거래처명, 대표자, 사업자번호, 담당자, 이메일 검색..."
                value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); setPage(1) }}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400"
              />
            </form>
            <div className="flex items-center gap-2">
              {activeTab === 'all' && (
                <select
                  value={typeFilter}
                  onChange={e => { setTypeFilter(e.target.value); setPage(1) }}
                  className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                >
                  <option value="">유형 전체</option>
                  <option value="customer">매출처</option>
                  <option value="supplier">매입처</option>
                  <option value="both">매입/매출</option>
                </select>
              )}
              <select
                value={sourceFilter}
                onChange={e => { setSourceFilter(e.target.value); setPage(1) }}
                className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              >
                <option value="">소스 전체</option>
                <option value="kpros">KPROS</option>
                <option value="ecount">이카운트</option>
                <option value="manual">직접등록</option>
              </select>
            </div>
          </div>

          {/* 에러 */}
          {error && (
            <div className="flex-shrink-0 mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center justify-between">
              <span>{error}</span>
              <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* 로딩 */}
          {loading && (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-[3px] border-brand-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-slate-500">거래처 조회 중...</span>
              </div>
            </div>
          )}

          {/* 테이블 */}
          {!loading && (
            <div className="flex-1 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white z-10">
                  <tr className="border-b border-slate-100">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">거래처명</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">대표자</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">사업자번호</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">전화</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">유형</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">소스</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell w-16">상태</th>
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
                          <div className="text-sm text-slate-500">조건에 맞는 거래처가 없습니다</div>
                          <button onClick={openCreate} className="text-sm text-brand-600 hover:text-brand-700 font-medium">
                            + 거래처 등록하기
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    companies.map(c => {
                      const source = getSource(c)
                      const isSelected = selectedCompany?.id === c.id
                      return (
                        <tr
                          key={c.id}
                          onClick={() => setSelectedCompany(isSelected ? null : c)}
                          className={`border-b border-slate-50 cursor-pointer transition-colors ${
                            isSelected ? 'bg-brand-50/50' : 'hover:bg-slate-50/50'
                          }`}
                        >
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-800">{c.companyNm}</div>
                            {c.companyCd && <div className="text-xs text-slate-400 mt-0.5">{c.companyCd}</div>}
                          </td>
                          <td className="px-3 py-3 text-slate-600 hidden sm:table-cell">{c.ceoNm || <span className="text-slate-300">-</span>}</td>
                          <td className="px-3 py-3 text-slate-500 text-xs hidden md:table-cell">{c.bizNo || <span className="text-slate-300">-</span>}</td>
                          <td className="px-3 py-3 text-slate-500 text-xs hidden md:table-cell">{c.tel || c.managerTel || <span className="text-slate-300">-</span>}</td>
                          <td className="px-3 py-3 hidden lg:table-cell">
                            {c.companyType ? (
                              <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium border ${TYPE_COLORS[c.companyType] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                                {TYPE_LABELS[c.companyType] || c.companyType}
                              </span>
                            ) : <span className="text-slate-300 text-xs">-</span>}
                          </td>
                          <td className="px-3 py-3 hidden lg:table-cell">
                            <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium ${SOURCE_COLORS[source]}`}>
                              {SOURCE_LABELS[source]}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center hidden lg:table-cell">
                            {c.isActive ? (
                              <span className="inline-block w-2 h-2 rounded-full bg-green-500" title="활성" />
                            ) : (
                              <span className="inline-block w-2 h-2 rounded-full bg-slate-300" title="비활성" />
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* 페이지네이션 */}
          {!loading && (
            <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-t border-slate-100">
              <div className="text-xs text-slate-400">
                전체 {total}건{totalPages > 1 && ` / ${page} of ${totalPages} 페이지`}
              </div>
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >이전</button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >다음</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── 상세 사이드 패널 ── */}
      {selectedCompany && (
        <div className="w-[380px] flex-shrink-0 border-l border-slate-200 bg-white overflow-y-auto">
          <DetailPanel
            company={selectedCompany}
            onClose={() => setSelectedCompany(null)}
            onEdit={openEdit}
            onDelete={handleDelete}
          />
        </div>
      )}

      {/* ── 등록/수정 모달 ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* 모달 헤더 */}
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
              {/* 기본 정보 */}
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">기본 정보</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InputField label="거래처명" required type="text" value={form.company_nm}
                  onChange={e => updateField('company_nm', (e.target as HTMLInputElement).value)} placeholder="거래처명 입력" />
                <InputField label="거래처코드" type="text" value={form.company_cd}
                  onChange={e => updateField('company_cd', (e.target as HTMLInputElement).value)} placeholder="코드 (선택)" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InputField label="대표자" type="text" value={form.ceo_nm}
                  onChange={e => updateField('ceo_nm', (e.target as HTMLInputElement).value)} placeholder="대표자명" />
                <InputField label="사업자번호" type="text" value={form.biz_no}
                  onChange={e => updateField('biz_no', (e.target as HTMLInputElement).value)} placeholder="000-00-00000" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InputField label="전화" type="text" value={form.tel}
                  onChange={e => updateField('tel', (e.target as HTMLInputElement).value)} placeholder="02-0000-0000" />
                <InputField label="팩스" type="text" value={form.fax}
                  onChange={e => updateField('fax', (e.target as HTMLInputElement).value)} placeholder="02-0000-0000" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InputField label="이메일" type="email" value={form.email}
                  onChange={e => updateField('email', (e.target as HTMLInputElement).value)} placeholder="example@company.com" />
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">거래 유형</label>
                  <select value={form.company_type} onChange={e => updateField('company_type', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400">
                    <option value="">미지정</option>
                    <option value="customer">매출처</option>
                    <option value="supplier">매입처</option>
                    <option value="both">매입/매출</option>
                  </select>
                </div>
              </div>
              <InputField label="주소" type="text" value={form.addr}
                onChange={e => updateField('addr', (e.target as HTMLInputElement).value)} placeholder="주소 입력" />

              {/* 담당자 정보 */}
              <div className="border-t border-slate-100 pt-4">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">담당자 정보</div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InputField label="담당자명" type="text" value={form.manager_nm}
                  onChange={e => updateField('manager_nm', (e.target as HTMLInputElement).value)} placeholder="담당자 이름" />
                <InputField label="담당자 전화" type="text" value={form.manager_tel}
                  onChange={e => updateField('manager_tel', (e.target as HTMLInputElement).value)} placeholder="010-0000-0000" />
              </div>
              <InputField label="담당자 이메일" type="email" value={form.manager_email}
                onChange={e => updateField('manager_email', (e.target as HTMLInputElement).value)} placeholder="manager@company.com" />

              {/* 메모 */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">메모</label>
                <textarea value={form.memo} onChange={e => updateField('memo', e.target.value)}
                  placeholder="비고 또는 메모..." rows={3}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 resize-none" />
              </div>

              {/* 이카운트 ERP 연동 (신규 등록 시만) */}
              {!editingId && (
                <div className="border-t border-slate-100 pt-4">
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={form.sync_ecount}
                        onChange={e => updateField('sync_ecount', e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-brand-500 focus:ring-brand-500/20" />
                      <span className="text-sm font-medium text-slate-700">이카운트 ERP에도 등록</span>
                    </label>
                    {form.sync_ecount && !form.biz_no && (
                      <span className="text-xs text-orange-500">(사업자번호 입력 시 연동)</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 모달 하단 버튼 */}
            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3">
              <button onClick={() => setShowModal(false)}
                className="px-5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                취소
              </button>
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors disabled:opacity-50 flex items-center gap-2">
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

// ── 상세 사이드 패널 컴포넌트 ──
function DetailPanel({ company: c, onClose, onEdit, onDelete }: {
  company: Company
  onClose: () => void
  onEdit: (c: Company) => void
  onDelete: (id: number, name: string) => void
}) {
  const source = getSource(c)

  const InfoRow = ({ label, value }: { label: string; value: string | null | undefined }) => (
    <div className="flex items-start py-2">
      <span className="text-xs text-slate-400 w-20 flex-shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-slate-700 flex-1 break-all">{value || <span className="text-slate-300">-</span>}</span>
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      {/* 패널 헤더 */}
      <div className="flex-shrink-0 px-5 py-4 border-b border-slate-100">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-slate-900 truncate">{c.companyNm}</h3>
            <div className="flex items-center gap-2 mt-1.5">
              <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium ${SOURCE_COLORS[source]}`}>
                {SOURCE_LABELS[source]}
              </span>
              {c.companyType && (
                <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium border ${TYPE_COLORS[c.companyType]}`}>
                  {TYPE_LABELS[c.companyType]}
                </span>
              )}
              {c.isActive ? (
                <span className="inline-flex items-center gap-1 text-xs text-green-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />활성
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />비활성
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* 패널 내용 */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* 기본정보 */}
        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">기본정보</div>
          <div className="bg-slate-50/50 rounded-xl p-3 divide-y divide-slate-100">
            <InfoRow label="거래처코드" value={c.companyCd} />
            <InfoRow label="사업자번호" value={c.bizNo} />
            <InfoRow label="대표자" value={c.ceoNm} />
            <InfoRow label="전화" value={c.tel} />
            <InfoRow label="팩스" value={c.fax} />
            <InfoRow label="이메일" value={c.email} />
            <InfoRow label="주소" value={c.addr} />
          </div>
        </div>

        {/* 담당자 정보 */}
        {(c.managerNm || c.managerTel || c.managerEmail) && (
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">담당자 정보</div>
            <div className="bg-slate-50/50 rounded-xl p-3 divide-y divide-slate-100">
              <InfoRow label="담당자" value={c.managerNm} />
              <InfoRow label="전화" value={c.managerTel} />
              <InfoRow label="이메일" value={c.managerEmail} />
            </div>
          </div>
        )}

        {/* 메모 */}
        {c.memo && (
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">메모</div>
            <div className="bg-slate-50/50 rounded-xl p-3">
              <p className="text-sm text-slate-600 whitespace-pre-wrap">{c.memo}</p>
            </div>
          </div>
        )}

        {/* 부가정보 */}
        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">부가정보</div>
          <div className="bg-slate-50/50 rounded-xl p-3 divide-y divide-slate-100">
            <InfoRow label="등록일" value={c.createdAt ? new Date(c.createdAt).toLocaleDateString('ko-KR') : null} />
            <InfoRow label="수정일" value={c.updatedAt ? new Date(c.updatedAt).toLocaleDateString('ko-KR') : null} />
            {c.kprosIdx && <InfoRow label="KPROS ID" value={String(c.kprosIdx)} />}
          </div>
        </div>
      </div>

      {/* 패널 하단 버튼 */}
      <div className="flex-shrink-0 px-5 py-4 border-t border-slate-100 flex gap-2">
        <button onClick={() => onEdit(c)}
          className="flex-1 px-4 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors flex items-center justify-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          수정
        </button>
        <button onClick={() => onDelete(c.id, c.companyNm)}
          className="px-4 py-2.5 rounded-xl border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors flex items-center justify-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          비활성화
        </button>
      </div>
    </div>
  )
}
