'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { apiUrl, authHeaders, authJsonHeaders } from '@/lib/api';

// ─── Types ───

interface InventoryItem {
  id?: number;
  name: string;
  item_code?: string;
  stock: number;
  unit: string;
  min_stock?: number;
  max_stock?: number;
  unit_price?: number;
  supplier?: string;
  category?: string;
}

interface ExcelRow {
  item_name: string;
  item_code?: string;
  current_stock: number;
  unit?: string;
  min_stock?: number;
  max_stock?: number;
  unit_price?: number;
  supplier?: string;
  category?: string;
}

interface SalesRecord {
  date: string;
  item_name: string;
  quantity: number;
  amount?: number;
  customer?: string;
}

interface SmartAnalysis {
  summary: {
    total_items: number;
    total_stock_value: number;
    total_sales_revenue: number;
    sales_period_days: number;
    abc_counts: { A: number; B: number; C: number };
    status_counts: { stockout_risk: number; low_stock: number; optimal: number; overstock: number; dead_stock: number };
    avg_days_of_supply: number;
    items_needing_reorder: number;
  };
  analyses: Array<{
    name: string; code?: string; category?: string; supplier?: string; unit: string;
    current_stock: number; unit_price: number; stock_value: number;
    total_sold: number; total_revenue: number; avg_daily_sales: number;
    max_daily_sales: number; customer_count: number;
    safety_stock: number; reorder_point: number; days_of_supply: number | null;
    recommended_order_qty: number;
    abc_class: 'A' | 'B' | 'C';
    status: string; demand_trend: string;
  }>;
  reorder_items: Array<{
    name: string; code?: string; supplier?: string; unit: string;
    current_stock: number; safety_stock: number; reorder_point: number;
    days_of_supply: number; recommended_order_qty: number;
    estimated_cost: number; demand_trend: string; abc_class: string;
  }>;
  dead_stock_items: Array<{ name: string; current_stock: number; unit: string; stock_value: number; supplier?: string }>;
  overstock_items: Array<{ name: string; current_stock: number; unit: string; days_of_supply: number | null }>;
  top_sellers: Array<{
    name: string; abc_class: string; total_revenue: number; total_sold: number;
    unit: string; avg_daily_sales: number; demand_trend: string; customer_count: number;
  }>;
  by_category: Record<string, { count: number; value: number; revenue: number }>;
  monthly_trend: Array<{ month: string; qty: number; amount: number }>;
  ai_insight: string;
  analyzed_at: string;
}

// ─── Helpers ───

function formatKRW(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) return `${Math.round(n / 10_000)}만`;
  return n.toLocaleString();
}

/**
 * Smart header detection for Excel files with title/merged rows.
 * When xlsx parses files with merged title cells, headers become __EMPTY_X.
 * This scans the first rows for actual header keywords and remaps column names.
 */
function smartParseRows(rows: Record<string, any>[], keywords: string[]): { data: Record<string, any>[]; detectedHeaders: string[] } {
  if (rows.length === 0) return { data: rows, detectedHeaders: [] };

  // Check if headers look correct already (no __EMPTY pattern)
  const firstKeys = Object.keys(rows[0]);
  const hasEmptyHeaders = firstKeys.some(k => k.startsWith('__EMPTY') || k.includes('회사명') || k.includes('재고일람표') || k.includes('보존년한'));
  if (!hasEmptyHeaders) return { data: rows, detectedHeaders: firstKeys };

  // Find header row by scanning first 10 rows for known keywords
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const vals = Object.values(rows[i]).map(v => String(v).trim());
    const matchCount = keywords.filter(kw => vals.some(v => v.includes(kw))).length;
    if (matchCount >= 2) {
      headerRowIdx = i;
      break;
    }
  }

  if (headerRowIdx === -1) return { data: rows, detectedHeaders: firstKeys };

  // Build column mapping: __EMPTY_X key -> actual header name
  const headerRow = rows[headerRowIdx];
  const keyMap: Record<string, string> = {};
  const detectedHeaders: string[] = [];
  for (const [key, value] of Object.entries(headerRow)) {
    const headerName = String(value).trim();
    if (headerName) {
      keyMap[key] = headerName;
      detectedHeaders.push(headerName);
    }
  }

  // Remap data rows (skip header row and rows above it)
  const dataRows = rows.slice(headerRowIdx + 1);
  const remapped = dataRows.map(row => {
    const mapped: Record<string, any> = {};
    for (const [key, value] of Object.entries(row)) {
      const newKey = keyMap[key] || key;
      mapped[newKey] = value;
    }
    return mapped;
  });

  return { data: remapped, detectedHeaders };
}

/**
 * Find the best sheet for inventory data.
 * Prefers the latest date-named sheet (YYMMDD format) over the first sheet.
 */
function findBestSheet(sheetNames: string[]): { name: string; reason: string } {
  // 1) 날짜형 시트 (6자리 YYMMDD 또는 8자리 YYYYMMDD)
  const dateSheets = sheetNames
    .map((name) => {
      const trimmed = name.trim();
      // YYMMDD (260215) → 20260215
      if (/^\d{6}$/.test(trimmed)) {
        const yy = parseInt(trimmed.slice(0, 2));
        const full = (yy >= 50 ? 1900 + yy : 2000 + yy) * 10000 +
          parseInt(trimmed.slice(2, 4)) * 100 + parseInt(trimmed.slice(4, 6));
        return { name, sortKey: full };
      }
      // YYYYMMDD (20260215)
      if (/^\d{8}$/.test(trimmed)) {
        return { name, sortKey: parseInt(trimmed) };
      }
      return null;
    })
    .filter(Boolean) as { name: string; sortKey: number }[];

  if (dateSheets.length > 0) {
    dateSheets.sort((a, b) => a.sortKey - b.sortKey);
    const latest = dateSheets[dateSheets.length - 1];
    return { name: latest.name, reason: `최신 날짜 시트 (${dateSheets.length}개 중)` };
  }

  // 2) 날짜 시트가 없으면 마지막 시트 (Excel 관례상 최신)
  if (sheetNames.length > 1) {
    return { name: sheetNames[sheetNames.length - 1], reason: '마지막 시트' };
  }

  return { name: sheetNames[0], reason: '유일한 시트' };
}

