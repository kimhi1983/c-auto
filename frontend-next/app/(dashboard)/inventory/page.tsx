'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { apiUrl, authHeaders } from '@/lib/api';
import * as XLSX from 'xlsx';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// ── KPROS 인터페이스 ──
interface KprosStockItem {
  productIdx: number;
  warehouseIdx: number;
  productNm: string;
  warehouseNm: string;
  sumStockQty: number;
  pkgUnitNm: string;
  manuNmList: string | null;
  braNmList: string | null;
}

interface WarehouseSummary { name: string; itemCount: number; totalQty: number }
interface BrandSummary { name: string; itemCount: number; totalQty: number }

interface KprosStockData {
  items: KprosStockItem[];
  totalCount: number;
  totalQty: number;
  warehouses: WarehouseSummary[];
  brands: BrandSummary[];
  zeroStockCount: number;
  fetchedAt: string;
}

// ── 판매분석 인터페이스 ──
interface SalesRow {
  date: string;
  customer: string;
  productCode: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

interface SalesAnalysisResult {
  overview: {
    totalSalesAmount: number;
    totalQuantity: number;
    productCount: number;
    customerCount: number;
    period: { from: string; to: string; months: number };
  };
  monthlyTrend: Array<{ month: string; totalQty: number; totalAmount: number; productCount: number }>;
  productRanking: Array<{
    rank: number; productName: string; totalQty: number; totalAmount: number;
    customerCount: number; avgMonthlyQty: number; salesMonths: number;
  }>;
  inventoryCrossRef: Array<{
    productName: string; salesQty: number; avgMonthlySales: number;
    currentStock: number | null; monthsOfSupply: number | null;
    safetyStock: number; reorderPoint: number;
    status: 'urgent' | 'warning' | 'normal' | 'excess' | 'no_stock_data';
    recommendedOrder: number;
  }>;
  safetyStockSummary: {
    urgentCount: number; warningCount: number; normalCount: number;
    excessCount: number; noDataCount: number; totalRecommendedOrderValue: number;
  };
  customerAnalysis: Array<{
    customer: string; totalAmount: number; totalQty: number;
    productCount: number; orderCount: number;
  }>;
  aiReport: string;
  kprosDataAvailable: boolean;
  analyzedAt: string;
}

type TabType = 'kpros' | 'sales';
type SortField = 'productNm' | 'sumStockQty' | 'warehouseNm' | 'braNmList';
type SalesPhase = 'upload' | 'preview' | 'analyzing' | 'report';
type CrossRefSort = 'productName' | 'salesQty' | 'avgMonthlySales' | 'currentStock' | 'monthsOfSupply' | 'status';

export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState<TabType>('kpros');

  // ── KPROS 상태 ──
  const [kprosData, setKprosData] = useState<KprosStockData | null>(null);
  const [kprosLoading, setKprosLoading] = useState(false);
  const [kprosError, setKprosError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState('all');
  const [sortField, setSortField] = useState<SortField>('productNm');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [isStale, setIsStale] = useState(false);

  // ── 판매분석 상태 ──
  const [salesPhase, setSalesPhase] = useState<SalesPhase>('upload');
  const [salesFileName, setSalesFileName] = useState('');
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesError, setSalesError] = useState('');
  const [salesIsDragging, setSalesIsDragging] = useState(false);
  const [parsedSalesData, setParsedSalesData] = useState<SalesRow[]>([]);
  const [salesResult, setSalesResult] = useState<SalesAnalysisResult | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [leadTimeDays, setLeadTimeDays] = useState(14);
  const [serviceLevel, setServiceLevel] = useState(95);
  const [crossRefSort, setCrossRefSort] = useState<CrossRefSort>('status');
  const [crossRefDir, setCrossRefDir] = useState<'asc' | 'desc'>('asc');
  const salesFileInputRef = useRef<HTMLInputElement>(null);

  // ── KPROS 데이터 조회 ──
  const fetchKprosStock = useCallback(async (refresh = false) => {
    setKprosLoading(true);
    setKprosError(null);
    setIsStale(false);
    try {
      const res = await fetch(apiUrl(`/api/v1/inventory/kpros-stock${refresh ? '?refresh=true' : ''}`), { headers: authHeaders() });
      const json = await res.json();
      if (json.status === 'success') {
        // 카이코스텍 창고 제외
        const HIDDEN_WH = '카이코스텍';
        const raw = json.data as KprosStockData;
        const filteredWh = raw.items.filter(i => i.warehouseNm !== HIDDEN_WH);
        const whSummary = raw.warehouses.filter(w => w.name !== HIDDEN_WH);
        setKprosData({
          ...raw,
          items: filteredWh,
          totalCount: filteredWh.length,
          totalQty: filteredWh.reduce((s, i) => s + i.sumStockQty, 0),
          warehouses: whSummary,
        });
        if (json.stale) setIsStale(true);
      } else {
        setKprosError(json.message || 'KPROS 재고 조회 실패');
      }
    } catch {
      setKprosError('네트워크 오류');
    } finally {
      setKprosLoading(false);
    }
  }, []);

  useEffect(() => { fetchKprosStock(); }, [fetchKprosStock]);

