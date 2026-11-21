# ERD: Phase 5 (fees, manual payments and receipts)

Migrations: `013_fee_configuration`, `014_student_fee_ledger`, `015_payments_receipts`. Source of truth: `apps/api/prisma/schema/fees.prisma`.
`academic_years`, `classes`, `student_enrolments` and `users` come from earlier phases.

```mermaid
erDiagram
    academic_years ||--o{ fee_structures : "has"
    classes ||--o{ fee_structures : "has"
    fee_structures ||--|{ fee_structure_items : "lines"
    fee_heads ||--o{ fee_structure_items : "fee_head_id"
    fee_heads ||--o{ student_fee_dues : "fee_head_id"
    fee_structure_items |o--o{ student_fee_dues : "generated from (unique per enrolment)"
    student_enrolments ||--o{ student_fee_dues : "(enrolment, year) composite FK"
    student_fee_dues ||--o{ fee_adjustments : "concession / discount / fine / waiver"
    users ||--o{ fee_adjustments : "approved_by"
    student_enrolments ||--o{ payments : "pays"
    users ||--o{ payments : "recorded_by"
    payments ||--|{ payment_allocations : "split over dues"
    student_fee_dues ||--o{ payment_allocations : "paid by"
    payments ||--o| receipts : "one receipt"
    users ||--o{ receipts : "issued_by"

    fee_heads {
        uuid id PK
        varchar code UK "upper-case"
        varchar name
        text description
        boolean is_active
    }
    fee_structures {
        uuid id PK
        uuid academic_year_id FK
        uuid class_id FK
        varchar name "unique per year + class"
        varchar billing_frequency "MONTHLY | QUARTERLY | ANNUAL | CUSTOM"
        boolean is_active
        timestamptz created_at
    }
    fee_structure_items {
        uuid id PK
        uuid fee_structure_id FK
        uuid fee_head_id FK
        numeric amount ">= 0"
        date due_date
        varchar installment_label
        smallint sequence_no "unique per plan"
    }
    student_fee_dues {
        uuid id PK
        uuid student_enrolment_id FK
        uuid fee_head_id FK
        varchar description
        numeric amount_due ">= 0, immutable"
        date due_date
        uuid academic_year_id FK
        varchar status "OPEN | PARTIAL | PAID | WAIVED (derived)"
        uuid fee_structure_item_id FK "added"
        timestamptz created_at
    }
    fee_adjustments {
        uuid id PK
        uuid student_fee_due_id FK
        varchar adjustment_type "CONCESSION | DISCOUNT | FINE | WAIVER"
        numeric amount ">= 0"
        text reason
        uuid approved_by FK
        date effective_date
        timestamptz created_at
    }
    payments {
        uuid id PK
        varchar payment_number UK "PAY/2026-27/00001"
        uuid student_enrolment_id FK
        date payment_date
        numeric amount_received "> 0"
        varchar payment_mode "CASH | BANK_TRANSFER | CHEQUE"
        varchar reference_number "cheque no. / UTR"
        varchar bank_name
        date cheque_date
        varchar cheque_status "PENDING | CLEARED | BOUNCED (cheques only)"
        text notes
        uuid recorded_by FK
        varchar status "POSTED | VOID | REVERSED"
        timestamptz created_at
    }
    payment_allocations {
        uuid id PK
        uuid payment_id FK
        uuid student_fee_due_id FK
        numeric allocated_amount "> 0"
    }
    receipts {
        uuid id PK
        uuid payment_id FK,UK
        varchar receipt_number UK "RCT/2026-27/00001"
        timestamptz issued_at
        uuid issued_by FK
        jsonb snapshot_json "frozen printed values"
        boolean is_cancelled
        text cancellation_reason "required when cancelled"
    }
```

## Database rules Prisma can't express (hand-written SQL in the migrations)

| Rule                                                                                        | Where                                                      |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Amount, status, type and frequency checks                                                   | `*_chk` constraints                                        |
| Cheque details present exactly for cheque payments                                          | `payments_cheque_chk`                                      |
| Cancelled receipts have a reason                                                            | `receipts_cancel_reason_chk`                               |
| Payments: no delete; only status / cheque status / notes may change; VOID/REVERSED is final | `payments_guard_update`, `payments_no_delete`              |
| Allocations and adjustments: no update, no delete                                           | `fees_block_update`, `fees_block_delete`                   |
| Receipts: number and snapshot frozen; cancel once; no delete                                | `receipts_guard_update`, `receipts_no_delete`              |
| Dues: billed amount, fee head and student never change                                      | `student_fee_dues_guard_update`                            |
| A due's year equals its enrolment's year                                                    | composite FK → `student_enrolments (id, academic_year_id)` |
| Generated dues never duplicated                                                             | `UNIQUE (student_enrolment_id, fee_structure_item_id)`     |
