import { z } from 'zod';

export const IMPORT_TYPES = ['students', 'staff', 'opening-balances'] as const;
export type ImportType = (typeof IMPORT_TYPES)[number];

export const IMPORT_TYPE_LABELS: Record<ImportType, string> = {
  students: 'Students with guardians and class',
  staff: 'Staff',
  'opening-balances': 'Opening fee balances',
};

export interface ImportColumn {
  name: string;
  required: boolean;
  description: string;
  example: string;
}

/** Spreadsheet columns per import (header row must use these names; order does not matter). */
export const IMPORT_COLUMNS: Record<ImportType, ImportColumn[]> = {
  students: [
    {
      name: 'admission_number',
      required: false,
      description: 'Leave empty to number automatically',
      example: '2019/0456',
    },
    { name: 'first_name', required: true, description: '', example: 'Aarav' },
    { name: 'middle_name', required: false, description: '', example: '' },
    { name: 'last_name', required: false, description: '', example: 'Sharma' },
    {
      name: 'gender',
      required: false,
      description: 'MALE, FEMALE, OTHER (or M / F)',
      example: 'M',
    },
    {
      name: 'date_of_birth',
      required: true,
      description: 'YYYY-MM-DD or DD/MM/YYYY',
      example: '14/05/2016',
    },
    { name: 'blood_group', required: false, description: 'A+, B-, O+, AB+ …', example: 'B+' },
    { name: 'address', required: false, description: '', example: '12 Gandhi Path' },
    { name: 'city', required: false, description: '', example: 'Jaipur' },
    { name: 'state', required: false, description: '', example: 'Rajasthan' },
    { name: 'pin_code', required: false, description: '6 digits', example: '302021' },
    {
      name: 'class',
      required: true,
      description: 'As named in the system, e.g. "Class 5", "5", "LKG", "Nursery"',
      example: 'Class 5',
    },
    {
      name: 'section',
      required: true,
      description: 'Section of the current academic year',
      example: 'A',
    },
    { name: 'roll_number', required: false, description: '', example: '12' },
    {
      name: 'enrolment_date',
      required: false,
      description: 'Defaults to the start of the academic year',
      example: '',
    },
    {
      name: 'guardian_name',
      required: true,
      description: 'Primary contact',
      example: 'Ramesh Sharma',
    },
    {
      name: 'guardian_relationship',
      required: true,
      description: 'FATHER, MOTHER, GUARDIAN or OTHER',
      example: 'FATHER',
    },
    {
      name: 'guardian_phone',
      required: true,
      description: '10-digit mobile',
      example: '9829012345',
    },
    { name: 'guardian_email', required: false, description: '', example: '' },
    { name: 'second_guardian_name', required: false, description: '', example: 'Sunita Sharma' },
    {
      name: 'second_guardian_relationship',
      required: false,
      description: 'FATHER, MOTHER, GUARDIAN or OTHER',
      example: 'MOTHER',
    },
    { name: 'second_guardian_phone', required: false, description: '', example: '9829012346' },
  ],
  staff: [
    {
      name: 'employee_code',
      required: false,
      description: 'Leave empty to number automatically',
      example: '',
    },
    { name: 'first_name', required: true, description: '', example: 'Neha' },
    { name: 'last_name', required: false, description: '', example: 'Agarwal' },
    { name: 'designation', required: true, description: '', example: 'TGT Science' },
    { name: 'department', required: false, description: '', example: 'Science' },
    {
      name: 'joining_date',
      required: true,
      description: 'YYYY-MM-DD or DD/MM/YYYY',
      example: '01/07/2016',
    },
    { name: 'date_of_birth', required: false, description: '', example: '' },
    { name: 'phone', required: false, description: '', example: '9414012345' },
    { name: 'email', required: false, description: '', example: 'neha@example.com' },
    {
      name: 'employment_type',
      required: false,
      description: 'FULL_TIME, PART_TIME, CONTRACT or VISITING',
      example: 'FULL_TIME',
    },
  ],
  'opening-balances': [
    {
      name: 'admission_number',
      required: true,
      description: 'Student must be enrolled in the current year',
      example: '2019/0456',
    },
    {
      name: 'amount',
      required: true,
      description: 'Rupees still owed from the previous system',
      example: '4500',
    },
    {
      name: 'description',
      required: false,
      description: 'Defaults to "Opening balance (previous system)"',
      example: '',
    },
    { name: 'due_date', required: false, description: 'YYYY-MM-DD or DD/MM/YYYY', example: '' },
  ],
};

export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export const importQuerySchema = z.object({
  dryRun: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

export interface ImportRowError {
  /** Spreadsheet row number (header = row 1). */
  row: number;
  column: string | null;
  message: string;
}

export interface ImportResult {
  type: ImportType;
  fileName: string;
  dryRun: boolean;
  totalRows: number;
  validRows: number;
  errors: ImportRowError[];
  /** Records created (0 on a dry run or when there are errors: imports are all-or-nothing). */
  created: number;
  /** File totals next to what is now in the database. */
  reconciliation: { label: string; file: string | number; system: string | number; ok: boolean }[];
}

export interface ImportHistoryItem {
  id: string;
  type: ImportType;
  fileName: string;
  rows: number;
  created: number;
  by: string | null;
  at: string;
}
