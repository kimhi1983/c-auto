'use client';

import { useState, useEffect, useRef } from 'react';
import { apiUrl, authHeaders, authJsonHeaders } from '@/lib/api';

// ─── Types ───

interface CoaDocument {
  id: number;
  fileName: string;
  originalName: string;
  fileSize: number;
  contentType: string | null;
  dropboxPath: string;
  note: string | null;
  tags: string | null;
  uploadedByName: string | null;
  productName: string | null;
  lotNo: string | null;
  manuDate: string | null;
  validDate: string | null;
  createdAt: string;
}

interface ProductGroup {
  productName: string;
  count: number;
  latestDate: string;
  latestValidDate: string | null;
}

interface AiExtracted {
  productName: string | null;
  lotNo: string | null;
  manuDate: string | null;
  validDate: string | null;
  debug?: string | null;
  manufacturer: string | null;
  confidence: number;
}

interface UploadResult {
  fileName: string;
  success: boolean;
  aiExtracted: AiExtracted | null;
  aiError: string | null;
  doc: CoaDocument | null;
}

// ─── Helpers ───

const ALLOWED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'image/jpeg',
  'image/png',
];
const ALLOWED_EXTENSIONS = ['.pdf', '.xlsx', '.xls', '.jpg', '.jpeg', '.png'];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(contentType: string | null, name: string): { color: string; label: string } {
  if (contentType?.includes('pdf') || name.endsWith('.pdf'))
    return { color: 'bg-red-100 text-red-600', label: 'PDF' };
  if (contentType?.includes('sheet') || contentType?.includes('excel') || name.endsWith('.xlsx') || name.endsWith('.xls'))
    return { color: 'bg-green-100 text-green-600', label: 'XLS' };
  if (contentType?.startsWith('image/') || /\.(jpg|jpeg|png)$/i.test(name))
    return { color: 'bg-blue-100 text-blue-600', label: 'IMG' };
  return { color: 'bg-slate-100 text-slate-600', label: 'FILE' };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function isValidFileType(file: File): boolean {
  if (ALLOWED_TYPES.includes(file.type)) return true;
  return ALLOWED_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext));
}

// raw SQL 응답을 camelCase로 변환
function normalizeDoc(raw: any): CoaDocument {
  if (raw.originalName) return raw as CoaDocument;
  return {
    id: raw.id,
    fileName: raw.file_name,
    originalName: raw.original_name,
    fileSize: raw.file_size,
    contentType: raw.content_type,
    dropboxPath: raw.dropbox_path,
    note: raw.note,
    tags: raw.tags,
    uploadedByName: raw.uploaded_by_name,
    productName: raw.product_name,
    lotNo: raw.lot_no,
    manuDate: raw.manu_date,
    validDate: raw.valid_date,
    createdAt: raw.created_at,
  };
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch {
    return dateStr;
  }
}

/** 유효기한 상태 계산 */
function getExpiryStatus(validDate: string | null): 'ok' | 'warning' | 'expired' | 'unknown' {
  if (!validDate) return 'unknown';
  try {
    const exp = new Date(validDate);
    const now = new Date();
    const diffDays = (exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays < 0) return 'expired';
    if (diffDays < 90) return 'warning';
    return 'ok';
  } catch {
    return 'unknown';
  }
}

/** AI 신뢰도 배지 */
function ConfidenceBadge({ confidence }: { confidence: number }) {
  if (confidence >= 80) return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
      AI {confidence}%
    </span>
  );
  if (confidence >= 50) return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
      AI {confidence}%
    </span>
  );
  if (confidence > 0) return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">
      AI {confidence}%
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
      수동
    </span>
  );
}

/** 유효기한 배지 */
function ExpiryBadge({ validDate }: { validDate: string | null }) {
  const status = getExpiryStatus(validDate);
  if (status === 'expired') return (
    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">만료</span>
  );
  if (status === 'warning') return (
    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">만료임박</span>
  );
  return null;
}

// ─── Main Page ───