function mapExcelRow(row: Record<string, any>): ExcelRow | null {
  const name =
    row['품목명'] || row['품명'] || row['제품명'] || row['item_name'] || row['name'] ||
    row['품목'] || row['상품명'] || row['원료명'] || row['자재명'] || '';
  if (!name || typeof name !== 'string') return null;

  const stock = parseFloat(
    row['현재고'] || row['재고'] || row['재고량'] || row['수량'] ||
    row['current_stock'] || row['stock'] || row['qty'] || '0'
  ) || 0;

  return {
    item_name: String(name).trim(),
    item_code: String(row['품목코드'] || row['코드'] || row['item_code'] || row['code'] || row['No'] || '').trim() || undefined,
    current_stock: stock,
    unit: String(row['단위'] || row['packing'] || row['Packing'] || row['unit'] || 'EA').trim(),
    min_stock: parseFloat(row['안전재고'] || row['최소재고'] || row['min_stock'] || '0') || undefined,
    max_stock: parseFloat(row['최대재고'] || row['max_stock'] || '0') || undefined,
    unit_price: parseFloat(row['단가'] || row['단가(원)'] || row['원가'] || row['unit_price'] || row['price'] || '0') || undefined,
    supplier: String(row['공급사'] || row['공급업체'] || row['거래처'] || row['제조사(공급사)'] || row['제조사'] || row['supplier'] || '').trim() || undefined,
    category: String(row['분류'] || row['카테고리'] || row['구분'] || row['원산지'] || row['category'] || '').trim() || undefined,
  };
}

function mapSalesRow(row: Record<string, any>): SalesRecord | null {
  const item =
    row['품목명'] || row['품명'] || row['제품명'] || row['상품명'] || row['품목명(규격)'] ||
    row['item_name'] || row['PROD_DES'] || row['원료명'] || '';

  // Handle date formats: "2025/05/02 -3" → "2025/05/02", or "일자-No." column
  let dateRaw =
    row['일자'] || row['날짜'] || row['판매일'] || row['거래일'] || row['일자-No.'] ||
    row['date'] || row['IO_DATE'] || row['출고일'] || '';
  // Extract date portion (remove trailing " -N" from eCount format)
  let date = String(dateRaw).trim().replace(/\s*-\d+\s*$/, '');

  const qty = parseFloat(
    row['수량'] || row['판매수량'] || row['출고수량'] || row['quantity'] || row['QTY'] || '0'
  ) || 0;

  if (!item || !date || qty <= 0) return null;

  return {
    date,
    item_name: String(item).trim(),
    quantity: qty,
    amount: parseFloat(row['금액'] || row['판매금액'] || row['매출액'] || row['공급가액'] || row['합계'] || row['amount'] || row['SUPPLY_AMT'] || '0') || undefined,
    customer: String(row['거래처'] || row['거래처명'] || row['고객'] || row['고객명'] || row['customer'] || row['CUST_DES'] || '').trim() || undefined,
  };
}

// ─── Component ───

