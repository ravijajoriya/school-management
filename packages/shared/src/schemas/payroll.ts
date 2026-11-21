import { z } from 'zod';
import { optionalText, uuidSchema } from './common.js';
import { moneySchema } from './fees.js';

export const COMPONENT_TYPES = ['EARNING', 'DEDUCTION'] as const;
export type ComponentType = (typeof COMPONENT_TYPES)[number];

export const PAYROLL_STATUSES = ['DRAFT', 'APPROVED', 'PAID'] as const;
export type PayrollStatus = (typeof PAYROLL_STATUSES)[number];
export const PAYROLL_STATUS_LABELS: Record<PayrollStatus, string> = {
  DRAFT: 'Draft',
  APPROVED: 'Approved',
  PAID: 'Paid',
};

/** Suggested starting components (school to confirm; amounts are entered, not calculated). */
export const DEFAULT_SALARY_COMPONENTS: { name: string; componentType: ComponentType }[] = [
  { name: 'Basic pay', componentType: 'EARNING' },
  { name: 'Dearness allowance (DA)', componentType: 'EARNING' },
  { name: 'House rent allowance (HRA)', componentType: 'EARNING' },
  { name: 'Conveyance allowance', componentType: 'EARNING' },
  { name: 'Provident fund (PF)', componentType: 'DEDUCTION' },
  { name: 'ESI', componentType: 'DEDUCTION' },
  { name: 'Professional tax', componentType: 'DEDUCTION' },
  { name: 'Income tax (TDS)', componentType: 'DEDUCTION' },
  { name: 'Leave without pay', componentType: 'DEDUCTION' },
];

export const saveSalaryComponentSchema = z.object({
  name: z.string().trim().min(2, 'Enter a name').max(100),
  componentType: z.enum(COMPONENT_TYPES),
  isActive: z.boolean().default(true),
});
export type SaveSalaryComponentInput = z.input<typeof saveSalaryComponentSchema>;

export interface SalaryComponentItem {
  id: string;
  name: string;
  componentType: ComponentType;
  isActive: boolean;
}

export const createPayrollRunSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Choose a month'),
});

export const savePayrollRecordSchema = z.object({
  lines: z
    .array(
      z.object({ salaryComponentId: uuidSchema, amount: moneySchema, notes: optionalText(255) }),
    )
    .max(40)
    .refine((l) => new Set(l.map((x) => x.salaryComponentId)).size === l.length, {
      message: 'Each component can appear only once',
    }),
});
export type SavePayrollRecordInput = z.input<typeof savePayrollRecordSchema>;
export type SavePayrollRecordData = z.output<typeof savePayrollRecordSchema>;

export const addPayrollEmployeeSchema = z.object({ employeeId: uuidSchema });

export interface PayrollLineItem {
  salaryComponentId: string;
  name: string;
  componentType: ComponentType;
  amount: number;
  notes: string | null;
}

export interface PayrollRecordItem {
  id: string;
  employee: { id: string; fullName: string; employeeCode: string; designation: string };
  gross: number;
  deductions: number;
  net: number;
  status: PayrollStatus;
  lines: PayrollLineItem[];
}

export interface PayrollRunItem {
  id: string;
  month: string;
  periodStart: string;
  periodEnd: string;
  status: PayrollStatus;
  createdBy: string;
  approvedBy: string | null;
  paidAt: string | null;
  totals: { employees: number; gross: number; deductions: number; net: number };
  records: PayrollRecordItem[];
}

export interface PayrollRunListItem {
  id: string;
  month: string;
  status: PayrollStatus;
  employees: number;
  net: number;
}

export interface Payslip {
  school: { name: string; address: string };
  month: string;
  periodStart: string;
  periodEnd: string;
  status: PayrollStatus;
  employee: {
    fullName: string;
    employeeCode: string;
    designation: string;
    department: string | null;
    joiningDate: string;
  };
  earnings: PayrollLineItem[];
  deductions: PayrollLineItem[];
  gross: number;
  totalDeductions: number;
  net: number;
  netInWords: string;
}
