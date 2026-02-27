'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { apiUrl, authHeaders, authJsonHeaders } from '@/lib/api'
import { setCache, getCache } from '@/lib/cache'

// -- 타입 정의 --
interface Product {
  id: number
  prodCd: string | null
  prodDes: string
  prodDes2: string | null
  unit: string | null
  sellPrice: number
  costPrice: number
  classCd: string | null
  classDes: string | null
  brand: string | null
  manufacturer: string | null
  source: string
  kprosProductIdx: number | null
  isActive: boolean
  memo: string | null
  createdAt: string
  updatedAt: string
}

interface ProductForm {
  prod_cd: string
  prod_des: string
  prod_des2: string
  unit: string
  sell_price: number
  cost_price: number
  class_cd: string
  class_des: string
  brand: string
  manufacturer: string
  memo: string
}

const EMPTY_FORM: ProductForm = {
  prod_cd: '', prod_des: '', prod_des2: '', unit: '',
  sell_price: 0, cost_price: 0, class_cd: '', class_des: '',
  brand: '', manufacturer: '', memo: '',
}

// 소스 라벨 / 컬러
const SOURCE_LABELS: Record<string, string> = {
  ecount: '이카운트', kpros: 'KPROS', manual: '직접등록',
}
const SOURCE_COLORS: Record<string, string> = {
  ecount: 'bg-emerald-50 text-emerald-700',
  kpros: 'bg-cyan-50 text-cyan-700',
  manual: 'bg-slate-100 text-slate-600',
}

