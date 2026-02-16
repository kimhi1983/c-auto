'use client';

import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';

interface InventoryRow {
  no: string;
  manufacturer: string;
  origin: string;
  productName: string;
  currentStock: number;
  monthlySales: number[];
  avgMonthlySales: number;
  monthsRemaining: number;
  status: 'urgent' | 'warning' | 'excess' | 'normal';
}

interface AnalysisResult {
  urgent: InventoryRow[];
  warning: InventoryRow[];
  excess: InventoryRow[];
  aiInsight?: string;
}

export default function InventoryPage() {
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [inventoryData, setInventoryData] = useState<InventoryRow[]>([]);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [analyzingAI, setAnalyzingAI] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseExcelFile = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData: any[][] = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

      // 헤더 찾기 (No, 제조사, 품명, 현재고가 있는 행)
      let headerRowIndex = -1;
      for (let i = 0; i < Math.min(15, jsonData.length); i++) {
        const row = jsonData[i];
        if (row && row.some((cell: any) => String(cell).includes('No')) &&
            row.some((cell: any) => String(cell).includes('제조사') || String(cell).includes('Manufacturer')) &&
            row.some((cell: any) => String(cell).includes('품명') || String(cell).includes('Product'))) {
          headerRowIndex = i;
          break;
        }
      }

      if (headerRowIndex === -1) {
        throw new Error('엑셀 파일에서 헤더를 찾을 수 없습니다. (No, 제조사, 품명 컬럼 필요)');
      }

      const headers: string[] = jsonData[headerRowIndex].map((h: any) => String(h || '').trim());

      // 컬럼 인덱스 찾기
      const noIdx = headers.findIndex(h => h.includes('No') || h === 'NO' || h === 'no');
      const mfrIdx = headers.findIndex(h => h.includes('제조사') || h.includes('Manufacturer'));
      const originIdx = headers.findIndex(h => h.includes('원산지') || h.includes('Origin'));
      const prodIdx = headers.findIndex(h => h.includes('품명') || h.includes('Product') || h.includes('품목'));
      const stockIdx = headers.findIndex(h => h.includes('현재고') || h.includes('재고') || h.includes('Stock'));

      // 월별 판매 컬럼들 찾기 (숫자나 월 표시가 있는 컬럼들)
      const salesIndices: number[] = [];
      for (let i = 0; i < headers.length; i++) {
        const h = headers[i];
        if (/\d+월|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|\d{1,2}\/|Month\d+/.test(h)) {
          salesIndices.push(i);
        }
      }

      // 데이터 행 파싱
      const rows: InventoryRow[] = [];
      for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (!row || row.length === 0) continue;

        const noVal = row[noIdx];
        const prodName = row[prodIdx];
        if (!noVal && !prodName) continue; // 빈 행 스킵

        const currentStock = parseFloat(row[stockIdx]) || 0;
        const monthlySales = salesIndices.map(idx => parseFloat(row[idx]) || 0);
        const avgMonthlySales = monthlySales.length > 0
          ? monthlySales.reduce((a, b) => a + b, 0) / monthlySales.length
          : 0;

        const monthsRemaining = avgMonthlySales > 0 ? currentStock / avgMonthlySales : 999;

        let status: 'urgent' | 'warning' | 'excess' | 'normal' = 'normal';
        if (monthsRemaining <= 1) status = 'urgent';
        else if (monthsRemaining <= 2) status = 'warning';
        else if (monthsRemaining >= 6) status = 'excess';

        rows.push({
          no: String(row[noIdx] || ''),
          manufacturer: String(row[mfrIdx] || '-'),
          origin: String(row[originIdx] || '-'),
          productName: String(row[prodIdx] || ''),
          currentStock,
          monthlySales,
          avgMonthlySales,
          monthsRemaining,
          status,
        });
      }

      if (rows.length === 0) {
        throw new Error('파싱된 재고 데이터가 없습니다.');
      }

      return rows;
    } catch (err: any) {
      throw new Error(`엑셀 파싱 오류: ${err.message}`);
    }
  };

  const processFile = async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setError('엑셀 파일(.xlsx, .xls)만 업로드 가능합니다.');
      return;
    }

    setFileName(file.name);
    setLoading(true);
    setError('');
    setInventoryData([]);
    setShowAnalysis(false);
    setAnalysisResult(null);

    try {
      const data = await parseExcelFile(file);
      setInventoryData(data);
      setLoading(false);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await processFile(file);
  };

  const runAIAnalysis = async () => {
    if (inventoryData.length === 0) return;

    setAnalyzingAI(true);
    setShowAnalysis(true);

    const urgent = inventoryData.filter(r => r.status === 'urgent');
    const warning = inventoryData.filter(r => r.status === 'warning');
    const excess = inventoryData.filter(r => r.status === 'excess');

    setAnalysisResult({ urgent, warning, excess });

    try {
      const prompt = `다음은 KPROS의 현재 재고 분석 결과입니다:

**긴급 발주 필요 (1개월 이내 소진)**: ${urgent.length}개 품목
${urgent.slice(0, 5).map(r => `- ${r.productName} (현재고: ${r.currentStock}, 월평균 판매: ${r.avgMonthlySales.toFixed(1)}, ${r.monthsRemaining.toFixed(1)}개월분)`).join('\n')}

**발주 검토 필요 (1-2개월)**: ${warning.length}개 품목
${warning.slice(0, 5).map(r => `- ${r.productName} (현재고: ${r.currentStock}, 월평균 판매: ${r.avgMonthlySales.toFixed(1)}, ${r.monthsRemaining.toFixed(1)}개월분)`).join('\n')}

**과다 재고 (6개월 이상)**: ${excess.length}개 품목
${excess.slice(0, 5).map(r => `- ${r.productName} (현재고: ${r.currentStock}, 월평균 판매: ${r.avgMonthlySales.toFixed(1)}, ${r.monthsRemaining.toFixed(1)}개월분)`).join('\n')}

총 ${inventoryData.length}개 품목 중, 긴급 ${urgent.length}개, 검토 ${warning.length}개, 과다 ${excess.length}개입니다.

CFO 관점에서 실질적인 재고 관리 조언을 3-4문장으로 요약해주세요.`;

      const res = await fetch('https://c-auto-workers-api.kimhi1983.workers.dev/api/v1/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          systemPrompt: '당신은 KPROS의 재고 관리 전문가입니다. CFO 관점에서 실질적이고 명확한 조언을 제공합니다.',
          maxTokens: 1024,
        }),
      });

      if (!res.ok) throw new Error('AI 분석 요청 실패');

      const result = await res.json();
      setAnalysisResult(prev => prev ? { ...prev, aiInsight: result.analysis } : null);
    } catch (err: any) {
      console.error('AI 분석 오류:', err);
      setAnalysisResult(prev => prev ? { ...prev, aiInsight: 'AI 분석 중 오류가 발생했습니다.' } : null);
    } finally {
      setAnalyzingAI(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'urgent': return <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-semibold rounded">🔴 긴급</span>;
      case 'warning': return <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-semibold rounded">🟡 검토</span>;
      case 'excess': return <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-semibold rounded">🔵 과다</span>;
      default: return <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded">🟢 양호</span>;
    }
  };

  return (
    <div className="flex h-full">
      {/* Main Content */}
      <div className={`flex-1 space-y-6 transition-all duration-300 ${showAnalysis ? 'mr-96' : ''}`}>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">재고 관리</h1>
          <p className="text-sm text-slate-500 mt-1">재고일람표 업로드 후 AI 분석</p>
        </div>

        {/* Upload Area */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`bg-white rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
            isDragging
              ? 'border-blue-500 bg-blue-50'
              : 'border-slate-300 hover:border-slate-400'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileUpload}
            className="hidden"
          />

          <div className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>

            {isDragging ? (
              <p className="text-lg font-semibold text-blue-600">파일을 여기에 놓으세요</p>
            ) : (
              <>
                <p className="text-slate-700 font-medium">
                  재고일람표 엑셀 파일을 드래그하거나 클릭하여 업로드
                </p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                  className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition"
                >
                  {loading ? '처리 중...' : '📁 파일 선택'}
                </button>
              </>
            )}

            {fileName && (
              <div className="mt-2 px-4 py-2 bg-slate-100 rounded-lg">
                <p className="text-sm text-slate-700">
                  <span className="font-semibold">선택된 파일:</span> {fileName}
                </p>
              </div>
            )}

            <p className="text-xs text-slate-400 mt-2">
              지원 형식: .xlsx, .xls
            </p>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg border border-red-200">
            ⚠️ {error}
          </div>
        )}

        {/* Inventory Table */}
        {inventoryData.length > 0 && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">재고 현황 ({inventoryData.length}개 품목)</h2>
              <button
                onClick={runAIAnalysis}
                disabled={analyzingAI}
                className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 transition"
              >
                {analyzingAI ? '🤖 AI 분석 중...' : '🤖 AI 재고 분석'}
              </button>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">No</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">제조사</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">품명</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-700">현재고</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-700">월평균 판매</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-700">재고 (개월)</th>
                      <th className="px-4 py-3 text-center font-semibold text-slate-700">상태</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {inventoryData.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-slate-600">{row.no}</td>
                        <td className="px-4 py-3 text-slate-600">{row.manufacturer}</td>
                        <td className="px-4 py-3 text-slate-900 font-medium">{row.productName}</td>
                        <td className="px-4 py-3 text-right text-slate-900 font-semibold">{row.currentStock.toFixed(0)}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{row.avgMonthlySales.toFixed(1)}</td>
                        <td className="px-4 py-3 text-right text-slate-600">
                          {row.monthsRemaining >= 100 ? '∞' : row.monthsRemaining.toFixed(1)}
                        </td>
                        <td className="px-4 py-3 text-center">{getStatusBadge(row.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {inventoryData.length === 0 && !loading && !error && (
          <div className="bg-slate-50 rounded-lg p-12 text-center text-slate-500">
            <svg className="w-16 h-16 mx-auto mb-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <p className="text-lg font-medium">재고 데이터가 없습니다</p>
            <p className="text-sm mt-1">위에서 재고일람표 엑셀 파일을 업로드해주세요</p>
          </div>
        )}
      </div>

      {/* Side Panel - AI Analysis */}
      {showAnalysis && analysisResult && (
        <div className="fixed right-0 top-0 w-96 h-full bg-white border-l border-slate-200 shadow-2xl overflow-y-auto z-50">
          <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-blue-600 text-white p-6 shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl font-bold">🤖 AI 재고 분석</h2>
              <button
                onClick={() => setShowAnalysis(false)}
                className="text-white/80 hover:text-white transition"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-sm text-white/90">
              총 {inventoryData.length}개 품목 분석 완료
            </p>
          </div>

          <div className="p-6 space-y-6">
            {/* Urgent Items */}
            <div>
              <h3 className="text-lg font-bold text-red-700 mb-3">
                🔴 긴급 발주 필요 ({analysisResult.urgent.length}개)
              </h3>
              {analysisResult.urgent.length === 0 ? (
                <p className="text-sm text-slate-500">긴급 발주가 필요한 품목이 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {analysisResult.urgent.slice(0, 10).map((item, idx) => (
                    <div key={idx} className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <p className="font-semibold text-slate-900 text-sm">{item.productName}</p>
                      <div className="flex justify-between text-xs text-slate-600 mt-1">
                        <span>현재고: {item.currentStock}</span>
                        <span>월평균: {item.avgMonthlySales.toFixed(1)}</span>
                        <span className="font-semibold text-red-600">{item.monthsRemaining.toFixed(1)}개월분</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Warning Items */}
            <div>
              <h3 className="text-lg font-bold text-yellow-700 mb-3">
                🟡 발주 검토 필요 ({analysisResult.warning.length}개)
              </h3>
              {analysisResult.warning.length === 0 ? (
                <p className="text-sm text-slate-500">발주 검토가 필요한 품목이 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {analysisResult.warning.slice(0, 10).map((item, idx) => (
                    <div key={idx} className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                      <p className="font-semibold text-slate-900 text-sm">{item.productName}</p>
                      <div className="flex justify-between text-xs text-slate-600 mt-1">
                        <span>현재고: {item.currentStock}</span>
                        <span>월평균: {item.avgMonthlySales.toFixed(1)}</span>
                        <span className="font-semibold text-yellow-600">{item.monthsRemaining.toFixed(1)}개월분</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Excess Items */}
            <div>
              <h3 className="text-lg font-bold text-blue-700 mb-3">
                🔵 과다 재고 ({analysisResult.excess.length}개)
              </h3>
              {analysisResult.excess.length === 0 ? (
                <p className="text-sm text-slate-500">과다 재고 품목이 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {analysisResult.excess.slice(0, 10).map((item, idx) => (
                    <div key={idx} className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="font-semibold text-slate-900 text-sm">{item.productName}</p>
                      <div className="flex justify-between text-xs text-slate-600 mt-1">
                        <span>현재고: {item.currentStock}</span>
                        <span>월평균: {item.avgMonthlySales.toFixed(1)}</span>
                        <span className="font-semibold text-blue-600">
                          {item.monthsRemaining >= 100 ? '∞' : `${item.monthsRemaining.toFixed(1)}개월분`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* AI Insight */}
            {analyzingAI && (
              <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-600"></div>
                  <p className="text-sm text-slate-600">AI가 인사이트를 생성하고 있습니다...</p>
                </div>
              </div>
            )}

            {analysisResult.aiInsight && (
              <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-4">
                <h3 className="font-bold text-slate-900 mb-2 flex items-center gap-2">
                  <span className="text-lg">💡</span>
                  AI 인사이트
                </h3>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {analysisResult.aiInsight}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
