'use client';

import { useState, useEffect } from 'react';
import { apiUrl, authHeaders, authJsonHeaders } from '@/lib/api';

interface FileResult {
  name: string;
  path: string;
  size: string;
  modified?: string;
}

interface DropboxStatus {
  configured: boolean;
  token_valid: boolean;
}

export default function FilesPage() {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<FileResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const [aiFiles, setAiFiles] = useState<FileResult[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [dropboxStatus, setDropboxStatus] = useState<DropboxStatus | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    checkDropboxStatus();
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
        // 새 창에서 인증 진행
        const authWindow = window.open(data.auth_url, '_blank', 'width=600,height=700');

        // 인증 완료 후 상태 확인 (3초마다)
        const checkInterval = setInterval(async () => {
          if (authWindow && authWindow.closed) {
            clearInterval(checkInterval);
            await checkDropboxStatus();
            setConnecting(false);
          }
        }, 3000);

        // 최대 5분 후 타임아웃
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

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim()) return;

    if (!dropboxStatus?.token_valid) {
      alert('드롭박스 연결이 필요합니다.');
      return;
    }

    setLoading(true);
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
        setResults(
          data.data.map((f: any) => ({
            name: f.name || f.file_name || '',
            path: f.path || f.file_path || '',
            size: f.size || f.file_size || '',
            modified: f.modified || '',
          }))
        );
      } else {
        setResults([]);
      }
    } catch (err: any) {
      setError(err.message || '검색에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const saveToAiFolder = async (filePath: string) => {
    setSaving(filePath);
    try {
      const response = await fetch(apiUrl('/api/v1/files/save-to-ai-folder'), {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify({ file_path: filePath }),
      });
      if (!response.ok) throw new Error('저장 실패');
      const data = await response.json();
      if (data.status === 'success') {
        alert('AI 업무폴더에 저장 완료!');
        loadAiFolder();
      }
    } catch {
      alert('저장에 실패했습니다.');
    } finally {
      setSaving(null);
    }
  };

  const loadAiFolder = async () => {
    if (!dropboxStatus?.token_valid) return;

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
    } catch {
      // ignore
    }
  };

  const formatSize = (size: string | number) => {
    const num = typeof size === 'string' ? parseInt(size) : size;
    if (isNaN(num)) return size;
    if (num < 1024) return `${num} B`;
    if (num < 1048576) return `${(num / 1024).toFixed(1)} KB`;
    return `${(num / 1048576).toFixed(1)} MB`;
  };

  const getDropboxStatusBadge = () => {
    if (checkingStatus) {
      return <span className="px-3 py-1 bg-slate-100 text-slate-500 text-xs font-medium rounded-full">확인 중...</span>;
    }

    if (!dropboxStatus?.configured) {
      return <span className="px-3 py-1 bg-red-100 text-red-700 text-xs font-semibold rounded-full">❌ 설정 안됨</span>;
    }

    if (dropboxStatus.token_valid) {
      return <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full">✅ 연결됨</span>;
    }

    return <span className="px-3 py-1 bg-yellow-100 text-yellow-700 text-xs font-semibold rounded-full">⚠️ 재연결 필요</span>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">파일 검색</h1>
          <p className="text-slate-500 mt-1 text-sm">드롭박스 파일 검색 및 AI 업무폴더 관리</p>
        </div>
      </div>

      {/* Dropbox 연결 상태 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 1.807L0 5.629l6 3.822 6-3.822L6 1.807zM18 1.807l-6 3.822 6 3.822 6-3.822-6-3.822zM0 13.274l6 3.822 6-3.822-6-3.822-6 3.822zm12 0l6 3.822 6-3.822-6-3.822-6 3.822zM6 20.85l6-3.822-6-3.822-6 3.822L6 20.85zm12 0l6-3.822-6-3.822-6 3.822 6 3.822z"/>
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">Dropbox 연동</h3>
                {getDropboxStatusBadge()}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {dropboxStatus?.token_valid
                  ? 'Dropbox 파일 검색이 가능합니다.'
                  : dropboxStatus?.configured
                    ? 'Dropbox 인증이 만료되었습니다. 재연결해주세요.'
                    : 'Dropbox 앱 키가 설정되지 않았습니다.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={checkDropboxStatus}
              disabled={checkingStatus}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 disabled:opacity-50 transition"
            >
              🔄 새로고침
            </button>
            {dropboxStatus?.configured && (
              <button
                onClick={connectDropbox}
                disabled={connecting}
                className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition disabled:opacity-50"
              >
                {connecting ? '연결 중...' : dropboxStatus.token_valid ? '재연결' : '연결하기'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Search Form */}
      <form onSubmit={handleSearch} className="flex gap-3">
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="검색어를 입력하세요 (예: 견적서, 계약서...)"
          className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
          disabled={!dropboxStatus?.token_valid}
        />
        <button
          type="submit"
          disabled={loading || !keyword.trim() || !dropboxStatus?.token_valid}
          className="px-6 py-3 rounded-2xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition disabled:opacity-50 shrink-0"
        >
          {loading ? '검색 중...' : '검색'}
        </button>
      </form>

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-2xl text-sm border border-red-200">
          {error}
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
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{file.name}</div>
                    <div className="text-xs text-slate-500 truncate mt-0.5">{file.path}</div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-4">
                    <span className="text-xs text-slate-400">{formatSize(file.size)}</span>
                    <button
                      onClick={() => saveToAiFolder(file.path)}
                      disabled={saving === file.path}
                      className="px-3 py-1.5 rounded-xl bg-brand-50 text-brand-600 text-xs font-medium hover:bg-brand-100 transition disabled:opacity-50"
                    >
                      {saving === file.path ? '저장 중...' : 'AI 폴더로 복사'}
                    </button>
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

      {/* AI Folder Contents */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700">AI 업무폴더</h3>
          <button
            onClick={loadAiFolder}
            disabled={!dropboxStatus?.token_valid}
            className="text-xs text-brand-600 hover:text-brand-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            새로고침
          </button>
        </div>
        {aiFiles.length > 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
            {aiFiles.map((file, i) => (
              <div key={i} className="flex items-center justify-between p-4">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900 truncate">{file.name}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{formatSize(file.size)}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center">
            <p className="text-sm text-slate-400">
              {dropboxStatus?.token_valid
                ? 'AI 업무폴더가 비어있습니다. "새로고침"을 클릭하여 확인하세요.'
                : 'Dropbox 연결 후 AI 업무폴더를 확인할 수 있습니다.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
