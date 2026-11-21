import ExcelJS from 'exceljs';

export type Cell = string | number | boolean | null | undefined;

export interface ExportColumn<T> {
  header: string;
  value: (row: T) => Cell;
  /** Excel number format, e.g. '#,##0.00' for rupees. */
  numFmt?: string;
  width?: number;
}

export interface ExportTable<T = unknown> {
  /** Sheet / file title, e.g. "Fee dues 2026-2027". */
  title: string;
  /** Extra lines shown above the table in Excel (filters used, generated at, …). */
  meta: string[];
  columns: ExportColumn<T>[];
  rows: T[];
}

export const RUPEES = '#,##0.00';

/**
 * Spreadsheet apps execute cells that start with = + - @ (or tab/CR) as formulas. Text values
 * from users (names, notes) are prefixed with an apostrophe so they are always shown as text.
 * Real numbers are written as numbers and never touched.
 */
export function safeText(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function csvField(value: Cell): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'string' ? safeText(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** RFC 4180 CSV with a UTF-8 BOM, so Excel opens ₹ and Hindi names correctly. */
export function toCsv<T>(table: ExportTable<T>): Buffer {
  const lines = [
    table.columns.map((c) => csvField(c.header)).join(','),
    ...table.rows.map((r) => table.columns.map((c) => csvField(c.value(r))).join(',')),
  ];
  return Buffer.from(`﻿${lines.join('\r\n')}\r\n`, 'utf8');
}

/** One-sheet workbook: title, meta lines, bold frozen header row, typed number cells. */
export async function toXlsx<T>(table: ExportTable<T>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'School Management System';
  wb.created = new Date();
  const ws = wb.addWorksheet(table.title.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Report');
  ws.addRow([table.title]).font = { bold: true, size: 14 };
  for (const line of table.meta)
    ws.addRow([line]).font = { italic: true, color: { argb: 'FF666666' } };
  ws.addRow([]);
  const header = ws.addRow(table.columns.map((c) => c.header));
  header.font = { bold: true };
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF5' } };
  });
  ws.views = [{ state: 'frozen', ySplit: header.number }];
  for (const r of table.rows) {
    ws.addRow(
      table.columns.map((c) => {
        const v = c.value(r);
        return typeof v === 'string' ? safeText(v) : (v ?? null);
      }),
    );
  }
  table.columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    if (c.numFmt) col.numFmt = c.numFmt;
    col.width = c.width ?? Math.min(40, Math.max(10, c.header.length + 2));
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** "Fee dues 2026-2027" → "fee-dues-2026-2027-2026-11-22.csv" */
export function exportFileName(title: string, day: string, format: 'csv' | 'xlsx'): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${slug || 'report'}-${day}.${format}`;
}
