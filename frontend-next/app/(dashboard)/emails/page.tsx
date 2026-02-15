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
  body_html: string | null;
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

/** AI 답신 초안에서 실제 메일 텍스트만 추출 (JSON 응답 처리) */
function parseDraftText(raw: string | null | undefined): string {
  if (!raw) return '';
  const trimmed = raw.trim();

  // JSON 형태인지 확인
  if (trimmed.startsWith('{') || trimmed.startsWith('```')) {
    try {
      // 마크다운 코드블록 제거
      const cleaned = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      const parsed = JSON.parse(cleaned);
      // 다양한 키에서 텍스트 추출 시도
      const text = parsed.draft_reply || parsed.answer || parsed.reply || parsed.content || parsed.response || parsed.text || '';
      if (text && typeof text === 'string' && text.length > 10) {
        return text;
      }
    } catch {
      // JSON 파싱 실패 시 코드블록만 제거
      const stripped = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      // 여전히 JSON처럼 보이면 답변 필드 추출 시도 (정규식)
      const answerMatch = stripped.match(/"(?:draft_reply|answer|reply)":\s*"((?:[^"\\]|\\.)*)"/);
      if (answerMatch) {
        return answerMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
      }
      return stripped;
    }
  }
  return raw;
}

/** HTML 본문 간이 삭제 (script/style/event handler 제거) */
function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}

/** HTML/텍스트 토글 안내 (실제 토글은 body_html 유무로 자동 결정) */
function BodyViewToggle() {
  return (
    <div className="mt-1 text-[10px] text-blue-500 font-normal">
      (HTML)
    </div>
  );
}

// ==========================================
// Instruction Sheet Export (카테고리별 지시서)
// ==========================================

const INSTRUCTION_TYPES: Record<string, { label: string; icon: string }> = {
  '자료대응': { label: '자료발송 지시서', icon: '📋' },
  '영업기회': { label: '견적/발주 지시서', icon: '📊' },
  '스케줄링': { label: '미팅 일정 지시서', icon: '📅' },
  '정보수집': { label: '시장정보 분석서', icon: '📈' },
  '필터링':   { label: '처리완료 보고서', icon: '📝' },
};

/** ─── Excel 보고서 스타일 상수 ─── */
const XL_COLORS = {
  NAVY: 'FF1E3A5F', WHITE: 'FFFFFFFF', SECTION_BG: 'FFE8EFF5',
  HEADER_BG: 'FFF1F5F9', LABEL_BG: 'FFF8FAFC', APPROVAL_BG: 'FFFEF2F2',
  BORDER: 'FFD1D5DB', TEXT_DARK: 'FF1E293B', TEXT_GRAY: 'FF6B7280',
};
const XL_BORDER_THIN: any = {
  top: { style: 'thin', color: { argb: XL_COLORS.BORDER } },
  left: { style: 'thin', color: { argb: XL_COLORS.BORDER } },
  bottom: { style: 'thin', color: { argb: XL_COLORS.BORDER } },
  right: { style: 'thin', color: { argb: XL_COLORS.BORDER } },
};

type SectionRow = { section?: string; label: string; value: string; isApproval?: boolean };

/** ExcelJS로 전문 보고서 양식 시트 생성 (공통 헬퍼) */
async function buildReportSheet(
  workbook: any, // ExcelJS.Workbook
  sheetName: string,
  title: string,
  docNumber: string,
  createdDate: string,
  receivedDate: string,
  sections: { name: string; rows: SectionRow[] }[],
) {
  const ws = workbook.addWorksheet(sheetName);

  // ── 열 설정 ──
  ws.columns = [
    { width: 14, key: 'col1' },
    { width: 18, key: 'col2' },
    { width: 58, key: 'col3' },
  ];

  // ── Row 1: 타이틀 바 ──
  ws.mergeCells('A1:C1');
  const titleRow = ws.getRow(1);
  titleRow.height = 36;
  const titleCell = ws.getCell('A1');
  titleCell.value = title;
  titleCell.font = { bold: true, size: 14, color: { argb: XL_COLORS.WHITE } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL_COLORS.NAVY } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.border = XL_BORDER_THIN;

  // ── Row 2: 문서번호/날짜 바 ──
  ws.mergeCells('A2:C2');
  const metaCell = ws.getCell('A2');
  metaCell.value = `문서번호: ${docNumber}    |    작성일: ${createdDate}    |    수신일: ${receivedDate}`;
  metaCell.font = { size: 9, color: { argb: XL_COLORS.TEXT_GRAY } };
  metaCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL_COLORS.HEADER_BG } };
  metaCell.alignment = { horizontal: 'center', vertical: 'middle' };
  metaCell.border = XL_BORDER_THIN;
  ws.getRow(2).height = 22;

  // ── Row 3: 빈 줄 ──
  ws.getRow(3).height = 6;

  let rowNum = 4;

  for (const section of sections) {
    // ── 섹션 헤더 ──
    ws.mergeCells(`A${rowNum}:C${rowNum}`);
    const secCell = ws.getCell(`A${rowNum}`);
    secCell.value = `  ${section.name}`;
    secCell.font = { bold: true, size: 10, color: { argb: XL_COLORS.TEXT_DARK } };
    secCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL_COLORS.SECTION_BG } };
    secCell.alignment = { vertical: 'middle' };
    secCell.border = XL_BORDER_THIN;
    ws.getRow(rowNum).height = 24;
    rowNum++;

    // ── 섹션 데이터 행 ──
    for (const item of section.rows) {
      const row = ws.getRow(rowNum);
      row.height = 22;

      // A열 (구분 - 첫 행만)
      const cellA = ws.getCell(`A${rowNum}`);
      cellA.border = XL_BORDER_THIN;
      cellA.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL_COLORS.LABEL_BG } };

      // B열 (항목명)
      const cellB = ws.getCell(`B${rowNum}`);
      cellB.value = item.label;
      cellB.font = { bold: true, size: 10, color: { argb: XL_COLORS.TEXT_DARK } };
      cellB.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL_COLORS.LABEL_BG } };
      cellB.alignment = { vertical: 'middle', horizontal: 'right', indent: 1 };
      cellB.border = XL_BORDER_THIN;

      // C열 (내용)
      const cellC = ws.getCell(`C${rowNum}`);
      cellC.value = item.value;
      cellC.font = { size: 10, color: { argb: XL_COLORS.TEXT_DARK } };
      cellC.alignment = { vertical: 'middle', wrapText: true, indent: 1 };
      cellC.border = XL_BORDER_THIN;

      // 이사님 확인 필요 시 빨간 배경
      if (item.isApproval && item.value.includes('필요')) {
        cellC.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL_COLORS.APPROVAL_BG } };
        cellC.font = { bold: true, size: 10, color: { argb: 'FFDC2626' } };
      }

      // 긴 텍스트는 행 높이 자동 조정
      if (item.value.length > 50) row.height = 36;
      if (item.value.length > 100) row.height = 52;

      rowNum++;
    }

    // 섹션 간 빈 줄
    ws.getRow(rowNum).height = 4;
    rowNum++;
  }

  // ── 하단 푸터 ──
  ws.mergeCells(`A${rowNum}:C${rowNum}`);
  const footerCell = ws.getCell(`A${rowNum}`);
  footerCell.value = 'KPROS AI 스마트 비서 - C-Auto 자동 생성 문서';
  footerCell.font = { size: 8, italic: true, color: { argb: XL_COLORS.TEXT_GRAY } };
  footerCell.alignment = { horizontal: 'right', vertical: 'middle' };

  return ws;
}

