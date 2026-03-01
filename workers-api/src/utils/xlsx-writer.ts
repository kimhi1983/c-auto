/**
 * 경량 XLSX 생성기 — Cloudflare Workers 환경용
 * pako(deflateRaw)로 ZIP 압축하여 .xlsx 파일 생성
 */
import pako from 'pako';

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function colRef(col: number): string {
  let s = '';
  col++;
  while (col > 0) {
    col--;
    s = String.fromCharCode(65 + (col % 26)) + s;
    col = Math.floor(col / 26);
  }
  return s;
}

function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createZip(files: { path: string; data: Uint8Array }[]): Uint8Array {
  const entries: { path: Uint8Array; compressed: Uint8Array; original: Uint8Array; crc: number; offset: number }[] = [];
  const chunks: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const pathBytes = new TextEncoder().encode(file.path);
    const crc = crc32(file.data);
    const compressed = pako.deflateRaw(file.data);

    // Local file header (30 + filename)
    const lh = new Uint8Array(30 + pathBytes.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(8, 8, true); // deflate
    lv.setUint32(14, crc, true);
    lv.setUint32(18, compressed.length, true);
    lv.setUint32(22, file.data.length, true);
    lv.setUint16(26, pathBytes.length, true);
    lh.set(pathBytes, 30);

    entries.push({ path: pathBytes, compressed, original: file.data, crc, offset });
    chunks.push(lh, compressed);
    offset += lh.length + compressed.length;
  }

  // Central directory
  const cdStart = offset;
  for (const e of entries) {
    const cd = new Uint8Array(46 + e.path.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(10, 8, true);
    cv.setUint32(16, e.crc, true);
    cv.setUint32(20, e.compressed.length, true);
    cv.setUint32(24, e.original.length, true);
    cv.setUint16(28, e.path.length, true);
    cv.setUint32(42, e.offset, true);
    cd.set(e.path, 46);
    chunks.push(cd);
    offset += cd.length;
  }

  // End of central directory
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, offset - cdStart, true);
  ev.setUint32(16, cdStart, true);
  chunks.push(eocd);

  const total = chunks.reduce((s, c) => s + c.length, 0);
  const result = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) { result.set(c, pos); pos += c.length; }
  return result;
}

/**
 * 헤더 + 데이터 행으로 .xlsx 바이너리 생성
 */
export function generateXlsx(
  headers: string[],
  rows: (string | number | null | undefined)[][],
  sheetName = '재고현황'
): Uint8Array {
  // Shared strings 수집
  const strings: string[] = [];
  const strIdx = new Map<string, number>();
  const addStr = (s: string) => {
    if (strIdx.has(s)) return strIdx.get(s)!;
    const i = strings.length;
    strings.push(s);
    strIdx.set(s, i);
    return i;
  };
  headers.forEach(addStr);
  rows.forEach(r => r.forEach(c => { if (c != null && typeof c === 'string') addStr(String(c)); }));

  // Sheet XML
  let sheetRows = '';
  sheetRows += '<row r="1">';
  headers.forEach((h, i) => {
    sheetRows += `<c r="${colRef(i)}1" t="s" s="1"><v>${strIdx.get(h)}</v></c>`;
  });
  sheetRows += '</row>';
  rows.forEach((row, ri) => {
    const rn = ri + 2;
    sheetRows += `<row r="${rn}">`;
    row.forEach((cell, ci) => {
      if (cell == null) return;
      const ref = `${colRef(ci)}${rn}`;
      if (typeof cell === 'number') {
        sheetRows += `<c r="${ref}"><v>${cell}</v></c>`;
      } else {
        const idx = strIdx.get(cell);
        if (idx !== undefined) sheetRows += `<c r="${ref}" t="s"><v>${idx}</v></c>`;
      }
    });
    sheetRows += '</row>';
  });

  const lastCol = colRef(headers.length - 1);
  const lastRow = rows.length + 1;

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<dimension ref="A1:${lastCol}${lastRow}"/>
<sheetViews><sheetView tabSelected="1" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${headers.map((_, i) => `<col min="${i + 1}" max="${i + 1}" width="18" bestFit="1" customWidth="1"/>`).join('')}</cols>
<sheetData>${sheetRows}</sheetData>
</worksheet>`;

  const sharedStringsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">
${strings.map(s => `<si><t>${escapeXml(s)}</t></si>`).join('')}
</sst>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="맑은 고딕"/></font><font><b/><sz val="11"/><name val="맑은 고딕"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9E1F2"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>
</styleSheet>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`;

  const enc = (s: string) => new TextEncoder().encode(s);
  return createZip([
    { path: '[Content_Types].xml', data: enc(contentTypes) },
    { path: '_rels/.rels', data: enc(rootRels) },
    { path: 'xl/workbook.xml', data: enc(workbookXml) },
    { path: 'xl/_rels/workbook.xml.rels', data: enc(wbRels) },
    { path: 'xl/worksheets/sheet1.xml', data: enc(sheetXml) },
    { path: 'xl/styles.xml', data: enc(stylesXml) },
    { path: 'xl/sharedStrings.xml', data: enc(sharedStringsXml) },
  ]);
}
