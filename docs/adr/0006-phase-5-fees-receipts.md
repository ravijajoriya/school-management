# ADR 0006: Phase 5 (fees, manual payments and receipts)

Status: accepted (fee policies pending school confirmation) · Date: 2026-11-21

Tables: `fee_heads`, `fee_structures`, `fee_structure_items`, `student_fee_dues`, `fee_adjustments`, `payments`, `payment_allocations`, `receipts`. ERD: [phase-5-fees-receipts.md](../erd/phase-5-fees-receipts.md).

## Defaults to confirm with the school

| Question                    | Default applied                                                                                                                                                                                                   |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Receipt and payment numbers | `RCT/2026-27/00001` and `PAY/2026-27/00001`: per academic year, **gapless**, assigned under a database lock.                                                                                                      |
| Partial payments            | Allowed, against any number of dues. The amount received must equal what is allocated, so there are no advances or credit balances.                                                                               |
| Allocation order            | The office chooses. "Allocate oldest first" spreads an amount over the oldest dues; overdue dues are pre-selected.                                                                                                |
| Cheques                     | Receipt issued at once ("subject to realisation"); the cheque counts as paid while pending. **Cleared** just records it. **Bounced** reverses the payment, cancels the receipt and the dues become payable again. |
| Bounce charge / late fine   | Not automatic. The office adds a Fine adjustment when the school's policy applies.                                                                                                                                |
| Concession approval         | Whoever holds `fees.adjust` approves by applying it and is recorded as `approved_by`. There is no second approval step.                                                                                           |
| Arrears in closed years     | Payments and adjustments are still allowed. New charges and dues generation are not.                                                                                                                              |
| Fee plans after billing     | Once any student is billed from a plan, its amounts are frozen. Use a new plan or one-off charges.                                                                                                                |

## Ledger rule

`balance = billed + fines − (concessions + discounts + waivers) − allocations of POSTED payments`

| Decision                                                                                                                                                                                                                                                    | Reason                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| There is no stored, editable balance. Every screen and report computes it from dues, adjustments and allocations with one function (`dueMath`). `student_fee_dues.status` (OPEN/PARTIAL/PAID/WAIVED) is re-derived in the same transaction as every change. | The PDF's "do not store only a manually editable balance"; the ledger always reconciles. |
| Money is NUMERIC(12,2) in the database and integer **paise** in code.                                                                                                                                                                                       | No floating-point rounding in totals.                                                    |
| Dues reference the **enrolment** (composite FK on enrolment and academic year), not the student.                                                                                                                                                            | Fees belong to a class and year, and history survives promotion.                         |
| Added `student_fee_dues.fee_structure_item_id` with `UNIQUE (student_enrolment_id, fee_structure_item_id)`.                                                                                                                                                 | Generating dues twice, or for a late admission, never bills a student twice.             |
| Payments lock the affected dues (`SELECT … FOR UPDATE`) and refuse to allocate more than a due's balance.                                                                                                                                                   | Two cashiers cannot overpay the same due.                                                |
| A reducing adjustment (concession, discount or waiver) cannot exceed the outstanding balance.                                                                                                                                                               | Balances never go negative.                                                              |

## Posted records are never deleted

Database triggers enforce this, not just the API:

- `payments`: no DELETE. Amount, student, date, mode and numbers can never change; only `status`, `cheque_status` and `notes`. VOID or REVERSED is final.
- `payment_allocations`, `fee_adjustments`: no UPDATE, no DELETE.
- `receipts`: no DELETE. Number and snapshot are frozen; a receipt can only be cancelled, once, with a reason.
- `student_fee_dues`: billed amount, fee head and student cannot change. An untouched due may be deleted (the foreign keys stop it once anything is attached).

Corrections are **void** (entered by mistake), **reverse** (money returned or not realised) or **adjustments**. Each needs a reason and is audited. The receipt stays on record, marked cancelled.

The only bypass is a transaction-local setting (`app.allow_financial_delete`) used by the development demo-data tool (`pnpm demo:clear`). Application code never sets it.

## Receipts

`receipts.snapshot_json` freezes everything printed at issue time: school details, student, class, guardian, lines, total, amount in words (Indian system: lakh, crore) and the balance after payment. Reprinting always shows the original, even if names or fees change later. Printing uses the browser (print-friendly page); PDF files are not generated.

## Permissions

New permissions:

- `fees.read`: ledgers, receipts, reports.
- `fees.configure`: fee heads, plans, generating dues, one-off charges.
- `fees.collect`: record payments, mark cheques cleared.
- `fees.adjust`: concessions, discounts, waivers, fines.
- `fees.void`: void or reverse payments, mark cheques bounced.

These are split so that a cashier can collect but not give concessions or cancel receipts. Teachers get none of them.

## Migration numbering

The PDF's `012/013/014` are `013_fee_configuration`, `014_student_fee_ledger` and `015_payments_receipts` here, following the one-step shift noted in ADR 0005.