/** 지시서 Excel(xlsx) 데이터 생성 - ExcelJS 전문 보고서 양식 */
async function buildInstructionExcel(email: EmailDetail): Promise<{ excelBase64: string; excelBlob: Blob; fileName: string; category: string }> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'KPROS C-Auto';
  workbook.created = new Date();

  const ai = parseAiSummary(email.ai_summary);
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const category = email.category || '필터링';
  const code = ai?.code || CATEGORY_CODES[category] || 'E';
  const receivedDate = formatDateFull(email.received_at);
  const createdDate = formatDateFull(now.toISOString());
  const companyName = (ai?.company_name || '').replace(/[\\/:*?"<>|]/g, '').trim() || '미상';
  const bodyLines = (email.body || '').split('\n').map(l => l.trim()).filter(Boolean);
  const docNumber = `KPROS-${code}-${dateStr}-${email.id}`;

  // ─── 카테고리별 메인 시트 ───
  switch (category) {
    case '자료대응': {
      const keywords = ai?.search_keywords?.join(', ') || '';
      await buildReportSheet(workbook, '자료발송지시서', 'KPROS 자료발송 지시서', docNumber, createdDate, receivedDate, [
        { name: '요청 정보', rows: [
          { label: '요청업체', value: ai?.company_name || '' },
          { label: '요청자', value: ai?.sender_info || email.sender || '' },
          { label: '메일 제목', value: email.subject || '' },
          { label: '요청 자료', value: ai?.action_items || '' },
        ]},
        { name: 'AI 분석 결과', rows: [
          { label: '핵심 요약', value: ai?.summary || '' },
          { label: '검색 키워드', value: keywords },
          { label: '이사님 보고', value: ai?.director_report || '' },
          { label: '중요도', value: ai?.importance || '' },
        ]},
        { name: '처리 지시', rows: [
          { label: '처리 방법', value: '드롭박스에서 관련 파일 검색 후 첨부 회신' },
          { label: '발송 방법', value: '이메일 첨부' },
          { label: '담당자', value: '' },
          { label: '완료 기한', value: '당일 처리' },
          { label: '이사님 확인', value: ai?.needs_approval ? '★ 확인 필요' : '불필요', isApproval: true },
          { label: '비고', value: ai?.note || '' },
        ]},
      ]);
      break;
    }
    case '영업기회': {
      const itemLines = bodyLines.filter(l => /^\d+[\.\)]\s/.test(l) || /^-\s/.test(l));
      const itemRows: SectionRow[] = itemLines.length > 0
        ? itemLines.map((line, i) => ({ label: `품목 ${i + 1}`, value: line }))
        : [{ label: '요청 내용', value: ai?.action_items || '본문 참조' }];

      await buildReportSheet(workbook, '견적발주지시서', 'KPROS 견적/발주 지시서', docNumber, createdDate, receivedDate, [
        { name: '거래처 정보', rows: [
          { label: '거래처', value: ai?.company_name || '' },
          { label: '담당자', value: ai?.sender_info || email.sender || '' },
          { label: '메일 제목', value: email.subject || '' },
          { label: '예상 매출', value: ai?.estimated_revenue || '-' },
        ]},
        { name: 'AI 분석 결과', rows: [
          { label: '핵심 요약', value: ai?.summary || '' },
          { label: '이사님 보고', value: ai?.director_report || '' },
          { label: '중요도', value: ai?.importance || '' },
        ]},
        { name: '요청 품목 상세', rows: itemRows },
        { name: '처리 지시', rows: [
          { label: '단가 확인', value: '이사님 확인 후 견적서 작성' },
          { label: '납기 확인', value: '재고/생산 일정 확인 필요' },
          { label: '견적서 발송', value: '단가 확정 후 공식 견적서 발송' },
          { label: '완료 기한', value: '' },
          { label: '이사님 확인', value: ai?.needs_approval ? '★ 확인 필요' : '불필요', isApproval: true },
          { label: '비고', value: ai?.note || '' },
        ]},
      ]);
      break;
    }
    case '스케줄링': {
      const scheduleLines = bodyLines.filter(l =>
        /일시|시간|날짜|장소|오전|오후|월|화|수|목|금|Zoom|Teams|화상/.test(l)
      );
      const scheduleRows: SectionRow[] = scheduleLines.length > 0
        ? scheduleLines.map((line, i) => ({ label: `일정 ${i + 1}`, value: line }))
        : [{ label: '제안 일시', value: '본문 참조' }];
      scheduleRows.push({ label: '장소/방식', value: '' });

      await buildReportSheet(workbook, '미팅일정지시서', 'KPROS 미팅 일정 지시서', docNumber, createdDate, receivedDate, [
        { name: '요청 정보', rows: [
          { label: '요청 업체', value: ai?.company_name || '' },
          { label: '요청자', value: ai?.sender_info || email.sender || '' },
          { label: '메일 제목', value: email.subject || '' },
          { label: '미팅 목적', value: ai?.summary || '' },
        ]},
        { name: '일정 정보', rows: scheduleRows },
        { name: 'AI 분석 결과', rows: [
          { label: '이사님 보고', value: ai?.director_report || '' },
        ]},
        { name: '처리 지시', rows: [
          { label: '이사님 일정 확인', value: '확인 후 수락/대안 회신' },
          { label: '준비 사항', value: '' },
          { label: '참석자', value: '' },
          { label: '이사님 확인', value: ai?.needs_approval ? '★ 확인 필요' : '불필요', isApproval: true },
          { label: '비고', value: ai?.note || '' },
        ]},
      ]);
      break;
    }
    case '정보수집': {
      await buildReportSheet(workbook, '시장정보분석서', 'KPROS 시장정보 분석서', docNumber, createdDate, receivedDate, [
        { name: '발신 정보', rows: [
          { label: '발신처', value: ai?.company_name || email.sender || '' },
          { label: '발신자', value: ai?.sender_info || '' },
          { label: '메일 제목', value: email.subject || '' },
          { label: '중요도', value: ai?.importance || '' },
        ]},
        { name: '분석 내용', rows: [
          { label: '핵심 요약', value: ai?.summary || '' },
          { label: '이사님 보고', value: ai?.director_report || '' },
          { label: '대응 방안', value: ai?.action_items || '' },
        ]},
        { name: '처리 지시', rows: [
          { label: '이사님 확인', value: ai?.needs_approval ? '★ 확인 필요' : '불필요', isApproval: true },
          { label: '비고', value: ai?.note || '' },
        ]},
      ]);
      break;
    }
    default: {
      await buildReportSheet(workbook, '처리보고서', 'KPROS 처리 보고서', docNumber, createdDate, receivedDate, [
        { name: '메일 정보', rows: [
          { label: '발신자', value: email.sender || '' },
          { label: '메일 제목', value: email.subject || '' },
          { label: '분류', value: `${code}.${category}` },
        ]},
        { name: '처리 결과', rows: [
          { label: '핵심 요약', value: ai?.summary || '' },
          { label: '처리 결과', value: '응대 불필요 - 자동 필터링' },
          { label: '비고', value: ai?.note || '' },
        ]},
      ]);
      break;
    }
  }

  // ─── 원문 메일 시트 ───
  const ws2 = workbook.addWorksheet('원문메일');
  ws2.columns = [{ width: 14 }, { width: 80 }];
  ws2.mergeCells('A1:B1');
  const mailTitle = ws2.getCell('A1');
  mailTitle.value = '원문 메일 내용';
  mailTitle.font = { bold: true, size: 13, color: { argb: XL_COLORS.WHITE } };
  mailTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL_COLORS.NAVY } };
  mailTitle.alignment = { horizontal: 'center', vertical: 'middle' };
  mailTitle.border = XL_BORDER_THIN;
  ws2.getRow(1).height = 32;

  const mailFields = [
    ['제목', email.subject || ''],
    ['보낸 사람', email.sender || ''],
    ['받는 사람', email.recipient || ''],
    ['수신일시', receivedDate],
  ];
  mailFields.forEach((field, i) => {
    const r = i + 2;
    const cA = ws2.getCell(`A${r}`);
    cA.value = field[0]; cA.font = { bold: true, size: 10 };
    cA.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL_COLORS.LABEL_BG } };
    cA.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
    cA.border = XL_BORDER_THIN;
    const cB = ws2.getCell(`B${r}`);
    cB.value = field[1]; cB.font = { size: 10 };
    cB.alignment = { vertical: 'middle', indent: 1 };
    cB.border = XL_BORDER_THIN;
  });
  const bodyStartRow = mailFields.length + 3;
  ws2.mergeCells(`A${bodyStartRow}:B${bodyStartRow}`);
  const bodyHeader = ws2.getCell(`A${bodyStartRow}`);
  bodyHeader.value = '  본문 내용';
  bodyHeader.font = { bold: true, size: 10 };
  bodyHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL_COLORS.SECTION_BG } };
  bodyHeader.border = XL_BORDER_THIN;
  (email.body || '(본문 없음)').split('\n').forEach((line, i) => {
    const r = bodyStartRow + 1 + i;
    ws2.mergeCells(`A${r}:B${r}`);
    const c = ws2.getCell(`A${r}`);
    c.value = `  ${line}`;
    c.font = { size: 10 };
    c.alignment = { wrapText: true };
  });

  // ─── AI 답변 초안 시트 ───
  if (email.ai_draft_response) {
    const ws3 = workbook.addWorksheet('AI답변초안');
    ws3.columns = [{ width: 14 }, { width: 80 }];
    ws3.mergeCells('A1:B1');
    const draftTitle = ws3.getCell('A1');
    draftTitle.value = 'AI 답변 초안';
    draftTitle.font = { bold: true, size: 13, color: { argb: XL_COLORS.WHITE } };
    draftTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL_COLORS.NAVY } };
    draftTitle.alignment = { horizontal: 'center', vertical: 'middle' };
    draftTitle.border = XL_BORDER_THIN;
    ws3.getRow(1).height = 32;

    const subjA = ws3.getCell('A2');
    subjA.value = '답변 제목'; subjA.font = { bold: true, size: 10 };
    subjA.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL_COLORS.LABEL_BG } };
    subjA.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
    subjA.border = XL_BORDER_THIN;
    const subjB = ws3.getCell('B2');
    subjB.value = email.draft_subject || `RE: ${email.subject}`;
    subjB.font = { size: 10 }; subjB.alignment = { vertical: 'middle', indent: 1 };
    subjB.border = XL_BORDER_THIN;

    ws3.mergeCells('A3:B3');
    const bodyH = ws3.getCell('A3');
    bodyH.value = '  답변 내용'; bodyH.font = { bold: true, size: 10 };
    bodyH.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL_COLORS.SECTION_BG } };
    bodyH.border = XL_BORDER_THIN;

    email.ai_draft_response.split('\n').forEach((line, i) => {
      const r = 4 + i;
      ws3.mergeCells(`A${r}:B${r}`);
      const c = ws3.getCell(`A${r}`);
      c.value = `  ${line}`; c.font = { size: 10 };
      c.alignment = { wrapText: true };
    });
  }

  // ─── xlsx 바이너리 생성 ───
  const buffer = await workbook.xlsx.writeBuffer();
  const uint8 = new Uint8Array(buffer as ArrayBuffer);

  // base64 변환
  let binary = '';
  for (let i = 0; i < uint8.length; i++) {
    binary += String.fromCharCode(uint8[i]);
  }
  const excelBase64 = btoa(binary);

  const excelBlob = new Blob([uint8], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const typeInfo = INSTRUCTION_TYPES[category] || INSTRUCTION_TYPES['필터링'];
  const fileName = `KPROS-${code}-${typeInfo.label.replace(/\//g, '_')}_${dateStr}_${companyName}_#${email.id}.xlsx`;

  return { excelBase64, excelBlob, fileName, category };
}

