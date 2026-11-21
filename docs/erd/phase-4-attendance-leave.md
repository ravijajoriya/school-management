# ERD: Phase 4 (attendance and teacher leave)

Migrations: `011_attendance`, `012_leave`. Source of truth: `apps/api/prisma/schema/attendance.prisma`.
`users`, `employees` and `student_enrolments` come from earlier phases; only their relationships are shown here.

```mermaid
erDiagram
    student_enrolments ||--o{ attendance_records : "one per date + session"
    users ||--o{ attendance_records : "marked_by"
    users |o--o{ attendance_records : "updated_by"
    employees ||--o{ leave_requests : "employee_id"
    users |o--o{ leave_requests : "reviewed_by"

    attendance_records {
        uuid id PK
        uuid student_enrolment_id FK "unique with date + session"
        date attendance_date
        varchar session_code "FULL_DAY (MORNING / AFTERNOON reserved)"
        varchar status "PRESENT | ABSENT | LATE"
        varchar remarks
        uuid marked_by FK
        timestamptz marked_at
        uuid updated_by FK "set with updated_at"
        timestamptz updated_at
        text correction_reason "required for past-day changes"
    }
    leave_requests {
        uuid id PK
        uuid employee_id FK
        varchar leave_type "CASUAL | SICK | EARNED | MATERNITY | ON_DUTY | UNPAID | OTHER"
        date start_date
        date end_date ">= start_date"
        text reason
        varchar status "PENDING | APPROVED | REJECTED | CANCELLED"
        uuid reviewed_by FK "required when approved/rejected"
        timestamptz reviewed_at
        text review_remarks
        timestamptz created_at
    }
```

## Database rules Prisma can't express (hand-written SQL in the migrations)

| Rule                                                                                     | Where                                           |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Status values `PRESENT / ABSENT / LATE`                                                  | `attendance_records_status_chk`                 |
| Session values `FULL_DAY / MORNING / AFTERNOON`                                          | `attendance_records_session_chk`                |
| `updated_by` and `updated_at` are set together                                           | `attendance_records_updated_pair_chk`           |
| One record per enrolment, date and session                                               | `attendance_records_enrolment_date_session_key` |
| `end_date >= start_date`; leave type and status values                                   | `leave_requests_*_chk`                          |
| Approved/rejected rows have a reviewer and review time                                   | `leave_requests_reviewed_chk`                   |
| No overlapping pending/approved requests per employee (`EXCLUDE USING gist`, btree_gist) | `leave_requests_no_overlap`                     |

Attendance and leave rows are never deleted (`ON DELETE RESTRICT` on every foreign key); corrections update the row and are written to `audit_logs`.
