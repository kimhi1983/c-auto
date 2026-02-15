'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiUrl, authHeaders, authJsonHeaders } from '@/lib/api';

interface FileResult {
  name: string;
  path: string;
  size: number;
  modified?: string;
  is_folder?: boolean;
}

export default function FilesPage() {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<FileResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  // Dropbox 상태
  const [dbxStatus, setDbxStatus] = useState<{ configured: boolean; token_valid: boolean } | null>(null);
  const [dbxAuthUrl, setDbxAuthUrl] = useState('');
  const [checkingDbx, setCheckingDbx] = useState(true);

  // AI 업무폴더
  const [aiFiles, setAiFiles] = useState<FileResult[]>([]);
  const [loadingAi, setLoadingAi] = useState(false);
  const [aiPath, setAiPath] = useState('/AI업무폴더');

  // ─── Dropbox 상태 확인 ───
  const checkDropboxStatus = useCallback(async () => {
    setCheckingDbx(true);
    try {
      const res = await fetch(apiUrl('/api/v1/dropbox/status'));
      const json = await res.json();
      if (json.status === 'success') {
        setDbxStatus(json.data);
        if (json.data.token_valid) loadAiFolder();
      }
    } catch {}
    finally { setCheckingDbx(false); }
  }, []);

  useEffect(() => { checkDropboxStatus(); }, [checkDropboxStatus]);

  // ─── Dropbox 인증 URL 가져오기 ───
  const getAuthUrl = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/v1/dropbox/auth-url'), { headers: authHeaders() });
      const json = await res.json();
      if (json.auth_url) {
        setDbxAuthUrl(json.auth_url);
        window.open(json.auth_url, '_blank', 'width=600,height=700');
      }
    } catch { setError('Dropbox 인증 URL을 가져올 수 없습니다.'); }
  }, []);

  // ─── 드롭박스 파일 검색 ───
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim()) return;

    setLoading(true);
    setError('');
    setSearched(true);

    try {
      const res = await fetch(apiUrl('/api/v1/dropbox/search'), {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify({ query: keyword.trim() }),
      });
      const json = await res.json();

      if (json.status === 'success' && json.data) {
        setResults(json.data);
      } else if (json.need_reauth) {
        setError('Dropbox 인증이 만료되었습니다. 아래 버튼으로 재인증해주세요.');
        setDbxStatus({ configured: true, token_valid: false });
      } else {
        setError(json.detail || json.message || '검색 실패');
        setResults([]);
      }
    } catch (err: any) {
      setError(err.message || '검색에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // ─── AI 업무폴더 조회 ───
  const loadAiFolder = useCallback(async (path?: string) => {
    const targetPath = path || aiPath;
    setLoadingAi(true);
    try {
      const res = await fetch(apiUrl('/api/v1/dropbox/list'), {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify({ path: targetPath }),
      });
      const json = await res.json();
      if (json.status === 'success' && json.data) {
        setAiFiles(json.data);
        if (path) setAiPath(path);
      } else if (json.need_reauth) {
        setDbxStatus({ configured: true, token_valid: false });
      }
    } catch {}
    finally { setLoadingAi(false); }
  }, [aiPath]);

  // ─── 파일 다운로드 링크 ───
  const openFile = useCallback(async (filePath: string) => {
    try {
      const res = await fetch(apiUrl('/api/v1/dropbox/link'), {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify({ path: filePath }),
      });
      const json = await res.json();
      if (json.link) {
        window.open(json.link, '_blank');
      } else {
        setError('다운로드 링크를 생성할 수 없습니다.');
      }
    } catch { setError('다운로드 실패'); }
  }, []);

  const formatSize = (size: number) => {
    if (!size || size === 0) return '-';
    if (size < 1024) return `${size} B`;
    if (size < 1048576) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / 1048576).toFixed(1)} MB`;
  };

  const formatDate = (d?: string) => {
    if (!d) return '';
    try { return new Date(d).toLocaleDateString('ko-KR'); } catch { return d; }
  };

  const isConnected = dbxStatus?.configured && dbxStatus?.token_valid;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">파일 검색</h1>
        <p className="text-slate-500 mt-1">드롭박스 파일 검색 및 AI 업무폴더 관리</p>
      </div>

      {/* Dropbox 연결 상태 */}
      {checkingDbx ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-slate-500">드롭박스 연결 확인 중...</span>
        </div>
      ) : !isConnected ? (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-amber-800">
                {dbxStatus?.configured ? 'Dropbox 인증이 만료되었습니다' : 'Dropbox가 연결되지 않았습니다'}
              </h3>
              <p className="text-xs text-amber-600 mt-0.5">
                파일 검색을 사용하려면 Dropbox 인증이 필요합니다.
              </p>
            </div>
            <button
              onClick={getAuthUrl}
              className="px-4 py-2 bg-amber-600 text-white rounded-xl text-sm font-medium hover:bg-amber-700 transition shrink-0"
            >
              {dbxStatus?.configured ? '재인증' : 'Dropbox 연결'}
            </button>
          </div>
          {dbxAuthUrl && (
            <div className="mt-3 pt-3 border-t border-amber-200">
              <p className="text-xs text-amber-600">
                팝업이 차단된 경우:{' '}
                <a href={dbxAuthUrl} target="_blank" rel="noopener noreferrer" className="underline font-medium">
                  여기를 클릭
                </a>
                하여 인증한 후{' '}
                <button onClick={checkDropboxStatus} className="underline font-medium">
                  새로고침
                </button>
                해주세요.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-2.5 flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full" />
          <span className="text-xs font-medium text-green-700">Dropbox 연결됨</span>
          <button onClick={checkDropboxStatus} className="text-xs text-green-500 hover:text-green-700 ml-auto">
            상태 확인
          </button>
        </div>
      )}

      {/* Search Form */}
      <form onSubmit={handleSearch} className="flex gap-3">
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="검색어를 입력하세요 (예: 견적서, 계약서, MSDS...)"
          className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
          disabled={!isConnected}
        />
        <button
          type="submit"
          disabled={loading || !keyword.trim() || !isConnected}
          className="px-6 py-3 rounded-2xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition disabled:opacity-50 shrink-0"
        >
          {loading ? '검색 중...' : '검색'}
        </button>
      </form>

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-2xl text-sm border border-red-200">
          {error}
          <button onClick={() => setError('')} className="float-right text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}

      {/* Search Results */}
      {searched && (
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-3">
            검색 결과 ({results.length}건)
          </h3>
          {results.length > 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
              {results.map((file, i) => (
                <div key={i} className="flex items-center justify-between p-4 hover:bg-slate-50 transition">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${file.is_folder ? 'bg-amber-50' : 'bg-blue-50'}`}>
                      {file.is_folder ? (
                        <svg className="w-4.5 h-4.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                      ) : (
                        <svg className="w-4.5 h-4.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{file.name}</div>
                      <div className="text-xs text-slate-400 truncate mt-0.5">{file.path}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-4">
                    <div className="text-right">
                      <div className="text-xs text-slate-400">{formatSize(file.size)}</div>
                      {file.modified && <div className="text-[10px] text-slate-300">{formatDate(file.modified)}</div>}
                    </div>
                    {!file.is_folder && (
                      <button
                        onClick={() => openFile(file.path)}
                        className="px-3 py-1.5 rounded-xl bg-brand-50 text-brand-600 text-xs font-medium hover:bg-brand-100 transition"
                      >
                        다운로드
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
              <p className="text-sm text-slate-500">검색 결과가 없습니다.</p>
            </div>
          )}
        </div>
      )}

      {/* AI 업무폴더 */}
      {isConnected && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-700">AI 업무폴더</h3>
              {aiPath !== '/AI업무폴더' && (
                <button
                  onClick={() => loadAiFolder('/AI업무폴더')}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  ← 상위 폴더
                </button>
              )}
              <span className="text-xs text-slate-400">{aiPath}</span>
            </div>
            <button
              onClick={() => loadAiFolder()}
              disabled={loadingAi}
              className="text-xs text-brand-600 hover:text-brand-700 font-medium disabled:opacity-50"
            >
              {loadingAi ? '로딩...' : '새로고침'}
            </button>
          </div>
          {aiFiles.length > 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
              {aiFiles.map((file, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-4 hover:bg-slate-50 transition cursor-pointer"
                  onClick={() => file.is_folder ? loadAiFolder(file.path) : openFile(file.path)}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${file.is_folder ? 'bg-amber-50' : 'bg-blue-50'}`}>
                      {file.is_folder ? (
                        <svg className="w-4.5 h-4.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                      ) : (
                        <svg className="w-4.5 h-4.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{file.name}</div>
                      {file.modified && <div className="text-xs text-slate-400 mt-0.5">{formatDate(file.modified)}</div>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    {!file.is_folder && <span className="text-xs text-slate-400">{formatSize(file.size)}</span>}
                    {file.is_folder && (
                      <svg className="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center">
              <p className="text-sm text-slate-400">
                {loadingAi ? '폴더 내용을 불러오는 중...' : 'AI 업무폴더가 비어있습니다.'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
