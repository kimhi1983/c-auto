'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiUrl, authHeaders, authJsonHeaders } from '@/lib/api';

// ─── Types ───

interface Commodity {
  id: string;
  name: string;
  category: string;
  currentPrice: string;
  previousPrice: string;
  unit: string;
  trend: 'up' | 'down' | 'stable';
}

interface CompanyData {
  id: string;
  name: string;
  description: string;
  metrics: { label: string; value: string }[];
}

interface SavedReport {
  id: string;
  title: string;
  issueLabel: string;
  date: string;
  savedAt: string;
}

// ─── Default Data ───

const DEFAULT_COMMODITIES: Commodity[] = [
  // 유지류
  { id: '1', name: 'CPO (Crude Palm Oil)', category: '유지류', currentPrice: '', previousPrice: '', unit: 'USD/MT', trend: 'stable' },
  { id: '2', name: 'Palm Kernel Oil', category: '유지류', currentPrice: '', previousPrice: '', unit: 'USD/MT', trend: 'stable' },
  { id: '3', name: 'Coconut Oil', category: '유지류', currentPrice: '', previousPrice: '', unit: 'USD/MT', trend: 'stable' },
  { id: '4', name: 'Castor Oil', category: '유지류', currentPrice: '', previousPrice: '', unit: 'USD/MT', trend: 'stable' },
  { id: '5', name: 'Shea Butter', category: '유지류', currentPrice: '', previousPrice: '', unit: 'USD/MT', trend: 'stable' },
  { id: '6', name: 'Jojoba Oil', category: '유지류', currentPrice: '', previousPrice: '', unit: 'USD/kg', trend: 'stable' },
  // 실리콘
  { id: '7', name: 'Silicone Oil (Dimethicone)', category: '실리콘', currentPrice: '', previousPrice: '', unit: 'USD/kg', trend: 'stable' },
  { id: '8', name: 'Cyclomethicone (D5)', category: '실리콘', currentPrice: '', previousPrice: '', unit: 'USD/kg', trend: 'stable' },
  // 보습제/용제
  { id: '9', name: 'Glycerin (정제)', category: '보습제', currentPrice: '', previousPrice: '', unit: 'USD/MT', trend: 'stable' },
  { id: '10', name: 'Squalane', category: '보습제', currentPrice: '', previousPrice: '', unit: 'USD/kg', trend: 'stable' },
  { id: '11', name: 'Butylene Glycol (1,3-BG)', category: '보습제', currentPrice: '', previousPrice: '', unit: 'USD/MT', trend: 'stable' },
  { id: '12', name: 'Propylene Glycol', category: '보습제', currentPrice: '', previousPrice: '', unit: 'USD/MT', trend: 'stable' },
  // 지방산/유화제
  { id: '13', name: 'Stearic Acid', category: '지방산', currentPrice: '', previousPrice: '', unit: 'USD/MT', trend: 'stable' },
  { id: '14', name: 'Lauric Acid', category: '지방산', currentPrice: '', previousPrice: '', unit: 'USD/MT', trend: 'stable' },
  { id: '15', name: 'Cetyl Alcohol', category: '유화제', currentPrice: '', previousPrice: '', unit: 'USD/kg', trend: 'stable' },
  { id: '16', name: 'Cetearyl Alcohol', category: '유화제', currentPrice: '', previousPrice: '', unit: 'USD/kg', trend: 'stable' },
  // 기능성 원료
  { id: '17', name: 'Hyaluronic Acid', category: '기능성', currentPrice: '', previousPrice: '', unit: 'USD/kg', trend: 'stable' },
  { id: '18', name: 'Niacinamide (Vitamin B3)', category: '기능성', currentPrice: '', previousPrice: '', unit: 'USD/kg', trend: 'stable' },
  { id: '19', name: 'Ascorbic Acid (Vitamin C)', category: '기능성', currentPrice: '', previousPrice: '', unit: 'USD/kg', trend: 'stable' },
  { id: '20', name: 'Tocopherol (Vitamin E)', category: '기능성', currentPrice: '', previousPrice: '', unit: 'USD/kg', trend: 'stable' },
  { id: '21', name: 'Adenosine', category: '기능성', currentPrice: '', previousPrice: '', unit: 'USD/kg', trend: 'stable' },
  { id: '22', name: 'Collagen Peptide', category: '기능성', currentPrice: '', previousPrice: '', unit: 'USD/kg', trend: 'stable' },
  { id: '23', name: 'Retinol', category: '기능성', currentPrice: '', previousPrice: '', unit: 'USD/g', trend: 'stable' },
  // 안료/무기원료
  { id: '24', name: 'Titanium Dioxide', category: '안료', currentPrice: '', previousPrice: '', unit: 'USD/kg', trend: 'stable' },
  { id: '25', name: 'Zinc Oxide', category: '안료', currentPrice: '', previousPrice: '', unit: 'USD/kg', trend: 'stable' },
  { id: '26', name: 'Iron Oxide', category: '안료', currentPrice: '', previousPrice: '', unit: 'USD/kg', trend: 'stable' },
  // 왁스/방부제
  { id: '27', name: 'Beeswax (밀랍)', category: '왁스', currentPrice: '', previousPrice: '', unit: 'USD/kg', trend: 'stable' },
  { id: '28', name: 'Phenoxyethanol', category: '방부제', currentPrice: '', previousPrice: '', unit: 'USD/kg', trend: 'stable' },
  // 석유화학
  { id: '29', name: 'Naphtha', category: '석유화학', currentPrice: '', previousPrice: '', unit: 'USD/MT', trend: 'stable' },
  { id: '30', name: 'Ethanol (화장품용)', category: '용제', currentPrice: '', previousPrice: '', unit: 'USD/MT', trend: 'stable' },
];

