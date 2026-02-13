'use client';

import { useState } from 'react';
import { apiUrl, authHeaders, authJsonHeaders } from '@/lib/api';

interface FileResult {
  name: string;
  path: string;
  size: string;
  modified?: string;
}

export default function FilesPage() {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<FileResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const [aiFiles, setAiFiles] = useState<FileResult[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim()) return;

    setLoading(true);
    setError('');
    setSearched(true);

    try {
      const response = await fetch(apiUrl(`/api/v1/files/search?keyword=${encodeURIComponent(keyword)}`), {
        headers: authHeaders(),
      });
      if (!response.ok) throw new Error('파일 검색 실패');
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
    try {
      const response = await fetch(apiUrl('/api/v1/files/ai-folder'), {
        headers: authHeaders(),
      });
      if (!response.ok) return;
      const data = await response.json();
      if (data.status === 'success' && data.data) {
        setAiFiles(
          data.data.map((f: any) => ({
            name: f.name || '',
            path: f.path || '',
            size: f.size || '',
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">파일 검색</h1>
        <p className="text-slate-500 mt-1">드롭박스 파일 검색 및 AI 업무폴더 관리</p>
      </div>

      {/* Search Form */}
      <form onSubmit={handleSearch} className="flex gap-3">
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="검색어를 입력하세요 (예: 견적서, 계약서...)"
          className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading || !keyword.trim()}
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
            className="text-xs text-brand-600 hover:text-brand-700 font-medium"
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
            <p className="text-sm text-slate-400">AI 업무폴더가 비어있습니다. &quot;새로고침&quot;을 클릭하여 확인하세요.</p>
          </div>
        )}
      </div>
    </div>
  );
}
