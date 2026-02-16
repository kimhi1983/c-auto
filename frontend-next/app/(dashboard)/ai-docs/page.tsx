'use client';

import { useEffect, useState, useRef } from 'react';
import { apiUrl, authHeaders, authJsonHeaders } from '@/lib/api';

type Tab = 'write' | 'analyze' | 'rewrite' | 'search' | 'folder';

interface Template {
  id: string;
  name: string;
  description: string;
}

interface HistoryItem {
  id: number;
  file_name: string;
  category: string;
  description: string;
  file_size: number;
  created_at: string;
}

interface FileResult {
  name: string;
  path: string;
  size: string | number;
  modified?: string;
}

interface DropboxStatus {
  configured: boolean;
  token_valid: boolean;
}

const ANALYSIS_TYPES = [
  { id: 'general', name: '종합 분석', description: '문서 유형, 핵심 요약, 주요 항목, 후속 조치' },
  { id: 'contract', name: '계약서 분석', description: '조항별 리스크, 유불리 분석, 수정 권고' },
  { id: 'financial', name: '재무 분석', description: '금액, 결제조건, 환율 리스크, 현금흐름' },
  { id: 'risk', name: '리스크 분석', description: '위험요소 식별, 영향도 평가, 대응방안' },
];

export default function AiDocsPage() {
  const [tab, setTab] = useState<Tab>('write');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Dropbox
  const [dropboxStatus, setDropboxStatus] = useState<DropboxStatus | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [connecting, setConnecting] = useState(false);

  // Write tab
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [writeContext, setWriteContext] = useState('');
  const [writeTitle, setWriteTitle] = useState('');
  const [writeResult, setWriteResult] = useState('');
  const [writeLoading, setWriteLoading] = useState(false);

  // Analyze tab
  const [analysisType, setAnalysisType] = useState('general');
  const [analyzeContent, setAnalyzeContent] = useState('');
  const [analyzeResult, setAnalyzeResult] = useState('');
  const [analyzeLoading, setAnalyzeLoading] = useState(false);

  // Rewrite tab
  const [rewriteContent, setRewriteContent] = useState('');
  const [rewriteInstructions, setRewriteInstructions] = useState('');
  const [rewriteResult, setRewriteResult] = useState('');
  const [rewriteLoading, setRewriteLoading] = useState(false);

  // Search tab
  const [keyword, setKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<FileResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Folder tab
  const [aiFiles, setAiFiles] = useState<FileResult[]>([]);
  const [loadingFolder, setLoadingFolder] = useState(false);

  const [error, setError] = useState('');

  // File upload
  const [writeFile, setWriteFile] = useState<File | null>(null);
  const [analyzeFile, setAnalyzeFile] = useState<File | null>(null);
  const writeFileRef = useRef<HTMLInputElement>(null);
  const analyzeFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    checkDropboxStatus();
    loadTemplates();
    loadHistory();
  }, []);

  const checkDropboxStatus = async () => {
    setCheckingStatus(true);
    try {
      const response = await fetch(apiUrl('/api/v1/dropbox/status'));
      if (response.ok) {
        const data = await response.json();
        setDropboxStatus(data.data);
      }
    } catch (err) {
      console.error('드롭박스 상태 확인 오류:', err);
    } finally {
      setCheckingStatus(false);
    }
  };

  const connectDropbox = async () => {
    setConnecting(true);
    try {
      const response = await fetch(apiUrl('/api/v1/dropbox/auth-url'), {
        headers: authHeaders(),
      });
      if (!response.ok) throw new Error('인증 URL 생성 실패');
      const data = await response.json();

      if (data.status === 'success' && data.auth_url) {
        const authWindow = window.open(data.auth_url, '_blank', 'width=600,height=700');
        const checkInterval = setInterval(async () => {
          if (authWindow && authWindow.closed) {
            clearInterval(checkInterval);
            await checkDropboxStatus();
            setConnecting(false);
          }
        }, 3000);
        setTimeout(() => {
          clearInterval(checkInterval);
          setConnecting(false);
        }, 300000);
      }
    } catch (err: any) {
      alert(err.message || '드롭박스 연결에 실패했습니다.');
      setConnecting(false);
    }
  };

  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('파일 읽기 실패'));
      reader.readAsText(file, 'UTF-8');
    });
  };

  const handleWriteFileSelect = async (file: File | undefined) => {
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const textExtensions = ['txt', 'md', 'csv', 'json', 'xml', 'html', 'htm', 'log', 'rtf', 'tsv'];
    if (!textExtensions.includes(ext)) {
      setError(`지원하지 않는 파일 형식입니다 (${ext}). 텍스트 기반 파일만 가능합니다: ${textExtensions.join(', ')}`);
      return;
    }
    if (file.size > 1024 * 1024) { setError('파일 크기는 1MB 이하만 가능합니다.'); return; }
    try {
      const text = await readFileAsText(file);
      setWriteFile(file);
      setWriteContext((prev) => prev ? prev + '\n\n--- 첨부파일: ' + file.name + ' ---\n' + text : text);
      setError('');
    } catch { setError('파일을 읽을 수 없습니다.'); }
  };

  const handleAnalyzeFileSelect = async (file: File | undefined) => {
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const textExtensions = ['txt', 'md', 'csv', 'json', 'xml', 'html', 'htm', 'log', 'rtf', 'tsv'];
    if (!textExtensions.includes(ext)) {
      setError(`지원하지 않는 파일 형식입니다 (${ext}). 텍스트 기반 파일만 가능합니다: ${textExtensions.join(', ')}`);
      return;
    }
    if (file.size > 1024 * 1024) { setError('파일 크기는 1MB 이하만 가능합니다.'); return; }
    try {
      const text = await readFileAsText(file);
      setAnalyzeFile(file);
      setAnalyzeContent((prev) => prev ? prev + '\n\n--- 첨부파일: ' + file.name + ' ---\n' + text : text);
      setError('');
    } catch { setError('파일을 읽을 수 없습니다.'); }
  };

  const loadTemplates = async () => {
    try {
      const res = await fetch(apiUrl('/api/v1/ai-docs/templates'), {
        headers: authHeaders(),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.status === 'success' && data.templates) {
        setTemplates(data.templates);
        if (data.templates.length > 0 && !selectedTemplate) {
          setSelectedTemplate(data.templates[0].id);
        }
      }
    } catch {
      // ignore
    }
  };

  const loadHistory = async () => {
    try {
      const res = await fetch(apiUrl('/api/v1/ai-docs/history?page=1&page_size=10'), {
        headers: authHeaders(),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.status === 'success' && data.documents) {
        setHistory(data.documents);
      }
    } catch {
      // ignore
    }
  };

  const loadAiFolder = async () => {
    if (!dropboxStatus?.token_valid) {
      alert('Dropbox 연결이 필요합니다.');
      return;
    }

    setLoadingFolder(true);
    try {
      const response = await fetch(apiUrl('/api/v1/dropbox/list'), {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify({ path: '/AI업무폴더' }),
      });
      if (!response.ok) return;
      const data = await response.json();
      if (data.status === 'success' && data.data) {
        setAiFiles(
          data.data.map((f: any) => ({
            name: f.name || '',
            path: f.path || '',
            size: f.size || 0,
            modified: f.modified || '',
          }))
        );
      }
    } catch (err) {
      console.error('AI 폴더 조회 오류:', err);
    } finally {
      setLoadingFolder(false);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTemplate || !writeContext.trim()) return;

    setWriteLoading(true);
    setWriteResult('');
    setError('');

    try {
      const res = await fetch(apiUrl(`/api/v1/ai-docs/generate?template_id=${selectedTemplate}&save=true`), {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify({
          context: writeContext,
          title: writeTitle || null,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || '문서 생성 실패');
      }

      const data = await res.json();
      if (data.status === 'success' && data.data) {
        setWriteResult(data.data.content);
        loadHistory();
      }
    } catch (err: any) {
      setError(err.message || '문서 생성에 실패했습니다.');
    } finally {
      setWriteLoading(false);
    }
  };

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!analyzeContent.trim()) return;

    setAnalyzeLoading(true);
    setAnalyzeResult('');
    setError('');

    try {
      const res = await fetch(apiUrl('/api/v1/ai-docs/analyze'), {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify({
          content: analyzeContent,
          analysis_type: analysisType,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || '분석 실패');
      }

      const data = await res.json();
      if (data.status === 'success' && data.data) {
        setAnalyzeResult(data.data.content);
      }
    } catch (err: any) {
      setError(err.message || '문서 분석에 실패했습니다.');
    } finally {
      setAnalyzeLoading(false);
    }
  };

  const handleRewrite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rewriteContent.trim() || !rewriteInstructions.trim()) return;

    setRewriteLoading(true);
    setRewriteResult('');
    setError('');

    try {
      const res = await fetch(apiUrl('/api/v1/ai-docs/rewrite'), {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify({
          content: rewriteContent,
          instructions: rewriteInstructions,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || '수정 실패');
      }

      const data = await res.json();
      if (data.status === 'success' && data.data) {
        setRewriteResult(data.data.content);
      }
    } catch (err: any) {
      setError(err.message || '문서 수정에 실패했습니다.');
    } finally {
      setRewriteLoading(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim()) return;

    if (!dropboxStatus?.token_valid) {
      alert('Dropbox 연결이 필요합니다.');
      return;
    }

    setSearchLoading(true);
    setError('');
    setSearched(true);

    try {
      const response = await fetch(apiUrl('/api/v1/dropbox/search'), {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify({ query: keyword }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          const data = await response.json();
          if (data.need_reauth) {
            setError('드롭박스 재인증이 필요합니다.');
            setDropboxStatus({ configured: true, token_valid: false });
            return;
          }
        }
        throw new Error('파일 검색 실패');
      }

      const data = await response.json();

      if (data.status === 'success' && data.data) {
        setSearchResults(
          data.data.map((f: any) => ({
            name: f.name || f.file_name || '',
            path: f.path || f.file_path || '',
            size: f.size || f.file_size || '',
            modified: f.modified || '',
          }))
        );
      } else {
        setSearchResults([]);
      }
    } catch (err: any) {
      setError(err.message || '검색에 실패했습니다.');
    } finally {
      setSearchLoading(false);
    }
  };

  const analyzeFromSearch = (fileName: string) => {
    setAnalyzeContent(`파일명: ${fileName}\n\n[파일 내용을 붙여넣으세요]`);
    setTab('analyze');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      alert('클립보드에 복사되었습니다.');
    });
  };

  const sendToRewrite = (content: string) => {
    setRewriteContent(content);
    setTab('rewrite');
  };

  const formatSize = (size: string | number) => {
    const num = typeof size === 'string' ? parseInt(size) : size;
    if (isNaN(num)) return size;
    if (num < 1024) return `${num} B`;
    if (num < 1048576) return `${(num / 1024).toFixed(1)} KB`;
    return `${(num / 1048576).toFixed(1)} MB`;
  };

  const formatDate = (iso: string) => {
    if (!iso) return '-';
    const d = new Date(iso);
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const getDropboxStatusBadge = () => {
    if (checkingStatus) {
      return <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-xs font-medium rounded-full">확인 중...</span>;
    }

    if (!dropboxStatus?.configured) {
      return <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-semibold rounded-full">❌ 미설정</span>;
    }

    if (dropboxStatus.token_valid) {
      return <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-semibold rounded-full">✅ 연결됨</span>;
    }

    return <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-semibold rounded-full">⚠️ 재연결</span>;
  };

  const tabs = [
    { id: 'write' as Tab, label: '📝 작성', desc: 'AI 문서 생성' },
    { id: 'analyze' as Tab, label: '📊 분석', desc: '정밀 분석' },
    { id: 'rewrite' as Tab, label: '✏️ 수정', desc: '문서 개선' },
    { id: 'search' as Tab, label: '🔍 검색', desc: 'Dropbox 검색' },
    { id: 'folder' as Tab, label: '📁 폴더', desc: 'AI 업무폴더' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">AI 문서 & 파일 관리</h1>
        <p className="text-slate-500 mt-1 text-sm">Claude AI + Dropbox 통합 문서 플랫폼</p>
      </div>

      {/* AI Engine Info + Dropbox Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-gradient-to-r from-slate-50 to-brand-50/50 rounded-2xl border border-slate-200 p-4 flex items-center gap-4">
          <div className="w-10 h-10 bg-gradient-to-br from-brand-500 to-brand-600 rounded-xl flex items-center justify-center shadow-sm shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-slate-800">Claude AI Engine</div>
            <div className="text-xs text-slate-500 mt-0.5">
              Claude Sonnet 4.5 &middot; 비즈니스 문서 전문가
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-2xl border border-blue-200 p-4 flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 1.807L0 5.629l6 3.822 6-3.822L6 1.807zM18 1.807l-6 3.822 6 3.822 6-3.822-6-3.822zM0 13.274l6 3.822 6-3.822-6-3.822-6 3.822zm12 0l6 3.822 6-3.822-6-3.822-6 3.822zM6 20.85l6-3.822-6-3.822-6 3.822L6 20.85zm12 0l6-3.822-6-3.822-6 3.822 6 3.822z"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold text-slate-800">Dropbox 연동</div>
              {getDropboxStatusBadge()}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {dropboxStatus?.token_valid ? '파일 검색 & 저장 가능' : '연결이 필요합니다'}
            </div>
          </div>
          {dropboxStatus?.configured && (
            <button
              onClick={connectDropbox}
              disabled={connecting}
              className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition disabled:opacity-50 shrink-0"
            >
              {connecting ? '연결 중...' : dropboxStatus.token_valid ? '재연결' : '연결'}
            </button>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 bg-white rounded-2xl border border-slate-200 p-1.5 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setError(''); }}
            className={`flex-shrink-0 py-2.5 px-4 rounded-xl text-sm font-medium transition-all duration-200 ${
              tab === t.id
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-2xl text-sm border border-red-200">
          {error}
        </div>
      )}

      {/* Tab Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content - 2 cols */}
        <div className="lg:col-span-2 space-y-6">
          {/* ─── Write Tab ─── */}
          {tab === 'write' && (
            <>
              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <h3 className="text-base font-semibold text-slate-900 mb-4">문서 템플릿 선택</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {templates.map((tpl) => (
                    <button
                      key={tpl.id}
                      onClick={() => setSelectedTemplate(tpl.id)}
                      className={`p-3 rounded-xl border text-left transition-all duration-200 ${
                        selectedTemplate === tpl.id
                          ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-200'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className={`text-sm font-semibold ${selectedTemplate === tpl.id ? 'text-brand-700' : 'text-slate-800'}`}>
                        {tpl.name}
                      </div>
                      <div className="text-xs text-slate-500 mt-1 line-clamp-2">{tpl.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              <form onSubmit={handleGenerate} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
                <h3 className="text-base font-semibold text-slate-900">입력 정보</h3>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">문서 제목 (선택)</label>
                  <input
                    type="text"
                    value={writeTitle}
                    onChange={(e) => setWriteTitle(e.target.value)}
                    placeholder="예: 2024년 1월 업무보고서"
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-200 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    내용 입력 <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    value={writeContext}
                    onChange={(e) => setWriteContext(e.target.value)}
                    placeholder="문서에 포함할 내용, 메모, 핵심 사항을 입력하세요..."
                    rows={8}
                    required
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-200 focus:outline-none resize-none"
                  />
                  <div className="text-xs text-slate-400 mt-1">{writeContext.length}자 입력됨</div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">참고 서류 첨부 (선택)</label>
                  <input
                    ref={writeFileRef}
                    type="file"
                    accept=".txt,.md,.csv,.json,.xml,.html,.htm,.log,.rtf,.tsv"
                    className="hidden"
                    onChange={(e) => handleWriteFileSelect(e.target.files?.[0])}
                  />
                  <button
                    type="button"
                    onClick={() => writeFileRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-slate-300 text-sm text-slate-500 hover:border-brand-400 hover:text-brand-600 hover:bg-brand-50/50 transition w-full justify-center"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                    {writeFile ? writeFile.name : '파일 첨부 (txt, md, csv, json, xml, html)'}
                  </button>
                  {writeFile && (
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-xs text-brand-600">{writeFile.name} ({(writeFile.size / 1024).toFixed(1)} KB)</span>
                      <button
                        type="button"
                        onClick={() => { setWriteFile(null); if (writeFileRef.current) writeFileRef.current.value = ''; }}
                        className="text-xs text-red-400 hover:text-red-600"
                      >
                        삭제
                      </button>
                    </div>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={writeLoading || !writeContext.trim()}
                  className="w-full px-6 py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {writeLoading ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      AI 문서 생성 중...
                    </>
                  ) : (
                    'AI 문서 생성'
                  )}
                </button>
              </form>

              {writeResult && (
                <div className="bg-white rounded-2xl border border-slate-200 p-6 animate-fadeIn">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-semibold text-slate-900">생성 결과</h3>
                    <div className="flex gap-2">
                      <button
                        onClick={() => sendToRewrite(writeResult)}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
                      >
                        수정 모드
                      </button>
                      <button
                        onClick={() => copyToClipboard(writeResult)}
                        className="px-3 py-1.5 rounded-xl bg-brand-50 text-brand-600 text-xs font-medium hover:bg-brand-100 transition"
                      >
                        복사
                      </button>
                    </div>
                  </div>
                  <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap bg-slate-50 rounded-xl p-5 border border-slate-100 max-h-[600px] overflow-y-auto">
                    {writeResult}
                  </div>
                  <div className="text-xs text-slate-400 mt-3">{writeResult.length}자 &middot; 아카이브에 자동 저장됨</div>
                </div>
              )}
            </>
          )}

          {/* ─── Analyze Tab ─── */}
          {tab === 'analyze' && (
            <>
              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <h3 className="text-base font-semibold text-slate-900 mb-4">분석 유형 선택</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {ANALYSIS_TYPES.map((at) => (
                    <button
                      key={at.id}
                      onClick={() => setAnalysisType(at.id)}
                      className={`p-3 rounded-xl border text-left transition-all duration-200 ${
                        analysisType === at.id
                          ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-200'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className={`text-sm font-semibold ${analysisType === at.id ? 'text-brand-700' : 'text-slate-800'}`}>
                        {at.name}
                      </div>
                      <div className="text-xs text-slate-500 mt-1 line-clamp-2">{at.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              <form onSubmit={handleAnalyze} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
                <h3 className="text-base font-semibold text-slate-900">분석할 문서</h3>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    문서 내용 붙여넣기 <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    value={analyzeContent}
                    onChange={(e) => setAnalyzeContent(e.target.value)}
                    placeholder="분석할 문서의 내용을 여기에 붙여넣으세요..."
                    rows={10}
                    required
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-200 focus:outline-none resize-none"
                  />
                  <div className="text-xs text-slate-400 mt-1">{analyzeContent.length}자 입력됨</div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">또는 파일 첨부</label>
                  <input
                    ref={analyzeFileRef}
                    type="file"
                    accept=".txt,.md,.csv,.json,.xml,.html,.htm,.log,.rtf,.tsv"
                    className="hidden"
                    onChange={(e) => handleAnalyzeFileSelect(e.target.files?.[0])}
                  />
                  <button
                    type="button"
                    onClick={() => analyzeFileRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-slate-300 text-sm text-slate-500 hover:border-brand-400 hover:text-brand-600 hover:bg-brand-50/50 transition w-full justify-center"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                    {analyzeFile ? analyzeFile.name : '파일 첨부 (txt, md, csv, json, xml, html)'}
                  </button>
                  {analyzeFile && (
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-xs text-brand-600">{analyzeFile.name} ({(analyzeFile.size / 1024).toFixed(1)} KB)</span>
                      <button
                        type="button"
                        onClick={() => { setAnalyzeFile(null); if (analyzeFileRef.current) analyzeFileRef.current.value = ''; }}
                        className="text-xs text-red-400 hover:text-red-600"
                      >
                        삭제
                      </button>
                    </div>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={analyzeLoading || !analyzeContent.trim()}
                  className="w-full px-6 py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {analyzeLoading ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      AI 분석 중...
                    </>
                  ) : (
                    'AI 문서 분석'
                  )}
                </button>
              </form>

              {analyzeResult && (
                <div className="bg-white rounded-2xl border border-slate-200 p-6 animate-fadeIn">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-semibold text-slate-900">분석 결과</h3>
                    <button
                      onClick={() => copyToClipboard(analyzeResult)}
                      className="px-3 py-1.5 rounded-xl bg-brand-50 text-brand-600 text-xs font-medium hover:bg-brand-100 transition"
                    >
                      복사
                    </button>
                  </div>
                  <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap bg-slate-50 rounded-xl p-5 border border-slate-100 max-h-[600px] overflow-y-auto">
                    {analyzeResult}
                  </div>
                  <div className="text-xs text-slate-400 mt-3">{analyzeResult.length}자</div>
                </div>
              )}
            </>
          )}

          {/* ─── Rewrite Tab ─── */}
          {tab === 'rewrite' && (
            <>
              <form onSubmit={handleRewrite} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
                <h3 className="text-base font-semibold text-slate-900">문서 수정/개선</h3>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    원본 문서 <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    value={rewriteContent}
                    onChange={(e) => setRewriteContent(e.target.value)}
                    placeholder="수정할 문서의 내용을 여기에 입력하세요..."
                    rows={8}
                    required
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-200 focus:outline-none resize-none"
                  />
                  <div className="text-xs text-slate-400 mt-1">{rewriteContent.length}자</div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    수정 지시사항 <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    value={rewriteInstructions}
                    onChange={(e) => setRewriteInstructions(e.target.value)}
                    placeholder={'수정 방향을 자연어로 입력하세요...\n\n예시:\n- "더 격식있는 톤으로 변경"\n- "항목을 표로 정리"\n- "결론 부분 강화"'}
                    rows={4}
                    required
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-200 focus:outline-none resize-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={rewriteLoading || !rewriteContent.trim() || !rewriteInstructions.trim()}
                  className="w-full px-6 py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {rewriteLoading ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      AI 수정 중...
                    </>
                  ) : (
                    'AI 문서 수정'
                  )}
                </button>
              </form>

              {rewriteResult && (
                <div className="bg-white rounded-2xl border border-slate-200 p-6 animate-fadeIn">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-semibold text-slate-900">수정 결과</h3>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setRewriteContent(rewriteResult); setRewriteResult(''); }}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
                      >
                        재수정
                      </button>
                      <button
                        onClick={() => copyToClipboard(rewriteResult)}
                        className="px-3 py-1.5 rounded-xl bg-brand-50 text-brand-600 text-xs font-medium hover:bg-brand-100 transition"
                      >
                        복사
                      </button>
                    </div>
                  </div>
                  <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap bg-slate-50 rounded-xl p-5 border border-slate-100 max-h-[600px] overflow-y-auto">
                    {rewriteResult}
                  </div>
                  <div className="text-xs text-slate-400 mt-3">{rewriteResult.length}자</div>
                </div>
              )}
            </>
          )}

          {/* ─── Search Tab ─── */}
          {tab === 'search' && (
            <>
              <form onSubmit={handleSearch} className="bg-white rounded-2xl border border-slate-200 p-6">
                <h3 className="text-base font-semibold text-slate-900 mb-4">Dropbox 파일 검색</h3>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="검색어를 입력하세요 (예: 견적서, 계약서...)"
                    className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
                    disabled={!dropboxStatus?.token_valid}
                  />
                  <button
                    type="submit"
                    disabled={searchLoading || !keyword.trim() || !dropboxStatus?.token_valid}
                    className="px-6 py-3 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition disabled:opacity-50 shrink-0"
                  >
                    {searchLoading ? '검색 중...' : '검색'}
                  </button>
                </div>
                {!dropboxStatus?.token_valid && (
                  <div className="mt-3 text-xs text-amber-600 bg-amber-50 rounded-lg p-3 border border-amber-200">
                    ⚠️ Dropbox 연결이 필요합니다. 상단의 "연결" 버튼을 클릭하세요.
                  </div>
                )}
              </form>

              {searched && (
                <div className="bg-white rounded-2xl border border-slate-200 p-6">
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">
                    검색 결과 ({searchResults.length}건)
                  </h3>
                  {searchResults.length > 0 ? (
                    <div className="space-y-2">
                      {searchResults.map((file, i) => (
                        <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100 hover:border-brand-200 hover:bg-brand-50/30 transition">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-slate-900 truncate">{file.name}</div>
                            <div className="text-xs text-slate-500 truncate mt-0.5">{file.path}</div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 ml-4">
                            <span className="text-xs text-slate-400">{formatSize(file.size)}</span>
                            <button
                              onClick={() => analyzeFromSearch(file.name)}
                              className="px-3 py-1.5 rounded-xl bg-brand-50 text-brand-600 text-xs font-medium hover:bg-brand-100 transition"
                            >
                              AI 분석
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-sm text-slate-500">검색 결과가 없습니다.</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ─── Folder Tab ─── */}
          {tab === 'folder' && (
            <>
              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold text-slate-900">AI 업무폴더</h3>
                  <button
                    onClick={loadAiFolder}
                    disabled={loadingFolder || !dropboxStatus?.token_valid}
                    className="px-4 py-2 rounded-xl bg-brand-50 text-brand-600 text-sm font-medium hover:bg-brand-100 transition disabled:opacity-50"
                  >
                    {loadingFolder ? '로딩 중...' : '새로고침'}
                  </button>
                </div>

                {!dropboxStatus?.token_valid ? (
                  <div className="text-center py-12">
                    <div className="text-4xl mb-3">📁</div>
                    <p className="text-sm text-slate-500">Dropbox 연결 후 AI 업무폴더를 확인할 수 있습니다.</p>
                    <button
                      onClick={connectDropbox}
                      disabled={connecting}
                      className="mt-4 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition disabled:opacity-50"
                    >
                      {connecting ? '연결 중...' : '지금 연결하기'}
                    </button>
                  </div>
                ) : aiFiles.length > 0 ? (
                  <div className="space-y-2">
                    {aiFiles.map((file, i) => (
                      <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100 hover:border-brand-200 hover:bg-brand-50/30 transition">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-900 truncate">{file.name}</div>
                          <div className="text-xs text-slate-400 mt-0.5">{formatSize(file.size)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="text-4xl mb-3">📂</div>
                    <p className="text-sm text-slate-500">AI 업무폴더가 비어있습니다.</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Sidebar - 1 col */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <div className="bg-gradient-to-br from-brand-50 to-cyan-50 rounded-2xl border border-brand-200 p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">빠른 워크플로우</h3>
            <div className="space-y-2 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <span className="text-brand-600">🔍</span>
                <span>검색 → AI 분석 → 인사이트</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-brand-600">📝</span>
                <span>작성 → 수정 → Dropbox 저장</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-brand-600">📁</span>
                <span>폴더 → 다운로드 → 분석</span>
              </div>
            </div>
          </div>

          {/* Document History */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-900">생성 히스토리</h3>
              <button
                onClick={loadHistory}
                className="text-xs text-brand-600 hover:text-brand-700 font-medium"
              >
                새로고침
              </button>
            </div>
            {history.length > 0 ? (
              <div className="space-y-2">
                {history.map((doc) => (
                  <div key={doc.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100 hover:border-slate-200 transition">
                    <div className="text-xs font-semibold text-slate-800 truncate">{doc.file_name}</div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="inline-block px-2 py-0.5 rounded-full bg-brand-50 text-brand-600 text-xs font-medium">
                        {doc.category}
                      </span>
                      <span className="text-xs text-slate-400">{formatSize(doc.file_size)}</span>
                    </div>
                    <div className="text-xs text-slate-400 mt-1">{formatDate(doc.created_at)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6">
                <div className="text-xs text-slate-400">생성된 문서가 없습니다</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