type InputTab = 'trend' | 'issues';

export default function MarketReportPage() {
  const [inputTab, setInputTab] = useState<InputTab>('trend');

  // Basic info
  const [reportTitle, setReportTitle] = useState('KPROS Market Intelligence');
  const [issueLabel, setIssueLabel] = useState('');
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);

  // Weekly Trend
  const [commodities, setCommodities] = useState<Commodity[]>(DEFAULT_COMMODITIES);
  const [marketNotes, setMarketNotes] = useState('');
  const [materialNews, setMaterialNews] = useState('');

  // Important Issues
  const [industryOverview, setIndustryOverview] = useState('');
  const [companies, setCompanies] = useState<CompanyData[]>([
    { id: '1', name: '', description: '', metrics: [
      { label: '매출액', value: '' },
      { label: '영업이익', value: '' },
      { label: '영업이익률', value: '' },
    ]},
  ]);

  // Generation
  const [generating, setGenerating] = useState(false);
  const [generatedReport, setGeneratedReport] = useState('');
  const [copied, setCopied] = useState(false);

  // Research
  const [researching, setResearching] = useState(false);

  // Save/History
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // ─── Commodity handlers ───

  const updateCommodity = (id: string, field: keyof Commodity, value: string) => {
    setCommodities(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const addCommodity = () => {
    setCommodities(prev => [...prev, {
      id: String(Date.now()),
      name: '', category: '', currentPrice: '', previousPrice: '', unit: 'USD/MT', trend: 'stable' as const,
    }]);
  };

  const removeCommodity = (id: string) => {
    setCommodities(prev => prev.filter(c => c.id !== id));
  };

  // ─── Company handlers ───

  const addCompany = () => {
    setCompanies(prev => [...prev, {
      id: String(Date.now()), name: '', description: '',
      metrics: [{ label: '매출액', value: '' }, { label: '영업이익', value: '' }, { label: '영업이익률', value: '' }],
    }]);
  };

  const removeCompany = (id: string) => {
    setCompanies(prev => prev.filter(c => c.id !== id));
  };

  const updateCompany = (id: string, field: 'name' | 'description', value: string) => {
    setCompanies(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const updateMetric = (companyId: string, idx: number, field: 'label' | 'value', val: string) => {
    setCompanies(prev => prev.map(c => {
      if (c.id !== companyId) return c;
      const metrics = [...c.metrics];
      metrics[idx] = { ...metrics[idx], [field]: val };
      return { ...c, metrics };
    }));
  };

  const addMetric = (companyId: string) => {
    setCompanies(prev => prev.map(c => {
      if (c.id !== companyId) return c;
      return { ...c, metrics: [...c.metrics, { label: '', value: '' }] };
    }));
  };

  const removeMetric = (companyId: string, idx: number) => {
    setCompanies(prev => prev.map(c => {
      if (c.id !== companyId) return c;
      return { ...c, metrics: c.metrics.filter((_, i) => i !== idx) };
    }));
  };

  // ─── History ───

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch(apiUrl('/api/v1/market-report/history'), { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setSavedReports(data.reports || []);
      }
    } catch { /* ignore */ } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // ─── Save ───

  const handleSave = async () => {
    if (!generatedReport) return;
    setSaving(true);
    try {
      const res = await fetch(apiUrl('/api/v1/market-report/save'), {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify({
          title: reportTitle,
          issueLabel,
          date: reportDate,
          content: generatedReport,
        }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
        loadHistory();
      }
    } catch {
      alert('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // ─── Load saved ───

  const handleLoadSaved = async (id: string) => {
    setLoadingSaved(id);
    try {
      const res = await fetch(apiUrl(`/api/v1/market-report/saved/${id}`), { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setGeneratedReport(data.data?.content || '');
        if (data.data?.title) setReportTitle(data.data.title);
        if (data.data?.issueLabel) setIssueLabel(data.data.issueLabel);
        if (data.data?.date) setReportDate(data.data.date);
      }
    } catch {
      alert('보고서를 불러올 수 없습니다.');
    } finally {
      setLoadingSaved(null);
    }
  };

  // ─── Delete saved ───

  const handleDeleteSaved = async (id: string) => {
    if (!confirm('이 보고서를 삭제하시겠습니까?')) return;
    try {
      await fetch(apiUrl(`/api/v1/market-report/saved/${id}`), {
        method: 'DELETE',
        headers: authHeaders(),
      });
      setSavedReports(prev => prev.filter(r => r.id !== id));
    } catch { /* ignore */ }
  };

  // ─── AI Research ───

  const handleResearch = async () => {
    setResearching(true);
    try {
      const commodityNames = commodities.filter(c => c.name.trim()).map(c => c.name);
      const res = await fetch(apiUrl('/api/v1/market-report/research'), {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify({ commodityNames, date: reportDate }),
      });
      if (!res.ok) throw new Error('조사 실패');
      const json = await res.json();
      const data = json.data;

      if (data?.parseError && data?.raw) {
        // JSON 파싱 실패 시 시장 메모에 원문 넣기
        setMarketNotes(data.raw);
        return;
      }

      // 원자재 시세 업데이트
      if (data?.commodities?.length) {
        setCommodities(prev => prev.map(c => {
          const match = data.commodities.find(
            (r: { name: string }) => c.name.toLowerCase().includes(r.name.toLowerCase().split(' ')[0]) ||
              r.name.toLowerCase().includes(c.name.toLowerCase().split(' ')[0])
          );
          if (!match) return c;
          return {
            ...c,
            currentPrice: match.estimatedPrice || c.currentPrice,
            previousPrice: match.previousPrice || c.previousPrice,
            trend: (['up', 'down', 'stable'].includes(match.trend) ? match.trend : c.trend) as 'up' | 'down' | 'stable',
          };
        }));
      }

      // 텍스트 섹션 업데이트
      if (data?.marketNotes) setMarketNotes(data.marketNotes);
      if (data?.materialNews) setMaterialNews(data.materialNews);
      if (data?.industryOverview) setIndustryOverview(data.industryOverview);

    } catch {
      alert('AI 시세 조사에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setResearching(false);
    }
  };

  // ─── Generate ───

  const handleGenerate = async () => {
    setSaved(false);
    setGenerating(true);
    try {
      const res = await fetch(apiUrl('/api/v1/market-report/generate'), {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify({
          title: reportTitle,
          issueLabel,
          date: reportDate,
          commodities: commodities.filter(c => c.name.trim()),
          marketNotes,
          materialNews,
          industryOverview,
          companies: companies.filter(c => c.name.trim()),
        }),
      });
      if (!res.ok) throw new Error('생성 실패');
      const data = await res.json();
      setGeneratedReport(data.data?.content || '');
    } catch {
      alert('보고서 생성에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setGenerating(false);
    }
  };

  // ─── Export Excel ───

  const handleExportExcel = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();

    // Sheet 1: Commodities
    const cmData = commodities.filter(c => c.name).map(c => ({
      '원자재': c.name,
      '분류': c.category,
      '현재가': c.currentPrice,
      '전주가': c.previousPrice,
      '단위': c.unit,
      '추세': c.trend === 'up' ? '▲ 상승' : c.trend === 'down' ? '▼ 하락' : '─ 보합',
    }));
    if (cmData.length) {
      const ws1 = XLSX.utils.json_to_sheet(cmData);
      ws1['!cols'] = [{ wch: 28 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }];
      XLSX.utils.book_append_sheet(wb, ws1, '원자재 시세');
    }

    // Sheet 2: Market analysis
    const analysisRows = [
      ['[시장 동향 분석]'], [''],
      ...(marketNotes ? marketNotes.split('\n').map(l => [l]) : [['(입력된 내용 없음)']]),
      [''], ['[화장품 원료 뉴스/이슈]'], [''],
      ...(materialNews ? materialNews.split('\n').map(l => [l]) : [['(입력된 내용 없음)']]),
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(analysisRows);
    ws2['!cols'] = [{ wch: 80 }];
    XLSX.utils.book_append_sheet(wb, ws2, '시장 분석');

    // Sheet 3: Issues
    const issueRows: string[][] = [['[업종 동향]'], ['']];
    if (industryOverview) industryOverview.split('\n').forEach(l => issueRows.push([l]));
    issueRows.push(['']);
    companies.filter(c => c.name).forEach(c => {
      issueRows.push([`[${c.name}]`]);
      if (c.description) c.description.split('\n').forEach(l => issueRows.push([l]));
      c.metrics.filter(m => m.label && m.value).forEach(m => issueRows.push([`  ${m.label}: ${m.value}`]));
      issueRows.push(['']);
    });
    const ws3 = XLSX.utils.aoa_to_sheet(issueRows);
    ws3['!cols'] = [{ wch: 60 }];
    XLSX.utils.book_append_sheet(wb, ws3, '주요 이슈');

    // Sheet 4: AI Report
    if (generatedReport) {
      const lines = generatedReport.split('\n').map(l => [l]);
      const ws4 = XLSX.utils.aoa_to_sheet(lines);
      ws4['!cols'] = [{ wch: 100 }];
      XLSX.utils.book_append_sheet(wb, ws4, 'AI 보고서');
    }

    XLSX.writeFile(wb, `시장자료_${reportDate.replace(/-/g, '')}.xlsx`);
  };

  // ─── Copy ───

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedReport);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filledCommodities = commodities.filter(c => c.name.trim()).length;
  const filledCompanies = companies.filter(c => c.name.trim()).length;
  const hasContent = filledCommodities > 0 || marketNotes || materialNews || industryOverview || filledCompanies > 0;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">시장자료 생성기</h1>
          <p className="text-sm text-slate-500 mt-1">화장품 원자재 시세, 업종 동향, 기업 분석 보고서를 AI로 생성합니다</p>
        </div>
        <div className="flex gap-2 shrink-0">
          {generatedReport && (
            <>
              <button
                onClick={handleSave}
                disabled={saving}
                className={`px-4 py-2 text-sm font-medium rounded-xl transition shadow-sm ${
                  saved
                    ? 'text-green-700 bg-green-50 border border-green-200'
                    : 'text-slate-700 bg-white border border-slate-200 hover:bg-slate-50'
                }`}
              >
                {saving ? '저장 중...' : saved ? '저장됨!' : '저장'}
              </button>
              <button
                onClick={handleExportExcel}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition shadow-sm"
              >
                Excel 내보내기
              </button>
              <button
                onClick={handleCopy}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition shadow-sm"
              >
                {copied ? '복사됨!' : '텍스트 복사'}
              </button>
            </>
          )}
          <button
            onClick={handleResearch}
            disabled={researching}
            className="px-5 py-2 text-sm font-semibold text-brand-700 bg-brand-50 border border-brand-200 rounded-xl hover:bg-brand-100 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
          >
            {researching ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-brand-300 border-t-brand-600 rounded-full animate-spin" />
                AI 조사 중...
              </span>
            ) : 'AI 시세 조사'}
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating || !hasContent}
            className="px-5 py-2 text-sm font-semibold text-white bg-brand-600 rounded-xl hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
          >
            {generating ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                AI 생성 중...
              </span>
            ) : 'AI 보고서 생성'}
          </button>
        </div>
      </div>

      {/* Basic Info */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">보고서 제목</label>
            <input
              type="text"
              value={reportTitle}
              onChange={e => setReportTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none"
              placeholder="KPROS Market Intelligence"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">호수/번호</label>
            <input
              type="text"
              value={issueLabel}
              onChange={e => setIssueLabel(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none"
              placeholder="2602-2"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">기준일</label>
            <input
              type="date"
              value={reportDate}
              onChange={e => setReportDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none"
            />
          </div>
        </div>
      </div>

      {/* Input Tabs */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex border-b border-slate-200">
          {([
            { id: 'trend' as const, label: '원자재 시세 동향', count: filledCommodities },
            { id: 'issues' as const, label: '업종 주요 이슈', count: filledCompanies },
          ]).map(tab => (
            <button
              key={tab.id}
              onClick={() => setInputTab(tab.id)}
              className={`flex-1 px-4 py-3.5 text-sm font-semibold transition ${
                inputTab === tab.id
                  ? 'text-brand-700 border-b-2 border-brand-600 bg-brand-50/30'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className="ml-2 px-1.5 py-0.5 rounded-full text-xs bg-brand-100 text-brand-700">{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        <div className="p-5">
          {/* ─── Tab 1: Commodity Trends ─── */}
          {inputTab === 'trend' && (
            <div className="space-y-6">
              {/* Commodity Table */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-slate-800">원자재 시세표</h3>
                  <div className="flex gap-3">
                    <button
                      onClick={handleResearch}
                      disabled={researching}
                      className="text-xs font-medium text-brand-600 hover:text-brand-700 transition flex items-center gap-1"
                    >
                      {researching ? (
                        <>
                          <span className="w-3 h-3 border-[1.5px] border-brand-300 border-t-brand-600 rounded-full animate-spin" />
                          조사 중...
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                          AI 자동 조사
                        </>
                      )}
                    </button>
                    <button onClick={addCommodity} className="text-xs font-medium text-slate-500 hover:text-slate-700 transition">
                      + 원자재 추가
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto -mx-5 px-5">
                  <table className="w-full text-sm min-w-[700px]">
                    <thead>
                      <tr className="bg-slate-50 text-slate-600">
                        <th className="px-3 py-2.5 text-left font-semibold text-xs rounded-tl-lg">원자재명</th>
                        <th className="px-3 py-2.5 text-left font-semibold text-xs w-24">분류</th>
                        <th className="px-3 py-2.5 text-left font-semibold text-xs w-28">현재가</th>
                        <th className="px-3 py-2.5 text-left font-semibold text-xs w-28">전주가</th>
                        <th className="px-3 py-2.5 text-left font-semibold text-xs w-24">단위</th>
                        <th className="px-3 py-2.5 text-center font-semibold text-xs w-24">추세</th>
                        <th className="px-3 py-2.5 w-10 rounded-tr-lg"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {commodities.map(c => (
                        <tr key={c.id} className="hover:bg-slate-50/50 group">
                          <td className="px-2 py-1.5">
                            <input type="text" value={c.name} onChange={e => updateCommodity(c.id, 'name', e.target.value)}
                              className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-brand-200 outline-none" placeholder="원자재명" />
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="text" value={c.category} onChange={e => updateCommodity(c.id, 'category', e.target.value)}
                              className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-brand-200 outline-none" placeholder="분류" />
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="text" value={c.currentPrice} onChange={e => updateCommodity(c.id, 'currentPrice', e.target.value)}
                              className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-brand-200 outline-none text-right" placeholder="0" />
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="text" value={c.previousPrice} onChange={e => updateCommodity(c.id, 'previousPrice', e.target.value)}
                              className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-brand-200 outline-none text-right" placeholder="0" />
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="text" value={c.unit} onChange={e => updateCommodity(c.id, 'unit', e.target.value)}
                              className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-brand-200 outline-none" />
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <select value={c.trend} onChange={e => updateCommodity(c.id, 'trend', e.target.value)}
                              className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-brand-200 outline-none bg-white">
                              <option value="up">▲ 상승</option>
                              <option value="down">▼ 하락</option>
                              <option value="stable">─ 보합</option>
                            </select>
                          </td>
                          <td className="px-2 py-1.5">
                            <button onClick={() => removeCommodity(c.id)}
                              className="text-slate-300 hover:text-red-500 transition p-1 opacity-0 group-hover:opacity-100">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Market Notes */}
              <div>
                <label className="block text-sm font-bold text-slate-800 mb-2">시장 동향 분석 메모</label>
                <textarea
                  value={marketNotes}
                  onChange={e => setMarketNotes(e.target.value)}
                  rows={5}
                  className="w-full px-4 py-3 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none resize-y"
                  placeholder={"원자재 가격 동향, 공급망 이슈, 환율 영향 등 시장 분석 내용을 입력하세요...\n\n예: CPO 가격은 인도네시아 수출규제 우려로 소폭 상승. 나프타는 중동 지정학적 리스크에도 불구하고 수요 둔화로 보합세..."}
                />
              </div>

              {/* Material News */}
              <div>
                <label className="block text-sm font-bold text-slate-800 mb-2">화장품 원료 관련 뉴스/이슈</label>
                <textarea
                  value={materialNews}
                  onChange={e => setMaterialNews(e.target.value)}
                  rows={5}
                  className="w-full px-4 py-3 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none resize-y"
                  placeholder={"화장품 원료 관련 뉴스, 규제 변경, 신소재 동향, 공급업체 이슈 등을 입력하세요...\n\n예: EU REACH 규정 강화로 실리콘 대체 원료 수요 증가. 히알루론산 가격 중국산 과잉공급으로 하락 추세..."}
                />
              </div>
            </div>
          )}

          {/* ─── Tab 2: Important Issues ─── */}
          {inputTab === 'issues' && (
            <div className="space-y-6">
              {/* Industry Overview */}
              <div>
                <label className="block text-sm font-bold text-slate-800 mb-2">업종 동향 개요</label>
                <textarea
                  value={industryOverview}
                  onChange={e => setIndustryOverview(e.target.value)}
                  rows={5}
                  className="w-full px-4 py-3 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none resize-y"
                  placeholder={"K-뷰티 업종 전반의 동향, 시장 트렌드, 수출 실적 등을 입력하세요...\n\n예: K-뷰티 수출 증가세 지속, 미국/일본 시장 성장 두드러져. 인디 브랜드 중심 ODM 수주 확대..."}
                />
              </div>

              {/* Company Analysis */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-slate-800">기업 분석</h3>
                  <button onClick={addCompany} className="text-xs font-medium text-brand-600 hover:text-brand-700 transition">
                    + 기업 추가
                  </button>
                </div>
                <div className="space-y-4">
                  {companies.map(company => (
                    <div key={company.id} className="border border-slate-200 rounded-xl p-4 bg-slate-50/30">
                      <div className="flex items-center justify-between mb-3">
                        <input
                          type="text"
                          value={company.name}
                          onChange={e => updateCompany(company.id, 'name', e.target.value)}
                          className="text-sm font-semibold px-3 py-1.5 border border-slate-200 rounded-lg bg-white focus:ring-1 focus:ring-brand-200 outline-none w-48"
                          placeholder="기업명"
                        />
                        <button onClick={() => removeCompany(company.id)}
                          className="text-slate-400 hover:text-red-500 transition p-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>

                      <textarea
                        value={company.description}
                        onChange={e => updateCompany(company.id, 'description', e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-1 focus:ring-brand-200 outline-none resize-y mb-3"
                        placeholder="기업 관련 뉴스, 실적 동향, 주요 이슈 등..."
                      />

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-500">재무 지표</span>
                          <button onClick={() => addMetric(company.id)} className="text-xs text-brand-600 hover:text-brand-700 transition">
                            + 지표 추가
                          </button>
                        </div>
                        {company.metrics.map((m, idx) => (
                          <div key={idx} className="flex gap-2 items-center">
                            <input
                              type="text" value={m.label}
                              onChange={e => updateMetric(company.id, idx, 'label', e.target.value)}
                              className="flex-1 px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:ring-1 focus:ring-brand-200 outline-none"
                              placeholder="지표명 (예: 매출액)"
                            />
                            <input
                              type="text" value={m.value}
                              onChange={e => updateMetric(company.id, idx, 'value', e.target.value)}
                              className="flex-1 px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:ring-1 focus:ring-brand-200 outline-none text-right"
                              placeholder="값 (예: 1,234억원)"
                            />
                            {company.metrics.length > 1 && (
                              <button onClick={() => removeMetric(company.id, idx)}
                                className="text-slate-300 hover:text-red-500 transition">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Saved Reports */}
      {savedReports.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-slate-50 transition"
          >
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-bold text-slate-800">저장된 보고서</span>
              <span className="px-1.5 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600 font-medium">{savedReports.length}</span>
            </div>
            <svg className={`w-4 h-4 text-slate-400 transition-transform ${showHistory ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showHistory && (
            <div className="border-t border-slate-200 divide-y divide-slate-100 max-h-64 overflow-y-auto">
              {savedReports.map(report => (
                <div key={report.id} className="px-5 py-3 flex items-center justify-between hover:bg-slate-50 group">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-800 truncate">{report.title}</span>
                      {report.issueLabel && (
                        <span className="text-xs text-slate-400 shrink-0">#{report.issueLabel}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      {report.date && <span className="text-xs text-slate-400">{report.date}</span>}
                      <span className="text-xs text-slate-400">
                        {report.savedAt ? new Date(report.savedAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0 ml-3">
                    <button
                      onClick={() => handleLoadSaved(report.id)}
                      disabled={loadingSaved === report.id}
                      className="text-xs font-medium text-brand-600 hover:text-brand-700 px-2.5 py-1.5 rounded-lg hover:bg-brand-50 transition"
                    >
                      {loadingSaved === report.id ? '불러오는 중...' : '불러오기'}
                    </button>
                    <button
                      onClick={() => handleDeleteSaved(report.id)}
                      className="text-xs font-medium text-slate-400 hover:text-red-500 px-2 py-1.5 rounded-lg hover:bg-red-50 transition opacity-0 group-hover:opacity-100"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Generated Report */}
      {generatedReport && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-brand-50/50 to-transparent flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full" />
              <h3 className="text-sm font-bold text-slate-800">AI 생성 보고서</h3>
            </div>
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={saving}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg transition ${
                  saved ? 'text-green-700 bg-green-100' : 'text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200'
                }`}>
                {saving ? '저장 중...' : saved ? '저장됨!' : '저장'}
              </button>
              <button onClick={handleExportExcel}
                className="text-xs font-medium text-slate-600 hover:text-slate-800 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 transition">
                Excel
              </button>
              <button onClick={handleCopy}
                className="text-xs font-medium text-slate-600 hover:text-slate-800 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 transition">
                {copied ? '복사됨!' : '복사'}
              </button>
            </div>
          </div>
          <div className="p-6">
            <div className="prose prose-sm max-w-none">
              {generatedReport.split('\n').map((line, i) => {
                if (line.startsWith('# ')) return <h1 key={i} className="text-xl font-bold text-slate-900 mt-6 mb-3 first:mt-0">{line.slice(2)}</h1>;
                if (line.startsWith('## ')) return <h2 key={i} className="text-lg font-bold text-slate-800 mt-5 mb-2 border-b border-slate-200 pb-2">{line.slice(3)}</h2>;
                if (line.startsWith('### ')) return <h3 key={i} className="text-base font-semibold text-slate-700 mt-4 mb-1.5">{line.slice(4)}</h3>;
                if (line.startsWith('#### ')) return <h4 key={i} className="text-sm font-semibold text-slate-600 mt-3 mb-1">{line.slice(5)}</h4>;
                if (line.startsWith('- ')) return <li key={i} className="text-sm text-slate-700 ml-4 mb-1 list-disc">{line.slice(2)}</li>;
                if (line.startsWith('|')) return <p key={i} className="text-sm text-slate-600 font-mono bg-slate-50 px-3 py-0.5 border-b border-slate-100">{line}</p>;
                if (line.startsWith('**') && line.endsWith('**')) return <p key={i} className="text-sm font-bold text-slate-800 mt-2">{line.slice(2, -2)}</p>;
                if (line.startsWith('> ')) return <blockquote key={i} className="text-sm text-slate-600 italic border-l-3 border-brand-300 pl-3 my-2">{line.slice(2)}</blockquote>;
                if (line.trim() === '') return <div key={i} className="h-2" />;
                if (line.startsWith('---')) return <hr key={i} className="my-4 border-slate-200" />;
                return <p key={i} className="text-sm text-slate-700 leading-relaxed mb-1">{line}</p>;
              })}
            </div>
          </div>
        </div>
      )}

      {/* Usage Guide */}
      {!generatedReport && (
        <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5">
          <h3 className="text-sm font-bold text-slate-700 mb-3">사용 가이드</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex gap-3">
              <div className="w-8 h-8 bg-brand-100 rounded-lg flex items-center justify-center shrink-0">
                <span className="text-brand-700 font-bold text-sm">1</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700">AI 시세 조사</p>
                <p className="text-xs text-slate-500 mt-0.5">AI가 원자재 시세, 시장 동향, 원료 뉴스를 자동으로 조사합니다</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-8 h-8 bg-brand-100 rounded-lg flex items-center justify-center shrink-0">
                <span className="text-brand-700 font-bold text-sm">2</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700">확인 및 수정</p>
                <p className="text-xs text-slate-500 mt-0.5">AI 조사 결과를 확인하고 필요시 수정합니다</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-8 h-8 bg-brand-100 rounded-lg flex items-center justify-center shrink-0">
                <span className="text-brand-700 font-bold text-sm">3</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700">AI 보고서 생성</p>
                <p className="text-xs text-slate-500 mt-0.5">입력 데이터 기반으로 전문 시장자료 보고서를 생성합니다</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
