# ERD: Phase 3 (academic structure, staff and students)

Migrations: `005_academic_years`, `006_academic_structure`, `007_employees`, `008_teacher_assignments`, `009_students_enrolments`, `010_subject_name_unique`.
Source of truth: `apps/api/prisma/schema/{academics,staff,students}.prisma`.
`users`, `classes` and `admission_enquiries` come from earlier phases; only their relationships are shown here.

```mermaid
erDiagram
    academic_years ||--o{ sections : "has"
    academic_years ||--o{ class_subjects : "has"
    academic_years ||--o{ teacher_assignments : "has"
    academic_years ||--o{ student_enrolments : "has"
    classes ||--o{ sections : "class_id"
    classes ||--o{ class_subjects : "class_id"
    classes ||--o{ student_enrolments : "class_id"
    subjects ||--o{ class_subjects : "subject_id"
    employees |o--o{ sections : "class_teacher_id"
    employees ||--o{ teacher_assignments : "employee_id"
    sections ||--o{ teacher_assignments : "section_id"
    class_subjects ||--o{ teacher_assignments : "class_subject_id"
    employees ||--o{ employee_documents : "has"
    users |o--o| employees : "user_id (login)"
    students ||--|{ student_guardians : "has (1-4)"
    students ||--o{ student_enrolments : "one per year"
    sections ||--o{ student_enrolments : "section_id"
    student_enrolments |o--o| student_enrolments : "previous_enrolment_id"
    students ||--o{ student_documents : "has"
    admission_enquiries |o--o| students : "converted_student_id"

    academic_years {
        uuid id PK
        varchar name UK "2026-2027"
        date start_date
        date end_date
        varchar status "DRAFT | ACTIVE | CLOSED"
        boolean is_active "= (status = ACTIVE); at most one true"
        timestamptz created_at
        timestamptz updated_at
    }
    subjects {
        uuid id PK
        varchar code UK
        varchar name "unique, case-insensitive"
        text description
        boolean is_active
    }
    sections {
        uuid id PK
        uuid academic_year_id FK
        uuid class_id FK
        varchar name "A, B (unique per year + class)"
        varchar room_label
        int capacity "> 0"
        uuid class_teacher_id FK "employees; the only class-teacher record"
        boolean is_active
    }
    class_subjects {
        uuid id PK
        uuid academic_year_id FK
        uuid class_id FK
        uuid subject_id FK "unique per year + class"
        varchar subject_type "CORE | OPTIONAL | PRACTICAL"
        boolean is_active
    }
    teacher_assignments {
        uuid id PK
        uuid academic_year_id FK
        uuid employee_id FK
        uuid section_id FK "(section_id, academic_year_id) composite FK"
        uuid class_subject_id FK "(class_subject_id, academic_year_id) composite FK"
        timestamptz created_at
    }
    employees {
        uuid id PK
        varchar employee_code UK "EMP-0001 (sequence)"
        varchar first_name
        varchar last_name
        varchar email "lowercase"
        varchar phone
        date date_of_birth
        date joining_date
        varchar designation
        varchar department
        varchar employment_type "FULL_TIME | PART_TIME | CONTRACT | VISITING"
        varchar status "ACTIVE | INACTIVE | LEFT"
        uuid user_id FK,UK "optional login"
        timestamptz created_at
        timestamptz updated_at
    }
    employee_documents {
        uuid id PK
        uuid employee_id FK
        varchar document_type
        varchar file_name
        varchar storage_key "private/..."
        varchar mime_type
        bigint file_size_bytes "> 0 (10 MB limit in API)"
        uuid uploaded_by FK
        timestamptz created_at
    }
    students {
        uuid id PK
        varchar admission_number UK "ADM-2026-00001 (sequence)"
        varchar first_name
        varchar middle_name
        varchar last_name
        date date_of_birth
        varchar gender "MALE | FEMALE | OTHER"
        varchar blood_group
        varchar photo_storage_key "private"
        varchar address_line1
        varchar address_line2
        varchar city
        varchar state
        varchar postal_code
        varchar status "ACTIVE | INACTIVE | WITHDRAWN"
        timestamptz created_at
        timestamptz updated_at
    }
    student_guardians {
        uuid id PK
        uuid student_id FK
        varchar full_name
        varchar relationship "FATHER | MOTHER | GUARDIAN | OTHER"
        varchar phone
        varchar email
        varchar occupation
        boolean is_primary "exactly one per student"
        boolean address_same_as_student
        timestamptz created_at
    }
    student_enrolments {
        uuid id PK
        uuid student_id FK "unique with academic_year_id"
        uuid academic_year_id FK
        uuid class_id FK
        uuid section_id FK "(section_id, academic_year_id, class_id) composite FK"
        varchar roll_number "unique within section"
        date enrolment_date
        varchar status "ACTIVE | PROMOTED | RETAINED | TRANSFERRED | WITHDRAWN | COMPLETED"
        uuid previous_enrolment_id FK,UK "promotion chain"
        date exit_date ">= enrolment_date"
        text exit_reason
        timestamptz created_at
        timestamptz updated_at
    }
    student_documents {
        uuid id PK
        uuid student_id FK
        varchar document_type
        varchar file_name
        varchar storage_key "private/..."
        varchar mime_type
        bigint file_size_bytes "> 0 (10 MB limit in API)"
        uuid uploaded_by FK
        timestamptz created_at
    }
```

## Database rules Prisma can't express (hand-written SQL in the migrations)

| Rule                                                                                                                     | Where                              |
| ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| `end_date > start_date`, status values, `is_active = (status = 'ACTIVE')`                                                | `academic_years` CHECKs            |
| At most one current year: `UNIQUE (is_active) WHERE is_active`                                                           | `academic_years_single_active_idx` |
| Subject names unique regardless of case: `UNIQUE (lower(name))` (migration 010)                                          | `subjects_name_key`                |
| `capacity > 0`                                                                                                           | `sections` CHECK                   |
| `subject_type` values                                                                                                    | `class_subjects` CHECK             |
| Status, employment type, lowercase email                                                                                 | `employees` CHECKs                 |
| `EMP-0001` numbering                                                                                                     | `employee_code_seq`                |
| Status, gender, blood group values                                                                                       | `students` CHECKs                  |
| `ADM-YYYY-NNNNN` numbering                                                                                               | `student_admission_number_seq`     |
| Relationship values; at most one primary guardian: `UNIQUE (student_id) WHERE is_primary` (the API ensures at least one) | `student_guardians`                |
| Status values, `exit_date >= enrolment_date`                                                                             | `student_enrolments` CHECKs        |
| An enrolment's class always matches its section (composite FK on section, year and class)                                | `student_enrolments` FK            |
| A teacher assignment's section and subject belong to the same year (composite FKs)                                       | `teacher_assignments` FKs          |
| File size > 0 (the 10 MB / 2 MB upload limits are enforced by the API)                                                   | `*_documents` CHECKs               |
