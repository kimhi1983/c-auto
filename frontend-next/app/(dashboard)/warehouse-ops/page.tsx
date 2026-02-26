'use client'

import { useState, useEffect, useRef } from 'react'
import { apiUrl, authHeaders, authJsonHeaders } from '@/lib/api'

// ─── 타입 ───
interface WorkflowTask {
  id: number
  workflowType: string
  status: string
  statusLabel: string
  ioDate: string
  custCd: string | null
  custName: string | null
  itemsData: string
  items: any[]
  totalAmount: number
  erpSubmittedAt: string | null
  step2At: string | null
  step3At: string | null
  step4At: string | null
  step5At: string | null
  note: string | null
  documentCount: number
  createdAt: string
  updatedAt: string
}

interface WarehouseGroup {
  warehouseCd: string
  taskCount: number
  tasks: WorkflowTask[]
}

interface DocItem {
  id: number
  workflowId: number
  documentType: string
  fileName: string
  fileSize: number | null
  contentType: string | null
  dropboxPath: string | null
  note: string | null
  createdAt: string
}

// ─── 상수 ───
const SALES_STEPS = ['ERP_SUBMITTED', 'SHIPPING_ORDER', 'PICKING', 'SHIPPED', 'DELIVERED']
const PURCHASE_STEPS = ['ERP_SUBMITTED', 'RECEIVING_SCHEDULED', 'INSPECTING', 'RECEIVED', 'STOCKED']
const SALES_LABELS: Record<string, string> = {
  ERP_SUBMITTED: '판매입력완료',
  SHIPPING_ORDER: '출고지시',
  PICKING: '피킹/포장',
  SHIPPED: '출고완료',
  DELIVERED: '납품완료',
}
const PURCHASE_LABELS: Record<string, string> = {
  ERP_SUBMITTED: '구매입력완료',
  RECEIVING_SCHEDULED: '입고예정',
  INSPECTING: '입고검수',
  RECEIVED: '입고완료',
  STOCKED: '재고반영',
}

function getSteps(type: string) { return type === 'SALES' ? SALES_STEPS : PURCHASE_STEPS }
function getLabels(type: string) { return type === 'SALES' ? SALES_LABELS : PURCHASE_LABELS }

function formatDate(s: string | null) {
  if (!s) return '-'
  if (s.length === 8) return `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6, 8)}`
  return s.split('T')[0].replace(/-/g, '.')
}

