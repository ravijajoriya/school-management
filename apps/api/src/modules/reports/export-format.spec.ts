import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import {
  RUPEES,
  exportFileName,
  safeText,
  toCsv,
  toXlsx,
  type ExportTable,
} from './export-format.js';

interface Row {
  name: string;
  amount: number;
  note: string | null;
}

const table: ExportTable<Row> = {
  title: 'Fee dues 2026-2027',
  meta: ['Class 5'],
  columns: [
    { header: 'Name', value: (r) => r.name },
    { header: 'Balance (₹)', value: (r) => r.amount, numFmt: RUPEES },
    { header: 'Note', value: (r) => r.note },
  ],
  rows: [
    { name: 'Aarav Sharma', amount: 1500.5, note: 'Paid "half", rest later' },
    { name: '=HYPERLINK("http://evil")', amount: -20, note: null },
    { name: 'अनन्या', amount: 0, note: 'line1\nline2' },
  ],
};

describe('report export formats', () => {
  it('neutralises formula-like text but leaves numbers alone', () => {
    expect(safeText('=1+1')).toBe("'=1+1");
    expect(safeText('+91 98290')).toBe("'+91 98290");
    expect(safeText('@cmd')).toBe("'@cmd");
    expect(safeText('Aarav')).toBe('Aarav');
  });

  it('writes RFC 4180 CSV with a BOM, quoting and injection protection', () => {
    const csv = toCsv(table).toString('utf8');
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe('Name,Balance (₹),Note');
    expect(lines[1]).toBe('Aarav Sharma,1500.5,"Paid ""half"", rest later"');
    expect(lines[2]).toBe(`"'=HYPERLINK(""http://evil"")",-20,`);
    expect(lines[3]).toBe('अनन्या,0,"line1\nline2"');
  });

  it('writes an xlsx with a title, header and typed cells', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await toXlsx(table)) as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    expect(ws.getCell('A1').value).toBe('Fee dues 2026-2027');
    expect(ws.getCell('A2').value).toBe('Class 5');
    expect(ws.getRow(4).values).toEqual([undefined, 'Name', 'Balance (₹)', 'Note']);
    expect(ws.getCell('B5').value).toBe(1500.5);
    expect(ws.getCell('B5').numFmt).toBe(RUPEES);
    expect(ws.getCell('A6').value).toBe('\'=HYPERLINK("http://evil")');
  });

  it('builds safe file names', () => {
    expect(exportFileName('Fee dues 2026-2027', '2026-11-22', 'xlsx')).toBe(
      'fee-dues-2026-2027-2026-11-22.xlsx',
    );
    expect(exportFileName('../../etc', '2026-11-22', 'csv')).toBe('etc-2026-11-22.csv');
  });
});
