'use client';

import { useEffect, useState } from 'react';

interface InventoryItem {
  name: string;
  stock: number;
  unit: string;
}

interface Transaction {
  item_name: string;
  quantity: number;
  type: string;
  note: string;
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [txLoading, setTxLoading] = useState(false);
  const [tx, setTx] = useState<Transaction>({
    item_name: '',
    quantity: 0,
    type: '입고',
    note: '',
  });

  const loadInventory = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/inventory');
      if (!response.ok) throw new Error('재고 조회 실패');
      const data = await response.json();

      if (data.status === 'success' && data.data) {
        setItems(
          data.data.map((item: any) => ({
            name: item['품목명'] || item.name || '',
            stock: parseInt(item['현재고'] || item.stock || '0'),
            unit: item['단위'] || item.unit || '개',
          }))
        );
      }
    } catch (err: any) {
      setError(err.message || '재고를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInventory();
  }, []);

  const handleTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tx.item_name || tx.quantity <= 0) return;

    setTxLoading(true);
    setError('');

    try {
      const response = await fetch('/api/inventory/transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_name: tx.item_name,
          quantity: tx.quantity,
          transaction_type: tx.type,
          note: tx.note,
        }),
      });

      if (!response.ok) throw new Error('처리 실패');
      const data = await response.json();

      if (data.status === 'success') {
        setShowForm(false);
        setTx({ item_name: '', quantity: 0, type: '입고', note: '' });
        loadInventory();
      } else {
        throw new Error(data.message || '처리 실패');
      }
    } catch (err: any) {
      setError(err.message || '입출고 처리에 실패했습니다.');
    } finally {
      setTxLoading(false);
    }
  };

  const getStockColor = (stock: number) => {
    if (stock <= 5) return 'text-red-600 bg-red-50';
    if (stock <= 20) return 'text-yellow-600 bg-yellow-50';
    return 'text-green-600 bg-green-50';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">재고 관리</h1>
          <p className="text-slate-500 mt-1">실시간 재고 현황 및 입출고 관리</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={loadInventory}
            disabled={loading}
            className="px-4 py-2.5 rounded-2xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
          >
            새로고침
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2.5 rounded-2xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition"
          >
            {showForm ? '취소' : '입출고 등록'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-2xl text-sm border border-red-200">
          {error}
        </div>
      )}

      {/* Transaction Form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="text-base font-semibold text-slate-900 mb-4">입출고 등록</h3>
          <form onSubmit={handleTransaction} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">품목명</label>
              <select
                value={tx.item_name}
                onChange={(e) => setTx({ ...tx, item_name: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-200 focus:outline-none"
                required
              >
                <option value="">선택</option>
                {items.map((item, i) => (
                  <option key={i} value={item.name}>{item.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">유형</label>
              <select
                value={tx.type}
                onChange={(e) => setTx({ ...tx, type: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-200 focus:outline-none"
              >
                <option value="입고">입고</option>
                <option value="출고">출고</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">수량</label>
              <input
                type="number"
                min="1"
                value={tx.quantity || ''}
                onChange={(e) => setTx({ ...tx, quantity: parseInt(e.target.value) || 0 })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-200 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">비고</label>
              <input
                type="text"
                value={tx.note}
                onChange={(e) => setTx({ ...tx, note: e.target.value })}
                placeholder="메모"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-200 focus:outline-none"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={txLoading}
                className="w-full px-4 py-2 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition disabled:opacity-50"
              >
                {txLoading ? '처리 중...' : '등록'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Inventory Table */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="text-sm text-slate-400">재고 정보를 불러오는 중...</div>
        </div>
      ) : items.length > 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">품목명</th>
                <th className="text-center px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">현재고</th>
                <th className="text-center px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">단위</th>
                <th className="text-center px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item, i) => (
                <tr key={i} className="hover:bg-slate-50 transition">
                  <td className="px-6 py-4 text-sm font-medium text-slate-900">{item.name}</td>
                  <td className="px-6 py-4 text-center text-sm font-semibold text-slate-700">{item.stock}</td>
                  <td className="px-6 py-4 text-center text-sm text-slate-500">{item.unit}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${getStockColor(item.stock)}`}>
                      {item.stock <= 5 ? '부족' : item.stock <= 20 ? '주의' : '정상'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="text-4xl mb-3">📦</div>
          <h3 className="text-lg font-semibold text-slate-900 mb-1">재고 데이터가 없습니다</h3>
          <p className="text-sm text-slate-500">재고 엑셀 파일이 설정되어 있는지 확인하세요.</p>
        </div>
      )}
    </div>
  );
}