function formatSize(bytes: number | null) {
  if (!bytes) return '-'
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function formatMoney(n: number) {
  return n.toLocaleString('ko-KR') + '원'
}

export default function WarehouseOpsPage() {
  const [warehouses, setWarehouses] = useState<WarehouseGroup[]>([])
  const [summary, setSummary] = useState({ totalTasks: 0, salesTasks: 0, purchaseTasks: 0 })
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<string>('ALL')
  const [selected, setSelected] = useState<WorkflowTask | null>(null)
  const [documents, setDocuments] = useState<DocItem[]>([])
  const [docsLoading, setDocsLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadNote, setUploadNote] = useState('')
  const [message, setMessage] = useState('')
  const [processing, setProcessing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 작업 목록 로드
  const loadTasks = async () => {
    setLoading(true)
    try {
      const q = typeFilter !== 'ALL' ? `?type=${typeFilter}` : ''
      const res = await fetch(apiUrl(`/api/v1/warehouse-ops${q}`), { headers: authHeaders() })
      const json = await res.json()
      if (json.status === 'success') {
        setWarehouses(json.data.warehouses)
        setSummary(json.data.summary)
      }
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadTasks() }, [typeFilter])

  // 문서 목록 로드
  const loadDocuments = async (workflowId: number) => {
    setDocsLoading(true)
    try {
      const res = await fetch(apiUrl(`/api/v1/warehouse-ops/${workflowId}/documents`), { headers: authHeaders() })
      const json = await res.json()
      if (json.status === 'success') setDocuments(json.data)
    } catch { /* ignore */ } finally {
      setDocsLoading(false)
    }
  }

  // 상세 보기
  const openDetail = (task: WorkflowTask) => {
    setSelected(task)
    setMessage('')
    loadDocuments(task.id)
  }

  // 파일 업로드
  const handleUpload = async (file: File) => {
    if (!selected) return
    if (file.size > 10 * 1024 * 1024) {
      setMessage('파일 크기는 10MB 이하만 가능합니다')
      return
    }
    setUploading(true)
    setMessage('')
    try {
      const arrayBuffer = await file.arrayBuffer()
      const bytes = new Uint8Array(arrayBuffer)
      // 청크 방식 base64 변환
      let binary = ''
      const CHUNK = 8192
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
      }
      const base64 = btoa(binary)

      const res = await fetch(apiUrl(`/api/v1/warehouse-ops/${selected.id}/documents`), {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify({
          fileName: file.name,
          contentBase64: base64,
          contentType: file.type || 'application/octet-stream',
          note: uploadNote,
        }),
      })
      const json = await res.json()
      if (json.status === 'success') {
        setMessage('성적서 업로드 완료')
        setUploadNote('')
        if (fileInputRef.current) fileInputRef.current.value = ''
        loadDocuments(selected.id)
        loadTasks()
      } else {
        setMessage(json.message || '업로드 실패')
      }
    } catch {
      setMessage('업로드 중 오류 발생')
    } finally {
      setUploading(false)
    }
  }

  // 문서 삭제
  const handleDeleteDoc = async (docId: number) => {
    if (!confirm('이 문서를 삭제하시겠습니까?')) return
    try {
      const res = await fetch(apiUrl(`/api/v1/warehouse-ops/documents/${docId}`), {
        method: 'DELETE',
        headers: authHeaders(),
      })
      const json = await res.json()
      if (json.status === 'success' && selected) {
        loadDocuments(selected.id)
        loadTasks()
      }
    } catch { /* ignore */ }
  }

  // 문서 다운로드 (Dropbox 임시 링크)
  const handleDownload = async (dropboxPath: string) => {
    try {
      const res = await fetch(apiUrl('/api/v1/dropbox/link'), {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify({ path: dropboxPath }),
      })
      const json = await res.json()
      if (json.status === 'success' && json.link) {
        window.open(json.link, '_blank')
      } else {
        setMessage('다운로드 링크 생성 실패')
      }
    } catch {
      setMessage('다운로드 오류')
    }
  }

  // 상태 진행
  const handleProcess = async (action: 'next' | 'prev') => {
    if (!selected) return
    setProcessing(true)
    try {
      const res = await fetch(apiUrl(`/api/v1/warehouse-ops/${selected.id}/process`), {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify({ action }),
      })
      const json = await res.json()
      if (json.status === 'success') {
        setMessage(json.message)
        setSelected(null)
        loadTasks()
      } else {
        setMessage(json.message || '처리 실패')
      }
    } catch {
      setMessage('처리 중 오류 발생')
    } finally {
      setProcessing(false)
    }
  }

  // ─── 상세 뷰 ───
  if (selected) {
    const steps = getSteps(selected.workflowType)
    const labels = getLabels(selected.workflowType)
    const currentIdx = steps.indexOf(selected.status)
    const isSales = selected.workflowType === 'SALES'

    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        {/* 헤더 */}
        <div className="mb-6">
          <button
            onClick={() => setSelected(null)}
            className="text-sm text-slate-500 hover:text-slate-700 mb-3 flex items-center gap-1"
          >
            <span>&#8592;</span> 목록으로
          </button>
          <div className="flex items-center gap-3">
            <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
              isSales ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
            }`}>
              {isSales ? '판매' : '구매'}
            </span>
            <h1 className="text-xl font-bold text-slate-800">
              주문 #{selected.id}
            </h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {formatDate(selected.ioDate)} · {selected.custName || selected.custCd || '-'} · {formatMoney(selected.totalAmount || 0)}
          </p>
        </div>

        {/* 진행 단계 */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 mb-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">진행 단계</h3>
          <div className="flex items-center gap-1 overflow-x-auto pb-2">
            {steps.map((step, idx) => {
              const isDone = idx < currentIdx
              const isCurrent = idx === currentIdx
              return (
                <div key={step} className="flex items-center">
                  <div className="flex flex-col items-center min-w-[72px]">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                      isDone ? 'bg-green-500 text-white' :
                      isCurrent ? (isSales ? 'bg-blue-500 text-white' : 'bg-orange-500 text-white') :
                      'bg-slate-200 text-slate-400'
                    }`}>
                      {isDone ? '✓' : idx + 1}
                    </div>
                    <span className={`text-[11px] mt-1 text-center whitespace-nowrap ${
                      isCurrent ? 'font-bold text-slate-800' : 'text-slate-500'
                    }`}>
                      {labels[step]}
                    </span>
                    {(isDone || isCurrent) && (
                      <span className="text-[10px] text-slate-400 mt-0.5">
                        {idx === 0 && selected.erpSubmittedAt ? formatDate(selected.erpSubmittedAt) : ''}
                        {idx === 1 && selected.step2At ? formatDate(selected.step2At) : ''}
                        {idx === 2 && selected.step3At ? formatDate(selected.step3At) : ''}
                        {idx === 3 && selected.step4At ? formatDate(selected.step4At) : ''}
                        {idx === 4 && selected.step5At ? formatDate(selected.step5At) : ''}
                      </span>
                    )}
                  </div>
                  {idx < steps.length - 1 && (
                    <div className={`w-6 h-0.5 mt-[-16px] ${
                      idx < currentIdx ? 'bg-green-400' : 'bg-slate-200'
                    }`} />
                  )}
                </div>
              )
            })}
          </div>
          {/* 상태 진행 버튼 */}
          <div className="flex gap-3 mt-4 pt-3 border-t border-slate-100">
            <button
              onClick={() => handleProcess('prev')}
              disabled={processing || currentIdx <= 0}
              className="px-4 py-2 text-sm rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              &#9664; 이전 단계
            </button>
            <button
              onClick={() => handleProcess('next')}
              disabled={processing || currentIdx >= steps.length - 1}
              className={`px-5 py-2 text-sm rounded-xl font-medium text-white transition-colors disabled:opacity-40 ${
                isSales ? 'bg-blue-500 hover:bg-blue-600' : 'bg-orange-500 hover:bg-orange-600'
              }`}
            >
              {processing ? '처리 중...' : `${labels[steps[Math.min(currentIdx + 1, steps.length - 1)]]}(으)로 진행 ▶`}
            </button>
          </div>
        </div>

        {/* 메시지 */}
        {message && (
          <div className={`p-3 rounded-xl text-sm mb-4 ${
            message.includes('완료') || message.includes('변경') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {message}
          </div>
        )}

        {/* 품목 내역 */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 mb-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">품목 내역</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="text-left py-2 px-2">품목코드</th>
                  <th className="text-left py-2 px-2">품명</th>
                  <th className="text-right py-2 px-2">수량</th>
                  <th className="text-right py-2 px-2">단가</th>
                  <th className="text-right py-2 px-2">금액</th>
                  <th className="text-left py-2 px-2">창고</th>
                </tr>
              </thead>
              <tbody>
                {selected.items.map((item: any, idx: number) => (
                  <tr key={idx} className="border-b border-slate-100">
                    <td className="py-2 px-2 font-mono text-xs">{item.PROD_CD || '-'}</td>
                    <td className="py-2 px-2">{item.PROD_DES || '-'}</td>
                    <td className="py-2 px-2 text-right">{Number(item.QTY || 0).toLocaleString()}</td>
                    <td className="py-2 px-2 text-right">{Number(item.PRICE || 0).toLocaleString()}</td>
                    <td className="py-2 px-2 text-right">{Number(item.SUPPLY_AMT || 0).toLocaleString()}</td>
                    <td className="py-2 px-2 text-xs text-slate-500">{item.WH_CD || item.WAREHOUSE_CD || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 성적서(CoA) 섹션 */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">
            성적서(CoA) 첨부
            <span className="ml-2 text-xs font-normal text-slate-400">
              {documents.length}건
            </span>
          </h3>

          {/* 문서 목록 */}
          {docsLoading ? (
            <div className="text-sm text-slate-400 py-4 text-center">로딩 중...</div>
          ) : documents.length > 0 ? (
            <div className="space-y-2 mb-4">
              {documents.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{doc.fileName}</p>
                    <p className="text-xs text-slate-400">
                      {formatSize(doc.fileSize)} · {formatDate(doc.createdAt)}
                      {doc.note && ` · ${doc.note}`}
                    </p>
                  </div>
                  <div className="flex gap-2 ml-3">
                    {doc.dropboxPath && (
                      <button
                        onClick={() => handleDownload(doc.dropboxPath!)}
                        className="px-3 py-1.5 text-xs rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                      >
                        다운로드
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteDoc(doc.id)}
                      className="px-3 py-1.5 text-xs rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400 mb-4">등록된 성적서가 없습니다.</p>
          )}

          {/* 업로드 폼 */}
          <div className="border border-dashed border-slate-300 rounded-xl p-4 bg-slate-50/50">
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.doc,.docx"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleUpload(file)
                }}
                disabled={uploading}
                className="flex-1 text-sm file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-600 hover:file:bg-blue-100"
              />
              <input
                type="text"
                value={uploadNote}
                onChange={(e) => setUploadNote(e.target.value)}
                placeholder="비고 (선택)"
                className="px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white w-full sm:w-48"
              />
            </div>
            {uploading && (
              <div className="mt-3 flex items-center gap-2 text-sm text-blue-600">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                업로드 중...
              </div>
            )}
          </div>

          {/* 메모 */}
          {selected.note && (
            <div className="mt-4 p-3 rounded-xl bg-amber-50 border border-amber-100">
              <p className="text-xs text-amber-600 font-medium mb-1">메모</p>
              <p className="text-sm text-amber-800">{selected.note}</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ─── 목록 뷰 ───
  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* 헤더 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">창고작업</h1>
        <p className="text-sm text-slate-500 mt-1">입출고 지시 처리 및 성적서 관리</p>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm text-center">
          <p className="text-2xl font-bold text-slate-800">{summary.totalTasks}</p>
          <p className="text-xs text-slate-500 mt-1">총 작업</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm text-center">
          <p className="text-2xl font-bold text-blue-600">{summary.salesTasks}</p>
          <p className="text-xs text-slate-500 mt-1">출고 작업</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm text-center">
          <p className="text-2xl font-bold text-orange-600">{summary.purchaseTasks}</p>
          <p className="text-xs text-slate-500 mt-1">입고 작업</p>
        </div>
      </div>

      {/* 필터 */}
      <div className="flex gap-2 mb-5">
        {[
          { key: 'ALL', label: '전체' },
          { key: 'SALES', label: '출고(판매)' },
          { key: 'PURCHASE', label: '입고(구매)' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setTypeFilter(f.key)}
            className={`px-4 py-2 text-sm rounded-xl transition-colors ${
              typeFilter === f.key
                ? 'bg-slate-800 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 로딩 */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2].map(i => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm animate-pulse">
              <div className="h-5 bg-slate-200 rounded w-40 mb-4" />
              <div className="h-16 bg-slate-100 rounded-xl" />
            </div>
          ))}
        </div>
      ) : warehouses.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-10 shadow-sm text-center">
          <p className="text-slate-400 text-sm">현재 창고 작업이 없습니다</p>
          <p className="text-slate-300 text-xs mt-1">출고지시 또는 입고예정 상태의 워크플로우가 생기면 여기에 표시됩니다</p>
        </div>
      ) : (
        <div className="space-y-5">
          {warehouses.map(wh => (
            <div key={wh.warehouseCd} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
              {/* 창고 헤더 */}
              <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                <span className="text-base">📦</span>
                <span className="font-semibold text-slate-700">
                  {wh.warehouseCd === '미지정' ? '미지정 창고' : `창고: ${wh.warehouseCd}`}
                </span>
                <span className="ml-auto text-xs text-slate-400 bg-slate-200/80 px-2 py-0.5 rounded-full">
                  {wh.taskCount}건
                </span>
              </div>

              {/* 작업 카드 목록 */}
              <div className="divide-y divide-slate-100">
                {wh.tasks.map(task => {
                  const isSales = task.workflowType === 'SALES'
                  const steps = getSteps(task.workflowType)
                  const currentIdx = steps.indexOf(task.status)
                  const progress = Math.round(((currentIdx) / (steps.length - 1)) * 100)

                  return (
                    <div
                      key={task.id}
                      onClick={() => openDetail(task)}
                      className="px-5 py-3 hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                          isSales ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                        }`}>
                          {isSales ? '판매' : '구매'}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                          currentIdx <= 1 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                        }`}>
                          {task.statusLabel}
                        </span>
                        <span className="text-xs text-slate-400">#{task.id}</span>
                        <span className="ml-auto text-xs text-slate-400">
                          {task.documentCount > 0 && (
                            <span className="inline-flex items-center gap-1 text-green-600 mr-3">
                              📄 CoA {task.documentCount}건
                            </span>
                          )}
                          {formatDate(task.ioDate)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-slate-700">
                          {task.custName || task.custCd || '-'} · {task.items.length}개 품목 · {formatMoney(task.totalAmount || 0)}
                        </p>
                        <div className="flex items-center gap-2 ml-4">
                          <div className="w-24 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${isSales ? 'bg-blue-500' : 'bg-orange-500'}`}
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <span className="text-[11px] text-slate-400 w-8">{progress}%</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
