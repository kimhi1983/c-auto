'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiUrl, authJsonHeaders } from '@/lib/api';

// ==========================================
// Types
// ==========================================

interface EmailItem {
  id: number;
  subject: string;
  sender: string;
  category: string;
  priority: string;
  status: string;
  aiSummary?: string | null;
  ai_summary?: string | null;
  received_at?: string | null;
  receivedAt?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
}

interface AiSummaryData {
  code: string;
  summary: string;
  importance: string;
  action_items: string;
  search_keywords: string[];
  director_report: string;
  needs_approval: boolean;
  company_name: string;
  sender_info: string;
  estimated_revenue: string;
  note: string;
}

interface EmailDetail {
  id: number;
  subject: string;
  sender: string;
  recipient: string | null;
  body: string | null;
  category: string;
  priority: string;
  status: string;
  ai_summary: string | null;
  ai_draft_response: string | null;
  ai_confidence: number;
  draft_response: string | null;
  draft_subject: string | null;
  processed_by: number | null;
  received_at: string | null;
  processed_at: string | null;
  sent_at: string | null;
  created_at: string | null;
  approvals: Approval[];
  attachments: Attachment[];
}

interface Approval {
  id: number;
  stage: string;
  approver_id: number;
  status: string;
  comments: string | null;
  approved_at: string | null;
  created_at: string | null;
}

interface Attachment {
  id: number;
  file_name: string;
  file_size: number;
  content_type: string | null;
}

interface EmailStats {
  total: number;
  unread: number;
  in_review: number;
  approved: number;
  sent: number;
  categories: Record<string, number>;
}

// ==========================================
// Constants - KPROS 5분류
// ==========================================

const CATEGORIES = ['자료대응', '영업기회', '스케줄링', '정보수집', '필터링'] as const;

const CATEGORY_CODES: Record<string, string> = {
  '자료대응': 'A',
  '영업기회': 'B',
  '스케줄링': 'C',
  '정보수집': 'D',
  '필터링': 'E',
};

const CATEGORY_COLORS: Record<string, string> = {
  '자료대응': 'bg-blue-100 text-blue-700',
  '영업기회': 'bg-red-100 text-red-700',
  '스케줄링': 'bg-pink-100 text-pink-700',
  '정보수집': 'bg-amber-100 text-amber-700',
  '필터링': 'bg-gray-100 text-gray-500',
  // 레거시 호환
  '발주': 'bg-red-100 text-red-700',
  '요청': 'bg-indigo-100 text-indigo-700',
  '견적요청': 'bg-purple-100 text-purple-700',
  '문의': 'bg-yellow-100 text-yellow-700',
  '공지': 'bg-slate-100 text-slate-700',
  '미팅': 'bg-pink-100 text-pink-700',
  '클레임': 'bg-red-100 text-red-700',
  '기타': 'bg-gray-100 text-gray-700',
};

const CATEGORY_ICONS: Record<string, string> = {
  '자료대응': '📁',
  '영업기회': '💰',
  '스케줄링': '📅',
  '정보수집': '📊',
  '필터링': '🚫',
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  unread: { label: '미확인', color: 'bg-blue-100 text-blue-700' },
  read: { label: '확인', color: 'bg-slate-100 text-slate-600' },
  draft: { label: '초안', color: 'bg-amber-100 text-amber-700' },
  in_review: { label: '검토중', color: 'bg-orange-100 text-orange-700' },
  approved: { label: '승인', color: 'bg-green-100 text-green-700' },
  rejected: { label: '반려', color: 'bg-red-100 text-red-700' },
  sent: { label: '발송완료', color: 'bg-emerald-100 text-emerald-700' },
  archived: { label: '보관', color: 'bg-gray-100 text-gray-500' },
};

const PRIORITY_ICONS: Record<string, string> = {
  high: '🔴',
  medium: '🟡',
  low: '🟢',
};

const STATUS_MAP: Record<string, string> = {
  unread: '미확인',
  read: '확인',
  draft: '초안',
  in_review: '검토중',
  approved: '승인',
  rejected: '반려',
  sent: '발송완료',
  archived: '보관',
};

// ==========================================
// Helpers
// ==========================================