// -- 탭 정의 --
type TabKey = 'all' | 'active' | 'ecount' | 'kpros' | 'manual'
const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'all', label: '전체', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
  { key: 'active', label: '활성', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
  { key: 'ecount', label: '이카운트', icon: 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z' },
  { key: 'kpros', label: 'KPROS', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
  { key: 'manual', label: '직접등록', icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' },
]

export default function ProductsPage() {
  // -- 데이터 상태 --
  const [products, setProducts] = useState<Product[]>([])
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // -- 필터/검색 --
  const [activeTab, setActiveTab] = useState<TabKey>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [classFilter, setClassFilter] = useState('')

  // -- 모달/패널 --
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)

  // -- 액션 --
  const [syncing, setSyncing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [syncMsg, setSyncMsg] = useState<{ type: 'success' | 'warning' | 'info'; text: string } | null>(null)
  const [showSyncMenu, setShowSyncMenu] = useState(false)

  // -- 캐시 상태 --
  const [usingCache, setUsingCache] = useState(false)
  const [cacheAge, setCacheAge] = useState('')

  // -- 탭별 카운트 (전체 데이터 기반) --
  const tabCounts = useMemo(() => {
    const all = allProducts
    return {
      all: all.length,
      active: all.filter(p => p.isActive).length,
      ecount: all.filter(p => p.source === 'ecount').length,
      kpros: all.filter(p => p.source === 'kpros').length,
      manual: all.filter(p => p.source === 'manual').length,
    }
  }, [allProducts])

  // -- 분류 목록 추출 (필터 드롭다운용) --
  const classList = useMemo(() => {
    const set = new Set<string>()
    allProducts.forEach(p => { if (p.classDes) set.add(p.classDes) })
    return Array.from(set).sort()
  }, [allProducts])

  // -- 전체 데이터 로드 (탭 카운트용) --
  const fetchAllProducts = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/v1/products?limit=9999&active=false'), { headers: authHeaders() })
      const json = await res.json()
      if (json.status === 'success') {
        const data = json.data || []
        setAllProducts(data)
        setUsingCache(false)
        setCacheAge('')
        // 캐시 저장
        setCache('cache:products', data)
      }
    } catch {
      // API 실패 시 캐시에서 복구
      const cached = getCache<Product[]>('cache:products')
      if (cached) {
        setAllProducts(cached.data)
        setUsingCache(true)
        setCacheAge(cached.age)
      }
    }
  }, [])

  // -- 페이지 데이터 로드 --
  const fetchProducts = useCallback(async () => {
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
      if (activeTab === 'ecount' || activeTab === 'kpros' || activeTab === 'manual') {
        params.set('source', activeTab)
      }
      if (classFilter) {
        params.set('class', classFilter)
      }

      const res = await fetch(apiUrl(`/api/v1/products?${params}`), { headers: authHeaders() })
      const json = await res.json()
      if (json.status === 'success') {
        const data = json.data as Product[] || []
        setProducts(data)
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
  }, [page, searchTerm, activeTab, classFilter])

  useEffect(() => { fetchProducts() }, [fetchProducts])
  useEffect(() => { fetchAllProducts() }, [fetchAllProducts])

  // -- 동기화 드롭다운 외부 클릭 닫기 --
  useEffect(() => {
    if (!showSyncMenu) return
    const handleClick = () => setShowSyncMenu(false)
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [showSyncMenu])

  // -- 핸들러 --
  const handleSave = async () => {
    if (!form.prod_des.trim()) { setError('품목명은 필수입니다'); return }
    setSaving(true)
    setError('')
    try {
      const url = editingId
        ? apiUrl(`/api/v1/products/${editingId}`)
        : apiUrl('/api/v1/products')
      const method = editingId ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: authJsonHeaders(), body: JSON.stringify(form) })
      const json = await res.json()
      if (json.status === 'success') {
        setShowModal(false)
        setEditingId(null)
        setForm(EMPTY_FORM)
        fetchProducts()
        fetchAllProducts()
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
    if (!confirm(`"${name}" 품목을 비활성화하시겠습니까?`)) return
    try {
      const res = await fetch(apiUrl(`/api/v1/products/${id}`), { method: 'DELETE', headers: authHeaders() })
      const json = await res.json()
      if (json.status === 'success') { fetchProducts(); fetchAllProducts(); setSelectedProduct(null) }
      else setError(json.message)
    } catch (e: any) { setError(e.message) }
  }

  const handleSync = async (type: 'ecount' | 'kpros') => {
    setSyncing(true)
    setError('')
    setShowSyncMenu(false)
    try {
      const res = await fetch(apiUrl(`/api/v1/products/sync-${type}`), { method: 'POST', headers: authHeaders() })
      const json = await res.json()
      if (json.status === 'success') {
        fetchProducts()
        fetchAllProducts()  // 캐시도 자동 갱신됨
        setUsingCache(false)
        setCacheAge('')
        setSyncMsg({ type: 'success', text: json.message || `${type === 'ecount' ? '이카운트' : 'KPROS'} 동기화 완료` })
        setTimeout(() => setSyncMsg(null), 5000)
      } else { setError(json.message) }
    } catch (e: any) { setError(e.message) }
    finally { setSyncing(false) }
  }

  const handleExportCSV = async () => {
    setExporting(true)
    try {
      const res = await fetch(apiUrl('/api/v1/products?limit=9999&active=false'), { headers: authHeaders() })
      const json = await res.json()
      if (json.status !== 'success' || !json.data?.length) { setError('내보낼 데이터가 없습니다'); return }
      const allData = json.data as Product[]
      const BOM = '\uFEFF'
      const headers = ['품목코드','품목명','품목명2','단위','판매가','원가','분류코드','분류명','브랜드','제조사','소스','상태','메모']
      const rows = allData.map(p => [
        p.prodCd || '', p.prodDes, p.prodDes2 || '', p.unit || '',
        String(p.sellPrice || 0), String(p.costPrice || 0),
        p.classCd || '', p.classDes || '', p.brand || '', p.manufacturer || '',
        SOURCE_LABELS[p.source] || p.source,
        p.isActive ? '활성' : '비활성',
        (p.memo || '').replace(/"/g, '""'),
      ])
      const csv = BOM + [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `품목목록_${new Date().toISOString().split('T')[0]}.csv`
      link.click()
      URL.revokeObjectURL(url)
    } catch (e: any) { setError(e.message || 'CSV 내보내기 실패') }
    finally { setExporting(false) }
  }

  const openEdit = (p: Product) => {
    setEditingId(p.id)
    setForm({
      prod_cd: p.prodCd || '', prod_des: p.prodDes, prod_des2: p.prodDes2 || '',
      unit: p.unit || '', sell_price: p.sellPrice || 0, cost_price: p.costPrice || 0,
      class_cd: p.classCd || '', class_des: p.classDes || '',
      brand: p.brand || '', manufacturer: p.manufacturer || '', memo: p.memo || '',
    })
    setShowModal(true)
  }

  const openCreate = () => { setEditingId(null); setForm(EMPTY_FORM); setShowModal(true) }
  const updateField = (field: keyof ProductForm, value: string | number) => setForm(prev => ({ ...prev, [field]: value }))
  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); setPage(1) }

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab)
    setPage(1)
    setClassFilter('')
    setSelectedProduct(null)
  }

  // -- 인라인 컴포넌트: 입력 필드 --
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
      {/* -- 메인 영역 -- */}
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${selectedProduct ? 'mr-0' : ''}`}>
        {/* 헤더 */}
        <div className="flex-shrink-0 px-6 pt-6 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">품목 관리</h1>
              <p className="text-sm text-slate-500 mt-1">이카운트 ERP / KPROS 품목 통합 관리</p>
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
              {/* 동기화 드롭다운 */}
              <div className="relative">
                <button
                  onClick={e => { e.stopPropagation(); setShowSyncMenu(!showSyncMenu) }}
                  disabled={syncing}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  <svg className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  동기화
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showSyncMenu && (
                  <div className="absolute right-0 mt-1 w-48 bg-white rounded-xl border border-slate-200 shadow-lg z-20 py-1">
                    <button
                      onClick={() => handleSync('ecount')}
                      className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                    >
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      이카운트 동기화
                    </button>
                    <button
                      onClick={() => handleSync('kpros')}
                      className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                    >
                      <span className="w-2 h-2 rounded-full bg-cyan-500" />
                      KPROS 동기화
                    </button>
                  </div>
                )}
              </div>
              <button
                onClick={openCreate}
                className="px-4 py-2 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                품목 추가
              </button>
            </div>
          </div>

          {/* 캐시 데이터 사용 중 배너 */}
          {usingCache && (
            <div className="mt-4 p-3 rounded-xl text-sm bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                </svg>
                <span>오프라인 캐시 데이터를 표시 중 ({cacheAge} 저장)</span>
              </div>
              <button
                onClick={() => { fetchAllProducts(); fetchProducts() }}
                className="px-3 py-1 rounded-lg bg-amber-100 text-amber-800 text-xs font-medium hover:bg-amber-200 transition-colors"
              >
                새로고침
              </button>
            </div>
          )}

          {/* 동기화 결과 배너 */}
          {syncMsg && (
            <div className={`mt-4 p-3 rounded-xl text-sm flex items-center justify-between ${
              syncMsg.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700'
              : syncMsg.type === 'warning' ? 'bg-orange-50 border border-orange-200 text-orange-700'
              : 'bg-blue-50 border border-blue-200 text-blue-700'
            }`}>
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {syncMsg.type === 'success'
                    ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />}
                </svg>
                <span>{syncMsg.text}</span>
              </div>
              <button onClick={() => setSyncMsg(null)} className="opacity-60 hover:opacity-100 ml-2">
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
                placeholder="품목명, 품목코드, 분류명 검색..."
                value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); setPage(1) }}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400"
              />
            </form>
            <div className="flex items-center gap-2">
              {classList.length > 0 && (
                <select
                  value={classFilter}
                  onChange={e => { setClassFilter(e.target.value); setPage(1) }}
                  className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                >
                  <option value="">분류 전체</option>
                  {classList.map(cls => (
                    <option key={cls} value={cls}>{cls}</option>
                  ))}
                </select>
              )}
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
                <span className="text-sm text-slate-500">품목 조회 중...</span>
              </div>
            </div>
          )}

          {/* 테이블 */}
          {!loading && (
            <div className="flex-1 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white z-10">
                  <tr className="border-b border-slate-100">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">품목코드</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">품목명</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">단위</th>
                    <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">판매가</th>
                    <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">원가</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">분류</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">소스</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell w-16">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {products.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-16">
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                            <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                            </svg>
                          </div>
                          <div className="text-sm text-slate-500">조건에 맞는 품목이 없습니다</div>
                          <button onClick={openCreate} className="text-sm text-brand-600 hover:text-brand-700 font-medium">
                            + 품목 등록하기
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    products.map(p => {
                      const isSelected = selectedProduct?.id === p.id
                      return (
                        <tr
                          key={p.id}
                          onClick={() => setSelectedProduct(isSelected ? null : p)}
                          className={`border-b border-slate-50 cursor-pointer transition-colors ${
                            isSelected ? 'bg-brand-50/50' : 'hover:bg-slate-50/50'
                          }`}
                        >
                          <td className="px-4 py-3">
                            <span className="text-xs text-slate-500 font-mono">{p.prodCd || <span className="text-slate-300">-</span>}</span>
                          </td>
                          <td className="px-3 py-3">
                            <div className="font-medium text-slate-800">{p.prodDes}</div>
                            {p.prodDes2 && <div className="text-xs text-slate-400 mt-0.5">{p.prodDes2}</div>}
                          </td>
                          <td className="px-3 py-3 text-slate-600 hidden sm:table-cell">{p.unit || <span className="text-slate-300">-</span>}</td>
                          <td className="px-3 py-3 text-right text-slate-700 hidden md:table-cell">
                            {p.sellPrice ? p.sellPrice.toLocaleString() : <span className="text-slate-300">-</span>}
                          </td>
                          <td className="px-3 py-3 text-right text-slate-500 hidden md:table-cell">
                            {p.costPrice ? p.costPrice.toLocaleString() : <span className="text-slate-300">-</span>}
                          </td>
                          <td className="px-3 py-3 hidden lg:table-cell">
                            {p.classDes ? (
                              <span className="text-xs text-slate-600">{p.classDes}</span>
                            ) : <span className="text-slate-300 text-xs">-</span>}
                          </td>
                          <td className="px-3 py-3 hidden lg:table-cell">
                            <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium ${SOURCE_COLORS[p.source] || 'bg-slate-100 text-slate-600'}`}>
                              {SOURCE_LABELS[p.source] || p.source}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center hidden lg:table-cell">
                            {p.isActive ? (
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

      {/* -- 상세 사이드 패널 -- */}
      {selectedProduct && (
        <div className="w-[380px] flex-shrink-0 border-l border-slate-200 bg-white overflow-y-auto">
          <DetailPanel
            product={selectedProduct}
            onClose={() => setSelectedProduct(null)}
            onEdit={openEdit}
            onDelete={handleDelete}
          />
        </div>
      )}

      {/* -- 등록/수정 모달 -- */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* 모달 헤더 */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">
                {editingId ? '품목 수정' : '품목 등록'}
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
                <InputField label="품목명" required type="text" value={form.prod_des}
                  onChange={e => updateField('prod_des', (e.target as HTMLInputElement).value)} placeholder="품목명 입력" />
                <InputField label="품목코드" type="text" value={form.prod_cd}
                  onChange={e => updateField('prod_cd', (e.target as HTMLInputElement).value)} placeholder="코드 (선택)" />
              </div>
              <InputField label="품목명2 (영문/별칭)" type="text" value={form.prod_des2}
                onChange={e => updateField('prod_des2', (e.target as HTMLInputElement).value)} placeholder="영문명 또는 별칭" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <InputField label="단위" type="text" value={form.unit}
                  onChange={e => updateField('unit', (e.target as HTMLInputElement).value)} placeholder="EA, KG, M 등" />
                <InputField label="판매가" type="number" value={form.sell_price}
                  onChange={e => updateField('sell_price', Number((e.target as HTMLInputElement).value))} placeholder="0" />
                <InputField label="원가" type="number" value={form.cost_price}
                  onChange={e => updateField('cost_price', Number((e.target as HTMLInputElement).value))} placeholder="0" />
              </div>

              {/* 분류 정보 */}
              <div className="border-t border-slate-100 pt-4">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">분류 정보</div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InputField label="분류코드" type="text" value={form.class_cd}
                  onChange={e => updateField('class_cd', (e.target as HTMLInputElement).value)} placeholder="분류코드" />
                <InputField label="분류명" type="text" value={form.class_des}
                  onChange={e => updateField('class_des', (e.target as HTMLInputElement).value)} placeholder="분류명" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InputField label="브랜드" type="text" value={form.brand}
                  onChange={e => updateField('brand', (e.target as HTMLInputElement).value)} placeholder="브랜드명" />
                <InputField label="제조사" type="text" value={form.manufacturer}
                  onChange={e => updateField('manufacturer', (e.target as HTMLInputElement).value)} placeholder="제조사명" />
              </div>

              {/* 메모 */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">메모</label>
                <textarea value={form.memo} onChange={e => updateField('memo', e.target.value)}
                  placeholder="비고 또는 메모..." rows={3}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 resize-none" />
              </div>
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

// -- 상세 사이드 패널 컴포넌트 --
function DetailPanel({ product: p, onClose, onEdit, onDelete }: {
  product: Product
  onClose: () => void
  onEdit: (p: Product) => void
  onDelete: (id: number, name: string) => void
}) {
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
            <h3 className="text-lg font-bold text-slate-900 truncate">{p.prodDes}</h3>
            <div className="flex items-center gap-2 mt-1.5">
              <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium ${SOURCE_COLORS[p.source] || 'bg-slate-100 text-slate-600'}`}>
                {SOURCE_LABELS[p.source] || p.source}
              </span>
              {p.isActive ? (
                <span className="inline-flex items-center gap-1 text-xs text-green-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />활성
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />비활성
                </span>
              )}
            </div>
            {p.prodDes2 && (
              <p className="text-xs text-slate-400 mt-1">{p.prodDes2}</p>
            )}
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
            <InfoRow label="품목코드" value={p.prodCd} />
            <InfoRow label="단위" value={p.unit} />
            <InfoRow label="분류코드" value={p.classCd} />
            <InfoRow label="분류명" value={p.classDes} />
          </div>
        </div>

        {/* 가격 정보 */}
        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">가격 정보</div>
          <div className="bg-slate-50/50 rounded-xl p-3 divide-y divide-slate-100">
            <div className="flex items-start py-2">
              <span className="text-xs text-slate-400 w-20 flex-shrink-0 pt-0.5">판매가</span>
              <span className="text-sm text-slate-700 font-medium">{p.sellPrice ? `${p.sellPrice.toLocaleString()}원` : '-'}</span>
            </div>
            <div className="flex items-start py-2">
              <span className="text-xs text-slate-400 w-20 flex-shrink-0 pt-0.5">원가</span>
              <span className="text-sm text-slate-700 font-medium">{p.costPrice ? `${p.costPrice.toLocaleString()}원` : '-'}</span>
            </div>
            {p.sellPrice > 0 && p.costPrice > 0 && (
              <div className="flex items-start py-2">
                <span className="text-xs text-slate-400 w-20 flex-shrink-0 pt-0.5">마진</span>
                <span className="text-sm text-emerald-600 font-medium">
                  {((p.sellPrice - p.costPrice) / p.sellPrice * 100).toFixed(1)}%
                  ({(p.sellPrice - p.costPrice).toLocaleString()}원)
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 브랜드/제조사 */}
        {(p.brand || p.manufacturer) && (
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">브랜드 / 제조사</div>
            <div className="bg-slate-50/50 rounded-xl p-3 divide-y divide-slate-100">
              <InfoRow label="브랜드" value={p.brand} />
              <InfoRow label="제조사" value={p.manufacturer} />
            </div>
          </div>
        )}

        {/* 메모 */}
        {p.memo && (
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">메모</div>
            <div className="bg-slate-50/50 rounded-xl p-3">
              <p className="text-sm text-slate-600 whitespace-pre-wrap">{p.memo}</p>
            </div>
          </div>
        )}

        {/* 부가정보 */}
        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">부가정보</div>
          <div className="bg-slate-50/50 rounded-xl p-3 divide-y divide-slate-100">
            <InfoRow label="등록일" value={p.createdAt ? new Date(p.createdAt).toLocaleDateString('ko-KR') : null} />
            <InfoRow label="수정일" value={p.updatedAt ? new Date(p.updatedAt).toLocaleDateString('ko-KR') : null} />
            {p.kprosProductIdx && <InfoRow label="KPROS ID" value={String(p.kprosProductIdx)} />}
          </div>
        </div>
      </div>

      {/* 패널 하단 버튼 */}
      <div className="flex-shrink-0 px-5 py-4 border-t border-slate-100 flex gap-2">
        <button onClick={() => onEdit(p)}
          className="flex-1 px-4 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors flex items-center justify-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          수정
        </button>
        <button onClick={() => onDelete(p.id, p.prodDes)}
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