/** 지시서 로컬 다운로드 (Excel) */
async function exportInstructionSheet(email: EmailDetail) {
  try {
    const { excelBlob, fileName } = await buildInstructionExcel(email);
    const url = URL.createObjectURL(excelBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  } catch (err: any) {
    alert(`엑셀 생성 실패: ${err.message || '알 수 없는 오류'}`);
  }
}

/** 지시서 Dropbox 저장 (Excel) */
async function saveInstructionToDropbox(email: EmailDetail): Promise<{ success: boolean; message: string; path?: string }> {
  try {
    const { excelBase64, fileName, category } = await buildInstructionExcel(email);

    const res = await fetch(apiUrl('/api/v1/dropbox/upload'), {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        category,
        fileName,
        contentBase64: excelBase64,
      }),
    });
    const data = await res.json();
    if (data.status === 'success') {
      return { success: true, message: data.message, path: data.data?.path };
    }
    if (data.need_reauth) {
      return { success: false, message: 'Dropbox 인증이 필요합니다. 설정에서 Dropbox를 연동하세요.' };
    }
    return { success: false, message: data.detail || '저장 실패' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Dropbox 저장 실패' };
  }
}

// ==========================================
// Excel Export (전체 목록)
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

const PAGE_SIZE = 20;

export default function EmailsPage() {
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [stats, setStats] = useState<EmailStats | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<EmailDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [refetching, setRefetching] = useState(false);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [view, setView] = useState<'list' | 'detail' | 'compose'>('list');
  const [draftText, setDraftText] = useState('');
  const [draftSubject, setDraftSubject] = useState('');
  const [approvalComment, setApprovalComment] = useState('');
  const [actionLoading, setActionLoading] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // ---- Fetch email list (서버사이드 페이지네이션) ----
  const loadEmails = useCallback(async (page?: number) => {
    setLoading(true);
    const p = page || currentPage;
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (categoryFilter) params.set('category', categoryFilter);
      if (searchQuery) params.set('search', searchQuery);
      params.set('page', p.toString());
      params.set('limit', PAGE_SIZE.toString());

      const res = await fetch(apiUrl(`/api/v1/emails?${params}`), { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('이메일 목록 조회 실패');
      const data = await res.json();
      if (data.status === 'success') {
        setEmails(data.data || []);
        setTotalCount(data.pagination?.total || data.total || 0);
        setTotalPages(data.pagination?.pages || 1);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, categoryFilter, searchQuery, currentPage]);

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
    loadEmails(currentPage);
    loadStats();
  }, [loadEmails, loadStats, currentPage]);

  // 필터 변경 시 1페이지로 리셋
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, categoryFilter, searchQuery]);

  const goToPage = (page: number) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ---- Fetch new emails ----
  const fetchNewEmails = async (count = 200) => {
    setFetching(true);
    setError('');
    try {
      const res = await fetch(apiUrl(`/api/v1/emails/fetch?max_count=${count}`), {
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
        if (data.count === 0) {
          alert('새 이메일이 없습니다.');
        } else if (data.ai_processing) {
          alert(`${data.count}개 이메일 저장 완료!\nAI 분류가 백그라운드에서 진행 중입니다.\n잠시 후 새로고침하면 분류 결과가 반영됩니다.`);
          // 30초 후 자동 새로고침 (AI 분류 완료 예상)
          setTimeout(() => { loadEmails(); loadStats(); }, 30000);
        } else {
          alert(`${data.count}개 이메일이 처리되었습니다. (${data.source})`);
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setFetching(false);
    }
  };

  // ---- Refetch email bodies (인코딩 수정) ----
  const refetchBodies = async () => {
    setRefetching(true); setError('');
    try {
      const res = await fetch(apiUrl('/api/v1/emails/refetch-bodies'), {
        method: 'POST', headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (data.status === 'success') {
        alert(`본문 재동기화 완료: ${data.updated}건 업데이트`);
        if (selectedEmail) {
          openEmail(selectedEmail.id);
        }
      } else {
        setError(data.detail || '본문 재동기화 실패');
      }
    } catch (err: any) {
      setError(err.message || '본문 재동기화 실패');
    } finally {
      setRefetching(false);
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
        setDraftText(parseDraftText(data.data.draft_response) || parseDraftText(data.data.ai_draft_response) || '');
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
    const currentCategory = selectedEmail.category || '미분류';
    if (!confirm(`현재 분류: ${CATEGORY_CODES[currentCategory] || ''}.${currentCategory}\n\nAI 재분류를 실행하시겠습니까?\n(분류가 변경될 수 있습니다)`)) return;
    setActionLoading('reclassify');
    try {
      const res = await fetch(apiUrl(`/api/v1/emails/${selectedEmail.id}/reclassify`), {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('재분류 실패');
      const data = await res.json();
      alert(`KPROS AI 재분류 완료: ${data.code || ''}.${data.category || ''}`);
      await openEmail(selectedEmail.id);
      await loadEmails();
      await loadStats();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading('');
    }
  };

  // ---- Manual Category Change ----
  const changeCategory = async (newCategory: string) => {
    if (!selectedEmail) return;
    if (newCategory === selectedEmail.category) return;
    setActionLoading('category');
    try {
      const res = await fetch(apiUrl(`/api/v1/emails/${selectedEmail.id}`), {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ category: newCategory }),
      });
      if (!res.ok) throw new Error('카테고리 변경 실패');
      alert(`카테고리가 ${CATEGORY_CODES[newCategory]}.${newCategory}(으)로 변경되었습니다.`);
      await openEmail(selectedEmail.id);
      await loadEmails();
      await loadStats();
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
        setDraftText(parseDraftText(data.draft));
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
            onClick={refetchBodies}
            disabled={refetching}
            className="px-4 py-2 rounded-xl border border-amber-300 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50 transition"
            title="Gmail에서 본문을 다시 다운로드합니다 (인코딩 수정)"
          >
            {refetching ? '동기화 중...' : '본문 재동기화'}
          </button>
          <button
            onClick={() => fetchNewEmails()}
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

      {/* Stats Bar - 상태 필터 */}
      {stats && (
        <div className="flex gap-2 flex-wrap">
          <StatBadge label="전체" count={stats.total} color="bg-slate-700 text-white" inactiveColor="bg-slate-100 text-slate-600" onClick={() => setStatusFilter('')} active={!statusFilter} />
          <StatBadge label="미확인" count={stats.unread} color="bg-blue-600 text-white" inactiveColor="bg-blue-50 text-blue-600" onClick={() => setStatusFilter(statusFilter === 'unread' ? '' : 'unread')} active={statusFilter === 'unread'} />
          <StatBadge label="검토중" count={stats.in_review} color="bg-orange-500 text-white" inactiveColor="bg-orange-50 text-orange-600" onClick={() => setStatusFilter(statusFilter === 'in_review' ? '' : 'in_review')} active={statusFilter === 'in_review'} />
          <StatBadge label="승인" count={stats.approved} color="bg-green-600 text-white" inactiveColor="bg-green-50 text-green-600" onClick={() => setStatusFilter(statusFilter === 'approved' ? '' : 'approved')} active={statusFilter === 'approved'} />
          <StatBadge label="발송" count={stats.sent} color="bg-emerald-600 text-white" inactiveColor="bg-emerald-50 text-emerald-600" onClick={() => setStatusFilter(statusFilter === 'sent' ? '' : 'sent')} active={statusFilter === 'sent'} />
        </div>
      )}

      {/* Category Tabs - 카테고리 필터 */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 overflow-x-auto">
        <button
          onClick={() => setCategoryFilter('')}
          className={`px-4 py-2.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            !categoryFilter ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
          }`}
        >
          전체 {stats ? `(${stats.total})` : ''}
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(categoryFilter === cat ? '' : cat)}
            className={`px-4 py-2.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
              categoryFilter === cat
                ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
                : cat === '영업기회' && (stats?.categories[cat] || 0) > 0
                  ? 'text-red-600 hover:text-red-700 hover:bg-red-50/50 font-extrabold'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
            }`}
          >
            {CATEGORY_ICONS[cat] || ''} {CATEGORY_CODES[cat]}.{cat} {stats?.categories[cat] ? `(${stats.categories[cat]})` : '(0)'}
            {cat === '영업기회' && (stats?.categories[cat] || 0) > 0 && (
              <span className="ml-1 inline-block w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
            )}
          </button>
        ))}
      </div>

      {/* Active Filter Indicator */}
      {(statusFilter || categoryFilter) && (
        <div className="flex items-center gap-2 px-3 py-2 bg-brand-50 border border-brand-200 rounded-xl text-xs animate-fadeIn">
          <span className="text-brand-700 font-semibold">필터 적용중:</span>
          {statusFilter && (
            <span className="px-2 py-0.5 bg-brand-100 text-brand-800 rounded font-bold">
              {STATUS_MAP[statusFilter] || statusFilter}
            </span>
          )}
          {categoryFilter && (
            <span className="px-2 py-0.5 bg-brand-100 text-brand-800 rounded font-bold">
              {CATEGORY_CODES[categoryFilter]}.{categoryFilter}
            </span>
          )}
          <button
            onClick={() => { setStatusFilter(''); setCategoryFilter(''); }}
            className="ml-auto text-brand-500 hover:text-brand-700 font-bold cursor-pointer"
          >
            초기화 ✕
          </button>
        </div>
      )}

      {/* Search */}
      <div className="flex gap-2.5 items-center">
        <input
          type="text"
          placeholder="제목 또는 발신자 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') loadEmails(1); }}
          className="flex-1 px-4 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition"
        />
        <button onClick={() => loadEmails(1)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm hover:bg-slate-50 transition font-medium cursor-pointer">
          검색
        </button>
      </div>

      {/* Main Content */}
      {view === 'list' && (
        <>
          <EmailList
            emails={emails}
            loading={loading}
            onSelect={openEmail}
          />
          {!loading && totalPages > 1 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalCount={totalCount}
              pageSize={PAGE_SIZE}
              onPageChange={goToPage}
            />
          )}
        </>
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
          onChangeCategory={changeCategory}
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
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer ${
        active
          ? `${color} shadow-md scale-105`
          : `${inactiveColor} hover:shadow-sm hover:scale-[1.02]`
      }`}
    >
      {label} {count}
    </button>
  );
}

function Pagination({ currentPage, totalPages, totalCount, pageSize, onPageChange }: {
  currentPage: number; totalPages: number; totalCount: number; pageSize: number;
  onPageChange: (page: number) => void;
}) {
  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalCount);

  // 표시할 페이지 번호 계산 (현재 페이지 주변 최대 7개)
  const getPageNumbers = (): (number | '...')[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | '...')[] = [];
    if (currentPage <= 4) {
      for (let i = 1; i <= 5; i++) pages.push(i);
      pages.push('...');
      pages.push(totalPages);
    } else if (currentPage >= totalPages - 3) {
      pages.push(1);
      pages.push('...');
      for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      pages.push('...');
      for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
      pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="flex items-center justify-between bg-white rounded-2xl border border-slate-200 px-5 py-3">
      {/* 좌측: 건수 정보 */}
      <div className="text-xs text-slate-500">
        <span className="font-bold text-slate-700">{start}-{end}</span>
        <span className="mx-1">/</span>
        <span className="font-bold text-slate-700">{totalCount.toLocaleString()}</span>건
      </div>

      {/* 중앙: 페이지 번호 */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-sm text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-default transition"
          title="이전 페이지"
        >
          &#8249;
        </button>
        {getPageNumbers().map((p, i) =>
          p === '...' ? (
            <span key={`dot-${i}`} className="w-8 h-8 flex items-center justify-center text-xs text-slate-400">...</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold transition ${
                p === currentPage
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {p}
            </button>
          )
        )}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-sm text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-default transition"
          title="다음 페이지"
        >
          &#8250;
        </button>
      </div>

      {/* 우측: 페이지 점프 */}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span>{currentPage}/{totalPages} 페이지</span>
      </div>
    </div>
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
  onChangeCategory,
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
  onChangeCategory: (cat: string) => void;
  onBack: () => void;
}) {
  const statusInfo = STATUS_LABELS[email.status] || STATUS_LABELS['read'];
  const ai = parseAiSummary(email.ai_summary);
  const code = ai?.code || CATEGORY_CODES[email.category] || '';

  const cellLabel = "bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600 border border-slate-200 whitespace-nowrap align-top w-28";
  const cellValue = "bg-white px-3 py-2 text-xs text-slate-800 border border-slate-200";

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Top Action Bar */}
      <div className="flex items-center justify-between bg-white rounded-xl border border-slate-200 px-4 py-2.5">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition">
          <span>&#8592;</span> 목록
        </button>
        <div className="flex items-center gap-2">
          {/* 수동 카테고리 변경 드롭다운 */}
          <select
            value={email.category}
            onChange={(e) => onChangeCategory(e.target.value)}
            disabled={actionLoading === 'category'}
            className={`px-3 py-1 rounded-full text-xs font-bold border-0 outline-none cursor-pointer appearance-none pr-6 ${CATEGORY_COLORS[email.category] || CATEGORY_COLORS['필터링']}`}
            title="클릭하여 카테고리 수동 변경"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center' }}
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{CATEGORY_CODES[cat]}.{cat}</option>
            ))}
          </select>
          <span className={`px-3 py-1 rounded-full text-xs font-bold ${statusInfo.color}`} title={`처리상태: ${statusInfo.label}`}>{statusInfo.label}</span>
          {ai?.importance && (
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${ai.importance === '상' ? 'bg-red-50 text-red-600' : ai.importance === '중' ? 'bg-yellow-50 text-yellow-600' : 'bg-gray-50 text-gray-500'}`} title={`우선순위: ${ai.importance}`}>
              {ai.importance === '상' ? '긴급' : ai.importance === '중' ? '중요' : '일반'}
            </span>
          )}
          {/* 답변 초안 상태 표시 */}
          {email.ai_draft_response ? (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-600" title="AI가 생성한 답변 초안이 있습니다">답변초안 있음</span>
          ) : !['정보수집', '필터링'].includes(email.category) ? (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-50 text-slate-400" title="아직 답변 초안이 생성되지 않았습니다">답변초안 없음</span>
          ) : null}
          {ai?.needs_approval && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-50 text-orange-600" title="이사님 확인이 필요한 건입니다">이사님 확인</span>}
          {email.ai_confidence < 70 ? (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-500 animate-pulse" title={`AI 분류 신뢰도가 낮습니다 (${email.ai_confidence}%). 수동 확인을 권장합니다.`}>AI {email.ai_confidence}% (낮음)</span>
          ) : (
            <span className="text-[10px] text-slate-400" title={`AI 분류 신뢰도: ${email.ai_confidence}%`}>AI {email.ai_confidence}%</span>
          )}
          <button onClick={onReclassify} disabled={actionLoading === 'reclassify'} className="px-3 py-1 rounded-lg bg-purple-600 text-white text-xs font-bold hover:bg-purple-700 disabled:opacity-50 transition">
            {actionLoading === 'reclassify' ? '...' : 'AI 재분류'}
          </button>
          {/* D(정보수집), E(필터링)는 답신 불필요 → AI 답신생성 비활성 */}
          {!['정보수집', '필터링'].includes(email.category) ? (
            <button onClick={onGenerateDraft} disabled={actionLoading === 'generate'} className="px-3 py-1 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-50 transition">
              {actionLoading === 'generate' ? '...' : 'AI 답신생성'}
            </button>
          ) : (
            <span className="px-3 py-1 rounded-lg bg-slate-200 text-slate-400 text-xs font-bold cursor-default" title="D.정보수집/E.필터링은 답신 불필요">
              답신 불필요
            </span>
          )}
          {/* E(필터링)는 지시서/Dropbox 저장 불필요 */}
          {email.category !== '필터링' && (
            <>
              <button
                onClick={() => exportInstructionSheet(email)}
                className="px-3 py-1 rounded-lg bg-green-600 text-white text-xs font-bold hover:bg-green-700 transition"
              >
                {(INSTRUCTION_TYPES[email.category] || INSTRUCTION_TYPES['필터링']).icon} 지시서 내보내기
              </button>
              <DropboxSaveButton email={email} />
            </>
          )}
        </div>
      </div>

      {/* === Sheet 1: 메일 정보 + 본문 === */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-700 text-white px-4 py-2 text-xs font-bold">수신 메일 정보</div>
        <table className="w-full border-collapse">
          <tbody>
            <tr>
              <td className={cellLabel}>제목</td>
              <td className={cellValue} colSpan={3}><span className="font-semibold text-sm">{email.subject}</span></td>
            </tr>
            <tr>
              <td className={cellLabel}>보낸 사람</td>
              <td className={cellValue}>{email.sender}</td>
              <td className={cellLabel}>회사명</td>
              <td className={cellValue}>{ai?.company_name || '-'}</td>
            </tr>
            <tr>
              <td className={cellLabel}>받는 사람</td>
              <td className={cellValue}>{email.recipient || '-'}</td>
              <td className={cellLabel}>수신일시</td>
              <td className={cellValue}>{formatDateFull(email.received_at)}</td>
            </tr>
            {/* 첨부파일 표시 (본문 위) */}
            {email.attachments && email.attachments.length > 0 && (
              <tr>
                <td className={cellLabel}>첨부파일</td>
                <td className={cellValue} colSpan={3}>
                  <div className="flex flex-wrap gap-2">
                    {email.attachments.map((att) => (
                      <div key={att.id} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                        <span className="text-base">{att.content_type?.includes('pdf') ? '📕' : att.content_type?.includes('image') ? '🖼️' : att.content_type?.includes('spreadsheet') || att.content_type?.includes('excel') ? '📊' : '📎'}</span>
                        <span className="font-medium text-slate-700">{att.file_name}</span>
                        <span className="text-slate-400">({(att.file_size / 1024).toFixed(0)}KB)</span>
                      </div>
                    ))}
                  </div>
                </td>
              </tr>
            )}
            <tr>
              <td className={cellLabel}>
                본문
                {email.body_html && (
                  <BodyViewToggle />
                )}
              </td>
              <td className={cellValue + " whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto"} colSpan={3}>
                {email.body ? (
                  email.body
                ) : email.body_html ? (
                  <div>
                    <div className="text-[11px] text-blue-600 mb-1 font-medium">HTML 본문 미리보기:</div>
                    <div
                      className="prose prose-xs max-w-none text-xs"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(email.body_html) }}
                    />
                  </div>
                ) : (
                  <div className="flex items-start gap-2 py-1">
                    <span className="text-amber-500 text-base shrink-0">&#9888;&#65039;</span>
                    <div>
                      <p className="text-amber-700 font-semibold text-xs">본문이 추출되지 않았습니다</p>
                      <p className="text-amber-600 text-[11px] mt-0.5">HTML 메일이거나 첨부파일만 포함된 메일일 수 있습니다. 원본 메일을 확인해 주세요.</p>
                    </div>
                  </div>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* === Sheet 2: AI 분석 결과 === */}
      <div className="bg-white rounded-xl border border-purple-200 overflow-hidden">
        <div className="bg-purple-700 text-white px-4 py-2 text-xs font-bold flex justify-between items-center">
          <span>KPROS AI 분석 결과</span>
          <span className="text-purple-200 text-[10px]">신뢰도 {email.ai_confidence}%</span>
        </div>
        <table className="w-full border-collapse">
          <tbody>
            <tr>
              <td className={cellLabel + " !bg-purple-50"}>분류</td>
              <td className={cellValue}><span className="font-bold">{code}.{email.category}</span> | 우선순위: {PRIORITY_ICONS[email.priority]} {email.priority} | 중요도: {ai?.importance || '-'}</td>
            </tr>
            <tr>
              <td className={cellLabel + " !bg-purple-50"}>핵심 요약</td>
              <td className={cellValue}>{ai?.summary || email.ai_summary || '-'}</td>
            </tr>
            {ai?.director_report && (
              <tr>
                <td className={cellLabel + " !bg-purple-50"}>이사님 보고</td>
                <td className={cellValue + " whitespace-pre-wrap font-medium text-purple-800"}>{ai.director_report}</td>
              </tr>
            )}
            {ai?.action_items && (
              <tr>
                <td className={cellLabel + " !bg-purple-50"}>액션 플랜</td>
                <td className={cellValue + " whitespace-pre-wrap"}>{ai.action_items}</td>
              </tr>
            )}
            {ai?.search_keywords && ai.search_keywords.length > 0 && (
              <tr>
                <td className={cellLabel + " !bg-purple-50"}>검색 키워드</td>
                <td className={cellValue}>
                  <div className="flex flex-wrap gap-1">{ai.search_keywords.map((kw, i) => (
                    <span key={i} className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-[11px] font-medium">{kw}</span>
                  ))}</div>
                </td>
              </tr>
            )}
            {ai?.estimated_revenue && (
              <tr>
                <td className={cellLabel + " !bg-purple-50"}>예상 매출</td>
                <td className={cellValue + " font-bold text-green-700"}>{ai.estimated_revenue}</td>
              </tr>
            )}
            <tr>
              <td className={cellLabel + " !bg-purple-50"}>발신자 정보</td>
              <td className={cellValue}>{ai?.sender_info || '-'} | {ai?.company_name || '-'}</td>
            </tr>
            {ai?.note && (
              <tr>
                <td className={cellLabel + " !bg-purple-50"}>비고</td>
                <td className={cellValue}>{ai.note}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* === Instruction Sheet Preview === */}
      {email.category !== '필터링' && (
        <InstructionPreview email={email} ai={ai} />
      )}

      {/* === Dropbox Search === */}
      {ai && ai.search_keywords && ai.search_keywords.length > 0 && (
        <DropboxSearchPanel keywords={ai.search_keywords} />
      )}

      {/* === E.필터링 자동처리 안내 === */}
      {email.category === '필터링' && (
        <div className="bg-gradient-to-r from-slate-50 to-gray-50 rounded-xl border border-slate-300 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🚫</span>
            <div>
              <p className="text-sm font-bold text-slate-700">스팸/광고 메일 - 응대 불필요</p>
              <p className="text-xs text-slate-500 mt-0.5">이 메일은 E.필터링으로 분류되어 답변이 필요하지 않습니다. 업무일지에 기록 후 보관 처리됩니다.</p>
            </div>
          </div>
        </div>
      )}

      {/* === D.정보수집 안내 === */}
      {email.category === '정보수집' && (
        <div className="bg-gradient-to-r from-amber-50 to-yellow-50 rounded-xl border border-amber-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📊</span>
            <div>
              <p className="text-sm font-bold text-amber-800">정보수집 건 - 외부 답변 불필요</p>
              <p className="text-xs text-amber-600 mt-0.5">시장 동향/단가 변동 정보를 업무일지에 기록하고, 중요 사항은 이사님께 보고하세요.</p>
            </div>
          </div>
        </div>
      )}

      {/* === Sheet 3: AI 답신 초안 + 편집 (D/E 카테고리에서는 축소 표시) === */}
      {!['필터링'].includes(email.category) && (
      <div className="bg-white rounded-xl border border-blue-200 overflow-hidden">
        <div className="bg-blue-700 text-white px-4 py-2 text-xs font-bold flex justify-between items-center">
          <span>답신 초안</span>
          <div className="flex gap-2">
            {['read', 'draft', 'rejected'].includes(email.status) && (
              <>
                <button onClick={onSaveDraft} disabled={actionLoading === 'save'} className="px-3 py-1 rounded bg-blue-500 text-white text-[11px] font-bold hover:bg-blue-400 disabled:opacity-50 transition">
                  {actionLoading === 'save' ? '...' : '저장'}
                </button>
                <button onClick={onSubmit} disabled={actionLoading === 'submit'} className="px-3 py-1 rounded bg-yellow-500 text-white text-[11px] font-bold hover:bg-yellow-400 disabled:opacity-50 transition">
                  {actionLoading === 'submit' ? '...' : '검토요청'}
                </button>
              </>
            )}
            {email.status === 'in_review' && (
              <>
                <button onClick={onApprove} disabled={actionLoading === 'approve'} className="px-3 py-1 rounded bg-green-500 text-white text-[11px] font-bold hover:bg-green-400 disabled:opacity-50 transition">
                  {actionLoading === 'approve' ? '...' : '승인'}
                </button>
                <button onClick={onReject} disabled={actionLoading === 'reject'} className="px-3 py-1 rounded bg-red-500 text-white text-[11px] font-bold hover:bg-red-400 disabled:opacity-50 transition">
                  {actionLoading === 'reject' ? '...' : '반려'}
                </button>
              </>
            )}
            {email.status === 'approved' && (
              <button onClick={onSend} disabled={actionLoading === 'send'} className="px-3 py-1 rounded bg-emerald-500 text-white text-[11px] font-bold hover:bg-emerald-400 disabled:opacity-50 transition">
                {actionLoading === 'send' ? '...' : '발송'}
              </button>
            )}
          </div>
        </div>
        <table className="w-full border-collapse">
          <tbody>
            {email.ai_draft_response && (
              <tr>
                <td className={cellLabel + " !bg-blue-50"}>AI 초안</td>
                <td className={cellValue + " whitespace-pre-wrap text-blue-800 bg-blue-50/30"}>{parseDraftText(email.ai_draft_response)}</td>
              </tr>
            )}
            <tr>
              <td className={cellLabel + " !bg-blue-50"}>답신 제목</td>
              <td className={cellValue + " p-0"}>
                <input type="text" value={draftSubject} onChange={(e) => setDraftSubject(e.target.value)}
                  className="w-full px-3 py-2 text-xs outline-none bg-transparent focus:bg-blue-50/50 transition" />
              </td>
            </tr>
            <tr>
              <td className={cellLabel + " !bg-blue-50"}>답신 내용</td>
              <td className={cellValue + " p-0"}>
                <textarea value={draftText} onChange={(e) => setDraftText(e.target.value)} rows={6}
                  className="w-full px-3 py-2 text-xs outline-none bg-transparent focus:bg-blue-50/50 resize-y transition" />
              </td>
            </tr>
            {email.status === 'in_review' && (
              <tr>
                <td className={cellLabel + " !bg-orange-50"}>승인 코멘트</td>
                <td className={cellValue + " p-0"}>
                  <textarea value={approvalComment} onChange={(e) => setApprovalComment(e.target.value)} rows={2} placeholder="코멘트 (선택)"
                    className="w-full px-3 py-2 text-xs outline-none bg-transparent focus:bg-orange-50/50 transition" />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      )}

      {/* === 상태 전환 액션 바 === */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl border border-indigo-200 px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-indigo-800">다음 단계:</span>
            {email.status === 'unread' && (
              <span className="text-xs text-indigo-600">메일 열람 시 자동으로 &quot;확인&quot; 처리됩니다.</span>
            )}
            {email.status === 'read' && !['정보수집', '필터링'].includes(email.category) && (
              <span className="text-xs text-indigo-600">답변 초안을 작성/확인 후 검토를 요청하세요.</span>
            )}
            {email.status === 'read' && ['정보수집', '필터링'].includes(email.category) && (
              <span className="text-xs text-indigo-600">답신 불필요 건입니다. 업무일지에 기록 후 보관 처리하세요.</span>
            )}
            {email.status === 'draft' && (
              <span className="text-xs text-indigo-600">초안이 준비되었습니다. 검토를 요청하세요.</span>
            )}
            {email.status === 'in_review' && (
              <span className="text-xs text-indigo-600">이사님 검토 중입니다. 승인 또는 반려해 주세요.</span>
            )}
            {email.status === 'approved' && (
              <span className="text-xs text-indigo-600">승인 완료! 발송 버튼을 클릭하여 메일을 보내세요.</span>
            )}
            {email.status === 'sent' && (
              <span className="text-xs text-green-600 font-semibold">발송 완료되었습니다.</span>
            )}
          </div>
          <div className="flex gap-2">
            {['read', 'draft', 'rejected'].includes(email.status) && !['정보수집', '필터링'].includes(email.category) && (
              <button onClick={onSubmit} disabled={actionLoading === 'submit'} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 transition shadow-sm">
                {actionLoading === 'submit' ? '처리중...' : '검토 요청'}
              </button>
            )}
            {email.status === 'in_review' && (
              <>
                <button onClick={onApprove} disabled={actionLoading === 'approve'} className="px-4 py-2 rounded-lg bg-green-600 text-white text-xs font-bold hover:bg-green-700 disabled:opacity-50 transition shadow-sm">
                  {actionLoading === 'approve' ? '처리중...' : '승인'}
                </button>
                <button onClick={onReject} disabled={actionLoading === 'reject'} className="px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 disabled:opacity-50 transition shadow-sm">
                  {actionLoading === 'reject' ? '처리중...' : '반려'}
                </button>
              </>
            )}
            {email.status === 'approved' && (
              <button onClick={onSend} disabled={actionLoading === 'send'} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 transition shadow-sm">
                {actionLoading === 'send' ? '처리중...' : '메일 발송'}
              </button>
            )}
            {['read'].includes(email.status) && ['정보수집', '필터링'].includes(email.category) && (
              <button onClick={onSubmit} disabled={actionLoading === 'submit'} className="px-4 py-2 rounded-lg bg-slate-600 text-white text-xs font-bold hover:bg-slate-700 disabled:opacity-50 transition shadow-sm">
                {actionLoading === 'submit' ? '처리중...' : '처리 완료 (보관)'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* === Sheet 4: 워크플로우 + 이력 === */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="bg-slate-600 text-white px-4 py-2 text-xs font-bold">워크플로우</div>
          <div className="p-4"><WorkflowSteps status={email.status} /></div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="bg-slate-600 text-white px-4 py-2 text-xs font-bold">처리 이력</div>
          <table className="w-full border-collapse">
            <tbody>
              <tr><td className={cellLabel}>수신일</td><td className={cellValue}>{formatDateFull(email.received_at)}</td></tr>
              <tr><td className={cellLabel}>처리일</td><td className={cellValue}>{formatDateFull(email.processed_at)}</td></tr>
              {email.sent_at && <tr><td className={cellLabel}>발송일</td><td className={cellValue}>{formatDateFull(email.sent_at)}</td></tr>}
              {email.approvals.length > 0 && email.approvals.map((a) => (
                <tr key={a.id}>
                  <td className={cellLabel}>{a.stage}</td>
                  <td className={cellValue}>
                    <span className={a.status === 'approved' ? 'text-green-600 font-bold' : a.status === 'rejected' ? 'text-red-600 font-bold' : ''}>
                      {a.status === 'approved' ? '승인' : a.status === 'rejected' ? '반려' : '대기'}
                    </span>
                    {a.comments && <span className="text-slate-400 ml-2">{a.comments}</span>}
                  </td>
                </tr>
              ))}
              {email.attachments.length > 0 && (
                <tr>
                  <td className={cellLabel}>첨부파일</td>
                  <td className={cellValue}>{email.attachments.map(a => `${a.file_name} (${(a.file_size/1024).toFixed(0)}KB)`).join(', ')}</td>
                </tr>
              )}
            </tbody>
          </table>
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
// Instruction Sheet Preview (지시서 미리보기)
// ==========================================

function InstructionPreview({ email, ai }: { email: EmailDetail; ai: AiSummaryData | null }) {
  const category = email.category || '필터링';
  const typeInfo = INSTRUCTION_TYPES[category] || INSTRUCTION_TYPES['필터링'];
  const bodyLines = (email.body || '').split('\n').map(l => l.trim()).filter(Boolean);

  const cellL = "bg-green-50 px-3 py-2 text-xs font-bold text-green-800 border border-green-200 whitespace-nowrap align-top w-28";
  const cellV = "bg-white px-3 py-2 text-xs text-slate-800 border border-green-200";

  const renderCategoryContent = () => {
    switch (category) {
      case '자료대응':
        return (
          <>
            <tr><td className={cellL}>요청 업체</td><td className={cellV}>{ai?.company_name || '-'}</td><td className={cellL}>요청자</td><td className={cellV}>{ai?.sender_info || email.sender}</td></tr>
            <tr><td className={cellL}>요청 자료</td><td className={cellV} colSpan={3}>{ai?.action_items || '본문 참조'}</td></tr>
            <tr><td className={cellL}>검색 키워드</td><td className={cellV} colSpan={3}>{ai?.search_keywords?.join(', ') || '-'}</td></tr>
            <tr><td className={cellL}>처리 지시</td><td className={cellV} colSpan={3}>드롭박스에서 관련 파일 검색 후 첨부 회신</td></tr>
            <tr><td className={cellL}>완료 기한</td><td className={cellV}>당일 처리</td><td className={cellL}>이사님 확인</td><td className={cellV}>{ai?.needs_approval ? '필요' : '불필요'}</td></tr>
          </>
        );
      case '영업기회': {
        const itemLines = bodyLines.filter(l => /^\d+[\.\)]\s/.test(l) || /^-\s/.test(l));
        return (
          <>
            <tr><td className={cellL}>거래처</td><td className={cellV}>{ai?.company_name || '-'}</td><td className={cellL}>담당자</td><td className={cellV}>{ai?.sender_info || email.sender}</td></tr>
            <tr><td className={cellL}>예상 매출</td><td className={cellV + " font-bold text-green-700"}>{ai?.estimated_revenue || '-'}</td><td className={cellL}>이사님 확인</td><td className={cellV}>{ai?.needs_approval ? '필요' : '불필요'}</td></tr>
            {itemLines.length > 0 ? (
              <tr><td className={cellL}>요청 품목</td><td className={cellV + " whitespace-pre-wrap"} colSpan={3}>{itemLines.join('\n')}</td></tr>
            ) : (
              <tr><td className={cellL}>요청 내용</td><td className={cellV} colSpan={3}>{ai?.action_items || '본문 참조'}</td></tr>
            )}
            <tr><td className={cellL}>처리 지시</td><td className={cellV} colSpan={3}>이사님 단가 확인 → 견적서 작성 → 발송</td></tr>
          </>
        );
      }
      case '스케줄링': {
        const scheduleLines = bodyLines.filter(l => /일시|시간|날짜|장소|오전|오후|월|화|수|목|금|Zoom|Teams|화상/.test(l));
        return (
          <>
            <tr><td className={cellL}>요청 업체</td><td className={cellV}>{ai?.company_name || '-'}</td><td className={cellL}>요청자</td><td className={cellV}>{ai?.sender_info || email.sender}</td></tr>
            <tr><td className={cellL}>미팅 목적</td><td className={cellV} colSpan={3}>{ai?.summary || '본문 참조'}</td></tr>
            {scheduleLines.length > 0 && (
              <tr><td className={cellL}>제안 일정</td><td className={cellV + " whitespace-pre-wrap"} colSpan={3}>{scheduleLines.join('\n')}</td></tr>
            )}
            <tr><td className={cellL}>처리 지시</td><td className={cellV} colSpan={3}>이사님 일정 확인 후 수락/대안 회신</td></tr>
            <tr><td className={cellL}>이사님 확인</td><td className={cellV}>{ai?.needs_approval ? '필요' : '불필요'}</td><td className={cellL}>준비 사항</td><td className={cellV}></td></tr>
          </>
        );
      }
      case '정보수집':
        return (
          <>
            <tr><td className={cellL}>발신처</td><td className={cellV}>{ai?.company_name || email.sender}</td><td className={cellL}>중요도</td><td className={cellV}>{ai?.importance || '-'}</td></tr>
            <tr><td className={cellL}>이사님 보고</td><td className={cellV + " whitespace-pre-wrap font-medium"} colSpan={3}>{ai?.director_report || ai?.summary || '-'}</td></tr>
            <tr><td className={cellL}>대응 방안</td><td className={cellV} colSpan={3}>{ai?.action_items || '-'}</td></tr>
            <tr><td className={cellL}>이사님 확인</td><td className={cellV}>{ai?.needs_approval ? '필요' : '불필요'}</td><td className={cellL}>비고</td><td className={cellV}>{ai?.note || ''}</td></tr>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-white rounded-xl border border-green-200 overflow-hidden">
      <div className="bg-green-700 text-white px-4 py-2 text-xs font-bold flex justify-between items-center">
        <span>{typeInfo.icon} {typeInfo.label}</span>
        <div className="flex gap-2">
          <button
            onClick={() => exportInstructionSheet(email)}
            className="px-3 py-1 rounded bg-green-500 text-white text-[11px] font-bold hover:bg-green-400 transition"
          >
            엑셀 내보내기
          </button>
          <DropboxSaveButton email={email} />
        </div>
      </div>
      <table className="w-full border-collapse">
        <tbody>
          {renderCategoryContent()}
        </tbody>
      </table>
    </div>
  );
}

// ==========================================
// Dropbox Save Button
// ==========================================

function DropboxSaveButton({ email }: { email: EmailDetail }) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');

  const handleSave = async () => {
    setSaving(true);
    const result = await saveInstructionToDropbox(email);
    setSaving(false);

    if (result.success) {
      setSaved(true);
      setSavedMessage(result.message || '');
    } else {
      alert(result.message);
    }
  };

  if (saved) {
    // message 예: "/AI업무폴더/A.자료대응/파일명.csv에 저장되었습니다."
    const pathMatch = savedMessage.match(/^(.+)에 저장되었습니다/);
    const fullPath = pathMatch ? pathMatch[1] : '';
    const parts = fullPath.split('/').filter(Boolean);
    const folderName = parts.length >= 2 ? parts[parts.length - 2] : '';
    const fileName = parts.length >= 1 ? parts[parts.length - 1] : '';

    return (
      <div className="flex flex-col items-end gap-1 animate-fadeIn">
        <span className="px-3 py-1 rounded-lg bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          Dropbox 저장완료
        </span>
        {fullPath && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs max-w-xs">
            <div className="flex items-center gap-1.5 text-slate-600">
              <svg className="w-3.5 h-3.5 text-sky-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
              <span className="font-semibold text-sky-700">{folderName}</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-500 mt-1 pl-5">
              <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              <span className="truncate">{fileName}</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-1.5 pl-5 break-all">{fullPath}</div>
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={handleSave}
      disabled={saving}
      className="px-3 py-1 rounded-lg bg-sky-600 text-white text-xs font-bold hover:bg-sky-700 disabled:opacity-50 transition"
    >
      {saving ? '저장중...' : '☁️ Dropbox 저장'}
    </button>
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
