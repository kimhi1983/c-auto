/**
 * Dropbox 기반 재고 데이터 서비스
 * KPROS ERP 대신 Dropbox의 최신 Excel 파일에서 재고 데이터를 읽어옴
 */
import type { Env } from '../types';
import type { KprosStockItem, KprosStockAggregated } from './kpros';
import { isDropboxConfigured, getDropboxAccessToken, listDropboxFolder, downloadDropboxFile } from './dropbox';
import { parseXlsx } from '../utils/xlsx-reader';

const KV_STOCK_KEY = 'kpros:stock_data'; // 기존 캐시 키 재사용
const STOCK_CACHE_TTL = 60 * 30; // 30분
const DROPBOX_STOCK_FOLDER = '/AI업무폴더/E.재고현황';

/**
 * 문자열 기반 안정 해시 → productIdx/warehouseIdx 대체
 */
function stableHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * 재고 데이터 집계 (kpros.ts의 aggregateStock과 동일 로직)
 */
function aggregateStock(items: KprosStockItem[]): KprosStockAggregated {
  const totalQty = items.reduce((sum, i) => sum + (i.sumStockQty || 0), 0);
  const zeroStockCount = items.filter(i => !i.sumStockQty || i.sumStockQty === 0).length;

  // 창고별 집계
  const whMap = new Map<string, { itemCount: number; totalQty: number }>();
  for (const item of items) {
    const name = item.warehouseNm || '미지정';
    const curr = whMap.get(name) || { itemCount: 0, totalQty: 0 };
    curr.itemCount++;
    curr.totalQty += item.sumStockQty || 0;
    whMap.set(name, curr);
  }
  const warehouses = Array.from(whMap.entries())
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.totalQty - a.totalQty);

  // 브랜드별 집계
  const brMap = new Map<string, { itemCount: number; totalQty: number }>();
  for (const item of items) {
    const name = item.braNmList || '미지정';
    const curr = brMap.get(name) || { itemCount: 0, totalQty: 0 };
    curr.itemCount++;
    curr.totalQty += item.sumStockQty || 0;
    brMap.set(name, curr);
  }
  const brands = Array.from(brMap.entries())
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.totalQty - a.totalQty);

  return {
    items,
    totalCount: items.length,
    totalQty,
    warehouses,
    brands,
    zeroStockCount,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Dropbox에서 최신 재고 Excel 파일을 읽어 KprosStockAggregated 형식으로 반환
 */
export async function getDropboxStock(env: Env, forceRefresh = false): Promise<KprosStockAggregated> {
  // 캐시 확인
  if (!forceRefresh && env.CACHE) {
    const cached = await env.CACHE.get(KV_STOCK_KEY, 'json') as KprosStockAggregated | null;
    if (cached) return cached;
  }

  if (!isDropboxConfigured(env)) {
    throw new Error('Dropbox 인증 정보가 설정되지 않았습니다');
  }

  // Dropbox 토큰 획득
  const token = await getDropboxAccessToken(env.CACHE!, env.DROPBOX_APP_KEY!, env.DROPBOX_APP_SECRET!);
  if (!token) {
    throw new Error('Dropbox 토큰 획득 실패');
  }

  // 폴더 목록 조회
  const files = await listDropboxFolder(token, DROPBOX_STOCK_FOLDER);

  // .xlsx 파일만 필터 → 최신순 정렬
  const xlsxFiles = files
    .filter(f => !f.is_folder && f.name.endsWith('.xlsx'))
    .sort((a, b) => (b.modified || '').localeCompare(a.modified || ''));

  if (xlsxFiles.length === 0) {
    throw new Error('Dropbox에 재고 Excel 파일이 없습니다');
  }

  // 최신 파일 다운로드
  const latestFile = xlsxFiles[0];
  const { data: xlsxData } = await downloadDropboxFile(token, latestFile.path);

  // XLSX 파싱
  const { headers, rows } = parseXlsx(xlsxData);

  if (headers.length === 0) {
    throw new Error('Excel 파일 파싱 실패: 헤더 없음');
  }

  // 컬럼 인덱스 매핑
  const colMap: Record<string, number> = {};
  const expectedCols = ['품명', '창고', '재고량', '단위', '제조사', '브랜드'];
  for (const col of expectedCols) {
    const idx = headers.indexOf(col);
    if (idx >= 0) colMap[col] = idx;
  }

  // KprosStockItem 배열 생성
  const rawItems: KprosStockItem[] = rows
    .filter(row => row.some(cell => cell && cell.trim() !== ''))
    .map(row => {
      const productNm = (colMap['품명'] !== undefined ? row[colMap['품명']] : '') || '';
      const warehouseNm = (colMap['창고'] !== undefined ? row[colMap['창고']] : '') || '';
      const qtyStr = colMap['재고량'] !== undefined ? row[colMap['재고량']] : '0';
      const sumStockQty = parseFloat(qtyStr) || 0;
      const pkgUnitNm = (colMap['단위'] !== undefined ? row[colMap['단위']] : '') || '';
      const manuNmList = (colMap['제조사'] !== undefined ? row[colMap['제조사']] : '') || null;
      const braNmList = (colMap['브랜드'] !== undefined ? row[colMap['브랜드']] : '') || null;

      return {
        productIdx: stableHash(productNm + '::' + warehouseNm),
        warehouseIdx: stableHash(warehouseNm),
        productNm,
        warehouseNm,
        sumStockQty,
        pkgUnitNm,
        manuNmList,
        braNmList,
      };
    });

  // 중복 제거: 동일 품명+창고 → 재고량 큰 항목 유지, 메타데이터 병합
  const dedup = new Map<string, KprosStockItem>();
  for (const item of rawItems) {
    const key = item.productNm + '::' + item.warehouseNm;
    const existing = dedup.get(key);
    if (!existing) {
      dedup.set(key, item);
    } else {
      if (item.sumStockQty > existing.sumStockQty) {
        existing.sumStockQty = item.sumStockQty;
      }
      if (!existing.manuNmList && item.manuNmList) existing.manuNmList = item.manuNmList;
      if (!existing.braNmList && item.braNmList) existing.braNmList = item.braNmList;
    }
  }
  const items = Array.from(dedup.values());

  const aggregated = aggregateStock(items);

  // 파일 정보 추가 (fetchedAt에 파일명 포함)
  aggregated.fetchedAt = latestFile.modified || new Date().toISOString();

  // 캐시 저장
  if (env.CACHE) {
    await env.CACHE.put(KV_STOCK_KEY, JSON.stringify(aggregated), { expirationTtl: STOCK_CACHE_TTL });
  }

  return aggregated;
}
