'use client';

import { useEffect, useState, useRef } from 'react';
import { apiUrl, authHeaders, authJsonHeaders } from '@/lib/api';

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

interface DropboxStatus {
  configured: boolean;
  token_valid: boolean;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  content: string;
  type?: 'write' | 'analyze' | 'rewrite' | 'search';
  timestamp: Date;
  loading?: boolean;
}

function getAuthHeaders(): Record<string, string> { return authHeaders(); }
function getAuthJsonHeaders(): Record<string, string> { return authJsonHeaders(); }

function formatDate(iso: string) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatSize(size: string | number) {
  const num = typeof size === 'string' ? parseInt(size) : size;
  if (isNaN(num)) return String(size);
  if (num < 1024) return `${num} B`;
  if (num < 1048576) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / 1048576).toFixed(1)} MB`;
}

export default function AiDocsPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'write' | 'analyze' | 'rewrite' | 'search'>('write');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [dropboxStatus, setDropboxStatus] = useState<DropboxStatus | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    checkDropboxStatus();
    loadTemplates();
    loadHistory();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  }, [input]);

  const checkDropboxStatus = async () => {
    try {
      const res = await fetch(apiUrl('/api/v1/dropbox/status'));
      if (res.ok) { const data = await res.json(); setDropboxStatus(data.data); }
    } catch { /* silent */ }
  };

  const connectDropbox = async () => {
    setConnecting(true);
    try {
      const res = await fetch(apiUrl('/api/v1/dropbox/auth-url'), { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('인증 URL 생성 실패');
      const data = await res.json();
      if (data.status === 'success' && data.auth_url) {
        const authWindow = window.open(data.auth_url, '_blank', 'width=600,height=700');
        const checkInterval = setInterval(async () => {
          if (authWindow && authWindow.closed) {
            clearInterval(checkInterval);
            await checkDropboxStatus();
            setConnecting(false);
          }
        }, 3000);
        setTimeout(() => { clearInterval(checkInterval); setConnecting(false); }, 300000);
      }
    } catch (err: any) {
      alert(err.message || '드롭박스 연결 실패');
      setConnecting(false);
    }
  };

  const loadTemplates = async () => {
    try {
      const res = await fetch(apiUrl('/api/v1/ai-docs/templates'), { headers: getAuthHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      if (data.status === 'success' && data.templates) {
        setTemplates(data.templates);
        if (data.templates.length > 0) setSelectedTemplate(data.templates[0].id);
      }
    } catch { /* silent */ }
  };

  const loadHistory = async () => {
    try {
      const res = await fetch(apiUrl('/api/v1/ai-docs/history?page=1&page_size=20'), { headers: getAuthHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      if (data.status === 'success' && data.documents) setHistory(data.documents);
    } catch { /* silent */ }
  };

  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('파일 읽기 실패'));
      reader.readAsText(file, 'UTF-8');
    });
  };

  const parsePDF = async (file: File): Promise<string> => {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map((item: any) => item.str).join(' '));
    }
    return pages.join('\n\n');
  };

  const parseWord = async (file: File): Promise<string> => {
    const mammoth = await import('mammoth');
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  };

  const parsePPT = async (file: File): Promise<string> => {
    const JSZip = (await import('jszip')).default;
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const slideFiles = Object.keys(zip.files)
      .filter(name => /ppt\/slides\/slide\d+\.xml/.test(name))
      .sort((a, b) => {
        const numA = parseInt(a.match(/slide(\d+)/)?.[1] || '0');
        const numB = parseInt(b.match(/slide(\d+)/)?.[1] || '0');
        return numA - numB;
      });
    const pages: string[] = [];
    for (const slideName of slideFiles) {
      const slideXml = await zip.files[slideName].async('string');
      const matches = slideXml.match(/<a:t>(.*?)<\/a:t>/g);
      if (matches) {
        pages.push(matches.map(m => m.replace(/<\/?a:t>/g, '')).join(' '));
      }
    }
    return pages.join('\n\n');
  };

  const parseExcel = async (file: File): Promise<string> => {
    const XLSX = await import('xlsx');
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer);
    const sheets: string[] = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      sheets.push(`[${sheetName}]\n` + XLSX.utils.sheet_to_csv(sheet));
    }
    return sheets.join('\n\n');
  };

  const textExtensions = ['txt', 'md', 'csv', 'json', 'xml', 'html', 'htm', 'log', 'rtf', 'tsv'];
  const docExtensions = ['pdf', 'docx', 'pptx', 'xlsx', 'xls'];
  const allExtensions = [...textExtensions, ...docExtensions];

  const handleFileSelect = async (file: File | undefined) => {
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!allExtensions.includes(ext)) {
      alert(`지원하지 않는 파일 형식입니다 (${ext})\n\n지원 형식: PDF, Word(.docx), PPT(.pptx), Excel(.xlsx), 텍스트 파일`);
      return;
    }
    const maxSize = docExtensions.includes(ext) ? 10 * 1024 * 1024 : 1024 * 1024;
    if (file.size > maxSize) {
      alert(`파일 크기는 ${docExtensions.includes(ext) ? '10MB' : '1MB'} 이하만 가능합니다.`);
      return;
    }
    try {
      let text = '';
      if (textExtensions.includes(ext)) {
        text = await readFileAsText(file);
      } else if (ext === 'pdf') {
        text = await parsePDF(file);
      } else if (ext === 'docx') {
        text = await parseWord(file);
      } else if (ext === 'pptx') {
        text = await parsePPT(file);
      } else if (ext === 'xlsx' || ext === 'xls') {
        text = await parseExcel(file);
      }
      if (text.trim()) {
        setInput(prev => prev ? prev + `\n\n--- ${file.name} ---\n` + text : text);
      } else {
        alert('파일에서 텍스트를 추출할 수 없습니다.');
      }
    } catch {
      alert('파일을 읽을 수 없습니다. 파일이 손상되었거나 지원하지 않는 형식일 수 있습니다.');
    }
  };

  const dragCounter = useRef(0);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes('Files')) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;
    const files = e.dataTransfer.files;
    if (files.length > 0) handleFileSelect(files[0]);
  };

  const addMessage = (role: 'user' | 'ai', content: string, type?: ChatMessage['type'], loading?: boolean): string => {
    const id = Date.now().toString() + Math.random().toString(36).slice(2);
    setMessages(prev => [...prev, { id, role, content, type, timestamp: new Date(), loading }]);
    return id;
  };

  const updateMessage = (id: string, content: string, loading?: boolean) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, content, loading: loading ?? false } : m));
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    setInput('');
    setIsLoading(true);
    addMessage('user', text, mode);
    const aiMsgId = addMessage('ai', '', mode, true);

    try {
      let result = '';

      if (mode === 'write') {
        const res = await fetch(apiUrl(`/api/v1/ai-docs/generate?template_id=${selectedTemplate}&save=true`), {
          method: 'POST', headers: getAuthJsonHeaders(),
          body: JSON.stringify({ context: text, title: null }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || '문서 생성 실패');
        const data = await res.json();
        if (data.status === 'success' && data.data) { result = data.data.content; loadHistory(); }
      } else if (mode === 'analyze') {
        const res = await fetch(apiUrl('/api/v1/ai-docs/analyze'), {
          method: 'POST', headers: getAuthJsonHeaders(),
          body: JSON.stringify({ content: text, analysis_type: 'general' }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || '분석 실패');
        const data = await res.json();
        if (data.status === 'success' && data.data) result = data.data.content;
      } else if (mode === 'rewrite') {
        const parts = text.split(/\n---\s*수정\s*지시\s*---\n/);
        const content = parts[0] || text;
        const instructions = parts[1] || '더 자연스럽고 전문적으로 수정해주세요';
        const res = await fetch(apiUrl('/api/v1/ai-docs/rewrite'), {
          method: 'POST', headers: getAuthJsonHeaders(),
          body: JSON.stringify({ content, instructions }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || '수정 실패');
        const data = await res.json();
        if (data.status === 'success' && data.data) result = data.data.content;
      } else if (mode === 'search') {
        if (!dropboxStatus?.token_valid) { updateMessage(aiMsgId, 'Dropbox 연결이 필요합니다. 상단에서 연결해주세요.'); setIsLoading(false); return; }
        const res = await fetch(apiUrl('/api/v1/dropbox/search'), {
          method: 'POST', headers: getAuthJsonHeaders(),
          body: JSON.stringify({ query: text }),
        });
        if (!res.ok) throw new Error('검색 실패');
        const data = await res.json();
        if (data.status === 'success' && data.data && data.data.length > 0) {
          result = `검색 결과 (${data.data.length}건):\n\n` +
            data.data.map((f: any, i: number) => `${i + 1}. ${f.name || f.file_name}\n   경로: ${f.path || f.file_path}\n   크기: ${formatSize(f.size || f.file_size || 0)}`).join('\n\n');
        } else {
          result = `"${text}"에 대한 검색 결과가 없습니다.`;
        }
      }

      updateMessage(aiMsgId, result || '결과를 가져올 수 없습니다.');
    } catch (err: any) {
      updateMessage(aiMsgId, `오류: ${err.message || '요청에 실패했습니다.'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const modeConfig = {
    write: { label: '작성', icon: '📝', color: 'bg-brand-500', placeholder: '작성할 문서 내용, 메모, 핵심 사항을 입력하세요...' },
    analyze: { label: '분석', icon: '📊', color: 'bg-indigo-500', placeholder: '분석할 문서 내용을 붙여넣으세요...' },
    rewrite: { label: '수정', icon: '✏️', color: 'bg-amber-500', placeholder: '수정할 원문을 입력하세요...\n\n--- 수정 지시 ---\n수정 방향을 여기에 입력' },
    search: { label: '검색', icon: '🔍', color: 'bg-emerald-500', placeholder: '검색어를 입력하세요 (예: 견적서, 계약서...)' },
  };

  const currentMode = modeConfig[mode];

  return (
    <div className="flex h-[calc(100vh-7rem)] gap-0 relative"
      onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}>
      {/* Drag Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-brand-500/10 border-2 border-dashed border-brand-500 rounded-2xl flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-lg px-8 py-6 text-center">
            <div className="text-4xl mb-2">📎</div>
            <div className="text-base font-bold text-slate-900">파일을 여기에 놓으세요</div>
            <div className="text-xs text-slate-500 mt-1">PDF, Word, PPT, Excel, 텍스트 파일 지원</div>
          </div>
        </div>
      )}
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-slate-800 to-slate-900 rounded-lg flex items-center justify-center">
              <span className="text-white text-xs font-bold">AI</span>
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900">AI 문서 어시스턴트</div>
              <div className="text-xs text-slate-400">Claude Sonnet 4.5</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {dropboxStatus?.token_valid ? (
              <span className="px-2.5 py-1 bg-green-50 text-green-700 text-xs font-semibold rounded-lg border border-green-200">Dropbox 연결됨</span>
            ) : dropboxStatus?.configured ? (
              <button onClick={connectDropbox} disabled={connecting} className="px-2.5 py-1 bg-amber-50 text-amber-700 text-xs font-semibold rounded-lg border border-amber-200 hover:bg-amber-100 transition">
                {connecting ? '연결 중...' : 'Dropbox 연결'}
              </button>
            ) : null}
            <button onClick={() => setShowHistory(!showHistory)} className={`p-2 rounded-lg transition ${showHistory ? 'bg-slate-200 text-slate-700' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </button>
          </div>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 bg-slate-50/50">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl flex items-center justify-center mb-4">
                <span className="text-white text-2xl font-bold">AI</span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 mb-1">AI 문서 어시스턴트</h2>
              <p className="text-sm text-slate-500 mb-6 max-w-md">문서 작성, 분석, 수정을 도와드립니다. 아래에서 모드를 선택하고 내용을 입력하세요.</p>

              {/* Template Quick Select */}
              <div className="w-full max-w-lg space-y-3">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">빠른 시작</div>
                <div className="grid grid-cols-2 gap-2">
                  {templates.slice(0, 4).map((tpl) => (
                    <button key={tpl.id} onClick={() => { setSelectedTemplate(tpl.id); setMode('write'); setInput(`[${tpl.name}] `); textareaRef.current?.focus(); }}
                      className="p-3 rounded-xl border border-slate-200 bg-white text-left hover:border-brand-300 hover:bg-brand-50/30 transition group">
                      <div className="text-sm font-semibold text-slate-800 group-hover:text-brand-600">{tpl.name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{tpl.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] ${msg.role === 'user' ? 'order-2' : ''}`}>
                {msg.role === 'ai' && (
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-6 h-6 bg-gradient-to-br from-slate-800 to-slate-900 rounded-md flex items-center justify-center">
                      <span className="text-white text-[10px] font-bold">AI</span>
                    </div>
                    <span className="text-xs text-slate-500">{currentMode.label} 결과</span>
                  </div>
                )}
                <div className={`rounded-2xl px-4 py-3 ${
                  msg.role === 'user'
                    ? 'bg-slate-900 text-white'
                    : 'bg-white border border-slate-200 text-slate-700'
                }`}>
                  {msg.loading ? (
                    <div className="flex items-center gap-2 py-1">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                      <span className="text-xs text-slate-400">AI가 처리 중...</span>
                    </div>
                  ) : (
                    <div className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                  )}
                </div>
                {msg.role === 'ai' && !msg.loading && msg.content && (
                  <div className="flex gap-1.5 mt-1.5 ml-1">
                    <button onClick={() => copyToClipboard(msg.content)} className="px-2.5 py-1 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition">복사</button>
                    <button onClick={() => { setMode('rewrite'); setInput(msg.content + '\n\n--- 수정 지시 ---\n'); textareaRef.current?.focus(); }} className="px-2.5 py-1 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition">수정</button>
                  </div>
                )}
                <div className={`text-xs mt-1 ${msg.role === 'user' ? 'text-right text-slate-400' : 'text-slate-400 ml-1'}`}>
                  {msg.timestamp.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Input Area */}
        <div className="border-t border-slate-200 bg-white px-4 py-3 shrink-0">
          {/* Mode Selector */}
          <div className="flex items-center gap-1.5 mb-2">
            {(Object.entries(modeConfig) as [typeof mode, typeof currentMode][]).map(([key, cfg]) => (
              <button key={key} onClick={() => setMode(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${mode === key ? `${cfg.color} text-white` : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                {cfg.icon} {cfg.label}
              </button>
            ))}
            {mode === 'write' && (
              <>
                <div className="w-px h-5 bg-slate-200 mx-1" />
                <button onClick={() => setShowTemplates(!showTemplates)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition">
                  템플릿: {templates.find(t => t.id === selectedTemplate)?.name || '선택'}
                </button>
              </>
            )}
          </div>

          {/* Template Dropdown */}
          {showTemplates && mode === 'write' && (
            <div className="mb-2 p-2 bg-slate-50 rounded-xl border border-slate-200">
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                {templates.map((tpl) => (
                  <button key={tpl.id} onClick={() => { setSelectedTemplate(tpl.id); setShowTemplates(false); }}
                    className={`px-3 py-2 rounded-lg text-xs text-left transition ${selectedTemplate === tpl.id ? 'bg-brand-500 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:border-brand-300'}`}>
                    <div className="font-semibold">{tpl.name}</div>
                    <div className={`mt-0.5 ${selectedTemplate === tpl.id ? 'text-white/80' : 'text-slate-400'}`}>{tpl.description}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Text Input */}
          <div className="flex items-end gap-2">
            <input ref={fileRef} type="file" accept=".txt,.md,.csv,.json,.xml,.html,.htm,.log,.rtf,.tsv,.pdf,.docx,.pptx,.xlsx,.xls" className="hidden"
              onChange={(e) => { handleFileSelect(e.target.files?.[0]); e.target.value = ''; }} />
            <button onClick={() => fileRef.current?.click()} className="p-2.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition shrink-0 mb-0.5">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </button>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={currentMode.placeholder}
              rows={1}
              className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-200 focus:outline-none resize-none max-h-[200px] overflow-y-auto"
            />
            <button onClick={handleSend} disabled={isLoading || !input.trim()}
              className="p-2.5 rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition disabled:opacity-30 shrink-0 mb-0.5">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19V5m0 0l-7 7m7-7l7 7" />
              </svg>
            </button>
          </div>
          <div className="text-xs text-slate-400 mt-1.5 px-1">Shift+Enter로 줄바꿈 | Enter로 전송</div>
        </div>
      </div>

      {/* History Sidebar */}
      {showHistory && (
        <div className="w-72 border-l border-slate-200 bg-white flex flex-col shrink-0 animate-fadeIn">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">히스토리</h3>
            <button onClick={loadHistory} className="text-xs text-brand-600 hover:text-brand-700 font-medium">새로고침</button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {history.length > 0 ? history.map((doc) => (
              <div key={doc.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100 hover:border-slate-200 transition cursor-pointer">
                <div className="text-xs font-semibold text-slate-800 truncate">{doc.file_name}</div>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="inline-block px-2 py-0.5 rounded-full bg-brand-50 text-brand-600 text-[10px] font-medium">{doc.category}</span>
                  <span className="text-[10px] text-slate-400">{formatSize(doc.file_size)}</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-1">{formatDate(doc.created_at)}</div>
              </div>
            )) : (
              <div className="text-center py-8 text-xs text-slate-400">생성된 문서가 없습니다</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