  // ── KPROS 필터링/정렬 ──
  const filteredItems = useMemo(() => {
    if (!kprosData) return [];
    let items = kprosData.items;

    if (selectedWarehouse !== 'all') {
      items = items.filter(i => i.warehouseNm === selectedWarehouse);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(i =>
        i.productNm?.toLowerCase().includes(q) ||
        i.manuNmList?.toLowerCase().includes(q) ||
        i.braNmList?.toLowerCase().includes(q)
      );
    }

    return [...items].sort((a, b) => {
      const av = a[sortField]; const bv = b[sortField];
      const cmp = typeof av === 'number' ? (av as number) - (bv as number) : String(av || '').localeCompare(String(bv || ''), 'ko');
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [kprosData, selectedWarehouse, searchQuery, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const sortIcon = (field: SortField) => {
    if (sortField !== field) return <span className="text-slate-300 ml-1">↕</span>;
    return <span className="text-slate-700 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  // ── 판매현황 엑셀 파싱 ──
  const parseSalesExcel = async (file: File): Promise<SalesRow[]> => {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData: any[][] = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(15, jsonData.length); i++) {
      const row = jsonData[i];
      if (!row) continue;
      const rowStr = row.map((c: any) => String(c || '')).join(' ');
      if ((/일자|날짜|Date/i.test(rowStr) || /\d{4}/.test(rowStr)) &&
          /품명|품목|Product/i.test(rowStr)) {
        headerRowIndex = i;
        break;
      }
    }
    if (headerRowIndex === -1) throw new Error('헤더를 찾을 수 없습니다 (일자, 품명 컬럼 필요)');

    const headers: string[] = jsonData[headerRowIndex].map((h: any) => String(h || '').trim());

    const dateIdx = headers.findIndex(h => /일자|날짜|Date/i.test(h));
    const custIdx = headers.findIndex(h => /거래처|Customer|Cust/i.test(h));
    const codeIdx = headers.findIndex(h => /품목코드|품번|Code/i.test(h));
    const prodIdx = headers.findIndex(h => /품명|품목명|Product/i.test(h));
    const qtyIdx = headers.findIndex(h => /수량|Qty|Quantity/i.test(h));
    const priceIdx = headers.findIndex(h => /단가|Price/i.test(h));
    const amtIdx = headers.findIndex(h => /금액|공급가|Amount|Supply/i.test(h));

    const rows: SalesRow[] = [];
    for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
      const row = jsonData[i];
      if (!row || row.length === 0) continue;
      const productName = prodIdx >= 0 ? String(row[prodIdx] || '').trim() : '';
      if (!productName) continue;

      let dateStr = '';
      if (dateIdx >= 0) {
        const rawDate = row[dateIdx];
        if (typeof rawDate === 'number' && rawDate > 30000) {
          const d = new Date((rawDate - 25569) * 86400000);
          dateStr = d.toISOString().split('T')[0];
        } else {
          dateStr = String(rawDate || '').replace(/[./]/g, '-');
        }
      }

      rows.push({
        date: dateStr,
        customer: custIdx >= 0 ? String(row[custIdx] || '').trim() : '',
        productCode: codeIdx >= 0 ? String(row[codeIdx] || '').trim() : '',
        productName,
        quantity: qtyIdx >= 0 ? parseFloat(row[qtyIdx]) || 0 : 0,
        unitPrice: priceIdx >= 0 ? parseFloat(row[priceIdx]) || 0 : 0,
        amount: amtIdx >= 0 ? parseFloat(row[amtIdx]) || 0 : 0,
      });
    }
    if (rows.length === 0) throw new Error('파싱된 판매 데이터가 없습니다');
    return rows;
  };

  const processSalesFile = async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) { setSalesError('엑셀 파일(.xlsx, .xls)만 가능합니다.'); return; }
    setSalesFileName(file.name); setSalesLoading(true); setSalesError(''); setParsedSalesData([]); setSalesResult(null);
    try {
      const rows = await parseSalesExcel(file);
      setParsedSalesData(rows);
      setSalesPhase('preview');
    } catch (err: any) { setSalesError(err.message); }
    setSalesLoading(false);
  };

  // ── 판매분석 API 호출 ──
  const runSalesAnalysis = async () => {
    setSalesPhase('analyzing'); setSalesError('');
    try {
      const res = await fetch(apiUrl('/api/v1/inventory/sales-analyze'), {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ salesData: parsedSalesData, leadTimeDays, serviceLevel }),
      });
      const json = await res.json();
      if (json.status === 'success') {
        setSalesResult(json.data);
        setSalesPhase('report');
      } else {
        setSalesError(json.message || '분석 실패');
        setSalesPhase('preview');
      }
    } catch {
      setSalesError('네트워크 오류');
      setSalesPhase('preview');
    }
  };

