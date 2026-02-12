'use client';

import { useState } from 'react';

interface EmailResult {
  subject: string;
  category: string;
  ai_response: string;
  sender?: string;
  date?: string;
}

export default function EmailsPage() {
  const [emails, setEmails] = useState<EmailResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fetchingNew, setFetchingNew] = useState(false);

  const fetchEmails = async () => {
    setFetchingNew(true);
    setError('');

    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch('/check-emails', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });

      if (!response.ok) throw new Error('이메일 조회 실패');
      const data = await response.json();

      if (data.status === 'success' && data.data) {
        const emailData = data.data;
        const newEmails: EmailResult[] = [];

        if (emailData.first_email) {
          newEmails.push({
            subject: emailData.first_email.subject || '제목 없음',
            category: emailData.first_email.category || '미분류',
            ai_response: emailData.first_email.ai_response || '',
            sender: emailData.first_email.sender || '',
            date: emailData.first_email.date || new Date().toLocaleDateString('ko-KR'),
          });
        }

        setEmails(newEmails);
      }
    } catch (err: any) {
      setError(err.message || '이메일을 불러오는데 실패했습니다.');
    } finally {
      setFetchingNew(false);
    }
  };

  const loadWorkLog = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/work-log');
      if (!response.ok) throw new Error('업무 기록 조회 실패');
      const data = await response.json();

      if (data.status === 'success' && data.data) {
        const mapped: EmailResult[] = data.data.map((row: any) => ({
          subject: row['제목'] || row['subject'] || '제목 없음',
          category: row['카테고리'] || row['category'] || '미분류',
          ai_response: row['AI 답변'] || row['ai_response'] || '',
          sender: row['발신자'] || row['sender'] || '',
          date: row['날짜'] || row['date'] || '',
        }));
        setEmails(mapped);
      }
    } catch (err: any) {
      setError(err.message || '업무 기록을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const categoryColor: Record<string, string> = {
    '재고': 'bg-green-100 text-green-700',
    '발주': 'bg-blue-100 text-blue-700',
    '문의': 'bg-yellow-100 text-yellow-700',
    '견적요청': 'bg-purple-100 text-purple-700',
    '공지': 'bg-slate-100 text-slate-700',
    '미팅': 'bg-pink-100 text-pink-700',
    '클레임': 'bg-red-100 text-red-700',
    '기타': 'bg-gray-100 text-gray-700',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">이메일 관리</h1>
          <p className="text-slate-500 mt-1">AI 기반 이메일 분석 및 자동 응답</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={loadWorkLog}
            disabled={loading}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
          >
            {loading ? '로딩...' : '업무 기록 보기'}
          </button>
          <button
            onClick={fetchEmails}
            disabled={fetchingNew}
            className="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition disabled:opacity-50"
          >
            {fetchingNew ? '분석 중...' : '새 이메일 가져오기'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm border border-red-200">
          {error}
        </div>
      )}

      {/* Email List */}
      {emails.length > 0 ? (
        <div className="space-y-3">
          {emails.map((email, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-slate-900 truncate">{email.subject}</h3>
                  <div className="flex items-center gap-3 mt-1">
                    {email.sender && <span className="text-sm text-slate-500">{email.sender}</span>}
                    {email.date && <span className="text-xs text-slate-400">{email.date}</span>}
                  </div>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold shrink-0 ml-3 ${categoryColor[email.category] || categoryColor['기타']}`}>
                  {email.category}
                </span>
              </div>
              {email.ai_response && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <div className="text-xs font-semibold text-slate-500 mb-1">AI 응답 초안</div>
                  <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{email.ai_response}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="text-4xl mb-3">📧</div>
          <h3 className="text-lg font-semibold text-slate-900 mb-1">이메일이 없습니다</h3>
          <p className="text-sm text-slate-500">
            &quot;새 이메일 가져오기&quot; 또는 &quot;업무 기록 보기&quot;를 클릭하세요
          </p>
        </div>
      )}
    </div>
  );
}