export default function InventoryPage() {
  // DB 재고
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  // 재고 엑셀
  const [excelData, setExcelData] = useState<ExcelRow[]>([]);
  const [invFileName, setInvFileName] = useState('');
  const [isDragOverInv, setIsDragOverInv] = useState(false);
  const [parsingInv, setParsingInv] = useState(false);
  const invFileRef = useRef<HTMLInputElement>(null);

  // 판매 엑셀
  const [salesData, setSalesData] = useState<SalesRecord[]>([]);
  const [salesFileName, setSalesFileName] = useState('');
  const [isDragOverSales, setIsDragOverSales] = useState(false);
  const [parsingSales, setParsingSales] = useState(false);
  const salesFileRef = useRef<HTMLInputElement>(null);

  // 공통
  const [uploadMsg, setUploadMsg] = useState('');
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [smartReport, setSmartReport] = useState<SmartAnalysis | null>(null);

  // 보고서 저장/로드
  const [savingReport, setSavingReport] = useState(false);
  const [savedReports, setSavedReports] = useState<Array<{ id: number; fileName: string; reportDate: string; itemCount: number; createdAt: string }>>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const [error, setError] = useState('');

  // 탭
  const [activeTab, setActiveTab] = useState<'inventory' | 'sales' | 'smart'>('inventory');

  // ─── DB 재고 로드 ───
  const loadInventory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/api/v1/inventory'), { headers: authHeaders() });
      if (!res.ok) throw new Error('fail');
      const data = await res.json();
      if (data.status === 'success' && data.data) {
        setItems(data.data.map((item: any) => ({
          id: item.id, name: item.name || '', item_code: item.item_code,
          stock: parseInt(item.stock || '0'), unit: item.unit || '개',
          min_stock: item.min_stock, max_stock: item.max_stock,
          unit_price: item.unit_price, supplier: item.supplier, category: item.category,
        })));
      }
    } catch { setError('재고를 불러오는데 실패했습니다.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadInventory(); }, [loadInventory]);

  // ─── 재고 엑셀 파싱 ───
  const parseInventoryFile = useCallback(async (file: File) => {
    setParsingInv(true); setUploadMsg('');
    setInvFileName(file.name);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });

      // Pick best sheet (latest date-named sheet for multi-sheet inventory files)
      const { name: sheetName, reason: sheetReason } = wb.SheetNames.length > 1
        ? findBestSheet(wb.SheetNames)
        : { name: wb.SheetNames[0], reason: '유일한 시트' };
      const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });

      // Smart header detection for files with title/merged rows
      const invKeywords = ['품명', '현재고', '품목명', '재고', 'packing', '단위'];
      const { data: rows, detectedHeaders } = smartParseRows(rawRows, invKeywords);

      const parsed = rows.map(mapExcelRow).filter(Boolean) as ExcelRow[];
      const sheetInfo = wb.SheetNames.length > 1
        ? ` [시트: "${sheetName}" ← ${sheetReason}, 전체: ${wb.SheetNames.join(', ')}]`
        : '';
      if (parsed.length === 0) {
        const headerInfo = detectedHeaders.length > 0
          ? `감지된 헤더: ${detectedHeaders.slice(0, 8).join(', ')}`
          : `첫 행 키: ${Object.keys(rawRows[0] || {}).slice(0, 5).join(', ')}`;
        setUploadMsg(`인식 가능한 재고 데이터가 없습니다. (${headerInfo})${sheetInfo}`);
      } else {
        setExcelData(parsed);
        setUploadMsg(`${file.name}: ${parsed.length}건 재고 품목 인식${sheetInfo}`);
      }
    } catch { setUploadMsg('엑셀 파일 읽기 실패'); }
    finally { setParsingInv(false); }
  }, []);

  // ─── 판매 엑셀 파싱 (전체 시트 통합) ───
  const parseSalesFile = useCallback(async (file: File) => {
    setParsingSales(true); setUploadMsg('');
    setSalesFileName(file.name);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const salesKeywords = ['일자', '거래처', '품목명', '수량', '단가', '공급가액'];

      const allParsed: SalesRecord[] = [];
      const sheetResults: string[] = [];

      // 전체 시트 순회하여 데이터 통합
      for (const sName of wb.SheetNames) {
        const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(wb.Sheets[sName], { defval: '' });
        if (rawRows.length === 0) continue;

        const { data: rows } = smartParseRows(rawRows, salesKeywords);
        const parsed = rows.map(mapSalesRow).filter(Boolean) as SalesRecord[];
        if (parsed.length > 0) {
          allParsed.push(...parsed);
          sheetResults.push(`${sName}(${parsed.length}건)`);
        }
      }

      if (allParsed.length === 0) {
        const firstRaw: Record<string, any>[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
        const { detectedHeaders } = smartParseRows(firstRaw, salesKeywords);
        const headerInfo = detectedHeaders.length > 0
          ? `감지된 헤더: ${detectedHeaders.slice(0, 6).join(', ')}`
          : `첫 행 키: ${Object.keys(firstRaw[0] || {}).slice(0, 5).join(', ')}`;
        setUploadMsg(`인식 가능한 판매 데이터가 없습니다. (${headerInfo})`);
      } else {
        setSalesData(allParsed);
        const sheetInfo = wb.SheetNames.length > 1
          ? ` [${sheetResults.join(', ')}]`
          : '';
        setUploadMsg(`${file.name}: ${allParsed.length}건 판매 기록 인식${sheetInfo}`);
      }
    } catch { setUploadMsg('엑셀 파일 읽기 실패'); }
    finally { setParsingSales(false); }
  }, []);

  // ─── 드래그앤드롭 ───
  const handleDropInv = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragOverInv(false);
    const file = e.dataTransfer.files[0];
    if (file && /\.(xlsx|xls|csv)$/i.test(file.name)) parseInventoryFile(file);
    else setUploadMsg('엑셀 파일(.xlsx, .xls, .csv)만 지원합니다.');
  }, [parseInventoryFile]);

  const handleDropSales = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragOverSales(false);
    const file = e.dataTransfer.files[0];
    if (file && /\.(xlsx|xls|csv)$/i.test(file.name)) parseSalesFile(file);
    else setUploadMsg('엑셀 파일(.xlsx, .xls, .csv)만 지원합니다.');
  }, [parseSalesFile]);

  // ─── DB 저장 ───
  const uploadToDB = useCallback(async () => {
    if (excelData.length === 0) return;
    setUploading(true);
    try {
      const res = await fetch(apiUrl('/api/v1/inventory/upload'), {
        method: 'POST', headers: authJsonHeaders(),
        body: JSON.stringify({ items: excelData, file_name: invFileName }),
      });
      const json = await res.json();
      setUploadMsg(json.status === 'success' ? `DB 저장 완료: ${json.message}` : json.message || 'DB 저장 실패');
      if (json.status === 'success') loadInventory();
    } catch { setUploadMsg('DB 저장 중 오류 발생'); }
    finally { setUploading(false); }
  }, [excelData, invFileName, loadInventory]);

  // ─── 스마트 분석 ───
  const runSmartAnalysis = useCallback(async () => {
    const invData = excelData.length > 0 ? excelData.map((i) => ({
      item_name: i.item_name, item_code: i.item_code, current_stock: i.current_stock,
      min_stock: i.min_stock, max_stock: i.max_stock, unit: i.unit,
      unit_price: i.unit_price, supplier: i.supplier, category: i.category,
    })) : items.map((i) => ({
      item_name: i.name, item_code: i.item_code, current_stock: i.stock,
      min_stock: i.min_stock, max_stock: i.max_stock, unit: i.unit,
      unit_price: i.unit_price, supplier: i.supplier, category: i.category,
    }));

    if (invData.length === 0) {
      setUploadMsg('재고 데이터가 필요합니다. 엑셀을 업로드하세요.'); return;
    }

    setAnalyzing(true); setUploadMsg('');
    try {
      const res = await fetch(apiUrl('/api/v1/inventory/smart-analyze'), {
        method: 'POST', headers: authJsonHeaders(),
        body: JSON.stringify({
          inventory_items: invData,
          sales_records: salesData,
        }),
      });
      const json = await res.json();
      if (json.status === 'success') {
        setSmartReport(json.data);
        setActiveTab('smart');
      } else {
        setUploadMsg(json.message || '분석 실패');
      }
    } catch { setUploadMsg('스마트 분석 중 오류 발생'); }
    finally { setAnalyzing(false); }
  }, [excelData, items, salesData]);

  // ─── 엑셀 보고서 다운로드 ───
  const downloadSmartReport = useCallback(async () => {
    if (!smartReport) return;
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();

    // 요약 시트
    const s = smartReport.summary;
    const summaryRows = [
      ['KPROS 스마트 재고 분석 보고서'],
      ['분석일시', new Date(smartReport.analyzed_at).toLocaleString('ko-KR')],
      ['분석 기간(판매)', `${s.sales_period_days}일`],
      [],
      ['구분', '값'],
      ['총 품목 수', s.total_items],
      ['기간 총 매출', s.total_sales_revenue],
      ['평균 재고일수', s.avg_days_of_supply],
      ['발주 필요 품목', s.items_needing_reorder],
      [],
      ['ABC 분류', '품목수'],
      ['A등급 (상위80%)', s.abc_counts.A],
      ['B등급 (80~95%)', s.abc_counts.B],
      ['C등급 (하위5%)', s.abc_counts.C],
      [],
      ['재고 상태', '품목수'],
      ['품절 위험', s.status_counts.stockout_risk],
      ['안전재고 부족', s.status_counts.low_stock],
      ['정상', s.status_counts.optimal],
      ['과잉재고', s.status_counts.overstock],
      ['악성재고', s.status_counts.dead_stock],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(summaryRows);
    ws1['!cols'] = [{ wch: 22 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws1, '요약');

    // 전체 분석 시트
    if (smartReport.analyses.length > 0) {
      const headers = ['품목명', 'ABC등급', '현재고', '단위', '단가', '총판매량', '총매출', '일평균판매', '안전재고', '발주점(ROP)', '재고일수', '권장발주량', '상태', '트렌드', '공급사'];
      const rows = smartReport.analyses.map((a) => [
        a.name, a.abc_class, a.current_stock, a.unit, a.unit_price,
        a.total_sold, a.total_revenue, a.avg_daily_sales, a.safety_stock,
        a.reorder_point, a.days_of_supply ?? '-', a.recommended_order_qty,
        statusLabel(a.status), trendLabel(a.demand_trend), a.supplier || '',
      ]);
      const ws2 = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      XLSX.utils.book_append_sheet(wb, ws2, '전체분석');
    }

    // 긴급발주 시트
    if (smartReport.reorder_items.length > 0) {
      const headers = ['품목명', 'ABC', '현재고', '안전재고', '발주점', '재고일수', '권장발주량', '예상비용', '트렌드', '공급사'];
      const rows = smartReport.reorder_items.map((i) => [
        i.name, i.abc_class, i.current_stock, i.safety_stock, i.reorder_point,
        i.days_of_supply, i.recommended_order_qty, i.estimated_cost,
        trendLabel(i.demand_trend), i.supplier || '',
      ]);
      const ws3 = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      XLSX.utils.book_append_sheet(wb, ws3, '긴급발주');
    }

    // AI 인사이트 시트
    const ws4 = XLSX.utils.aoa_to_sheet([['AI 스마트 분석 인사이트'], [], [smartReport.ai_insight]]);
    ws4['!cols'] = [{ wch: 100 }];
    XLSX.utils.book_append_sheet(wb, ws4, 'AI분석');

    XLSX.writeFile(wb, `KPROS_스마트재고분석_${new Date().toISOString().split('T')[0]}.xlsx`);
  }, [smartReport]);

  // ─── 보고서 저장 ───
  const saveReport = useCallback(async () => {
    if (!smartReport) return;
    setSavingReport(true);
    try {
      const res = await fetch(apiUrl('/api/v1/inventory/reports'), {
        method: 'POST', headers: authJsonHeaders(),
        body: JSON.stringify({ report: smartReport }),
      });
      const json = await res.json();
      if (json.status === 'success') {
        const s = json.data.storage;
        setUploadMsg(
          s
            ? `저장 완료 ― DB: ${s.database} → ${s.table} (ID: ${s.record_id}, type: ${s.report_type})`
            : `보고서 저장 완료 (ID: ${json.data.id})`
        );
        loadSavedReports();
      } else {
        setUploadMsg(json.message || '보고서 저장 실패');
      }
    } catch (e: any) { setUploadMsg(`보고서 저장 중 오류: ${e.message || '네트워크 오류'}`); }
    finally { setSavingReport(false); }
  }, [smartReport]);

  // ─── 저장된 보고서 목록 ───
  const loadSavedReports = useCallback(async () => {
    setLoadingReports(true);
    try {
      const res = await fetch(apiUrl('/api/v1/inventory/reports'), { headers: authHeaders() });
      const json = await res.json();
      if (json.status === 'success') setSavedReports(json.data || []);
    } catch {}
    finally { setLoadingReports(false); }
  }, []);

  // ─── 저장된 보고서 불러오기 ───
  const loadReport = useCallback(async (id: number) => {
    try {
      const res = await fetch(apiUrl(`/api/v1/inventory/reports/${id}`), { headers: authHeaders() });
      const json = await res.json();
      if (json.status === 'success' && json.data.report) {
        setSmartReport(json.data.report);
        setActiveTab('smart');
        setUploadMsg(`보고서 불러옴: ${json.data.report_name}`);
      } else {
        setUploadMsg('보고서를 불러올 수 없습니다');
      }
    } catch { setUploadMsg('보고서 로드 실패'); }
  }, []);

  // ─── 보고서 삭제 ───
  const deleteReport = useCallback(async (id: number) => {
    try {
      const res = await fetch(apiUrl(`/api/v1/inventory/reports/${id}`), {
        method: 'DELETE', headers: authHeaders(),
      });
      const json = await res.json();
      if (json.status === 'success') {
        setSavedReports(prev => prev.filter(r => r.id !== id));
      }
    } catch {}
  }, []);

  // ─── PDF 다운로드 ───
  const downloadPDF = useCallback(async () => {
    if (!reportRef.current || !smartReport) return;
    setPdfGenerating(true);
    setUploadMsg('PDF 생성 중...');
    try {
      const html2canvas = (await import('html2canvas')).default;
      const { jsPDF } = await import('jspdf');

      const element = reportRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#f8fafc',
        logging: false,
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      const imgWidth = 210; // A4 width in mm
      const pageHeight = 297; // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      const pdf = new jsPDF('p', 'mm', 'a4');
      let heightLeft = imgHeight;
      let position = 0;

      // First page
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      // Additional pages
      while (heightLeft > 0) {
        position = -(imgHeight - heightLeft);
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`KPROS_스마트재고분석_${new Date().toISOString().split('T')[0]}.pdf`);
      setUploadMsg('PDF 다운로드 완료');
    } catch (err) {
      console.error('PDF generation error:', err);
      setUploadMsg('PDF 생성 실패');
    }
    finally { setPdfGenerating(false); }
  }, [smartReport]);

  // 탭 전환 시 저장된 보고서 목록 로드
  useEffect(() => {
    if (activeTab === 'smart') loadSavedReports();
  }, [activeTab, loadSavedReports]);

  const getStockBadge = (stock: number, min?: number) => {
    if (stock === 0) return { text: '재고없음', cls: 'bg-red-100 text-red-700' };
    if (min && stock <= min) return { text: '부족', cls: 'bg-amber-100 text-amber-700' };
    if (stock <= 5) return { text: '주의', cls: 'bg-yellow-100 text-yellow-700' };
    return { text: '정상', cls: 'bg-green-100 text-green-700' };
  };

  const hasData = excelData.length > 0 || items.length > 0;
  const hasSales = salesData.length > 0;

  // ─── Render ───
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">재고 관리</h1>
          <p className="text-sm text-slate-500 mt-1">재고 + 판매 데이터 통합 스마트 분석</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadInventory} disabled={loading} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-50">
            새로고침
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-2xl text-sm border border-red-200">
          {error}
          <button onClick={() => setError('')} className="float-right text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}

      {/* PDF 생성 오버레이 */}
      {pdfGenerating && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-8 shadow-xl flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-[3px] border-red-500 border-t-transparent rounded-full animate-spin" />
            <div className="text-sm font-medium text-slate-700">PDF 생성 중...</div>
            <div className="text-xs text-slate-400">잠시만 기다려주세요</div>
          </div>
        </div>
      )}

      {/* 데이터 업로드 영역 (2열) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 재고 엑셀 업로드 */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragOverInv(true); }}
          onDragLeave={() => setIsDragOverInv(false)}
          onDrop={handleDropInv}
          onClick={() => invFileRef.current?.click()}
          className={`relative bg-white rounded-2xl border-2 border-dashed p-6 text-center cursor-pointer transition-all ${
            isDragOverInv ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-400 hover:bg-slate-50'
          }`}
        >
          <input ref={invFileRef} type="file" accept=".xlsx,.xls,.csv" onChange={(e) => e.target.files?.[0] && parseInventoryFile(e.target.files[0])} className="hidden" />
          {parsingInv ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-[3px] border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-slate-500">분석 중...</span>
            </div>
          ) : (
            <>
              <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center mx-auto mb-2">
                <svg className="w-6 h-6 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <h3 className="text-sm font-bold text-slate-900 mb-1">재고 현황 엑셀</h3>
              <p className="text-xs text-slate-500">품목명, 현재고, 단위, 안전재고, 단가, 공급사</p>
              {invFileName && (
                <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[11px] font-medium">
                  {invFileName} ({excelData.length}건)
                </div>
              )}
            </>
          )}
        </div>

        {/* 판매 엑셀 업로드 */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragOverSales(true); }}
          onDragLeave={() => setIsDragOverSales(false)}
          onDrop={handleDropSales}
          onClick={() => salesFileRef.current?.click()}
          className={`relative bg-white rounded-2xl border-2 border-dashed p-6 text-center cursor-pointer transition-all ${
            isDragOverSales ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-400 hover:bg-slate-50'
          }`}
        >
          <input ref={salesFileRef} type="file" accept=".xlsx,.xls,.csv" onChange={(e) => e.target.files?.[0] && parseSalesFile(e.target.files[0])} className="hidden" />
          {parsingSales ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-[3px] border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-slate-500">분석 중...</span>
            </div>
          ) : (
            <>
              <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-2">
                <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-sm font-bold text-slate-900 mb-1">판매 내역 엑셀</h3>
              <p className="text-xs text-slate-500">일자, 품목명, 수량, 금액, 거래처</p>
              {salesFileName && (
                <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-[11px] font-medium">
                  {salesFileName} ({salesData.length}건)
                </div>
              )}
              <p className="text-[10px] text-slate-400 mt-1">이카운트 판매 엑셀 다운로드 후 업로드</p>
            </>
          )}
        </div>
      </div>

      {/* 메시지 + 액션 */}
      {(uploadMsg || hasData) && (
        <div className="flex items-center justify-between flex-wrap gap-3 bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center gap-3 flex-wrap">
            {uploadMsg && <span className="text-sm text-slate-600">{uploadMsg}</span>}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {excelData.length > 0 && (
              <button onClick={uploadToDB} disabled={uploading} className="px-3 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-medium hover:bg-slate-700 transition disabled:opacity-50">
                {uploading ? '저장 중...' : `DB 저장 (${excelData.length}건)`}
              </button>
            )}
            <button
              onClick={runSmartAnalysis}
              disabled={analyzing || !hasData}
              className="px-5 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl text-sm font-medium hover:from-violet-700 hover:to-indigo-700 transition disabled:opacity-50 shadow-sm"
            >
              {analyzing ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  AI 분석 중...
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                  스마트 분석{hasSales ? ' (재고+판매)' : ' (재고)'}
                </span>
              )}
            </button>
            {(excelData.length > 0 || salesData.length > 0) && (
              <button onClick={() => { setExcelData([]); setSalesData([]); setInvFileName(''); setSalesFileName(''); setUploadMsg(''); }} className="px-2 py-1 text-slate-400 hover:text-slate-600 text-xs">
                초기화
              </button>
            )}
          </div>
        </div>
      )}

      {/* 탭 */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {[
          { key: 'inventory', label: `재고 현황${items.length ? ` (${items.length})` : ''}` },
          { key: 'sales', label: `판매 데이터${salesData.length ? ` (${salesData.length})` : ''}` },
          { key: 'smart', label: 'AI 스마트 분석' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition ${
              activeTab === tab.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 재고 현황 탭 */}
      {activeTab === 'inventory' && (
        <>
          {/* 엑셀 미리보기 */}
          {excelData.length > 0 && (
            <div className="bg-white rounded-2xl border border-emerald-200 overflow-hidden">
              <div className="px-5 py-3 bg-emerald-50 border-b border-emerald-200">
                <h3 className="text-sm font-bold text-emerald-800">엑셀 미리보기 ({excelData.length}건)</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-200 bg-slate-50 text-slate-500 text-xs">
                    <th className="text-left px-4 py-2">품목명</th>
                    <th className="text-right px-4 py-2">현재고</th>
                    <th className="text-center px-4 py-2">단위</th>
                    <th className="text-right px-4 py-2">안전재고</th>
                    <th className="text-right px-4 py-2">단가</th>
                    <th className="text-left px-4 py-2">공급사</th>
                    <th className="text-left px-4 py-2">분류</th>
                  </tr></thead>
                  <tbody>
                    {excelData.slice(0, 30).map((row, i) => (
                      <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="px-4 py-2 font-medium text-slate-900">{row.item_name}</td>
                        <td className="px-4 py-2 text-right font-semibold">{row.current_stock}</td>
                        <td className="px-4 py-2 text-center text-slate-500">{row.unit || '-'}</td>
                        <td className="px-4 py-2 text-right text-slate-500">{row.min_stock || '-'}</td>
                        <td className="px-4 py-2 text-right text-slate-500">{row.unit_price ? `₩${row.unit_price.toLocaleString()}` : '-'}</td>
                        <td className="px-4 py-2 text-slate-500">{row.supplier || '-'}</td>
                        <td className="px-4 py-2 text-slate-500">{row.category || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {excelData.length > 30 && <p className="text-center text-xs text-slate-400 py-2">... 외 {excelData.length - 30}건</p>}
              </div>
            </div>
          )}

          {/* DB 재고 */}
          {loading ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
              <div className="w-10 h-10 border-[3px] border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <div className="text-sm text-slate-400">재고 정보를 불러오는 중...</div>
            </div>
          ) : items.length > 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
                <h3 className="text-sm font-bold text-slate-700">DB 재고 목록 ({items.length}건)</h3>
              </div>
              <table className="w-full">
                <thead><tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500">품목명</th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-slate-500">현재고</th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-slate-500">단위</th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-slate-500">안전재고</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500">단가</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500">공급사</th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-slate-500">상태</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item, i) => {
                    const badge = getStockBadge(item.stock, item.min_stock);
                    return (
                      <tr key={i} className="hover:bg-slate-50 transition">
                        <td className="px-5 py-3 text-sm font-medium text-slate-900">{item.name}</td>
                        <td className="px-5 py-3 text-center text-sm font-semibold text-slate-700">{item.stock}</td>
                        <td className="px-5 py-3 text-center text-sm text-slate-500">{item.unit}</td>
                        <td className="px-5 py-3 text-center text-sm text-slate-500">{item.min_stock || '-'}</td>
                        <td className="px-5 py-3 text-right text-sm text-slate-500">{item.unit_price ? `₩${item.unit_price.toLocaleString()}` : '-'}</td>
                        <td className="px-5 py-3 text-sm text-slate-500">{item.supplier || '-'}</td>
                        <td className="px-5 py-3 text-center"><span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${badge.cls}`}>{badge.text}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : !excelData.length && (
            <EmptyState icon="box" title="재고 데이터가 없습니다" desc="위 영역에 재고 엑셀 파일을 업로드하세요." />
          )}
        </>
      )}

      {/* 판매 데이터 탭 */}
      {activeTab === 'sales' && (
        <>
          {salesData.length > 0 ? (
            <div className="bg-white rounded-2xl border border-blue-200 overflow-hidden">
              <div className="px-5 py-3 bg-blue-50 border-b border-blue-200 flex items-center justify-between">
                <h3 className="text-sm font-bold text-blue-800">판매 내역 ({salesData.length}건)</h3>
                <span className="text-xs text-blue-600">
                  {salesData[0]?.date} ~ {salesData[salesData.length - 1]?.date}
                </span>
              </div>
              {/* 판매 요약 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 border-b border-slate-100">
                <MiniCard label="총 거래 건수" value={`${salesData.length}건`} />
                <MiniCard label="총 판매수량" value={`${salesData.reduce((s, r) => s + r.quantity, 0).toLocaleString()}`} />
                <MiniCard label="총 매출액" value={`₩${formatKRW(salesData.reduce((s, r) => s + (r.amount || 0), 0))}`} />
                <MiniCard label="품목 수" value={`${new Set(salesData.map((r) => r.item_name)).size}개`} />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-200 bg-slate-50 text-slate-500 text-xs">
                    <th className="text-left px-4 py-2">일자</th>
                    <th className="text-left px-4 py-2">품목명</th>
                    <th className="text-right px-4 py-2">수량</th>
                    <th className="text-right px-4 py-2">금액</th>
                    <th className="text-left px-4 py-2">거래처</th>
                  </tr></thead>
                  <tbody>
                    {salesData.slice(0, 50).map((r, i) => (
                      <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="px-4 py-2 text-slate-600">{r.date}</td>
                        <td className="px-4 py-2 font-medium text-slate-900">{r.item_name}</td>
                        <td className="px-4 py-2 text-right font-semibold">{r.quantity}</td>
                        <td className="px-4 py-2 text-right text-slate-500">{r.amount ? `₩${r.amount.toLocaleString()}` : '-'}</td>
                        <td className="px-4 py-2 text-slate-500">{r.customer || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {salesData.length > 50 && <p className="text-center text-xs text-slate-400 py-2">... 외 {salesData.length - 50}건</p>}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
              <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">판매 데이터가 없습니다</h3>
              <p className="text-sm text-slate-500 mb-3">위 영역에 판매 엑셀 파일을 드래그앤드롭하세요.</p>
              <p className="text-xs text-slate-400">헤더 예시: 일자, 품목명, 수량, 금액, 거래처</p>
            </div>
          )}
        </>
      )}

      {/* AI 스마트 분석 탭 */}
      {activeTab === 'smart' && (
        <div className="space-y-4">
          {smartReport ? (
            <div ref={reportRef}>
              <SmartReportView
                report={smartReport}
                onDownload={downloadSmartReport}
                onSave={saveReport}
                onDownloadPDF={downloadPDF}
                saving={savingReport}
              />
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-violet-100 to-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">AI 스마트 재고 분석</h3>
              <p className="text-sm text-slate-500 mb-1">재고 엑셀 + 판매 엑셀을 업로드하고 분석 버튼을 클릭하세요</p>
              <p className="text-xs text-slate-400 mb-5">
                ABC분류 / 안전재고 산출 / 발주점(ROP) / 판매속도 / 재고일수 / 품절위험 / 악성재고 / 수요트렌드
              </p>
              <button
                onClick={runSmartAnalysis}
                disabled={analyzing || !hasData}
                className="px-6 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl text-sm font-medium hover:from-violet-700 hover:to-indigo-700 transition disabled:opacity-50"
              >
                {analyzing ? 'AI 분석 중...' : '스마트 분석 시작'}
              </button>
            </div>
          )}

          {/* 저장된 보고서 목록 */}
          {savedReports.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
                <h4 className="text-sm font-bold text-slate-700">저장된 보고서 ({savedReports.length}건)</h4>
              </div>
              <div className="divide-y divide-slate-100">
                {savedReports.map((r) => (
                  <div key={r.id} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-violet-50 rounded-lg flex items-center justify-center">
                        <svg className="w-4 h-4 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-900">{r.fileName || `보고서 #${r.id}`}</div>
                        <div className="text-xs text-slate-400">
                          {r.reportDate} | {r.itemCount}개 품목 | {new Date(r.createdAt).toLocaleString('ko-KR')}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => loadReport(r.id)}
                        className="px-3 py-1.5 bg-violet-50 text-violet-700 rounded-lg text-xs font-medium hover:bg-violet-100 transition"
                      >
                        불러오기
                      </button>
                      <button
                        onClick={() => deleteReport(r.id)}
                        className="px-2 py-1.5 text-slate-400 hover:text-red-500 text-xs transition"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// Sub Components
// ═══════════════════════════════════════════════

function statusLabel(s: string) {
  switch (s) {
    case 'stockout_risk': return '품절위험';
    case 'low_stock': return '부족';
    case 'optimal': return '정상';
    case 'overstock': return '과잉';
    case 'dead_stock': return '악성재고';
    default: return s;
  }
}

function statusBadge(s: string) {
  switch (s) {
    case 'stockout_risk': return 'bg-red-100 text-red-700';
    case 'low_stock': return 'bg-amber-100 text-amber-700';
    case 'optimal': return 'bg-green-100 text-green-700';
    case 'overstock': return 'bg-orange-100 text-orange-700';
    case 'dead_stock': return 'bg-slate-200 text-slate-600';
    default: return 'bg-slate-100 text-slate-600';
  }
}

function trendLabel(t: string) {
  switch (t) {
    case 'increasing': return '증가';
    case 'decreasing': return '감소';
    case 'stable': return '안정';
    default: return '-';
  }
}

function trendIcon(t: string) {
  switch (t) {
    case 'increasing': return <span className="text-green-600 font-bold">&#9650;</span>;
    case 'decreasing': return <span className="text-red-600 font-bold">&#9660;</span>;
    case 'stable': return <span className="text-slate-400">&#9654;</span>;
    default: return <span className="text-slate-300">-</span>;
  }
}

function abcBadge(abc: string) {
  switch (abc) {
    case 'A': return 'bg-violet-100 text-violet-700';
    case 'B': return 'bg-blue-100 text-blue-700';
    case 'C': return 'bg-slate-100 text-slate-600';
    default: return 'bg-slate-100 text-slate-600';
  }
}

function MiniCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="text-base font-bold text-slate-900">{value}</div>
    </div>
  );
}

function EmptyState({ icon, title, desc, sub }: { icon: string; title: string; desc: string; sub?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
      <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
        {icon === 'box' ? (
          <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        ) : (
          <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        )}
      </div>
      <h3 className="text-lg font-bold text-slate-900 mb-2">{title}</h3>
      <p className="text-sm text-slate-500">{desc}</p>
      {sub && <p className="text-xs text-slate-400 mt-2">{sub}</p>}
    </div>
  );
}

// ─── Smart Report View ───

function SmartReportView({ report, onDownload, onSave, onDownloadPDF, saving }: {
  report: SmartAnalysis;
  onDownload: () => void;
  onSave: () => void;
  onDownloadPDF: () => void;
  saving: boolean;
}) {
  const s = report.summary;
  const [showAllItems, setShowAllItems] = useState(false);

  return (
    <>
      {/* 보고서 헤더 */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h3 className="text-xl font-bold">KPROS 스마트 재고 분석 보고서</h3>
            <p className="text-slate-300 text-sm mt-1">
              {new Date(report.analyzed_at).toLocaleString('ko-KR')} | 판매기간 {s.sales_period_days}일
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={onSave} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition flex items-center gap-1.5 disabled:opacity-50">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
              {saving ? '저장 중...' : '보고서 저장'}
            </button>
            <button onClick={onDownloadPDF} className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
              PDF
            </button>
            <button onClick={onDownload} className="px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              Excel
            </button>
          </div>
        </div>
      </div>

      {/* 핵심 지표 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2.5">
        <StatCard label="총 품목" value={String(s.total_items)} sub="개" color="slate" />
        <StatCard label="기간 매출" value={`₩${formatKRW(s.total_sales_revenue)}`} color="indigo" />
        <StatCard label="평균 재고일수" value={String(s.avg_days_of_supply)} sub="일" color="cyan" />
        <StatCard label="품절 위험" value={String(s.status_counts.stockout_risk)} sub="건" color="red" />
        <StatCard label="재고 부족" value={String(s.status_counts.low_stock)} sub="건" color="amber" />
        <StatCard label="발주 필요" value={String(s.items_needing_reorder)} sub="건" color="rose" />
        <StatCard label="악성재고" value={String(s.status_counts.dead_stock)} sub="건" color="gray" />
      </div>

      {/* ABC 분류 + 상태 요약 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* ABC 분류 */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h4 className="text-sm font-bold text-slate-700 mb-3">ABC 분류 (매출 기여도)</h4>
          <div className="space-y-2.5">
            {[
              { cls: 'A', label: 'A등급 (상위 80%)', count: s.abc_counts.A, desc: '핵심 수익 품목 - 최우선 관리' },
              { cls: 'B', label: 'B등급 (80~95%)', count: s.abc_counts.B, desc: '중요 품목 - 정기 모니터링' },
              { cls: 'C', label: 'C등급 (하위 5%)', count: s.abc_counts.C, desc: '저매출 품목 - 재고 최소화' },
            ].map((item) => {
              const pct = s.total_items > 0 ? Math.round((item.count / s.total_items) * 100) : 0;
              return (
                <div key={item.cls} className="flex items-center gap-3">
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${abcBadge(item.cls)}`}>{item.cls}</span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-medium text-slate-700">{item.label}</span>
                      <span className="text-xs font-bold text-slate-900">{item.count}개 ({pct}%)</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full bg-violet-500" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">{item.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 재고 상태 분포 */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h4 className="text-sm font-bold text-slate-700 mb-3">재고 상태 분포</h4>
          <div className="space-y-2">
            {[
              { key: 'stockout_risk', label: '품절 위험', color: 'bg-red-500', count: s.status_counts.stockout_risk },
              { key: 'low_stock', label: '안전재고 부족', color: 'bg-amber-500', count: s.status_counts.low_stock },
              { key: 'optimal', label: '정상', color: 'bg-green-500', count: s.status_counts.optimal },
              { key: 'overstock', label: '과잉재고', color: 'bg-orange-400', count: s.status_counts.overstock },
              { key: 'dead_stock', label: '악성재고', color: 'bg-slate-400', count: s.status_counts.dead_stock },
            ].map((item) => {
              const pct = s.total_items > 0 ? Math.round((item.count / s.total_items) * 100) : 0;
              return (
                <div key={item.key} className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${item.color} shrink-0`} />
                  <span className="text-xs text-slate-600 w-24">{item.label}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-2">
                    <div className={`h-2 rounded-full ${item.color}`} style={{ width: `${Math.max(pct, 2)}%` }} />
                  </div>
                  <span className="text-xs font-bold text-slate-700 w-16 text-right">{item.count}건 ({pct}%)</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 긴급 발주 필요 */}
      {report.reorder_items.length > 0 && (
        <div className="bg-white rounded-2xl border border-red-200 overflow-hidden">
          <div className="px-5 py-3 bg-red-50 border-b border-red-200 flex items-center gap-2">
            <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
            <h4 className="text-sm font-bold text-red-800">긴급 발주 필요 ({report.reorder_items.length}건)</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                <th className="text-left px-4 py-2">품목명</th>
                <th className="text-center px-3 py-2">ABC</th>
                <th className="text-right px-3 py-2">현재고</th>
                <th className="text-right px-3 py-2">안전재고</th>
                <th className="text-right px-3 py-2">발주점</th>
                <th className="text-right px-3 py-2">재고일수</th>
                <th className="text-right px-3 py-2">권장발주</th>
                <th className="text-right px-3 py-2">예상비용</th>
                <th className="text-center px-3 py-2">트렌드</th>
                <th className="text-left px-3 py-2">공급사</th>
              </tr></thead>
              <tbody>
                {report.reorder_items.map((item, i) => (
                  <tr key={i} className={`border-b border-slate-50 hover:bg-red-50/30 ${item.days_of_supply <= 3 ? 'bg-red-50/50' : ''}`}>
                    <td className="px-4 py-2 font-medium text-slate-900">{item.name}</td>
                    <td className="px-3 py-2 text-center"><span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${abcBadge(item.abc_class)}`}>{item.abc_class}</span></td>
                    <td className="px-3 py-2 text-right font-semibold text-red-600">{item.current_stock}</td>
                    <td className="px-3 py-2 text-right text-slate-500">{item.safety_stock}</td>
                    <td className="px-3 py-2 text-right text-slate-500">{item.reorder_point}</td>
                    <td className="px-3 py-2 text-right font-bold text-red-700">{item.days_of_supply}일</td>
                    <td className="px-3 py-2 text-right font-bold text-blue-700">{item.recommended_order_qty}{item.unit}</td>
                    <td className="px-3 py-2 text-right text-slate-500">{item.estimated_cost > 0 ? `₩${formatKRW(item.estimated_cost)}` : '-'}</td>
                    <td className="px-3 py-2 text-center">{trendIcon(item.demand_trend)}</td>
                    <td className="px-3 py-2 text-slate-500 text-xs">{item.supplier || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TOP 판매 품목 */}
      {report.top_sellers.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 bg-indigo-50 border-b border-indigo-200">
            <h4 className="text-sm font-bold text-indigo-800">TOP 판매 품목</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                <th className="text-center px-3 py-2">#</th>
                <th className="text-left px-4 py-2">품목명</th>
                <th className="text-center px-3 py-2">ABC</th>
                <th className="text-right px-3 py-2">총매출</th>
                <th className="text-right px-3 py-2">판매수량</th>
                <th className="text-right px-3 py-2">일평균판매</th>
                <th className="text-center px-3 py-2">트렌드</th>
                <th className="text-right px-3 py-2">거래처수</th>
              </tr></thead>
              <tbody>
                {report.top_sellers.map((item, i) => (
                  <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-3 py-2 text-center text-xs font-bold text-slate-400">{i + 1}</td>
                    <td className="px-4 py-2 font-medium text-slate-900">{item.name}</td>
                    <td className="px-3 py-2 text-center"><span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${abcBadge(item.abc_class)}`}>{item.abc_class}</span></td>
                    <td className="px-3 py-2 text-right font-semibold text-indigo-700">₩{formatKRW(item.total_revenue)}</td>
                    <td className="px-3 py-2 text-right">{item.total_sold.toLocaleString()}{item.unit}</td>
                    <td className="px-3 py-2 text-right text-slate-500">{item.avg_daily_sales}{item.unit}/일</td>
                    <td className="px-3 py-2 text-center">{trendIcon(item.demand_trend)} <span className="text-[10px] text-slate-500">{trendLabel(item.demand_trend)}</span></td>
                    <td className="px-3 py-2 text-right text-slate-500">{item.customer_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 악성재고 + 월별 트렌드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {report.dead_stock_items.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h4 className="text-sm font-bold text-slate-700 mb-3">악성재고 (판매실적 없음)</h4>
            <div className="space-y-2">
              {report.dead_stock_items.map((item, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-slate-50">
                  <div>
                    <span className="text-sm font-medium text-slate-700">{item.name}</span>
                    {item.supplier && <span className="text-[10px] text-slate-400 ml-2">{item.supplier}</span>}
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-semibold text-slate-600">{item.current_stock}{item.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {report.monthly_trend.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h4 className="text-sm font-bold text-slate-700 mb-3">월별 판매 추이</h4>
            <div className="space-y-2">
              {report.monthly_trend.map((m, i) => {
                const maxAmt = Math.max(...report.monthly_trend.map((t) => t.amount), 1);
                const pct = Math.round((m.amount / maxAmt) * 100);
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs font-medium text-slate-600 w-16">{m.month}</span>
                    <div className="flex-1 bg-slate-100 rounded-full h-3">
                      <div className="h-3 rounded-full bg-gradient-to-r from-indigo-400 to-indigo-600" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="text-right w-24">
                      <span className="text-xs font-bold text-slate-700">₩{formatKRW(m.amount)}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 w-14 text-right">{m.qty.toLocaleString()}개</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 카테고리별 현황 */}
      {Object.keys(report.by_category).length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h4 className="text-sm font-bold text-slate-700 mb-3">카테고리별 현황</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {Object.entries(report.by_category).map(([cat, d]) => (
              <div key={cat} className="bg-slate-50 rounded-xl p-3">
                <div className="text-xs font-medium text-slate-500 mb-1">{cat}</div>
                <div className="text-lg font-bold text-slate-900">{d.count}<span className="text-xs text-slate-400 ml-0.5">품목</span></div>
                <div className="flex items-center gap-2 mt-1">
                  {d.value > 0 && <span className="text-[10px] text-slate-500">재고 ₩{formatKRW(d.value)}</span>}
                  {d.revenue > 0 && <span className="text-[10px] text-indigo-500">매출 ₩{formatKRW(d.revenue)}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 전체 품목 분석 상세 */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <h4 className="text-sm font-bold text-slate-700">전체 품목 분석 ({report.analyses.length}건)</h4>
          <button onClick={() => setShowAllItems(!showAllItems)} className="text-xs text-brand-600 hover:text-brand-700 font-medium">
            {showAllItems ? '접기' : '펼치기'}
          </button>
        </div>
        {showAllItems && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                <th className="text-left px-3 py-2">품목명</th>
                <th className="text-center px-2 py-2">ABC</th>
                <th className="text-center px-2 py-2">상태</th>
                <th className="text-right px-2 py-2">현재고</th>
                <th className="text-right px-2 py-2">안전재고</th>
                <th className="text-right px-2 py-2">발주점</th>
                <th className="text-right px-2 py-2">일평균판매</th>
                <th className="text-right px-2 py-2">재고일수</th>
                <th className="text-right px-2 py-2">권장발주</th>
                <th className="text-center px-2 py-2">트렌드</th>
              </tr></thead>
              <tbody>
                {report.analyses.map((a, i) => (
                  <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-3 py-1.5 font-medium text-slate-800">{a.name}</td>
                    <td className="px-2 py-1.5 text-center"><span className={`px-1 py-0.5 rounded text-[10px] font-bold ${abcBadge(a.abc_class)}`}>{a.abc_class}</span></td>
                    <td className="px-2 py-1.5 text-center"><span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${statusBadge(a.status)}`}>{statusLabel(a.status)}</span></td>
                    <td className="px-2 py-1.5 text-right font-semibold">{a.current_stock}</td>
                    <td className="px-2 py-1.5 text-right text-slate-500">{a.safety_stock}</td>
                    <td className="px-2 py-1.5 text-right text-slate-500">{a.reorder_point}</td>
                    <td className="px-2 py-1.5 text-right text-slate-500">{a.avg_daily_sales}</td>
                    <td className="px-2 py-1.5 text-right font-medium">{a.days_of_supply ?? '-'}</td>
                    <td className="px-2 py-1.5 text-right text-blue-600 font-medium">{a.recommended_order_qty > 0 ? a.recommended_order_qty : '-'}</td>
                    <td className="px-2 py-1.5 text-center">{trendIcon(a.demand_trend)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* AI 인사이트 */}
      {report.ai_insight && (
        <div className="bg-gradient-to-br from-violet-50 to-indigo-50 rounded-2xl border border-violet-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <h4 className="text-sm font-bold text-violet-800">AI 스마트 분석 인사이트</h4>
          </div>
          <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
            {report.ai_insight}
          </div>
        </div>
      )}
    </>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  const colorMap: Record<string, string> = {
    slate: 'text-slate-700', blue: 'text-blue-700', indigo: 'text-indigo-700', cyan: 'text-cyan-700',
    red: 'text-red-700', amber: 'text-amber-700', rose: 'text-rose-700', green: 'text-green-700', gray: 'text-slate-500',
  };
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3">
      <div className="text-[10px] text-slate-500 font-medium mb-0.5 truncate">{label}</div>
      <div className={`text-base font-bold ${colorMap[color] || 'text-slate-900'}`}>
        {value}{sub && <span className="text-[10px] text-slate-400 ml-0.5">{sub}</span>}
      </div>
    </div>
  );
}