function getAuthHeaders(): Record<string, string> {
  return authJsonHeaders();
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('ko-KR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function formatDateFull(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function parseAiSummary(raw: string | null | undefined): AiSummaryData | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.summary) {
      return parsed as AiSummaryData;
    }
    return null;
  } catch {
    return null;
  }
}

function getDisplaySummary(email: EmailItem): string {
  const raw = email.aiSummary || email.ai_summary;
  const parsed = parseAiSummary(raw);
  if (parsed) return parsed.summary;
  return raw || '';
}

// ==========================================
// Excel Export
// ==========================================

function exportToExcel(emailList: EmailItem[]) {
  const BOM = '\uFEFF';
  const headers = ['날짜', '분류코드', '카테고리명', '발신자', '회사명', '메일 제목', '핵심 요약', '중요도', '처리 내용', '첨부파일', '처리 상태', '이사님 확인', '예상 매출', '비고'];

  const rows = emailList.map((email) => {
    const ai = parseAiSummary(email.aiSummary || email.ai_summary);
    const date = formatDateFull(email.received_at || email.receivedAt || email.created_at || email.createdAt);
    const code = ai?.code || CATEGORY_CODES[email.category] || '';
    const category = email.category || '';
    const sender = email.sender || '';
    const company = ai?.company_name || '';
    const subject = email.subject || '';
    const summary = ai?.summary || '';
    const importance = ai?.importance || '';
    const actionItems = ai?.action_items || '';
    const attachments = '';
    const status = STATUS_MAP[email.status] || email.status;
    const needsApproval = ai?.needs_approval ? '필요' : '불필요';
    const revenue = ai?.estimated_revenue || '';
    const note = ai?.note || '';

    return [date, code, category, sender, company, subject, summary, importance, actionItems, attachments, status, needsApproval, revenue, note];
  });

  const csvContent = BOM + [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const fileName = `KPROS_업무일지_${dateStr}.csv`;

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

// ==========================================
// Main Component
// ==========================================

export default function EmailsPage() {
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [stats, setStats] = useState<EmailStats | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<EmailDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [view, setView] = useState<'list' | 'detail' | 'compose'>('list');
  const [draftText, setDraftText] = useState('');
  const [draftSubject, setDraftSubject] = useState('');
  const [approvalComment, setApprovalComment] = useState('');
  const [actionLoading, setActionLoading] = useState('');

  // ---- Fetch email list ----
  const loadEmails = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (categoryFilter) params.set('category', categoryFilter);
      if (searchQuery) params.set('search', searchQuery);
      params.set('limit', '100');

      const res = await fetch(apiUrl(`/api/v1/emails/?${params}`), { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('이메일 목록 조회 실패');
      const data = await res.json();
      if (data.status === 'success') {
        setEmails(data.data || []);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, categoryFilter, searchQuery]);

  // ---- Fetch stats ----
  const loadStats = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/v1/emails/stats'), { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success') setStats(data.data);
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    loadEmails();
    loadStats();
  }, [loadEmails, loadStats]);

  // ---- Fetch new emails ----
  const fetchNewEmails = async () => {
    setFetching(true);
    setError('');
    try {
      const res = await fetch(apiUrl('/api/v1/emails/fetch?max_count=5'), {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || '이메일 가져오기 실패');
      }
      const data = await res.json();
      if (data.status === 'success') {
        setError('');
        await loadEmails();
        await loadStats();
        alert(`${data.count}개 이메일이 처리되었습니다. (${data.source})`);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setFetching(false);
    }
  };

  // ---- Open email detail ----
  const openEmail = async (emailId: number) => {
    try {
      const res = await fetch(apiUrl(`/api/v1/emails/${emailId}`), { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('이메일 상세 조회 실패');
      const data = await res.json();
      if (data.status === 'success') {
        setSelectedEmail(data.data);
        setDraftText(data.data.draft_response || data.data.ai_draft_response || '');
        setDraftSubject(data.data.draft_subject || `Re: ${data.data.subject}`);
        setView('detail');
        loadEmails();
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  // ---- Save draft ----
  const saveDraft = async () => {
    if (!selectedEmail) return;
    setActionLoading('save');
    try {
      const res = await fetch(apiUrl(`/api/v1/emails/${selectedEmail.id}`), {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ draft_response: draftText, draft_subject: draftSubject }),
      });
      if (!res.ok) throw new Error('저장 실패');
      alert('초안이 저장되었습니다.');
      await openEmail(selectedEmail.id);
      await loadEmails();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading('');
    }
  };

  // ---- Submit for review ----
  const submitForReview = async () => {
    if (!selectedEmail) return;
    setActionLoading('submit');
    try {
      const res = await fetch(apiUrl(`/api/v1/emails/${selectedEmail.id}/submit`), {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || '제출 실패');
      }
      alert('검토 요청이 제출되었습니다.');
      await openEmail(selectedEmail.id);
      await loadEmails();
      await loadStats();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading('');
    }
  };

  // ---- Approve ----
  const approveEmail = async () => {
    if (!selectedEmail) return;
    setActionLoading('approve');
    try {
      const res = await fetch(apiUrl(`/api/v1/emails/${selectedEmail.id}/approve`), {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ comments: approvalComment || null }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || '승인 실패');
      }
      alert('이메일이 승인되었습니다.');
      setApprovalComment('');
      await openEmail(selectedEmail.id);
      await loadEmails();
      await loadStats();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading('');
    }
  };

  // ---- Reject ----
  const rejectEmail = async () => {
    if (!selectedEmail) return;
    setActionLoading('reject');
    try {
      const res = await fetch(apiUrl(`/api/v1/emails/${selectedEmail.id}/reject`), {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ comments: approvalComment || '반려' }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || '반려 실패');
      }
      alert('이메일이 반려되었습니다.');
      setApprovalComment('');
      await openEmail(selectedEmail.id);
      await loadEmails();
      await loadStats();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading('');
    }
  };

  // ---- Send email ----
  const sendEmail = async () => {
    if (!selectedEmail) return;
    if (!confirm('이메일을 발송하시겠습니까?')) return;
    setActionLoading('send');
    try {
      const res = await fetch(apiUrl(`/api/v1/emails/${selectedEmail.id}/send`), {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || '발송 실패');
      }
      alert('이메일이 발송되었습니다.');
      await openEmail(selectedEmail.id);
      await loadEmails();
      await loadStats();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading('');
    }
  };

  // ---- Reclassify ----
  const reclassify = async () => {
    if (!selectedEmail) return;
    setActionLoading('reclassify');
    try {
      const res = await fetch(apiUrl(`/api/v1/emails/${selectedEmail.id}/reclassify`), {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('재분류 실패');
      alert('KPROS AI 재분류가 완료되었습니다.');
      await openEmail(selectedEmail.id);
      await loadEmails();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading('');
    }
  };

  // ---- Generate Draft ----
  const generateDraft = async () => {
    if (!selectedEmail) return;
    setActionLoading('generate');
    try {
      const res = await fetch(apiUrl(`/api/v1/emails/${selectedEmail.id}/generate-draft`), {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('답신 생성 실패');
      const data = await res.json();
      if (data.draft) {
        setDraftText(data.draft);
      }
      alert('AI 답신이 생성되었습니다.');
      await openEmail(selectedEmail.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading('');
    }
  };

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">이메일 관리</h1>
          <p className="text-sm text-slate-500 mt-1">KPROS AI 스마트 비서 - 5개 카테고리 자동 분류 및 대응</p>
        </div>
        <div className="flex gap-2">
          {view !== 'list' && (
            <button
              onClick={() => { setView('list'); setSelectedEmail(null); }}
              className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
            >
              &#8592; 목록
            </button>
          )}
          {view === 'list' && emails.length > 0 && (
            <button
              onClick={() => exportToExcel(emails)}
              className="px-4 py-2 rounded-xl border border-green-300 text-sm font-medium text-green-700 hover:bg-green-50 transition"
            >
              📥 엑셀 내보내기
            </button>
          )}
          <button
            onClick={fetchNewEmails}
            disabled={fetching}
            className="px-5 py-2 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50 transition"
          >
            {fetching ? '가져오는 중...' : '새 이메일 가져오기'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm border border-red-200 flex justify-between items-center animate-fadeIn">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 ml-3">✕</button>
        </div>
      )}

      {/* Stats Bar */}
      {stats && (
        <div className="flex gap-2.5 flex-wrap">
          <StatBadge label="전체" count={stats.total} color="bg-slate-100 text-slate-700" onClick={() => setStatusFilter('')} active={!statusFilter} />
          <StatBadge label="미확인" count={stats.unread} color="bg-blue-100 text-blue-700" onClick={() => setStatusFilter('unread')} active={statusFilter === 'unread'} />
          <StatBadge label="검토중" count={stats.in_review} color="bg-orange-100 text-orange-700" onClick={() => setStatusFilter('in_review')} active={statusFilter === 'in_review'} />
          <StatBadge label="승인" count={stats.approved} color="bg-green-100 text-green-700" onClick={() => setStatusFilter('approved')} active={statusFilter === 'approved'} />
          <StatBadge label="발송" count={stats.sent} color="bg-emerald-100 text-emerald-700" onClick={() => setStatusFilter('sent')} active={statusFilter === 'sent'} />
        </div>
      )}

      {/* Category Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 overflow-x-auto">
        <button
          onClick={() => setCategoryFilter('')}
          className={`px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
            !categoryFilter ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          전체 {stats ? `(${stats.total})` : ''}
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(categoryFilter === cat ? '' : cat)}
            className={`px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
              categoryFilter === cat ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {CATEGORY_ICONS[cat] || ''} {CATEGORY_CODES[cat]}.{cat} {stats?.categories[cat] ? `(${stats.categories[cat]})` : ''}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex gap-2.5 items-center">
        <input
          type="text"
          placeholder="제목 또는 발신자 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') loadEmails(); }}
          className="flex-1 px-4 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition"
        />
        <button onClick={loadEmails} className="px-4 py-2 rounded-xl border border-slate-200 text-sm hover:bg-slate-50 transition font-medium">
          검색
        </button>
      </div>

      {/* Main Content */}
      {view === 'list' && (
        <EmailList
          emails={emails}
          loading={loading}
          onSelect={openEmail}
        />
      )}

      {view === 'detail' && selectedEmail && (
        <EmailDetailView
          email={selectedEmail}
          draftText={draftText}
          setDraftText={setDraftText}
          draftSubject={draftSubject}
          setDraftSubject={setDraftSubject}
          approvalComment={approvalComment}
          setApprovalComment={setApprovalComment}
          actionLoading={actionLoading}
          onSaveDraft={saveDraft}
          onSubmit={submitForReview}
          onApprove={approveEmail}
          onReject={rejectEmail}
          onSend={sendEmail}
          onReclassify={reclassify}
          onGenerateDraft={generateDraft}
          onBack={() => { setView('list'); setSelectedEmail(null); }}
        />
      )}
    </div>
  );
}

// ==========================================
// Sub-components
// ==========================================

function StatBadge({ label, count, color, onClick, active }: {
  label: string; count: number; color: string;
  onClick: () => void; active: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${color} ${active ? 'ring-2 ring-brand-400 ring-offset-1 shadow-sm' : 'opacity-70 hover:opacity-100'}`}
    >
      {label} {count}
    </button>
  );
}

function EmailList({ emails, loading, onSelect }: {
  emails: EmailItem[]; loading: boolean; onSelect: (id: number) => void;
}) {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-14 text-center">
        <div className="w-8 h-8 border-[3px] border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm text-slate-500">이메일을 불러오는 중...</p>
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-14 text-center">
        <div className="text-4xl mb-3">📭</div>
        <h3 className="text-base font-bold text-slate-900 mb-1">이메일이 없습니다</h3>
        <p className="text-sm text-slate-500">&quot;새 이메일 가져오기&quot;를 클릭하여 메일을 가져오세요</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
      {emails.map((email) => {
        const statusInfo = STATUS_LABELS[email.status] || STATUS_LABELS['read'];
        const summary = getDisplaySummary(email);
        const ai = parseAiSummary(email.aiSummary || email.ai_summary);
        const code = ai?.code || CATEGORY_CODES[email.category] || '';

        return (
          <button
            key={email.id}
            onClick={() => onSelect(email.id)}
            className={`w-full text-left px-5 py-3.5 hover:bg-slate-50 transition-colors flex items-center gap-3 ${email.status === 'unread' ? 'bg-blue-50/30' : ''}`}
          >
            {/* Priority */}
            <span className="text-base shrink-0" title={email.priority}>
              {PRIORITY_ICONS[email.priority] || '🟡'}
            </span>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-semibold truncate ${email.status === 'unread' ? 'text-slate-900' : 'text-slate-700'}`}>
                  {email.subject}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-slate-500 truncate">{email.sender}</span>
                {summary && (
                  <span className="text-xs text-slate-400 truncate hidden md:inline">— {summary}</span>
                )}
              </div>
            </div>

            {/* Category badge */}
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold shrink-0 ${CATEGORY_COLORS[email.category] || CATEGORY_COLORS['필터링']}`}>
              {code ? `${code}.` : ''}{email.category}
            </span>

            {/* Importance */}
            {ai?.importance && ai.importance !== '하' && (
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                ai.importance === '상' ? 'bg-red-50 text-red-600' : 'bg-yellow-50 text-yellow-600'
              }`}>
                {ai.importance === '상' ? '중요' : '보통'}
              </span>
            )}

            {/* Status badge */}
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold shrink-0 ${statusInfo.color}`}>
              {statusInfo.label}
            </span>

            {/* Date */}
            <span className="text-xs text-slate-400 shrink-0 w-28 text-right">
              {formatDate(email.received_at || email.receivedAt || email.created_at || email.createdAt)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function EmailDetailView({
  email,
  draftText,
  setDraftText,
  draftSubject,
  setDraftSubject,
  approvalComment,
  setApprovalComment,
  actionLoading,
  onSaveDraft,
  onSubmit,
  onApprove,
  onReject,
  onSend,
  onReclassify,
  onGenerateDraft,
  onBack,
}: {
  email: EmailDetail;
  draftText: string;
  setDraftText: (v: string) => void;
  draftSubject: string;
  setDraftSubject: (v: string) => void;
  approvalComment: string;
  setApprovalComment: (v: string) => void;
  actionLoading: string;
  onSaveDraft: () => void;
  onSubmit: () => void;
  onApprove: () => void;
  onReject: () => void;
  onSend: () => void;
  onReclassify: () => void;
  onGenerateDraft: () => void;
  onBack: () => void;
}) {
  const statusInfo = STATUS_LABELS[email.status] || STATUS_LABELS['read'];
  const ai = parseAiSummary(email.ai_summary);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 animate-fadeIn">
      {/* Left: Email Content */}
      <div className="lg:col-span-2 space-y-5">
        {/* Back to list button */}
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition"
        >
          <span>&#8592;</span>
          <span>목록으로 돌아가기</span>
        </button>

        {/* Email Header */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-start justify-between mb-3">
            <h2 className="text-lg font-bold text-slate-900 flex-1">{email.subject}</h2>
            <div className="flex gap-2 shrink-0 ml-3">
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${CATEGORY_COLORS[email.category] || CATEGORY_COLORS['필터링']}`}>
                {CATEGORY_CODES[email.category] ? `${CATEGORY_CODES[email.category]}.` : ''}{email.category}
              </span>
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${statusInfo.color}`}>
                {statusInfo.label}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
            <span>보낸 사람: <strong className="text-slate-700">{email.sender}</strong></span>
            {ai?.company_name && <span>회사: <strong className="text-slate-700">{ai.company_name}</strong></span>}
            {email.recipient && <span>받는 사람: {email.recipient}</span>}
            <span>{formatDate(email.received_at)}</span>
            <span>우선순위: {PRIORITY_ICONS[email.priority]} {email.priority}</span>
            {ai?.importance && (
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                ai.importance === '상' ? 'bg-red-50 text-red-600' : ai.importance === '중' ? 'bg-yellow-50 text-yellow-600' : 'bg-gray-50 text-gray-500'
              }`}>
                중요도: {ai.importance}
              </span>
            )}
            {ai?.needs_approval && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-50 text-orange-600">
                이사님 확인 필요
              </span>
            )}
          </div>
        </div>

        {/* Email Body */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="text-sm font-bold text-slate-700 mb-3">이메일 본문</h3>
          <div className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
            {email.body || '(본문 없음)'}
          </div>
        </div>

        {/* AI Analysis - Enhanced */}
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-2xl border border-purple-200/80 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-purple-800">KPROS AI 분석 결과</h3>
            <div className="flex items-center gap-3">
              <span className="text-xs text-purple-600 font-medium">신뢰도: {email.ai_confidence}%</span>
              <button
                onClick={onReclassify}
                disabled={actionLoading === 'reclassify'}
                className="px-3 py-1.5 rounded-lg bg-purple-100 text-purple-700 text-xs font-bold hover:bg-purple-200 disabled:opacity-50 transition"
              >
                {actionLoading === 'reclassify' ? '분석중...' : '재분류'}
              </button>
            </div>
          </div>

          {ai ? (
            <div className="space-y-3">
              {/* Summary */}
              <div className="bg-white/60 rounded-xl p-3">
                <div className="text-xs font-bold text-purple-600 mb-1">📋 핵심 요약</div>
                <p className="text-sm text-purple-800">{ai.summary}</p>
              </div>

              {/* Director Report */}
              {ai.director_report && (
                <div className="bg-white/60 rounded-xl p-3">
                  <div className="text-xs font-bold text-purple-600 mb-1">📌 이사님 보고</div>
                  <p className="text-sm text-purple-800 whitespace-pre-wrap">{ai.director_report}</p>
                </div>
              )}

              {/* Action Items */}
              {ai.action_items && (
                <div className="bg-white/60 rounded-xl p-3">
                  <div className="text-xs font-bold text-purple-600 mb-1">⚡ 액션 플랜</div>
                  <p className="text-sm text-purple-800 whitespace-pre-wrap">{ai.action_items}</p>
                </div>
              )}

              {/* Search Keywords (A카테고리) */}
              {ai.search_keywords && ai.search_keywords.length > 0 && (
                <div className="bg-white/60 rounded-xl p-3">
                  <div className="text-xs font-bold text-purple-600 mb-1">🔍 드롭박스 검색 키워드</div>
                  <div className="flex flex-wrap gap-1.5">
                    {ai.search_keywords.map((kw, i) => (
                      <span key={i} className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium">{kw}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Estimated Revenue (B카테고리) */}
              {ai.estimated_revenue && (
                <div className="bg-white/60 rounded-xl p-3">
                  <div className="text-xs font-bold text-purple-600 mb-1">💰 예상 매출</div>
                  <p className="text-sm text-purple-800 font-semibold">{ai.estimated_revenue}</p>
                </div>
              )}

              {/* Note */}
              {ai.note && (
                <div className="text-xs text-purple-500 mt-1">비고: {ai.note}</div>
              )}
            </div>
          ) : (
            /* fallback for legacy plain-text aiSummary */
            email.ai_summary && (
              <p className="text-sm text-purple-700">
                <strong>요약:</strong> {email.ai_summary}
              </p>
            )
          )}

          {/* AI Draft Response */}
          {email.ai_draft_response && (
            <div className="mt-4">
              <div className="text-xs font-bold text-purple-600 mb-1.5">✉️ AI 자동 답신 초안:</div>
              <div className="text-sm text-purple-800 bg-white/60 rounded-xl p-4 whitespace-pre-wrap">
                {email.ai_draft_response}
              </div>
            </div>
          )}
        </div>

        {/* Dropbox Search - A카테고리(자료대응) */}
        {ai && ai.search_keywords && ai.search_keywords.length > 0 && (
          <DropboxSearchPanel keywords={ai.search_keywords} />
        )}

        {/* Draft Editor */}
        {['read', 'draft', 'rejected'].includes(email.status) && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-700">답신 작성</h3>
              {!email.ai_draft_response && (
                <button
                  onClick={onGenerateDraft}
                  disabled={actionLoading === 'generate'}
                  className="px-3 py-1.5 rounded-lg bg-purple-100 text-purple-700 text-xs font-bold hover:bg-purple-200 disabled:opacity-50 transition"
                >
                  {actionLoading === 'generate' ? 'AI 생성중...' : '🤖 AI 답신 생성'}
                </button>
              )}
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-500 mb-1.5 block font-medium">답신 제목</label>
                <input
                  type="text"
                  value={draftSubject}
                  onChange={(e) => setDraftSubject(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1.5 block font-medium">답신 내용</label>
                <textarea
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  rows={8}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none resize-y transition"
                />
              </div>
              <div className="flex gap-2.5">
                <button
                  onClick={onSaveDraft}
                  disabled={actionLoading === 'save'}
                  className="px-5 py-2 rounded-xl border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition"
                >
                  {actionLoading === 'save' ? '저장중...' : '초안 저장'}
                </button>
                <button
                  onClick={onSubmit}
                  disabled={actionLoading === 'submit'}
                  className="px-5 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition"
                >
                  {actionLoading === 'submit' ? '제출중...' : '검토 요청'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Approval Actions (for approver/admin) */}
        {email.status === 'in_review' && (
          <div className="bg-white rounded-2xl border border-orange-200 p-6">
            <h3 className="text-sm font-bold text-orange-700 mb-3">승인/반려</h3>
            <textarea
              value={approvalComment}
              onChange={(e) => setApprovalComment(e.target.value)}
              placeholder="코멘트를 입력하세요 (선택)"
              rows={3}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none mb-4 transition"
            />
            <div className="flex gap-2.5">
              <button
                onClick={onApprove}
                disabled={actionLoading === 'approve'}
                className="px-5 py-2 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition"
              >
                {actionLoading === 'approve' ? '처리중...' : '승인'}
              </button>
              <button
                onClick={onReject}
                disabled={actionLoading === 'reject'}
                className="px-5 py-2 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition"
              >
                {actionLoading === 'reject' ? '처리중...' : '반려'}
              </button>
            </div>
          </div>
        )}

        {/* Send Button (for approved emails) */}
        {email.status === 'approved' && (
          <div className="bg-white rounded-2xl border border-green-200 p-6">
            <h3 className="text-sm font-bold text-green-700 mb-3">발송 준비 완료</h3>
            <p className="text-xs text-slate-500 mb-3">
              승인된 답신을 {email.sender}에게 발송합니다.
            </p>
            <button
              onClick={onSend}
              disabled={actionLoading === 'send'}
              className="px-5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition"
            >
              {actionLoading === 'send' ? '발송중...' : '이메일 발송'}
            </button>
          </div>
        )}
      </div>

      {/* Right Sidebar */}
      <div className="space-y-4">
        {/* Workflow Status */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-3">워크플로우</h3>
          <WorkflowSteps status={email.status} />
        </div>

        {/* Approval History */}
        {email.approvals.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h3 className="text-sm font-bold text-slate-900 mb-3">승인 이력</h3>
            <div className="space-y-2.5">
              {email.approvals.map((a) => (
                <div key={a.id} className="text-xs border-b border-slate-50 pb-2.5 last:border-0">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700">{a.stage}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      a.status === 'approved' ? 'bg-green-100 text-green-700' :
                      a.status === 'rejected' ? 'bg-red-100 text-red-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {a.status === 'approved' ? '승인' : a.status === 'rejected' ? '반려' : '대기'}
                    </span>
                  </div>
                  {a.comments && <p className="text-slate-500 mt-1">{a.comments}</p>}
                  <p className="text-slate-400 text-[11px] mt-0.5">{formatDate(a.approved_at || a.created_at)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Attachments */}
        {email.attachments.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h3 className="text-sm font-bold text-slate-900 mb-3">첨부파일</h3>
            <div className="space-y-2">
              {email.attachments.map((att) => (
                <div key={att.id} className="flex items-center gap-2 text-xs text-slate-600">
                  <span>📎</span>
                  <span className="truncate">{att.file_name}</span>
                  <span className="text-slate-400 shrink-0">
                    {(att.file_size / 1024).toFixed(1)}KB
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Email Info */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-3">상세 정보</h3>
          <div className="space-y-2.5 text-xs">
            <InfoRow label="수신일" value={formatDate(email.received_at)} />
            <InfoRow label="처리일" value={formatDate(email.processed_at)} />
            {email.sent_at && <InfoRow label="발송일" value={formatDate(email.sent_at)} />}
            <InfoRow label="우선순위" value={`${PRIORITY_ICONS[email.priority]} ${email.priority}`} />
            <InfoRow label="AI 신뢰도" value={`${email.ai_confidence}%`} />
            {ai?.sender_info && <InfoRow label="발신자 정보" value={ai.sender_info} />}
            {ai?.company_name && <InfoRow label="회사명" value={ai.company_name} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkflowSteps({ status }: { status: string }) {
  const steps = [
    { key: 'unread', label: '수신' },
    { key: 'draft', label: '초안 작성' },
    { key: 'in_review', label: '검토' },
    { key: 'approved', label: '승인' },
    { key: 'sent', label: '발송' },
  ];

  const statusOrder = ['unread', 'read', 'draft', 'in_review', 'approved', 'sent'];
  const currentIdx = statusOrder.indexOf(status);

  return (
    <div className="space-y-2">
      {steps.map((step, i) => {
        const stepIdx = statusOrder.indexOf(step.key);
        const isComplete = currentIdx >= stepIdx;
        const isCurrent = status === step.key || (status === 'read' && step.key === 'unread');
        const isRejected = status === 'rejected' && step.key === 'in_review';

        return (
          <div key={step.key} className="flex items-center gap-2.5">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
              isRejected ? 'bg-red-500 text-white' :
              isComplete ? 'bg-green-500 text-white' :
              isCurrent ? 'bg-brand-500 text-white' :
              'bg-slate-200 text-slate-400'
            }`}>
              {isRejected ? '✕' : isComplete ? '✓' : i + 1}
            </div>
            <span className={`text-xs ${isComplete || isCurrent ? 'text-slate-900 font-semibold' : 'text-slate-400'}`}>
              {step.label}
            </span>
            {isRejected && <span className="text-[11px] text-red-500 font-medium">(반려됨)</span>}
          </div>
        );
      })}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-700 font-medium">{value || '-'}</span>
    </div>
  );
}

// ==========================================
// Dropbox Search Panel
// ==========================================

interface DropboxFile {
  name: string;
  path: string;
  size: number;
  modified: string;
  is_folder: boolean;
}

function DropboxSearchPanel({ keywords }: { keywords: string[] }) {
  const [results, setResults] = useState<DropboxFile[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const [downloadingPath, setDownloadingPath] = useState('');

  const searchDropbox = async () => {
    setSearching(true);
    setError('');
    try {
      const res = await fetch(apiUrl('/api/v1/dropbox/search-multi'), {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ keywords }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        setResults(data.data || []);
        setSearched(true);
      } else if (data.need_reauth) {
        setError('Dropbox 인증이 필요합니다. 관리자에게 문의하세요.');
      } else {
        setError(data.detail || '검색 실패');
      }
    } catch (err: any) {
      setError(err.message || '드롭박스 검색 실패');
    } finally {
      setSearching(false);
    }
  };

  const getDownloadLink = async (path: string) => {
    setDownloadingPath(path);
    try {
      const res = await fetch(apiUrl('/api/v1/dropbox/link'), {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ path }),
      });
      const data = await res.json();
      if (data.status === 'success' && data.link) {
        window.open(data.link, '_blank');
      } else {
        alert(data.detail || '링크 생성 실패');
      }
    } catch {
      alert('다운로드 링크 생성 실패');
    } finally {
      setDownloadingPath('');
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  return (
    <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-2xl border border-blue-200/80 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-blue-800">📂 드롭박스 파일 검색</h3>
        <button
          onClick={searchDropbox}
          disabled={searching}
          className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {searching ? '검색중...' : '🔍 AI 키워드로 검색'}
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {keywords.map((kw, i) => (
          <span key={i} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
            {kw}
          </span>
        ))}
      </div>

      {error && (
        <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-3">{error}</div>
      )}

      {searched && results.length === 0 && (
        <div className="text-xs text-blue-500 bg-white/60 px-3 py-2 rounded-lg">
          검색 결과가 없습니다. 드롭박스에 해당 파일이 없거나 다른 키워드로 검색해 보세요.
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-1.5">
          {results.map((file, i) => (
            <div
              key={i}
              className="flex items-center gap-3 bg-white/70 rounded-lg px-3 py-2 text-xs hover:bg-white transition"
            >
              <span className="text-base shrink-0">{file.is_folder ? '📁' : '📄'}</span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-800 truncate">{file.name}</div>
                <div className="text-slate-400 truncate">{file.path}</div>
              </div>
              {!file.is_folder && (
                <>
                  <span className="text-slate-400 shrink-0">{formatFileSize(file.size)}</span>
                  <button
                    onClick={() => getDownloadLink(file.path)}
                    disabled={downloadingPath === file.path}
                    className="px-2 py-1 rounded bg-blue-100 text-blue-700 font-bold hover:bg-blue-200 disabled:opacity-50 transition shrink-0"
                  >
                    {downloadingPath === file.path ? '...' : '다운로드'}
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
