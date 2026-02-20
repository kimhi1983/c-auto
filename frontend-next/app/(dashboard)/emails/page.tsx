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
  dropbox_path: string | null;
}

interface DropboxFile { name: string; path: string; size: number; modified: string; is_folder: boolean; }

interface EmailStats {
  total: number;
  unread: number;
  in_review: number;
  approved: number;
  sent: number;
  categories: Record<string, number>;
}

// ==========================================
// Constants - KPROS 4분류
// ==========================================

const CATEGORIES = ['자료대응', '성적서대응', '발주관리', '필터링'] as const;

const CATEGORY_CODES: Record<string, string> = {
  '자료대응': 'A',
  '성적서대응': 'B',
  '발주관리': 'C',
  '필터링': 'D',
};

const CATEGORY_COLORS: Record<string, string> = {
  '자료대응': 'bg-blue-100 text-blue-700',
  '성적서대응': 'bg-emerald-100 text-emerald-700',
  '발주관리': 'bg-orange-100 text-orange-700',
  '필터링': 'bg-gray-100 text-gray-500',
  '영업기회': 'bg-orange-100 text-orange-700',
  '영업기획': 'bg-orange-100 text-orange-700',
  '스케줄링': 'bg-orange-100 text-orange-700',
  '정보수집': 'bg-gray-100 text-gray-500',
  '발주': 'bg-orange-100 text-orange-700',
  '발주내역': 'bg-orange-100 text-orange-700',
  '기타': 'bg-gray-100 text-gray-700',
};

const CATEGORY_ICONS: Record<string, string> = {
  '자료대응': '📁',
  '성적서대응': '📋',
  '발주관리': '📦',
  '필터링': '🔘',
};

const LEGACY_CATEGORY_MAP: Record<string, string> = {
  '영업기회': '발주관리',
  '영업기획': '발주관리',
  '스케줄링': '발주관리',
  '발주': '발주관리',
  '발주내역': '발주관리',
  '정보수집': '필터링',
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  unread: { label: '미처리', color: 'bg-blue-100 text-blue-700' },
  read: { label: '확인', color: 'bg-slate-100 text-slate-600' },
  draft: { label: '처리중', color: 'bg-amber-100 text-amber-700' },
  in_review: { label: '검토중', color: 'bg-orange-100 text-orange-700' },
  approved: { label: '처리완료', color: 'bg-green-100 text-green-700' },
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
  unread: '미처리',
  read: '확인',
  draft: '처리중',
  in_review: '검토중',
  approved: '처리완료',
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

function parseDraftText(raw: string | null | undefined): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('```')) {
    try {
      const cleaned = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      const parsed = JSON.parse(cleaned);
      const text = parsed.draft_reply || parsed.answer || parsed.reply || parsed.content || parsed.response || parsed.text || '';
      if (text && typeof text === 'string' && text.length > 10) return text;
    } catch {
      const stripped = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      const answerMatch = stripped.match(/"(?:draft_reply|answer|reply)":\s*"((?:[^"\\]|\\.)*)"/);
      if (answerMatch) return answerMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
      return stripped;
    }
  }
  return raw;
}

// ==========================================
// Instruction Sheet Export
// ==========================================

const INSTRUCTION_TYPES: Record<string, { label: string; icon: string }> = {
  '자료대응': { label: '자료발송 지시서', icon: '📁' },
  '성적서대응': { label: '성적서 처리 지시서', icon: '📋' },
  '발주관리': { label: '발주관리 지시서', icon: '📦' },
  '필터링':   { label: '처리완료 보고서', icon: '📝' },
};