  // ── PDF 다운로드 ──
  const downloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      const html2pdf = (await import('html2pdf.js')).default;
      const el = document.getElementById('sales-analysis-report');
      if (!el) throw new Error('리포트 콘텐츠 없음');
      const date = new Date().toISOString().split('T')[0];
      await (html2pdf().set({
        margin: [12, 8, 12, 8],
        filename: `KPROS_판매분석_안전재고계획_${date}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      }) as any).from(el).save();
    } catch (e: any) {
      alert('PDF 다운로드 실패: ' + (e.message || ''));
    }
    setDownloadingPdf(false);
  };

  // ── 판매 미리보기 통계 ──
  const previewStats = useMemo(() => {
    if (!parsedSalesData.length) return null;
    const dates = parsedSalesData.map(r => r.date).filter(Boolean).sort();
    const products = new Set(parsedSalesData.map(r => r.productName));
    const customers = new Set(parsedSalesData.map(r => r.customer).filter(Boolean));
    return {
      count: parsedSalesData.length,
      from: dates[0] || '-',
      to: dates[dates.length - 1] || '-',
      productCount: products.size,
      customerCount: customers.size,
      totalAmount: parsedSalesData.reduce((s, r) => s + r.amount, 0),
    };
  }, [parsedSalesData]);

  // ── 교차분석 정렬 ──
  const sortedCrossRef = useMemo(() => {
    if (!salesResult) return [];
    const statusOrder: Record<string, number> = { urgent: 0, warning: 1, normal: 2, excess: 3, no_stock_data: 4 };
    return [...salesResult.inventoryCrossRef].sort((a, b) => {
      let cmp = 0;
      if (crossRefSort === 'status') cmp = (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5);
      else if (crossRefSort === 'productName') cmp = a.productName.localeCompare(b.productName, 'ko');
      else cmp = ((a[crossRefSort] ?? -1) as number) - ((b[crossRefSort] ?? -1) as number);
      return crossRefDir === 'asc' ? cmp : -cmp;
    });
  }, [salesResult, crossRefSort, crossRefDir]);

  const toggleCrossRefSort = (field: CrossRefSort) => {
    if (crossRefSort === field) setCrossRefDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setCrossRefSort(field); setCrossRefDir('asc'); }
  };

  const crSortIcon = (field: CrossRefSort) => {
    if (crossRefSort !== field) return <span className="text-slate-300 ml-1">↕</span>;
    return <span className="text-slate-700 ml-1">{crossRefDir === 'asc' ? '↑' : '↓'}</span>;
  };

  const statusBadge = (s: string) => {
    const map: Record<string, { bg: string; text: string; label: string }> = {
      urgent: { bg: 'bg-red-100', text: 'text-red-700', label: '긴급' },
      warning: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: '주의' },
      normal: { bg: 'bg-green-100', text: 'text-green-700', label: '양호' },
      excess: { bg: 'bg-blue-100', text: 'text-blue-700', label: '과잉' },
      no_stock_data: { bg: 'bg-slate-100', text: 'text-slate-500', label: '미확인' },
    };
    const m = map[s] || map.no_stock_data;
    return <span className={`px-2 py-0.5 ${m.bg} ${m.text} text-xs font-semibold rounded`}>{m.label}</span>;
  };

  const fmtAmt = (n: number) => n >= 1e8 ? `${(n / 1e8).toFixed(1)}억` : n >= 1e4 ? `${(n / 1e4).toFixed(0)}만` : n.toLocaleString();

  const resetSalesAnalysis = () => {
    setSalesPhase('upload'); setSalesFileName(''); setParsedSalesData([]); setSalesResult(null); setSalesError('');
  };

  return (
    <div className="space-y-6">
      {/* ── 헤더 ── */}
      <div className="animate-fadeIn">
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <span>재고</span>
          <span className="text-slate-300">/</span>
          <span className="text-slate-700 font-medium">재고 관리 센터</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">재고 관리 센터</h1>
            <p className="text-sm text-slate-500 mt-1">KPROS ERP 실시간 재고 현황</p>
          </div>
          <div className="flex items-center gap-3">
            {kprosData && (
              <span className="text-xs text-slate-400">
                {new Date(kprosData.fetchedAt).toLocaleString('ko-KR')} 기준
                {isStale && <span className="ml-1 text-amber-500">(캐시)</span>}
              </span>
            )}
            <button
              onClick={() => fetchKprosStock(true)}
              disabled={kprosLoading}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                kprosLoading ? 'bg-slate-100 text-slate-400' : 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm'
              }`}
            >
              {kprosLoading ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
              새로고침
            </button>
          </div>
        </div>
      </div>

      {/* ── KPROS 통계 카드 (KPROS 탭) ── */}
      {activeTab === 'kpros' && kprosData && !kprosLoading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fadeInUp">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4">
            <div className="text-xs text-slate-500 font-medium mb-1">총 품목</div>
            <div className="text-2xl font-bold text-slate-900">{kprosData.totalCount}<span className="text-sm font-normal text-slate-400 ml-1">건</span></div>
            <div className="text-xs text-slate-400 mt-1">재고없음 {kprosData.zeroStockCount}건</div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4">
            <div className="text-xs text-slate-500 font-medium mb-1">총 재고량</div>
            <div className="text-2xl font-bold text-slate-900">{kprosData.totalQty.toLocaleString()}<span className="text-sm font-normal text-slate-400 ml-1">kg</span></div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4">
            <div className="text-xs text-slate-500 font-medium mb-1">창고</div>
            <div className="text-2xl font-bold text-slate-900">{kprosData.warehouses.length}<span className="text-sm font-normal text-slate-400 ml-1">개</span></div>
            <div className="text-xs text-slate-400 mt-1">{kprosData.warehouses.map(w => w.name).join(', ')}</div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4">
            <div className="text-xs text-slate-500 font-medium mb-1">브랜드</div>
            <div className="text-2xl font-bold text-slate-900">{kprosData.brands.length}<span className="text-sm font-normal text-slate-400 ml-1">개</span></div>
          </div>
        </div>
      )}

      {/* ── 안전재고 파라미터 안내 (판매분석 탭) ── */}
      {activeTab === 'sales' && (
        <div className="grid md:grid-cols-2 gap-4 animate-fadeInUp">
          {/* 리드타임 */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-sm font-bold text-slate-800">리드타임 (Lead Time)</h3>
                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded-md">기본 14일</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed mb-2">발주 후 입고까지 걸리는 기간. 이 기간 동안 재고가 바닥나면 안 되므로, 리드타임이 길수록 안전재고를 더 많이 확보해야 합니다.</p>
                <div className="flex gap-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                    <span className="text-[10px] text-slate-500">국내 3~7일</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    <span className="text-[10px] text-slate-500">해외 14~30일</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                    <span className="text-[10px] text-slate-500">긴급 1~3일</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          {/* 서비스레벨 */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-sm font-bold text-slate-800">서비스레벨 (Service Level)</h3>
                  <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded-md">기본 95%</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed mb-2">재고 부족 없이 주문을 충족할 확률. 높을수록 안전재고가 늘어나지만 품절 위험이 줄어듭니다.</p>
                <div className="flex gap-2">
                  {[
                    { level: '90%', z: '1.28', label: '적음', color: 'bg-slate-200' },
                    { level: '95%', z: '1.65', label: '보통', color: 'bg-emerald-200' },
                    { level: '97%', z: '1.88', label: '많음', color: 'bg-blue-200' },
                    { level: '99%', z: '2.33', label: '매우 많음', color: 'bg-purple-200' },
                  ].map(item => (
                    <div key={item.level} className={`flex-1 ${item.color} rounded-lg px-2 py-1.5 text-center`}>
                      <div className="text-[10px] font-bold text-slate-700">{item.level}</div>
                      <div className="text-[9px] text-slate-500">Z={item.z}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 탭 ── */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
        <button
          onClick={() => setActiveTab('kpros')}
          className={`px-5 py-2 text-sm font-medium rounded-lg transition ${
            activeTab === 'kpros' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          KPROS 실시간 재고
        </button>
        <button
          onClick={() => setActiveTab('sales')}
          className={`px-5 py-2 text-sm font-medium rounded-lg transition ${
            activeTab === 'sales' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          판매분석/안전재고
        </button>
      </div>

      {/* ══════════════════════════════════════════ */}
      {/* TAB 1: KPROS 실시간 재고 */}
      {/* ══════════════════════════════════════════ */}
      {activeTab === 'kpros' && (
        <div className="space-y-5 animate-fadeInUp">
          {kprosLoading && !kprosData && (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-12">
              <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-[3px] border-slate-200 border-t-slate-800 rounded-full animate-spin" />
                <div className="text-center">
                  <p className="text-sm font-semibold text-slate-700">KPROS ERP 재고 조회 중...</p>
                  <p className="text-xs text-slate-400 mt-1">최초 로딩 시 약 5~10초 소요</p>
                </div>
              </div>
            </div>
          )}

          {kprosError && !kprosLoading && (
            <div className="bg-red-50 rounded-2xl border border-red-200 p-5 flex items-start gap-3">
              <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800">{kprosError}</p>
                <button onClick={() => fetchKprosStock(true)} className="text-xs text-red-600 underline mt-1">다시 시도</button>
              </div>
            </div>
          )}

          {kprosData && !kprosLoading && (
            <>
              {/* 창고 필터 + 검색 */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setSelectedWarehouse('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                      selectedWarehouse === 'all' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    전체 ({kprosData.totalCount})
                  </button>
                  {kprosData.warehouses.map(wh => (
                    <button
                      key={wh.name}
                      onClick={() => setSelectedWarehouse(wh.name)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        selectedWarehouse === wh.name ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {wh.name} ({wh.itemCount})
                    </button>
                  ))}
                </div>
                <div className="flex-1 min-w-[200px]">
                  <div className="relative">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="품명, 제조사, 브랜드 검색..."
                      className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                    />
                  </div>
                </div>
              </div>

              <div className="text-xs text-slate-400">
                {filteredItems.length}건 표시
                {searchQuery && ` (검색: "${searchQuery}")`}
                {selectedWarehouse !== 'all' && ` · ${selectedWarehouse}`}
              </div>

              {/* 재고 테이블 */}
              <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden">
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 sticky top-0 z-10">
                      <tr className="border-b border-slate-200">
                        <th className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer select-none hover:text-slate-900" onClick={() => toggleSort('productNm')}>
                          품명{sortIcon('productNm')}
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer select-none hover:text-slate-900" onClick={() => toggleSort('warehouseNm')}>
                          창고{sortIcon('warehouseNm')}
                        </th>
                        <th className="px-4 py-3 text-right font-semibold text-slate-600 cursor-pointer select-none hover:text-slate-900" onClick={() => toggleSort('sumStockQty')}>
                          재고량{sortIcon('sumStockQty')}
                        </th>
                        <th className="px-4 py-3 text-center font-semibold text-slate-600">단위</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-600">제조사</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer select-none hover:text-slate-900" onClick={() => toggleSort('braNmList')}>
                          브랜드{sortIcon('braNmList')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredItems.map((item) => (
                        <tr key={`${item.productIdx}-${item.warehouseIdx}`} className="hover:bg-slate-50 transition">
                          <td className="px-4 py-2.5 text-slate-900 font-medium">{item.productNm}</td>
                          <td className="px-4 py-2.5">
                            <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-md">{item.warehouseNm}</span>
                          </td>
                          <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${
                            item.sumStockQty === 0 ? 'text-red-500' : 'text-slate-900'
                          }`}>
                            {item.sumStockQty.toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5 text-center text-slate-500">{item.pkgUnitNm}</td>
                          <td className="px-4 py-2.5 text-slate-600 text-xs">{item.manuNmList || '-'}</td>
                          <td className="px-4 py-2.5 text-slate-600 text-xs">{item.braNmList || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 창고별 요약 */}
              <div>
                <h3 className="text-sm font-bold text-slate-700 mb-3">창고별 요약</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {kprosData.warehouses.map(wh => (
                    <button
                      key={wh.name}
                      onClick={() => { setSelectedWarehouse(wh.name === selectedWarehouse ? 'all' : wh.name); }}
                      className={`text-left p-4 rounded-2xl border transition-all ${
                        selectedWarehouse === wh.name
                          ? 'bg-white border-slate-300 shadow-sm'
                          : 'bg-white/60 border-slate-200/60 hover:border-slate-300'
                      }`}
                    >
                      <div className="text-xs text-slate-400 font-medium">{wh.name}</div>
                      <div className="text-xl font-bold text-slate-900 mt-1">{wh.itemCount}<span className="text-xs font-normal text-slate-400 ml-1">품목</span></div>
                      <div className="text-xs text-slate-500 mt-1">총 {wh.totalQty.toLocaleString()} kg</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 브랜드별 상위 */}
              <div>
                <h3 className="text-sm font-bold text-slate-700 mb-3">브랜드별 재고 (상위 10)</h3>
                <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr className="border-b border-slate-200">
                        <th className="px-4 py-2.5 text-left font-semibold text-slate-600">브랜드</th>
                        <th className="px-4 py-2.5 text-right font-semibold text-slate-600">품목 수</th>
                        <th className="px-4 py-2.5 text-right font-semibold text-slate-600">총 재고량</th>
                        <th className="px-4 py-2.5 text-right font-semibold text-slate-600">비중</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {kprosData.brands.slice(0, 10).map(br => (
                        <tr key={br.name} className="hover:bg-slate-50">
                          <td className="px-4 py-2.5 text-slate-900 font-medium">{br.name}</td>
                          <td className="px-4 py-2.5 text-right text-slate-600">{br.itemCount}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-slate-900 tabular-nums">{br.totalQty.toLocaleString()} kg</td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-slate-700 rounded-full" style={{ width: `${Math.min(100, (br.totalQty / kprosData.totalQty) * 100)}%` }} />
                              </div>
                              <span className="text-xs text-slate-500 w-10 text-right">{((br.totalQty / kprosData.totalQty) * 100).toFixed(1)}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════ */}
      {/* TAB 2: 판매분석 / 안전재고 계획 */}
      {/* ══════════════════════════════════════════ */}
      {activeTab === 'sales' && (
        <div className="space-y-6 animate-fadeInUp">

          {/* ── Phase 1: 업로드 ── */}
          {salesPhase === 'upload' && (
            <>
              <div
                onDragOver={e => { e.preventDefault(); setSalesIsDragging(true); }}
                onDragLeave={e => { e.preventDefault(); setSalesIsDragging(false); }}
                onDrop={async e => { e.preventDefault(); setSalesIsDragging(false); const f = e.dataTransfer.files?.[0]; if (f) await processSalesFile(f); }}
                className={`bg-white rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
                  salesIsDragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-slate-400'
                }`}
              >
                <input ref={salesFileInputRef} type="file" accept=".xlsx,.xls" onChange={async e => { const f = e.target.files?.[0]; if (f) await processSalesFile(f); }} className="hidden" />
                <div className="flex flex-col items-center gap-4">
                  <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center">
                    <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-slate-800">판매현황 엑셀 업로드</p>
                    <p className="text-sm text-slate-500 mt-1">eCount ERP 판매현황 다운로드 파일 또는 유사 형식</p>
                  </div>
                  <button onClick={() => salesFileInputRef.current?.click()} disabled={salesLoading}
                    className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 disabled:opacity-50 transition">
                    {salesLoading ? '파싱 중...' : '파일 선택'}
                  </button>
                  <div className="text-xs text-slate-400 space-y-0.5">
                    <p>지원 형식: .xlsx, .xls</p>
                    <p>필수 컬럼: 일자, 품명 | 권장 컬럼: 거래처, 수량, 금액</p>
                  </div>
                </div>
              </div>
              {salesError && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl border border-red-200">{salesError}</div>}
              <div className="bg-slate-50 rounded-2xl p-6">
                <h3 className="text-sm font-bold text-slate-700 mb-3">판매분석/안전재고 기능 안내</h3>
                <div className="grid md:grid-cols-3 gap-4 text-sm">
                  <div className="bg-white rounded-xl p-4 border border-slate-200">
                    <div className="text-emerald-600 font-bold mb-1">1. 판매 패턴 분석</div>
                    <p className="text-slate-500 text-xs">월별 추이, TOP 품목/거래처, 계절성 분석</p>
                  </div>
                  <div className="bg-white rounded-xl p-4 border border-slate-200">
                    <div className="text-blue-600 font-bold mb-1">2. KPROS 재고 교차분석</div>
                    <p className="text-slate-500 text-xs">실시간 재고와 판매 데이터 교차, 재고월수 산출</p>
                  </div>
                  <div className="bg-white rounded-xl p-4 border border-slate-200">
                    <div className="text-purple-600 font-bold mb-1">3. AI 보고서 (Gemini 2.5 Pro)</div>
                    <p className="text-slate-500 text-xs">안전재고 계획, 발주점(ROP), 전략 제안, PDF 다운로드</p>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── Phase 2: 미리보기 ── */}
          {salesPhase === 'preview' && previewStats && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="bg-white rounded-xl border border-slate-200 p-3">
                  <div className="text-xs text-slate-400">판매 건수</div>
                  <div className="text-xl font-bold text-slate-900">{previewStats.count.toLocaleString()}<span className="text-xs text-slate-400 ml-1">건</span></div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-3">
                  <div className="text-xs text-slate-400">기간</div>
                  <div className="text-sm font-bold text-slate-900 mt-1">{previewStats.from}<br />{previewStats.to}</div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-3">
                  <div className="text-xs text-slate-400">품목 수</div>
                  <div className="text-xl font-bold text-slate-900">{previewStats.productCount}<span className="text-xs text-slate-400 ml-1">개</span></div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-3">
                  <div className="text-xs text-slate-400">거래처 수</div>
                  <div className="text-xl font-bold text-slate-900">{previewStats.customerCount}<span className="text-xs text-slate-400 ml-1">개</span></div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-3">
                  <div className="text-xs text-slate-400">총 금액</div>
                  <div className="text-xl font-bold text-slate-900">{fmtAmt(previewStats.totalAmount)}<span className="text-xs text-slate-400 ml-1">원</span></div>
                </div>
              </div>

              {/* 미리보기 테이블 */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-700">데이터 미리보기 (처음 30행)</div>
                  <div className="text-xs text-slate-400">{salesFileName}</div>
                </div>
                <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">일자</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">거래처</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">품명</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">수량</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">금액</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {parsedSalesData.slice(0, 30).map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="px-3 py-2 text-slate-600 text-xs">{row.date}</td>
                          <td className="px-3 py-2 text-slate-600 text-xs">{row.customer || '-'}</td>
                          <td className="px-3 py-2 text-slate-900 font-medium text-xs">{row.productName}</td>
                          <td className="px-3 py-2 text-right text-slate-700 tabular-nums text-xs">{row.quantity.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right text-slate-700 tabular-nums text-xs">{row.amount.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {salesError && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl border border-red-200">{salesError}</div>}

              {/* 분석 설정 + 시작 */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex flex-wrap items-end gap-6">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">리드타임 (일)</label>
                    <input type="number" value={leadTimeDays} onChange={e => setLeadTimeDays(Number(e.target.value) || 14)}
                      className="w-24 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">서비스레벨 (%)</label>
                    <select value={serviceLevel} onChange={e => setServiceLevel(Number(e.target.value))}
                      className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300">
                      <option value={90}>90%</option>
                      <option value={95}>95%</option>
                      <option value={97}>97%</option>
                      <option value={99}>99%</option>
                    </select>
                  </div>
                  <div className="flex gap-2 ml-auto">
                    <button onClick={resetSalesAnalysis}
                      className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition">
                      다시 선택
                    </button>
                    <button onClick={runSalesAnalysis}
                      className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 shadow-sm transition flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                      분석 시작 (Gemini 2.5 Pro)
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── Phase 3: 분석 중 ── */}
          {salesPhase === 'analyzing' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center">
              <div className="flex flex-col items-center gap-6">
                <div className="relative">
                  <div className="w-20 h-20 border-[4px] border-slate-200 border-t-emerald-600 rounded-full animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                </div>
                <div>
                  <p className="text-lg font-bold text-slate-800">판매 데이터 분석 중...</p>
                  <p className="text-sm text-slate-500 mt-2">KPROS 재고 교차 분석 + Gemini 2.5 Pro AI 보고서 생성</p>
                  <p className="text-xs text-slate-400 mt-1">약 15~30초 소요됩니다</p>
                </div>
              </div>
            </div>
          )}

          {/* ── Phase 4: 분석 보고서 ── */}
          {salesPhase === 'report' && salesResult && (
            <>
              {/* 상단 액션 */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">판매분석 & 안전재고 보고서</h2>
                  <p className="text-xs text-slate-500">분석기간: {salesResult.overview.period.from} ~ {salesResult.overview.period.to} ({salesResult.overview.period.months}개월)</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={resetSalesAnalysis}
                    className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition">
                    새 분석
                  </button>
                  <button onClick={downloadPdf} disabled={downloadingPdf}
                    className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 disabled:opacity-50 shadow-sm transition flex items-center gap-2">
                    {downloadingPdf ? (
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    )}
                    PDF 다운로드
                  </button>
                </div>
              </div>

              {/* ── PDF 캡처 영역 ── */}
              <div id="sales-analysis-report" className="space-y-6">

                {/* 개요 카드 */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white rounded-2xl border border-slate-200 p-4">
                    <div className="text-xs text-slate-400 font-medium">총 매출액</div>
                    <div className="text-2xl font-bold text-slate-900 mt-1">{fmtAmt(salesResult.overview.totalSalesAmount)}<span className="text-xs text-slate-400 ml-1">원</span></div>
                  </div>
                  <div className="bg-white rounded-2xl border border-slate-200 p-4">
                    <div className="text-xs text-slate-400 font-medium">총 판매수량</div>
                    <div className="text-2xl font-bold text-slate-900 mt-1">{salesResult.overview.totalQuantity.toLocaleString()}</div>
                  </div>
                  <div className="bg-white rounded-2xl border border-slate-200 p-4">
                    <div className="text-xs text-slate-400 font-medium">판매 품목</div>
                    <div className="text-2xl font-bold text-slate-900 mt-1">{salesResult.overview.productCount}<span className="text-xs text-slate-400 ml-1">개</span></div>
                  </div>
                  <div className="bg-white rounded-2xl border border-slate-200 p-4">
                    <div className="text-xs text-slate-400 font-medium">거래처</div>
                    <div className="text-2xl font-bold text-slate-900 mt-1">{salesResult.overview.customerCount}<span className="text-xs text-slate-400 ml-1">개</span></div>
                  </div>
                </div>

                {/* 월별 판매 추이 차트 */}
                {salesResult.monthlyTrend.length > 1 && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-5">
                    <h3 className="text-sm font-bold text-slate-700 mb-4">월별 판매 추이</h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={salesResult.monthlyTrend} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                          <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} width={60} tickFormatter={(v: number) => v >= 1e6 ? `${(v/1e6).toFixed(0)}M` : v >= 1e3 ? `${(v/1e3).toFixed(0)}K` : String(v)} />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '12px' }}
                            formatter={(value: any, name: any) => [Number(value).toLocaleString(), name === 'totalAmount' ? '금액 (원)' : '수량']}
                          />
                          <Bar dataKey="totalAmount" fill="#10b981" radius={[4, 4, 0, 0]} name="totalAmount" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* TOP10 품목 + 거래처 */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                      <h3 className="text-sm font-bold text-slate-700">TOP 10 판매 품목</h3>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {salesResult.productRanking.slice(0, 10).map(p => {
                        const maxAmt = salesResult.productRanking[0]?.totalAmount || 1;
                        return (
                          <div key={p.productName} className="px-4 py-2.5 flex items-center gap-3">
                            <span className="w-6 text-xs font-bold text-slate-400">{p.rank}</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-slate-900 truncate">{p.productName}</div>
                              <div className="text-xs text-slate-400">월평균 {p.avgMonthlyQty.toLocaleString()} · 거래처 {p.customerCount}개</div>
                            </div>
                            <div className="text-right">
                              <div className="text-xs font-bold text-slate-700">{fmtAmt(p.totalAmount)}원</div>
                              <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
                                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(p.totalAmount / maxAmt) * 100}%` }} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                      <h3 className="text-sm font-bold text-slate-700">TOP 10 거래처</h3>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {salesResult.customerAnalysis.slice(0, 10).map((c, idx) => {
                        const maxAmt = salesResult.customerAnalysis[0]?.totalAmount || 1;
                        return (
                          <div key={c.customer} className="px-4 py-2.5 flex items-center gap-3">
                            <span className="w-6 text-xs font-bold text-slate-400">{idx + 1}</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-slate-900 truncate">{c.customer}</div>
                              <div className="text-xs text-slate-400">품목 {c.productCount}개 · {c.orderCount}건</div>
                            </div>
                            <div className="text-right">
                              <div className="text-xs font-bold text-slate-700">{fmtAmt(c.totalAmount)}원</div>
                              <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
                                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(c.totalAmount / maxAmt) * 100}%` }} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* KPROS 재고 교차분석 */}
                {!salesResult.kprosDataAvailable && (
                  <div className="bg-amber-50 text-amber-800 px-4 py-3 rounded-xl border border-amber-200 text-sm">
                    KPROS 재고 데이터를 불러올 수 없어 판매 데이터만으로 분석했습니다. 재고월수/안전재고는 재고 연동 후 확인 가능합니다.
                  </div>
                )}

                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                    <h3 className="text-sm font-bold text-slate-700">KPROS 재고 교차분석 & 안전재고</h3>
                  </div>
                  <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 sticky top-0 z-10">
                        <tr className="border-b border-slate-200">
                          <th className="px-3 py-2.5 text-left font-semibold text-slate-600 text-xs cursor-pointer select-none" onClick={() => toggleCrossRefSort('productName')}>품명{crSortIcon('productName')}</th>
                          <th className="px-3 py-2.5 text-right font-semibold text-slate-600 text-xs cursor-pointer select-none" onClick={() => toggleCrossRefSort('salesQty')}>판매량{crSortIcon('salesQty')}</th>
                          <th className="px-3 py-2.5 text-right font-semibold text-slate-600 text-xs cursor-pointer select-none" onClick={() => toggleCrossRefSort('avgMonthlySales')}>월평균{crSortIcon('avgMonthlySales')}</th>
                          <th className="px-3 py-2.5 text-right font-semibold text-slate-600 text-xs cursor-pointer select-none" onClick={() => toggleCrossRefSort('currentStock')}>현재고{crSortIcon('currentStock')}</th>
                          <th className="px-3 py-2.5 text-right font-semibold text-slate-600 text-xs cursor-pointer select-none" onClick={() => toggleCrossRefSort('monthsOfSupply')}>재고월수{crSortIcon('monthsOfSupply')}</th>
                          <th className="px-3 py-2.5 text-right font-semibold text-slate-600 text-xs">안전재고</th>
                          <th className="px-3 py-2.5 text-right font-semibold text-slate-600 text-xs">ROP</th>
                          <th className="px-3 py-2.5 text-right font-semibold text-slate-600 text-xs">권장발주</th>
                          <th className="px-3 py-2.5 text-center font-semibold text-slate-600 text-xs cursor-pointer select-none" onClick={() => toggleCrossRefSort('status')}>상태{crSortIcon('status')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {sortedCrossRef.map(item => (
                          <tr key={item.productName} className="hover:bg-slate-50">
                            <td className="px-3 py-2 text-slate-900 font-medium text-xs max-w-[200px] truncate">{item.productName}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-xs">{item.salesQty.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-xs">{item.avgMonthlySales.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-xs">{item.currentStock !== null ? item.currentStock.toLocaleString() : '-'}</td>
                            <td className={`px-3 py-2 text-right tabular-nums text-xs font-semibold ${
                              item.monthsOfSupply !== null && item.monthsOfSupply <= 1 ? 'text-red-600' :
                              item.monthsOfSupply !== null && item.monthsOfSupply <= 2 ? 'text-yellow-600' : 'text-slate-700'
                            }`}>{item.monthsOfSupply !== null ? `${item.monthsOfSupply}개월` : '-'}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-xs text-slate-600">{item.safetyStock.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-xs text-slate-600">{item.reorderPoint.toLocaleString()}</td>
                            <td className={`px-3 py-2 text-right tabular-nums text-xs font-semibold ${item.recommendedOrder > 0 ? 'text-red-600' : 'text-slate-400'}`}>{item.recommendedOrder > 0 ? item.recommendedOrder.toLocaleString() : '-'}</td>
                            <td className="px-3 py-2 text-center">{statusBadge(item.status)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 안전재고 요약 */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {[
                    { label: '긴급 발주', count: salesResult.safetyStockSummary.urgentCount, bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700' },
                    { label: '주의', count: salesResult.safetyStockSummary.warningCount, bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700' },
                    { label: '양호', count: salesResult.safetyStockSummary.normalCount, bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700' },
                    { label: '과잉 재고', count: salesResult.safetyStockSummary.excessCount, bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' },
                    { label: '재고 미확인', count: salesResult.safetyStockSummary.noDataCount, bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-600' },
                  ].map(item => (
                    <div key={item.label} className={`${item.bg} rounded-xl border ${item.border} p-3 text-center`}>
                      <div className={`text-2xl font-bold ${item.text}`}>{item.count}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{item.label}</div>
                    </div>
                  ))}
                </div>

                {/* AI 보고서 */}
                {salesResult.aiReport && (
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden" style={{ pageBreakInside: 'avoid' }}>
                    <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-bold">AI 분석 보고서</h3>
                        <p className="text-xs text-slate-400 mt-0.5">재고관리 팀장 관점</p>
                      </div>
                      <span className="px-2.5 py-1 bg-emerald-600 text-white text-xs font-bold rounded-lg">Gemini 2.5 Pro</span>
                    </div>
                    <div className="p-6 prose prose-sm prose-slate max-w-none
                      prose-headings:text-slate-800 prose-headings:font-bold prose-headings:mt-5 prose-headings:mb-2
                      prose-p:text-slate-700 prose-p:leading-relaxed
                      prose-li:text-slate-700 prose-li:my-0.5
                      prose-strong:text-slate-900
                      prose-table:text-xs prose-th:bg-slate-50 prose-th:px-3 prose-th:py-2 prose-td:px-3 prose-td:py-1.5">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{salesResult.aiReport}</ReactMarkdown>
                    </div>
                  </div>
                )}

                {/* 푸터 */}
                <div className="text-center text-xs text-slate-400 py-3 border-t border-slate-200">
                  분석일시: {new Date(salesResult.analyzedAt).toLocaleString('ko-KR')}
                  {' · '}데이터 기간: {salesResult.overview.period.from} ~ {salesResult.overview.period.to}
                  {salesResult.kprosDataAvailable && ' · KPROS 재고 연동 완료'}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
