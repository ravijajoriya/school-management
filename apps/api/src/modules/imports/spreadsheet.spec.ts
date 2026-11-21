import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { normaliseDate, normaliseHeader, parseCsv, readSheet } from './spreadsheet.js';

describe('spreadsheet reading', () => {
  it('parses quoted CSV fields, escaped quotes, CRLF and embedded newlines', () => {
    expect(parseCsv('a,b\r\n"x, y","he said ""hi"""\n"multi\nline",\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'he said "hi"'],
      ['multi\nline', ''],
    ]);
  });

  it('normalises headers and dates', () => {
    expect(normaliseHeader('﻿ Guardian Phone ')).toBe('guardian_phone');
    expect(normaliseHeader('Date-of-Birth')).toBe('date_of_birth');
    expect(normaliseDate('14/05/2016')).toBe('2016-05-14');
    expect(normaliseDate('4-5-2016')).toBe('2016-05-04');
    expect(normaliseDate('2016-05-14')).toBe('2016-05-14');
  });

  it('reads a CSV into header-keyed rows with spreadsheet row numbers, skipping blank lines', async () => {
    const csv = '﻿First Name,Class\r\nAarav, Class 5 \r\n,\r\nBhavya,Class 6\r\n';
    const { headers, rows } = await readSheet(Buffer.from(csv), 'students.csv');
    expect(headers).toEqual(['first_name', 'class']);
    expect(rows).toEqual([
      { row: 2, values: { first_name: 'Aarav', class: 'Class 5' } },
      { row: 4, values: { first_name: 'Bhavya', class: 'Class 6' } },
    ]);
  });

  it('reads the first sheet of an xlsx, including dates and numbers', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Students');
    ws.addRow(['first_name', 'date_of_birth', 'roll_number']);
    ws.addRow(['Aarav', new Date(Date.UTC(2016, 4, 14)), 12]);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const { rows } = await readSheet(buffer, 'students.xlsx');
    expect(rows).toEqual([
      { row: 2, values: { first_name: 'Aarav', date_of_birth: '2016-05-14', roll_number: '12' } },
    ]);
  });
});