function buildInstructionCSV(email: EmailDetail): { csvContent: string; fileName: string; category: string } {
  const BOM = '\uFEFF';
  const ai = parseAiSummary(email.ai_summary);
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const category = email.category || '필터링';
  const code = ai?.code || CATEGORY_CODES[category] || 'E';
  const receivedDate = formatDateFull(email.received_at);
  const companyName = (ai?.company_name || '').replace(/[\\/:*?"<>|]/g, '').trim() || '미상';
  const bodyLines = (email.body || '').split('\n').map(l => l.trim()).filter(Boolean);
  let headers: string[] = [];
  let rows: string[][] = [];
  let sheetTitle = '';
  switch (category) {
    case '자료대응': {
      sheetTitle = 'KPROS 자료발송 지시서';
      headers = ['항목', '내용'];
      rows = [['문서번호', `KPROS-A-${dateStr}-${email.id}`],['작성일', formatDateFull(now.toISOString())],['수신일', receivedDate],['요청업체', ai?.company_name || ''],['요청자', ai?.sender_info || email.sender || ''],['메일 제목', email.subject || ''],['요청 자료', ai?.action_items || ''],['검색 키워드', ai?.search_keywords?.join(', ') || ''],['핵심 요약', ai?.summary || ''],['처리 지시사항', '드롭박스에서 관련 파일 검색 후 첨부 회신'],['발송 방법', '이메일 첨부'],['담당자', ''],['완료 기한', '당일 처리'],['이사님 확인', ai?.needs_approval ? '필요' : '불필요'],['비고', ai?.note || '']];
      break;
    }
    case '성적서대응': {
      sheetTitle = 'KPROS 성적서 처리 지시서';
      headers = ['항목', '내용'];
      rows = [['문서번호', `KPROS-B-${dateStr}-${email.id}`],['작성일', formatDateFull(now.toISOString())],['수신일', receivedDate],['발신업체', ai?.company_name || ''],['발신자', ai?.sender_info || email.sender || ''],['메일 제목', email.subject || ''],['서류 유형', ai?.action_items || '본문 참조'],['핵심 요약', ai?.summary || ''],['', ''],['[처리 지시]', ''],['수신 확인', 'COA/성적서/거래명세서 내용 대조'],['DB 매칭', '기존 성적서와 중복 여부 확인'],['완료 기한', '당일 처리'],['이사님 확인', ai?.needs_approval ? '필요' : '불필요'],['비고', ai?.note || '']];
      break;
    }
    case '발주관리': {
      sheetTitle = 'KPROS 발주관리 지시서';
      const itemLines = bodyLines.filter(l => /^\d+[\.\)]\s/.test(l) || /^-\s/.test(l));
      headers = ['항목', '내용'];
      rows = [['문서번호', `KPROS-C-${dateStr}-${email.id}`],['작성일', formatDateFull(now.toISOString())],['수신일', receivedDate],['거래처', ai?.company_name || ''],['담당자', ai?.sender_info || email.sender || ''],['메일 제목', email.subject || ''],['핵심 요약', ai?.summary || ''],['예상 매출', ai?.estimated_revenue || '-'],['', '']];
      if (itemLines.length > 0) { rows.push(['[발주 품목 상세]', '']); itemLines.forEach((line, i) => rows.push([`품목 ${i + 1}`, line])); } else { rows.push(['요청 내용', ai?.action_items || '본문 참조']); }
      rows.push(['', ''],['[처리 지시]', ''],['발주 접수', 'PO 확인 및 내부 전달'],['납기 확인', '재고/생산/선적 일정 확인'],['물류 지시', '물류팀 지시서 생성'],['완료 기한', ''],['이사님 확인', ai?.needs_approval ? '필요' : '불필요'],['비고', ai?.note || '']);
      break;
    }
    default: {
      sheetTitle = 'KPROS 처리 보고서';
      headers = ['항목', '내용'];
      rows = [['문서번호', `KPROS-D-${dateStr}-${email.id}`],['작성일', formatDateFull(now.toISOString())],['수신일', receivedDate],['발신자', email.sender || ''],['메일 제목', email.subject || ''],['분류', `${code}.${category}`],['핵심 요약', ai?.summary || ''],['처리 결과', '응대 불필요 - 자동 필터링'],['비고', ai?.note || '']];
      break;
    }
  }
  const titleRow = [sheetTitle, ''];
  const csvContent = BOM + [titleRow, headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const typeInfo = INSTRUCTION_TYPES[category] || INSTRUCTION_TYPES['필터링'];
  const fileName = `KPROS-${code}-${typeInfo.label.replace(/\//g, '_')}_${dateStr}_${companyName}_#${email.id}.csv`;
  return { csvContent, fileName, category };
}

function exportInstructionSheet(email: EmailDetail) {
  const { csvContent, fileName } = buildInstructionCSV(email);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

async function saveInstructionToDropbox(email: EmailDetail): Promise<{ success: boolean; message: string; path?: string }> {
  const { csvContent, fileName, category } = buildInstructionCSV(email);
  try {
    const res = await fetch(apiUrl('/api/v1/dropbox/upload'), { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ category, fileName, content: csvContent }) });
    const data = await res.json();
    if (data.status === 'success') return { success: true, message: data.message, path: data.data?.path };
    if (data.need_reauth) return { success: false, message: 'Dropbox 인증이 필요합니다.' };
    return { success: false, message: data.detail || '저장 실패' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Dropbox 저장 실패' };
  }
}

function exportToExcel(emailList: EmailItem[]) {
  const BOM = '\uFEFF';
  const headers = ['날짜', '분류코드', '카테고리명', '발신자', '회사명', '메일 제목', '핵심 요약', '중요도', '처리 내용', '첨부파일', '처리 상태', '이사님 확인', '예상 매출', '비고'];
  const rows = emailList.map((email) => {
    const ai = parseAiSummary(email.aiSummary || email.ai_summary);
    return [formatDateFull(email.received_at || email.receivedAt || email.created_at || email.createdAt), ai?.code || CATEGORY_CODES[email.category] || '', email.category || '', email.sender || '', ai?.company_name || '', email.subject || '', ai?.summary || '', ai?.importance || '', ai?.action_items || '', '', STATUS_MAP[email.status] || email.status, ai?.needs_approval ? '필요' : '불필요', ai?.estimated_revenue || '', ai?.note || ''];
  });
  const csvContent = BOM + [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `KPROS_업무일지_${dateStr}.csv`;
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
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [draftText, setDraftText] = useState('');
  const [draftSubject, setDraftSubject] = useState('');
  const [approvalComment, setApprovalComment] = useState('');
  const [actionLoading, setActionLoading] = useState('');

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const cat = sp.get('category');
    const status = sp.get('status');
    if (cat) { setCategoryFilter(cat); setStatusFilter(''); }
    else if (status) { setStatusFilter(status); setCategoryFilter(''); }
  }, []);

  const loadEmails = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (categoryFilter) params.set('category', categoryFilter);
      if (searchQuery) params.set('search', searchQuery);
      params.set('limit', '100');
      const res = await fetch(apiUrl(`/api/v1/emails?${params}`), { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('이메일 목록 조회 실패');
      const data = await res.json();
      if (data.status === 'success') setEmails(data.data || []);
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }, [statusFilter, categoryFilter, searchQuery]);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/v1/emails/stats'), { headers: getAuthHeaders() });
      if (res.ok) { const data = await res.json(); if (data.status === 'success') setStats(data.data); }
    } catch { /* silent */ }
  }, []);

  useEffect(() => { loadEmails(); loadStats(); }, [loadEmails, loadStats]);

  const fetchNewEmails = async () => {
    setFetching(true); setError('');
    try {
      const res = await fetch(apiUrl('/api/v1/emails/fetch?max_count=50'), { method: 'POST', headers: getAuthHeaders() });
      if (!res.ok) { const errData = await res.json().catch(() => ({})); throw new Error(errData.detail || '이메일 가져오기 실패'); }
      const data = await res.json();
      if (data.status === 'success') { setError(''); await loadEmails(); await loadStats(); alert(`${data.count}개 이메일이 처리되었습니다. (${data.source})`); }
    } catch (err: any) { setError(err.message); } finally { setFetching(false); }
  };

  const openEmail = async (emailId: number) => {
    try {
      const res = await fetch(apiUrl(`/api/v1/emails/${emailId}`), { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('이메일 상세 조회 실패');
      const data = await res.json();
      if (data.status === 'success') {
        setSelectedEmail(data.data);
        setDraftText(parseDraftText(data.data.draft_response) || parseDraftText(data.data.ai_draft_response) || '');
        setDraftSubject(data.data.draft_subject || `Re: ${data.data.subject}`);
        setView('detail');
        loadEmails();
      }
    } catch (err: any) { setError(err.message); }
  };

  const saveDraft = async () => {
    if (!selectedEmail) return;
    setActionLoading('save');
    try {
      const res = await fetch(apiUrl(`/api/v1/emails/${selectedEmail.id}`), { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify({ draft_response: draftText, draft_subject: draftSubject }) });
      if (!res.ok) throw new Error('저장 실패');
      alert('초안이 저장되었습니다.');
      await openEmail(selectedEmail.id); await loadEmails();
    } catch (err: any) { setError(err.message); } finally { setActionLoading(''); }
  };

  const submitForReview = async () => {
    if (!selectedEmail) return;
    setActionLoading('submit');
    try {
      const res = await fetch(apiUrl(`/api/v1/emails/${selectedEmail.id}/submit`), { method: 'POST', headers: getAuthHeaders() });
      if (!res.ok) { const errData = await res.json().catch(() => ({})); throw new Error(errData.detail || '제출 실패'); }
      alert('검토 요청이 제출되었습니다.');
      await openEmail(selectedEmail.id); await loadEmails(); await loadStats();
    } catch (err: any) { setError(err.message); } finally { setActionLoading(''); }
  };

  const approveEmail = async () => {
    if (!selectedEmail) return;
    setActionLoading('approve');
    try {
      const res = await fetch(apiUrl(`/api/v1/emails/${selectedEmail.id}/approve`), { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ comments: approvalComment || null }) });
      if (!res.ok) { const errData = await res.json().catch(() => ({})); throw new Error(errData.detail || '승인 실패'); }
      alert('이메일이 승인되었습니다.'); setApprovalComment('');
      await openEmail(selectedEmail.id); await loadEmails(); await loadStats();
    } catch (err: any) { setError(err.message); } finally { setActionLoading(''); }
  };

  const rejectEmail = async () => {
    if (!selectedEmail) return;
    setActionLoading('reject');
    try {
      const res = await fetch(apiUrl(`/api/v1/emails/${selectedEmail.id}/reject`), { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ comments: approvalComment || '반려' }) });
      if (!res.ok) { const errData = await res.json().catch(() => ({})); throw new Error(errData.detail || '반려 실패'); }
      alert('이메일이 반려되었습니다.'); setApprovalComment('');
      await openEmail(selectedEmail.id); await loadEmails(); await loadStats();
    } catch (err: any) { setError(err.message); } finally { setActionLoading(''); }
  };

  const sendEmail = async (dropboxPaths?: string[]) => {
    if (!selectedEmail) return;
    if (!confirm('이메일을 발송하시겠습니까?')) return;
    setActionLoading('send');
    try {
      const res = await fetch(apiUrl(`/api/v1/emails/${selectedEmail.id}/send`), {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ dropbox_paths: dropboxPaths || [] }),
      });
      if (!res.ok) { const errData = await res.json().catch(() => ({})); throw new Error(errData.detail || '발송 실패'); }
      alert('이메일이 발송되었습니다.');
      await openEmail(selectedEmail.id); await loadEmails(); await loadStats();
    } catch (err: any) { setError(err.message); } finally { setActionLoading(''); }
  };

  const markAllRead = async () => {
    if (!confirm('미처리 이메일을 모두 확인 처리하시겠습니까?')) return;
    try {
      const res = await fetch(apiUrl('/api/v1/emails/mark-all-read'), { method: 'POST', headers: getAuthHeaders() });
      if (!res.ok) throw new Error('일괄 확인 실패');
      await loadEmails(); await loadStats();
    } catch (err: any) { setError(err.message); }
  };

  const reclassify = async () => {
    if (!selectedEmail) return;
    setActionLoading('reclassify');
    try {
      const res = await fetch(apiUrl(`/api/v1/emails/${selectedEmail.id}/reclassify`), { method: 'POST', headers: getAuthHeaders() });
      if (!res.ok) throw new Error('재분류 실패');
      alert('AI 재분류가 완료되었습니다.');
      await openEmail(selectedEmail.id); await loadEmails();
    } catch (err: any) { setError(err.message); } finally { setActionLoading(''); }
  };

  const generateDraft = async () => {
    if (!selectedEmail) return;
    setActionLoading('generate');
    try {
      const res = await fetch(apiUrl(`/api/v1/emails/${selectedEmail.id}/generate-draft`), { method: 'POST', headers: getAuthHeaders() });
      if (!res.ok) throw new Error('답신 생성 실패');
      const data = await res.json();
      if (data.draft) setDraftText(parseDraftText(data.draft));
      alert('AI 답신이 생성되었습니다.');
      await openEmail(selectedEmail.id);
    } catch (err: any) { setError(err.message); } finally { setActionLoading(''); }
  };

  // 처리중 카운트 (read + draft + in_review)
  const processingCount = stats ? (stats.total - stats.unread - stats.approved - stats.sent) : 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">이메일 관리</h1>
          <p className="text-sm text-slate-500 mt-0.5">KPROS AI 스마트 비서</p>
        </div>
        <div className="flex gap-2">
          {view !== 'list' && (
            <button onClick={() => { setView('list'); setSelectedEmail(null); }} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition">
              &#8592; 목록
            </button>
          )}
          {view === 'list' && stats && stats.total > 0 && (
            <button onClick={markAllRead} className="px-4 py-2 rounded-xl border border-blue-300 text-sm font-medium text-blue-700 hover:bg-blue-50 transition">
              전체 확인
            </button>
          )}
          {view === 'list' && emails.length > 0 && (
            <button onClick={() => exportToExcel(emails)} className="px-4 py-2 rounded-xl border border-green-300 text-sm font-medium text-green-700 hover:bg-green-50 transition">
              📥 엑셀 내보내기
            </button>
          )}
          <button onClick={fetchNewEmails} disabled={fetching} className="px-5 py-2 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50 transition">
            {fetching ? '가져오는 중...' : '새 이메일 가져오기'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm border border-red-200 flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 ml-3">✕</button>
        </div>
      )}

      {/* Status Filter Tabs */}
      {view === 'list' && stats && (
        <div className="flex gap-2 flex-wrap">
          <StatBadge label="전체" count={stats.total} color="bg-slate-700 text-white" inactiveColor="bg-slate-100 text-slate-600" onClick={() => { setStatusFilter(''); setCategoryFilter(''); }} active={!statusFilter && !categoryFilter} />
          <StatBadge label="미처리" count={stats.unread} color="bg-blue-600 text-white" inactiveColor="bg-blue-50 text-blue-600" onClick={() => { setStatusFilter(statusFilter === 'unread' ? '' : 'unread'); setCategoryFilter(''); }} active={statusFilter === 'unread'} />
          <StatBadge label="처리중" count={processingCount > 0 ? processingCount : 0} color="bg-amber-500 text-white" inactiveColor="bg-amber-50 text-amber-600" onClick={() => { setStatusFilter(statusFilter === 'in_review' ? '' : 'in_review'); setCategoryFilter(''); }} active={statusFilter === 'in_review'} />
          <StatBadge label="처리완료" count={stats.approved} color="bg-green-600 text-white" inactiveColor="bg-green-50 text-green-600" onClick={() => { setStatusFilter(statusFilter === 'approved' ? '' : 'approved'); setCategoryFilter(''); }} active={statusFilter === 'approved'} />
          <StatBadge label="발송" count={stats.sent} color="bg-emerald-600 text-white" inactiveColor="bg-emerald-50 text-emerald-600" onClick={() => { setStatusFilter(statusFilter === 'sent' ? '' : 'sent'); setCategoryFilter(''); }} active={statusFilter === 'sent'} />
        </div>
      )}

      {/* Active Filter Indicator */}
      {view === 'list' && (statusFilter || categoryFilter) && (
        <div className="flex items-center gap-2 px-3 py-2 bg-brand-50 border border-brand-200 rounded-xl text-xs">
          <span className="text-brand-700 font-semibold">필터:</span>
          {statusFilter && <span className="px-2 py-0.5 bg-brand-100 text-brand-800 rounded font-bold">{STATUS_MAP[statusFilter] || statusFilter}</span>}
          {categoryFilter && <span className="px-2 py-0.5 bg-brand-100 text-brand-800 rounded font-bold">{CATEGORY_CODES[categoryFilter]}.{categoryFilter}</span>}
          <button onClick={() => { setStatusFilter(''); setCategoryFilter(''); }} className="ml-auto text-brand-500 hover:text-brand-700 font-bold cursor-pointer">초기화 ✕</button>
        </div>
      )}

      {/* Search */}
      {view === 'list' && (
        <div className="flex gap-2.5 items-center">
          <input type="text" placeholder="제목 또는 발신자 검색..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') loadEmails(); }}
            className="flex-1 px-4 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition" />
          <button onClick={loadEmails} className="px-4 py-2 rounded-xl border border-slate-200 text-sm hover:bg-slate-50 transition font-medium cursor-pointer">검색</button>
        </div>
      )}

      {/* Main Content */}
      {view === 'list' && <EmailList emails={emails} loading={loading} onSelect={openEmail} />}

      {view === 'detail' && selectedEmail && (
        <EmailDetailView
          email={selectedEmail}
          draftText={draftText} setDraftText={setDraftText}
          draftSubject={draftSubject} setDraftSubject={setDraftSubject}
          approvalComment={approvalComment} setApprovalComment={setApprovalComment}
          actionLoading={actionLoading}
          onSaveDraft={saveDraft} onSubmit={submitForReview}
          onApprove={approveEmail} onReject={rejectEmail}
          onSend={sendEmail}
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

function StatBadge({ label, count, color, inactiveColor, onClick, active }: {
  label: string; count: number; color: string; inactiveColor: string;
  onClick: () => void; active: boolean;
}) {
  return (
    <button onClick={onClick} className={`px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer ${active ? `${color} shadow-md scale-105` : `${inactiveColor} hover:shadow-sm hover:scale-[1.02]`}`}>
      {label} {count}
    </button>
  );
}

function EmailList({ emails, loading, onSelect }: { emails: EmailItem[]; loading: boolean; onSelect: (id: number) => void }) {
  if (loading) return (
    <div className="bg-white rounded-2xl border border-slate-200 p-14 text-center">
      <div className="w-8 h-8 border-[3px] border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
      <p className="text-sm text-slate-500">이메일을 불러오는 중...</p>
    </div>
  );

  if (emails.length === 0) return (
    <div className="bg-white rounded-2xl border border-slate-200 p-14 text-center">
      <div className="text-4xl mb-3">📭</div>
      <h3 className="text-base font-bold text-slate-900 mb-1">이메일이 없습니다</h3>
      <p className="text-sm text-slate-500">&quot;새 이메일 가져오기&quot;를 클릭하여 메일을 가져오세요</p>
    </div>
  );

  return (
    <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
      {emails.map((email) => {
        const statusInfo = STATUS_LABELS[email.status] || STATUS_LABELS['read'];
        const summary = getDisplaySummary(email);
        const ai = parseAiSummary(email.aiSummary || email.ai_summary);
        const displayCat = LEGACY_CATEGORY_MAP[email.category] || email.category;
        const displayCode = CATEGORY_CODES[displayCat] || ai?.code || '';
        const catIcon = CATEGORY_ICONS[displayCat] || '🔘';

        return (
          <button key={email.id} onClick={() => onSelect(email.id)}
            className={`w-full text-left px-5 py-3.5 hover:bg-slate-50 transition-colors flex items-center gap-3 ${email.status === 'unread' ? 'bg-blue-50/30' : ''}`}>
            <span className="text-base shrink-0" title={email.priority}>{PRIORITY_ICONS[email.priority] || '🟡'}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-semibold truncate ${email.status === 'unread' ? 'text-slate-900' : 'text-slate-700'}`}>{email.subject}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-slate-500 truncate">{email.sender}</span>
                {summary && <span className="text-xs text-slate-400 truncate hidden md:inline">— {summary}</span>}
              </div>
            </div>
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold shrink-0 ${statusInfo.color}`}>{statusInfo.label}</span>
            <span className="text-xs text-slate-400 shrink-0 w-28 text-right">{formatDate(email.received_at || email.receivedAt || email.created_at || email.createdAt)}</span>
          </button>
        );
      })}
    </div>
  );
}

// ==========================================
// Email Detail View - 단일 페이지 워크플로우
// ==========================================

function EmailDetailView({
  email, draftText, setDraftText, draftSubject, setDraftSubject,
  approvalComment, setApprovalComment, actionLoading,
  onSaveDraft, onSubmit, onApprove, onReject, onSend, onGenerateDraft, onBack,
}: {
  email: EmailDetail; draftText: string; setDraftText: (v: string) => void;
  draftSubject: string; setDraftSubject: (v: string) => void;
  approvalComment: string; setApprovalComment: (v: string) => void;
  actionLoading: string;
  onSaveDraft: () => void; onSubmit: () => void; onApprove: () => void;
  onReject: () => void; onSend: (dropboxPaths?: string[]) => void;
  onGenerateDraft: () => void; onBack: () => void;
}) {
  const ai = parseAiSummary(email.ai_summary);
  const displayCat = LEGACY_CATEGORY_MAP[email.category] || email.category;
  const [showReply, setShowReply] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showDropboxAttach, setShowDropboxAttach] = useState(false);
  const [dropboxSearchQuery, setDropboxSearchQuery] = useState('');
  const [dropboxSearchResults, setDropboxSearchResults] = useState<DropboxFile[]>([]);
  const [dropboxSearching, setDropboxSearching] = useState(false);
  const [selectedDropboxFiles, setSelectedDropboxFiles] = useState<{ path: string; name: string; size: number }[]>([]);

  const searchDropboxForAttach = async () => {
    if (!dropboxSearchQuery.trim()) return;
    setDropboxSearching(true);
    try {
      const res = await fetch(apiUrl('/api/v1/dropbox/search'), {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: dropboxSearchQuery.trim() }),
      });
      if (!res.ok) throw new Error('검색 실패');
      const data = await res.json() as any;
      setDropboxSearchResults(data.results || []);
    } catch {
      setDropboxSearchResults([]);
    } finally {
      setDropboxSearching(false);
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition">
          <span>&#8592;</span> 목록으로
        </button>
      </div>

      {/* Section 1: 메일 헤더 */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-slate-900 mb-3">{email.subject}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              <div><span className="text-slate-400 font-medium">From:</span> <span className="text-slate-700">{email.sender}</span></div>
              <div><span className="text-slate-400 font-medium">To:</span> <span className="text-slate-700">{email.recipient || 'kpros@kpros.kr'}</span></div>
              <div><span className="text-slate-400 font-medium">Date:</span> <span className="text-slate-700">{formatDateFull(email.received_at)}</span></div>
              {email.attachments.length > 0 && (
                <div><span className="text-slate-400 font-medium">📎</span> <span className="text-slate-700">첨부 {email.attachments.length}건</span></div>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${STATUS_LABELS[email.status]?.color || 'bg-slate-100 text-slate-600'}`}>
              {STATUS_LABELS[email.status]?.label || email.status}
            </span>
            {ai?.needs_approval && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-50 text-orange-600">이사님 확인</span>}
          </div>
        </div>
      </div>

      {/* Section 2: 액션 바 */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap gap-2">
          {/* AI 답장 */}
          <button onClick={() => { onGenerateDraft(); setShowReply(true); }} disabled={actionLoading === 'generate'}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-50 transition">
            {actionLoading === 'generate' ? '생성중...' : '↩️ AI답장'}
          </button>
        </div>

        {/* 우선순위 + 상태 */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 font-medium">우선순위:</span>
            {['high', 'medium', 'low'].map((p) => (
              <span key={p} className={`px-2 py-0.5 rounded ${email.priority === p ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-400'} text-[10px] font-bold`}>
                {PRIORITY_ICONS[p]} {p === 'high' ? '긴급' : p === 'medium' ? '일반' : '낮음'}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2 text-xs ml-auto">
            <span className="text-slate-400 font-medium">상태:</span>
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${STATUS_LABELS[email.status]?.color || 'bg-slate-100'}`}>
              {STATUS_LABELS[email.status]?.label || email.status}
            </span>
          </div>
        </div>
      </div>

      {/* Section 4: 메일 본문 + 첨부파일 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-700 text-white px-4 py-2 text-xs font-bold">📧 메일 본문</div>
        <div className="p-4 text-sm text-slate-800 whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto">
          {email.body || '(본문 없음)'}
        </div>
        {email.attachments.length > 0 && (
          <div className="border-t border-slate-100 px-4 py-3">
            <div className="text-xs font-bold text-slate-500 mb-2">첨부파일</div>
            <div className="flex flex-wrap gap-2">
              {email.attachments.map((att) => (
                <div key={att.id} className="flex items-center gap-1">
                  <span className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 font-medium">
                    📎 {att.file_name} ({(att.file_size / 1024).toFixed(0)}KB)
                  </span>
                  {att.dropbox_path && (
                    <button
                      onClick={async () => {
                        try {
                          const res = await fetch(apiUrl('/api/v1/dropbox/link'), {
                            method: 'POST', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                            body: JSON.stringify({ path: att.dropbox_path }),
                          });
                          const data = await res.json() as any;
                          if (data.link) window.open(data.link, '_blank');
                        } catch {}
                      }}
                      className="px-2 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-600 hover:bg-blue-100 transition font-medium"
                      title="Dropbox에서 다운로드"
                    >
                      ☁️
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Section 6: 답장 작성 패널 (접이식) */}
      <div className="bg-white rounded-xl border border-blue-200 overflow-hidden">
        <button onClick={() => setShowReply(!showReply)} className="w-full bg-blue-700 text-white px-4 py-2.5 text-xs font-bold flex justify-between items-center hover:bg-blue-600 transition">
          <span>✏️ 답장 작성</span>
          <svg className={`w-4 h-4 transition-transform ${showReply ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showReply && (
          <div className="p-4 space-y-3">
            <div>
              <label className="text-xs font-bold text-slate-500 mb-1 block">To</label>
              <div className="px-3 py-2 bg-slate-50 rounded-lg text-xs text-slate-700">{email.sender}</div>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 mb-1 block">Subject</label>
              <input type="text" value={draftSubject} onChange={(e) => setDraftSubject(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500 transition" />
            </div>
            {email.ai_draft_response && (
              <div>
                <label className="text-xs font-bold text-blue-500 mb-1 block">AI 초안</label>
                <div className="px-3 py-2 bg-blue-50 rounded-lg text-xs text-blue-800 whitespace-pre-wrap max-h-32 overflow-y-auto">{parseDraftText(email.ai_draft_response)}</div>
              </div>
            )}
            <div>
              <label className="text-xs font-bold text-slate-500 mb-1 block">본문</label>
              <textarea value={draftText} onChange={(e) => setDraftText(e.target.value)} rows={8}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500 resize-y transition" />
            </div>
            {email.status === 'in_review' && (
              <div>
                <label className="text-xs font-bold text-orange-500 mb-1 block">승인 코멘트</label>
                <textarea value={approvalComment} onChange={(e) => setApprovalComment(e.target.value)} rows={2} placeholder="코멘트 (선택)"
                  className="w-full px-3 py-2 border border-orange-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-orange-500 transition" />
              </div>
            )}

            {/* Dropbox 파일 첨부 */}
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <button onClick={() => setShowDropboxAttach(!showDropboxAttach)}
                className="w-full px-3 py-2 bg-slate-50 text-xs font-bold text-slate-600 flex justify-between items-center hover:bg-slate-100 transition">
                <span>📎 Dropbox 파일 첨부 {selectedDropboxFiles.length > 0 && `(${selectedDropboxFiles.length}건 선택)`}</span>
                <svg className={`w-3.5 h-3.5 transition-transform ${showDropboxAttach ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showDropboxAttach && (
                <div className="p-3 space-y-2 border-t border-slate-200">
                  <div className="flex gap-2">
                    <input type="text" value={dropboxSearchQuery} onChange={(e) => setDropboxSearchQuery(e.target.value)}
                      placeholder="파일명으로 검색..."
                      onKeyDown={(e) => { if (e.key === 'Enter') searchDropboxForAttach(); }}
                      className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500" />
                    <button onClick={searchDropboxForAttach} disabled={dropboxSearching || !dropboxSearchQuery.trim()}
                      className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">
                      {dropboxSearching ? '...' : '검색'}
                    </button>
                  </div>
                  {dropboxSearchResults.length > 0 && (
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {dropboxSearchResults.filter(f => !f.is_folder).map((file) => {
                        const isSelected = selectedDropboxFiles.some(s => s.path === file.path);
                        return (
                          <div key={file.path}
                            onClick={() => {
                              if (isSelected) {
                                setSelectedDropboxFiles(prev => prev.filter(s => s.path !== file.path));
                              } else {
                                setSelectedDropboxFiles(prev => [...prev, { path: file.path, name: file.name, size: file.size }]);
                              }
                            }}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs cursor-pointer transition ${
                              isSelected ? 'bg-blue-50 border border-blue-300' : 'bg-white border border-slate-100 hover:bg-slate-50'
                            }`}>
                            <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                              isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300'
                            }`}>
                              {isSelected && <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                            </span>
                            <span className="truncate flex-1 font-medium">{file.name}</span>
                            <span className="text-slate-400 shrink-0">{file.size > 1048576 ? `${(file.size / 1048576).toFixed(1)}MB` : `${(file.size / 1024).toFixed(0)}KB`}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {selectedDropboxFiles.length > 0 && (
                    <div className="pt-2 border-t border-slate-100">
                      <div className="text-xs font-bold text-blue-600 mb-1">선택된 파일:</div>
                      <div className="flex flex-wrap gap-1">
                        {selectedDropboxFiles.map((f) => (
                          <span key={f.path} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
                            📎 {f.name}
                            <button onClick={() => setSelectedDropboxFiles(prev => prev.filter(s => s.path !== f.path))}
                              className="text-blue-400 hover:text-red-500 font-bold ml-0.5">&times;</button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <div className="flex gap-2">
                <button onClick={() => { onGenerateDraft(); }} disabled={actionLoading === 'generate'} className="px-3 py-1.5 rounded-lg bg-blue-100 text-blue-700 text-xs font-bold hover:bg-blue-200 disabled:opacity-50 transition">
                  {actionLoading === 'generate' ? '...' : '🤖 AI 재생성'}
                </button>
                {['read', 'draft', 'rejected', 'unread'].includes(email.status) && (
                  <button onClick={onSaveDraft} disabled={actionLoading === 'save'} className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 disabled:opacity-50 transition">
                    {actionLoading === 'save' ? '...' : '💾 임시저장'}
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                {['read', 'draft', 'rejected', 'unread'].includes(email.status) && (
                  <button onClick={onSubmit} disabled={actionLoading === 'submit'} className="px-4 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 disabled:opacity-50 transition">
                    {actionLoading === 'submit' ? '...' : '승인요청 ▶'}
                  </button>
                )}
                {email.status === 'in_review' && (
                  <>
                    <button onClick={onApprove} disabled={actionLoading === 'approve'} className="px-4 py-1.5 rounded-lg bg-green-600 text-white text-xs font-bold hover:bg-green-700 disabled:opacity-50 transition">
                      {actionLoading === 'approve' ? '...' : '✅ 승인'}
                    </button>
                    <button onClick={onReject} disabled={actionLoading === 'reject'} className="px-4 py-1.5 rounded-lg bg-red-500 text-white text-xs font-bold hover:bg-red-600 disabled:opacity-50 transition">
                      {actionLoading === 'reject' ? '...' : '❌ 반려'}
                    </button>
                  </>
                )}
                {email.status === 'approved' && (
                  <button onClick={() => onSend(selectedDropboxFiles.map(f => f.path))} disabled={actionLoading === 'send'} className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 transition">
                    {actionLoading === 'send' ? '...' : `📤 발송${selectedDropboxFiles.length > 0 ? ` (첨부 ${selectedDropboxFiles.length})` : ''}`}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Section 7: 처리 이력 (접이식) */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <button onClick={() => setShowHistory(!showHistory)} className="w-full bg-slate-600 text-white px-4 py-2.5 text-xs font-bold flex justify-between items-center hover:bg-slate-500 transition">
          <span>📝 처리 이력 ({email.approvals.length + 2}건)</span>
          <svg className={`w-4 h-4 transition-transform ${showHistory ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showHistory && (
          <div className="p-4 space-y-2 text-xs">
            <div className="flex items-center gap-3">
              <span className="text-slate-400 w-24 shrink-0">{formatDateFull(email.received_at)}</span>
              <span className="text-slate-700">메일 수신</span>
            </div>
            {email.processed_at && (
              <div className="flex items-center gap-3">
                <span className="text-slate-400 w-24 shrink-0">{formatDateFull(email.processed_at)}</span>
                <span className="text-slate-700">AI 자동분류 → {CATEGORY_ICONS[displayCat]} {displayCat} ({email.ai_confidence}%)</span>
              </div>
            )}
            {email.approvals.map((a) => (
              <div key={a.id} className="flex items-center gap-3">
                <span className="text-slate-400 w-24 shrink-0">{formatDateFull(a.approved_at || a.created_at)}</span>
                <span className={a.status === 'approved' ? 'text-green-600 font-bold' : a.status === 'rejected' ? 'text-red-600 font-bold' : 'text-slate-700'}>
                  {a.stage}: {a.status === 'approved' ? '승인' : a.status === 'rejected' ? '반려' : '대기'}
                  {a.comments && <span className="text-slate-400 ml-2">({a.comments})</span>}
                </span>
              </div>
            ))}
            {email.sent_at && (
              <div className="flex items-center gap-3">
                <span className="text-slate-400 w-24 shrink-0">{formatDateFull(email.sent_at)}</span>
                <span className="text-emerald-600 font-bold">메일 발송 완료</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// Dropbox Components
// ==========================================

function DropboxSaveButton({ email }: { email: EmailDetail }) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedPath, setSavedPath] = useState('');
  const handleSave = async () => {
    setSaving(true);
    const result = await saveInstructionToDropbox(email);
    setSaving(false);
    if (result.success) { setSaved(true); setSavedPath(result.path || ''); setTimeout(() => setSaved(false), 5000); }
    else { alert(result.message); }
  };
  if (saved) return <span className="px-3 py-1 rounded-lg bg-emerald-100 text-emerald-700 text-xs font-bold" title={savedPath}>Dropbox 저장완료</span>;
  return (
    <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-lg bg-sky-600 text-white text-xs font-bold hover:bg-sky-700 disabled:opacity-50 transition">
      {saving ? '저장중...' : '☁️ Dropbox'}
    </button>
  );
}

function DropboxSearchPanel({ keywords }: { keywords: string[] }) {
  const [results, setResults] = useState<DropboxFile[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const [downloadingPath, setDownloadingPath] = useState('');

  const searchDropbox = async () => {
    setSearching(true); setError('');
    try {
      const res = await fetch(apiUrl('/api/v1/dropbox/search-multi'), { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ keywords }) });
      const data = await res.json();
      if (data.status === 'success') { setResults(data.data || []); setSearched(true); }
      else if (data.need_reauth) { setError('Dropbox 인증이 필요합니다.'); }
      else { setError(data.detail || '검색 실패'); }
    } catch (err: any) { setError(err.message || '드롭박스 검색 실패'); } finally { setSearching(false); }
  };

  const getDownloadLink = async (path: string) => {
    setDownloadingPath(path);
    try {
      const res = await fetch(apiUrl('/api/v1/dropbox/link'), { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ path }) });
      const data = await res.json();
      if (data.status === 'success' && data.link) window.open(data.link, '_blank');
      else alert(data.detail || '링크 생성 실패');
    } catch { alert('다운로드 링크 생성 실패'); } finally { setDownloadingPath(''); }
  };

  const fmtSize = (b: number) => b < 1024 ? `${b}B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(1)}KB` : `${(b / (1024 * 1024)).toFixed(1)}MB`;

  return (
    <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl border border-blue-200/80 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold text-blue-800">📂 드롭박스 파일 검색</h3>
        <button onClick={searchDropbox} disabled={searching} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-50 transition">
          {searching ? '검색중...' : '🔍 검색'}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {keywords.map((kw, i) => <span key={i} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">{kw}</span>)}
      </div>
      {error && <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-2">{error}</div>}
      {searched && results.length === 0 && <div className="text-xs text-blue-500 bg-white/60 px-3 py-2 rounded-lg">검색 결과 없음</div>}
      {results.length > 0 && (
        <div className="space-y-1.5">
          {results.map((file, i) => (
            <div key={i} className="flex items-center gap-3 bg-white/70 rounded-lg px-3 py-2 text-xs hover:bg-white transition">
              <span className="text-base shrink-0">{file.is_folder ? '📁' : '📄'}</span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-800 truncate">{file.name}</div>
                <div className="text-slate-400 truncate">{file.path}</div>
              </div>
              {!file.is_folder && (
                <>
                  <span className="text-slate-400 shrink-0">{fmtSize(file.size)}</span>
                  <button onClick={() => getDownloadLink(file.path)} disabled={downloadingPath === file.path}
                    className="px-2 py-1 rounded bg-blue-100 text-blue-700 font-bold hover:bg-blue-200 disabled:opacity-50 transition shrink-0">
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