export default function CoaPage() {
  // ─── 제품별 목록 ───
  const [products, setProducts] = useState<ProductGroup[]>([]);
  const [prodLoading, setProdLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  const [productFiles, setProductFiles] = useState<CoaDocument[]>([]);
  const [productFilesLoading, setProductFilesLoading] = useState(false);

  // ─── 업로드 ───
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [uploadCurrentIdx, setUploadCurrentIdx] = useState(0);
  const [uploadTotalCount, setUploadTotalCount] = useState(0);
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const [showUploadResults, setShowUploadResults] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [fileError, setFileError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── 인라인 편집 ───
  const [editingDoc, setEditingDoc] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ productName: '', lotNo: '', manuDate: '', validDate: '', note: '' });

  // ─── 미리보기 ───
  const [previewDoc, setPreviewDoc] = useState<CoaDocument | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // ─── 통계 ───
  const totalFiles = products.reduce((sum, p) => sum + p.count, 0);
  const totalProducts = products.length;
  const expiringCount = products.filter(p => getExpiryStatus(p.latestValidDate) === 'warning').length;
  const expiredCount = products.filter(p => getExpiryStatus(p.latestValidDate) === 'expired').length;

  // ─── API: 제품별 목록 ───
  const fetchProducts = async (q = '') => {
    setProdLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set('search', q);
      const res = await fetch(apiUrl(`/api/v1/coa-documents/products?${params}`), { headers: authHeaders() });
      const json = await res.json();
      if (json.status === 'success') setProducts(json.data || []);
    } catch (e) {
      console.error('제품 목록 로드 실패:', e);
    } finally {
      setProdLoading(false);
    }
  };

  const fetchProductFiles = async (productName: string) => {
    setProductFilesLoading(true);
    try {
      const res = await fetch(apiUrl(`/api/v1/coa-documents/products/${encodeURIComponent(productName)}`), {
        headers: authHeaders(),
      });
      const json = await res.json();
      if (json.status === 'success') setProductFiles((json.data || []).map(normalizeDoc));
    } catch (e) {
      console.error('제품 파일 로드 실패:', e);
    } finally {
      setProductFilesLoading(false);
    }
  };

  useEffect(() => { fetchProducts(); }, []);

  const handleSearch = () => fetchProducts(searchQuery);

  const toggleProduct = (name: string) => {
    if (expandedProduct === name) {
      setExpandedProduct(null);
      setProductFiles([]);
    } else {
      setExpandedProduct(name);
      fetchProductFiles(name);
    }
  };

  // ─── 파일 선택 → AI 자동분석 업로드 ───
  const handleFilesSelected = (fileList: File[]) => {
    setFileError('');
    const validFiles: File[] = [];
    for (const file of fileList) {
      if (!isValidFileType(file)) {
        setFileError(`지원하지 않는 형식: ${file.name} (PDF, Excel, JPG, PNG만 가능)`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        setFileError(`파일 크기 초과: ${file.name} (최대 10MB)`);
        continue;
      }
      validFiles.push(file);
    }
    if (validFiles.length === 0) return;
    handleAutoUpload(validFiles);
  };

  // ─── AI 자동분석 업로드 ───
  const handleAutoUpload = async (filesToUpload: File[]) => {
    setUploading(true);
    setFileError('');
    setUploadResults([]);
    setShowUploadResults(true);
    setUploadTotalCount(filesToUpload.length);

    const results: UploadResult[] = [];

    for (let i = 0; i < filesToUpload.length; i++) {
      const file = filesToUpload[i];
      setUploadCurrentIdx(i);
      setUploadProgress(file.name);

      try {
        const base64 = await fileToBase64(file);

        const res = await fetch(apiUrl('/api/v1/coa-documents/auto-upload'), {
          method: 'POST',
          headers: authJsonHeaders(),
          body: JSON.stringify({
            fileName: file.name,
            contentBase64: base64,
            contentType: file.type,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || '업로드 실패');
        }

        const result = await res.json();
        results.push({
          fileName: file.name,
          success: true,
          aiExtracted: result.aiExtracted || null,
          aiError: result.aiError || null,
          doc: result.data ? normalizeDoc(result.data) : null,
        });
      } catch (e: any) {
        results.push({
          fileName: file.name,
          success: false,
          aiExtracted: null,
          aiError: e.message,
          doc: null,
        });
      }

      setUploadResults([...results]);
    }

    setUploading(false);
    setUploadProgress('');
    fetchProducts(searchQuery);
  };

  // ─── 드래그앤드롭 ───
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragActive(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) handleFilesSelected(droppedFiles);
  };

  // ─── 다운로드 ───
  const handleDownload = async (doc: CoaDocument) => {
    try {
      const res = await fetch(apiUrl(`/api/v1/coa-documents/${doc.id}/link`), {
        method: 'POST',
        headers: authJsonHeaders(),
      });
      const json = await res.json();
      if (json.status === 'success' && json.link) {
        const a = document.createElement('a');
        a.href = json.link;
        a.download = doc.originalName;
        a.target = '_blank';
        a.click();
      }
    } catch (e) {
      console.error('다운로드 실패:', e);
    }
  };

  // ─── 미리보기 ───
  const handlePreview = async (doc: CoaDocument) => {
    try {
      const res = await fetch(apiUrl(`/api/v1/coa-documents/${doc.id}/link`), {
        method: 'POST',
        headers: authJsonHeaders(),
      });
      const json = await res.json();
      if (json.status === 'success' && json.link) {
        // PDF/이미지: Dropbox 링크를 blob으로 변환하여 미리보기
        // Dropbox 임시 링크는 Content-Disposition: attachment로 강제 다운로드되므로 blob URL 사용
        if (doc.contentType?.includes('pdf') || doc.contentType?.startsWith('image/')) {
          try {
            const fileRes = await fetch(json.link);
            const blob = await fileRes.blob();
            const blobUrl = URL.createObjectURL(blob);

            if (doc.contentType?.includes('pdf')) {
              // PDF: 새 탭에서 브라우저 PDF 뷰어로 열기
              window.open(blobUrl, '_blank');
            } else {
              // 이미지: 모달 미리보기
              setPreviewDoc(doc);
              setPreviewUrl(blobUrl);
            }
            return;
          } catch {
            // blob 변환 실패 시 직접 링크로 폴백
            window.open(json.link, '_blank');
            return;
          }
        }
        // 기타 파일 → 새 탭
        window.open(json.link, '_blank');
      }
    } catch (e) {
      console.error('미리보기 실패:', e);
    }
  };

  // ─── 삭제 ───
  const handleDelete = async (doc: CoaDocument) => {
    if (!confirm(`"${doc.originalName}" 파일을 삭제하시겠습니까?`)) return;
    try {
      await fetch(apiUrl(`/api/v1/coa-documents/${doc.id}`), {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (expandedProduct) {
        fetchProductFiles(expandedProduct);
      }
      fetchProducts(searchQuery);
    } catch (e) {
      console.error('삭제 실패:', e);
    }
  };

  // ─── 인라인 수정 ───
  const startEdit = (doc: CoaDocument) => {
    setEditingDoc(doc.id);
    setEditForm({
      productName: doc.productName || '',
      lotNo: doc.lotNo || '',
      manuDate: doc.manuDate || '',
      validDate: doc.validDate || '',
      note: doc.note || '',
    });
  };

  const saveEdit = async () => {
    if (!editingDoc) return;
    try {
      await fetch(apiUrl(`/api/v1/coa-documents/${editingDoc}`), {
        method: 'PUT',
        headers: authJsonHeaders(),
        body: JSON.stringify(editForm),
      });
      setEditingDoc(null);
      if (expandedProduct) {
        fetchProductFiles(expandedProduct);
      }
      fetchProducts(searchQuery);
    } catch (e) {
      console.error('수정 실패:', e);
    }
  };

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">성적서 관리 (CoA)</h1>
          <p className="text-sm text-slate-500 mt-0.5">AI가 성적서를 자동 분석하여 제품명, LOT, 유효기한을 추출합니다</p>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-200/80 px-4 py-3">
          <p className="text-xs text-slate-500">총 제품</p>
          <p className="text-lg font-bold text-slate-900 mt-0.5">{totalProducts}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200/80 px-4 py-3">
          <p className="text-xs text-slate-500">총 성적서</p>
          <p className="text-lg font-bold text-slate-900 mt-0.5">{totalFiles}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200/80 px-4 py-3">
          <p className="text-xs text-amber-600">만료 임박 (90일 이내)</p>
          <p className="text-lg font-bold text-amber-600 mt-0.5">{expiringCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200/80 px-4 py-3">
          <p className="text-xs text-red-500">만료됨</p>
          <p className="text-lg font-bold text-red-500 mt-0.5">{expiredCount}</p>
        </div>
      </div>

      {/* 업로드 드래그앤드롭 영역 */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
          dragActive ? 'border-brand-400 bg-brand-50/50 scale-[1.01]' : 'border-slate-300 bg-slate-50/30 hover:border-slate-400 hover:bg-slate-50/50'
        }`}
      >
        <div className="flex flex-col items-center gap-2">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${dragActive ? 'bg-brand-100' : 'bg-slate-100'}`}>
            <svg className={`w-6 h-6 ${dragActive ? 'text-brand-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          </div>
          <div>
            <p className={`text-sm font-medium ${dragActive ? 'text-brand-700' : 'text-slate-600'}`}>
              {uploading ? 'AI 분석 중...' : dragActive ? '여기에 놓으세요!' : '성적서 파일을 드래그하여 업로드'}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">PDF, Excel, JPG, PNG (최대 10MB) — AI가 자동으로 분류합니다</p>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.xlsx,.xls,.jpg,.jpeg,.png"
          multiple
          className="hidden"
          onChange={(e) => {
            const fl = e.target.files;
            if (fl) handleFilesSelected(Array.from(fl));
            e.target.value = '';
          }}
        />
      </div>

      {/* 에러 메시지 */}
      {fileError && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm border border-red-200 flex items-center justify-between">
          <span>{fileError}</span>
          <button onClick={() => setFileError('')} className="font-bold text-red-400 hover:text-red-600 ml-2">&times;</button>
        </div>
      )}

      {/* 업로드 진행 상태 */}
      {uploading && (
        <div className="bg-brand-50 border border-brand-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-brand-700">
                AI 분석 중... ({uploadCurrentIdx + 1}/{uploadTotalCount})
              </p>
              <p className="text-xs text-brand-500 truncate mt-0.5">{uploadProgress}</p>
            </div>
          </div>
          <div className="mt-2 bg-brand-200 rounded-full h-1.5">
            <div
              className="bg-brand-500 rounded-full h-1.5 transition-all"
              style={{ width: `${((uploadCurrentIdx + 1) / uploadTotalCount) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* 업로드 결과 패널 */}
      {showUploadResults && uploadResults.length > 0 && !uploading && (
        <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-semibold text-slate-700">
                AI 분석 결과 ({uploadResults.filter(r => r.success).length}/{uploadResults.length} 완료)
              </span>
            </div>
            <button onClick={() => setShowUploadResults(false)}
              className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {uploadResults.map((result, idx) => (
              <div key={idx} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  {/* 상태 아이콘 */}
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                    result.success ? 'bg-emerald-100' : 'bg-red-100'
                  }`}>
                    {result.success ? (
                      <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-800 truncate">{result.fileName}</span>
                      {result.aiExtracted && <ConfidenceBadge confidence={result.aiExtracted.confidence} />}
                    </div>

                    {result.aiExtracted && result.aiExtracted.confidence > 0 ? (
                      <div className="mt-1.5 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1">
                        <div>
                          <span className="text-[10px] text-slate-400">제품명</span>
                          <p className="text-xs font-medium text-slate-700">{result.aiExtracted.productName || '-'}</p>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400">LOT/Batch</span>
                          <p className="text-xs font-medium text-slate-700 font-mono">{result.aiExtracted.lotNo || '-'}</p>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400">제조일</span>
                          <p className="text-xs font-medium text-slate-700">{formatDate(result.aiExtracted.manuDate)}</p>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400">유효기한</span>
                          <p className="text-xs font-medium text-slate-700">{formatDate(result.aiExtracted.validDate)}</p>
                        </div>
                        {result.aiExtracted.manufacturer && (
                          <div className="col-span-2">
                            <span className="text-[10px] text-slate-400">제조사</span>
                            <p className="text-xs font-medium text-slate-700">{result.aiExtracted.manufacturer}</p>
                          </div>
                        )}
                        {result.aiExtracted.debug && (
                          <div className="col-span-2 md:col-span-4 mt-1">
                            <details className="text-[10px] text-slate-400">
                              <summary className="cursor-pointer hover:text-slate-600">AI 디버그 정보</summary>
                              <p className="mt-1 bg-slate-50 rounded px-2 py-1 font-mono break-all">{result.aiExtracted.debug}</p>
                            </details>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <p className="text-xs text-slate-400 mt-1">
                          {result.aiError ? `AI 분석 실패: ${result.aiError}` : '파일명 기반으로 저장됨 (AI 분석 불가)'}
                        </p>
                        {(result.aiExtracted?.debug || result.aiError) && (
                          <details className="text-[10px] text-slate-400 mt-1">
                            <summary className="cursor-pointer hover:text-slate-600">AI 디버그 정보</summary>
                            <p className="mt-1 bg-slate-50 rounded px-2 py-1 font-mono break-all">
                              {result.aiExtracted?.debug || result.aiError}
                            </p>
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 검색 */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="제품명, LOT번호, 파일명으로 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>
        <button onClick={handleSearch}
          className="px-5 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors shrink-0">
          검색
        </button>
      </div>

      {/* 제품별 성적서 목록 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden">
        {prodLoading ? (
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-slate-50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
              <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <p className="text-slate-500 text-sm font-medium">
              {searchQuery ? '검색 결과가 없습니다' : '등록된 성적서가 없습니다'}
            </p>
            <p className="text-slate-400 text-xs mt-1">
              {searchQuery ? '다른 검색어를 시도해보세요' : '위 영역에 성적서 파일을 드래그하여 업로드하세요'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {products.map((prod) => {
              const expiryStatus = getExpiryStatus(prod.latestValidDate);
              return (
                <div key={prod.productName}>
                  {/* 제품 행 */}
                  <button
                    onClick={() => toggleProduct(prod.productName)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors text-left"
                  >
                    {/* 폴더 아이콘 */}
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      expandedProduct === prod.productName ? 'bg-brand-100' :
                      expiryStatus === 'expired' ? 'bg-red-50' :
                      expiryStatus === 'warning' ? 'bg-amber-50' : 'bg-slate-100'
                    }`}>
                      <svg className={`w-5 h-5 ${
                        expandedProduct === prod.productName ? 'text-brand-600' :
                        expiryStatus === 'expired' ? 'text-red-400' :
                        expiryStatus === 'warning' ? 'text-amber-400' : 'text-slate-400'
                      }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                      </svg>
                    </div>

                    {/* 제품 정보 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-800 truncate">{prod.productName}</span>
                        <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full shrink-0">{prod.count}건</span>
                        <ExpiryBadge validDate={prod.latestValidDate} />
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        {prod.latestValidDate && (
                          <span className="text-[11px] text-slate-400">
                            유효기한: {formatDate(prod.latestValidDate)}
                          </span>
                        )}
                        <span className="text-[11px] text-slate-400">
                          최근: {formatDate(prod.latestDate)}
                        </span>
                      </div>
                    </div>

                    {/* 화살표 */}
                    <svg className={`w-4 h-4 text-slate-400 transition-transform shrink-0 ${expandedProduct === prod.productName ? 'rotate-90' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>

                  {/* 파일 목록 (펼침) */}
                  {expandedProduct === prod.productName && (
                    <div className="bg-slate-50/50 border-t border-slate-100">
                      {productFilesLoading ? (
                        <div className="p-6 text-center">
                          <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
                        </div>
                      ) : productFiles.length === 0 ? (
                        <div className="p-6 text-center text-sm text-slate-400">파일이 없습니다.</div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-slate-200">
                                <th className="text-left px-4 py-2 font-medium text-slate-500 text-xs">파일명</th>
                                <th className="text-left px-4 py-2 font-medium text-slate-500 text-xs">LOT/Batch</th>
                                <th className="text-left px-4 py-2 font-medium text-slate-500 text-xs">제조일</th>
                                <th className="text-left px-4 py-2 font-medium text-slate-500 text-xs">유효기한</th>
                                <th className="text-right px-4 py-2 font-medium text-slate-500 text-xs">크기</th>
                                <th className="text-left px-4 py-2 font-medium text-slate-500 text-xs">비고</th>
                                <th className="text-center px-4 py-2 font-medium text-slate-500 text-xs w-32">작업</th>
                              </tr>
                            </thead>
                            <tbody>
                              {productFiles.map((doc) => {
                                const icon = getFileIcon(doc.contentType, doc.originalName);
                                const isEditing = editingDoc === doc.id;

                                if (isEditing) {
                                  return (
                                    <tr key={doc.id} className="border-b border-slate-100 bg-brand-50/30">
                                      <td className="px-4 py-2" colSpan={7}>
                                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                                          <div>
                                            <label className="text-[10px] text-slate-500">제품명</label>
                                            <input type="text" value={editForm.productName}
                                              onChange={e => setEditForm({ ...editForm, productName: e.target.value })}
                                              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
                                          </div>
                                          <div>
                                            <label className="text-[10px] text-slate-500">LOT/Batch</label>
                                            <input type="text" value={editForm.lotNo}
                                              onChange={e => setEditForm({ ...editForm, lotNo: e.target.value })}
                                              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-mono" />
                                          </div>
                                          <div>
                                            <label className="text-[10px] text-slate-500">제조일</label>
                                            <input type="date" value={editForm.manuDate}
                                              onChange={e => setEditForm({ ...editForm, manuDate: e.target.value })}
                                              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
                                          </div>
                                          <div>
                                            <label className="text-[10px] text-slate-500">유효기한</label>
                                            <input type="date" value={editForm.validDate}
                                              onChange={e => setEditForm({ ...editForm, validDate: e.target.value })}
                                              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
                                          </div>
                                          <div className="flex items-end gap-1">
                                            <button onClick={saveEdit}
                                              className="px-3 py-1.5 rounded-lg bg-brand-500 text-white text-xs font-medium hover:bg-brand-600">
                                              저장
                                            </button>
                                            <button onClick={() => setEditingDoc(null)}
                                              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-white">
                                              취소
                                            </button>
                                          </div>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                }

                                return (
                                  <tr key={doc.id} className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors">
                                    <td className="px-4 py-2.5">
                                      <div className="flex items-center gap-2">
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${icon.color}`}>{icon.label}</span>
                                        <span className="text-slate-800 text-xs font-medium truncate max-w-[180px]">{doc.originalName}</span>
                                      </div>
                                    </td>
                                    <td className="px-4 py-2.5 text-xs text-slate-600 font-mono">{doc.lotNo || '-'}</td>
                                    <td className="px-4 py-2.5 text-xs text-slate-500">{formatDate(doc.manuDate)}</td>
                                    <td className="px-4 py-2.5">
                                      <div className="flex items-center gap-1">
                                        <span className="text-xs text-slate-500">{formatDate(doc.validDate)}</span>
                                        <ExpiryBadge validDate={doc.validDate} />
                                      </div>
                                    </td>
                                    <td className="px-4 py-2.5 text-right text-slate-400 text-xs">{formatFileSize(doc.fileSize)}</td>
                                    <td className="px-4 py-2.5 text-xs text-slate-400 truncate max-w-[100px]">{doc.note || '-'}</td>
                                    <td className="px-4 py-2.5">
                                      <div className="flex items-center justify-center gap-0.5">
                                        <button onClick={() => startEdit(doc)} title="수정"
                                          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-brand-600 transition">
                                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                          </svg>
                                        </button>
                                        <button onClick={() => handleDownload(doc)} title="다운로드"
                                          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-brand-600 transition">
                                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                          </svg>
                                        </button>
                                        {(doc.contentType?.startsWith('image/') || doc.contentType?.includes('pdf')) && (
                                          <button onClick={() => handlePreview(doc)} title="미리보기"
                                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-blue-600 transition">
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                            </svg>
                                          </button>
                                        )}
                                        <button onClick={() => handleDelete(doc)} title="삭제"
                                          className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition">
                                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                          </svg>
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══ 미리보기 모달 ═══ */}
      {previewDoc && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => { setPreviewDoc(null); setPreviewUrl(null); }}>
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${getFileIcon(previewDoc.contentType, previewDoc.originalName).color}`}>
                  {getFileIcon(previewDoc.contentType, previewDoc.originalName).label}
                </span>
                <span className="text-sm font-semibold text-slate-800 truncate">{previewDoc.originalName}</span>
                {previewDoc.productName && (
                  <span className="text-xs text-slate-400 shrink-0">({previewDoc.productName})</span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {previewDoc.lotNo && (
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-lg font-mono">LOT: {previewDoc.lotNo}</span>
                )}
                <button onClick={() => handleDownload(previewDoc)}
                  className="px-3 py-1.5 rounded-lg bg-brand-500 text-white text-xs font-medium hover:bg-brand-600 transition">
                  다운로드
                </button>
                <button onClick={() => { setPreviewDoc(null); setPreviewUrl(null); }}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto flex items-center justify-center bg-slate-100 min-h-[400px]">
              {!previewUrl ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-slate-500">로딩 중...</span>
                </div>
              ) : (
                <img src={previewUrl} alt={previewDoc.originalName} className="max-w-full max-h-[75vh] object-contain" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
