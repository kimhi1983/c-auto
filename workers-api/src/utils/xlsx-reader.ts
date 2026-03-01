/**
 * 경량 XLSX 파서 — Cloudflare Workers 환경용
 * pako(inflateRaw)로 ZIP 엔트리 추출 → XML 파싱하여 2D 배열 반환
 */
import pako from 'pako';

interface ZipEntry {
  path: string;
  data: Uint8Array;
}

/**
 * ZIP 파일에서 엔트리 추출
 */
function extractZipEntries(zipData: Uint8Array): ZipEntry[] {
  const entries: ZipEntry[] = [];
  const view = new DataView(zipData.buffer, zipData.byteOffset, zipData.byteLength);
  let offset = 0;

  while (offset < zipData.length - 4) {
    const sig = view.getUint32(offset, true);
    if (sig !== 0x04034b50) break; // Local file header signature

    const compressionMethod = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const uncompressedSize = view.getUint32(offset + 22, true);
    const fileNameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);

    const fileNameBytes = zipData.slice(offset + 30, offset + 30 + fileNameLen);
    const fileName = new TextDecoder().decode(fileNameBytes);

    const dataStart = offset + 30 + fileNameLen + extraLen;
    const rawData = zipData.slice(dataStart, dataStart + compressedSize);

    let fileData: Uint8Array;
    if (compressionMethod === 8) {
      // Deflate
      fileData = pako.inflateRaw(rawData);
    } else if (compressionMethod === 0) {
      // Stored (no compression)
      fileData = rawData;
    } else {
      // 지원하지 않는 압축 → 스킵
      offset = dataStart + compressedSize;
      continue;
    }

    entries.push({ path: fileName, data: fileData });
    offset = dataStart + compressedSize;
  }

  return entries;
}

/**
 * 간단한 XML 텍스트 값 추출 (정규식 기반)
 */
function extractXmlValues(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'g');
  const values: string[] = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    values.push(match[1]);
  }
  return values;
}

/**
 * SharedStrings XML 파싱 → 문자열 배열
 */
function parseSharedStrings(xml: string): string[] {
  // <si> 안에 <t>text</t> 또는 <r><t>text</t></r> (rich text) 형태
  const siBlocks = extractXmlValues(xml, 'si');
  return siBlocks.map(si => {
    // 모든 <t> 태그의 내용을 연결 (rich text 대응)
    const tValues = extractXmlValues(si, 't');
    return tValues.join('');
  });
}

/**
 * XML 엔티티 디코딩
 */
function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * 셀 참조에서 컬럼 인덱스 추출 (A→0, B→1, ..., AA→26, ...)
 */
function colIndex(cellRef: string): number {
  const letters = cellRef.replace(/[0-9]/g, '');
  let idx = 0;
  for (let i = 0; i < letters.length; i++) {
    idx = idx * 26 + (letters.charCodeAt(i) - 64);
  }
  return idx - 1;
}

/**
 * XLSX 바이너리를 파싱하여 헤더 + 데이터 행 반환
 */
export function parseXlsx(data: Uint8Array): { headers: string[]; rows: string[][] } {
  const entries = extractZipEntries(data);

  // SharedStrings 파싱
  const ssEntry = entries.find(e => e.path.includes('sharedStrings'));
  const sharedStrings = ssEntry
    ? parseSharedStrings(new TextDecoder().decode(ssEntry.data))
    : [];

  // Sheet1 파싱
  const sheetEntry = entries.find(e => e.path.includes('worksheets/sheet1') || e.path.includes('worksheets/sheet'));
  if (!sheetEntry) {
    return { headers: [], rows: [] };
  }

  const sheetXml = new TextDecoder().decode(sheetEntry.data);

  // <row> 블록 추출
  const rowBlocks = extractXmlValues(sheetXml, 'row');
  const allRows: string[][] = [];

  for (const rowXml of rowBlocks) {
    // <c> 셀 추출 — 속성 포함 매칭
    const cellRegex = /<c\s+([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g;
    const row: string[] = [];
    let maxCol = -1;
    let cellMatch;

    while ((cellMatch = cellRegex.exec(rowXml)) !== null) {
      const attrs = cellMatch[1];
      const innerContent = cellMatch[2] || '';

      // r 속성 (셀 참조)
      const refMatch = attrs.match(/r="([^"]+)"/);
      const col = refMatch ? colIndex(refMatch[1]) : row.length;

      // 빈 슬롯 채우기
      while (row.length <= col) row.push('');
      if (col > maxCol) maxCol = col;

      // t 속성 (타입)
      const typeMatch = attrs.match(/t="([^"]+)"/);
      const cellType = typeMatch ? typeMatch[1] : '';

      // <v> 값 추출
      const vMatch = innerContent.match(/<v>([^<]*)<\/v>/);
      if (!vMatch) continue;

      const rawValue = vMatch[1];

      if (cellType === 's') {
        // Shared string
        const idx = parseInt(rawValue, 10);
        row[col] = decodeXmlEntities(sharedStrings[idx] || '');
      } else {
        // 숫자 또는 기타
        row[col] = decodeXmlEntities(rawValue);
      }
    }

    if (row.length > 0) {
      allRows.push(row);
    }
  }

  if (allRows.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = allRows[0];
  const rows = allRows.slice(1);

  return { headers, rows };
}
