import ExcelJS from 'exceljs';

/** One data row: normalised header → trimmed text, plus its spreadsheet row number. */
export interface SheetRow {
  row: number;
  values: Record<string, string>;
}

/** "Guardian Phone" / "guardian-phone" / " GUARDIAN_PHONE " → "guardian_phone". */
export const normaliseHeader = (h: string) =>
  h
    .replace(/^﻿/, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

/** RFC 4180 CSV (quoted fields, "" escapes, CRLF/LF, embedded newlines). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('text' in value && typeof value.text === 'string') return value.text; // hyperlink
    if ('result' in value) return cellText(value.result as ExcelJS.CellValue); // formula
    if ('richText' in value) return value.richText.map((r) => r.text).join('');
    return '';
  }
  return String(value);
}

/** Reads the first sheet of an .xlsx, or a .csv, into header-keyed rows (blank rows skipped). */
export async function readSheet(
  buffer: Buffer,
  fileName: string,
): Promise<{ headers: string[]; rows: SheetRow[] }> {
  let grid: string[][];
  const isXlsx = buffer.subarray(0, 2).toString('latin1') === 'PK';
  if (isXlsx) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    grid = [];
    ws?.eachRow({ includeEmpty: true }, (r, n) => {
      const cells: string[] = [];
      for (let c = 1; c <= r.cellCount; c++) cells.push(cellText(r.getCell(c).value));
      grid[n - 1] = cells;
    });
    grid = Array.from(grid, (r) => r ?? []);
  } else if (/\.(csv|txt)$/i.test(fileName) || !buffer.includes(0)) {
    grid = parseCsv(buffer.toString('utf8'));
  } else {
    throw new Error('Upload a .csv or .xlsx file');
  }
  const headerIndex = grid.findIndex((r) => r.some((c) => c.trim()));
  if (headerIndex < 0) return { headers: [], rows: [] };
  const headers = grid[headerIndex].map(normaliseHeader);
  const rows: SheetRow[] = [];
  for (let i = headerIndex + 1; i < grid.length; i++) {
    const cells = grid[i];
    if (!cells.some((c) => c.trim())) continue;
    const values: Record<string, string> = {};
    headers.forEach((h, j) => {
      if (h) values[h] = (cells[j] ?? '').trim();
    });
    rows.push({ row: i + 1, values });
  }
  return { headers: headers.filter(Boolean), rows };
}

/** "14/05/2016", "14-05-2016", "2016-05-14" → "2016-05-14"; anything else is returned unchanged. */
export function normaliseDate(v: string): string {
  const s = v.trim();
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  return s;
}
