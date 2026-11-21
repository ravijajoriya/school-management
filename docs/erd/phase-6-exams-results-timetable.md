# ERD: Phase 6 (examinations, results and timetable)

Migrations: `016_examinations`, `017_grading`, `018_timetable`. Source of truth: `apps/api/prisma/schema/exams.prisma`.
`academic_years`, `classes`, `class_subjects`, `sections`, `student_enrolments`, `employees` and `users` come from earlier phases.

```mermaid
erDiagram
    academic_years ||--o{ examinations : "has"
    classes ||--o{ examinations : "has"
    grading_scales |o--o{ examinations : "grading_scale_id (added; fixed when finalised)"
    examinations ||--|{ exam_subjects : "papers"
    class_subjects ||--o{ exam_subjects : "class_subject_id"
    exam_subjects ||--o{ mark_entries : "marks"
    student_enrolments ||--o{ mark_entries : "student"
    users ||--o{ mark_entries : "entered_by / approved_by"
    grading_scales ||--|{ grade_bands : "bands"
    academic_years |o--o{ grading_scales : "optional scope"
    classes |o--o{ grading_scales : "optional scope"
    sections ||--o{ timetables : "(section, year) composite FK"
    timetables ||--o{ timetable_entries : "periods"
    class_subjects |o--o{ timetable_entries : "subject"
    employees |o--o{ timetable_entries : "teacher"
    users ||--o{ timetables : "created_by"

    examinations {
        uuid id PK
        uuid academic_year_id FK
        uuid class_id FK
        varchar name "unique per year + class"
        varchar exam_type "UNIT_TEST | HALF_YEARLY | ANNUAL | PRE_BOARD | OTHER"
        date start_date
        date end_date
        varchar status "DRAFT | SCHEDULED | MARKS_ENTRY | FINALIZED (final)"
        uuid grading_scale_id FK "added"
        timestamptz created_at
    }
    exam_subjects {
        uuid id PK
        uuid examination_id FK
        uuid class_subject_id FK
        date exam_date
        numeric max_marks "> 0"
        numeric pass_marks "<= max; null = 33%"
        varchar component_name "Theory / Practical / …"
        smallint sequence_no
    }
    mark_entries {
        uuid id PK
        uuid exam_subject_id FK "unique with enrolment"
        uuid student_enrolment_id FK
        numeric marks_obtained "null exactly when absent; <= max (trigger)"
        boolean is_absent
        varchar remarks
        uuid entered_by FK
        uuid approved_by FK
        varchar status "DRAFT | SUBMITTED | APPROVED | FINAL (locked)"
        timestamptz updated_at
    }
    grading_scales {
        uuid id PK
        varchar name
        uuid academic_year_id FK "optional"
        uuid class_id FK "optional"
        boolean is_active
        timestamptz created_at
    }
    grade_bands {
        uuid id PK
        uuid grading_scale_id FK
        numeric min_percentage
        numeric max_percentage "no overlap per scale"
        varchar grade_label
        varchar remark
    }
    timetables {
        uuid id PK
        uuid academic_year_id FK
        uuid section_id FK "one PUBLISHED per section"
        varchar name
        varchar status "DRAFT | PUBLISHED | ARCHIVED"
        date effective_from
        date effective_to
        uuid created_by FK
    }
    timetable_entries {
        uuid id PK
        uuid timetable_id FK
        smallint day_of_week "1-7"
        smallint period_number "unique per day"
        time start_time
        time end_time "> start"
        uuid class_subject_id FK "null for breaks / free"
        uuid teacher_employee_id FK
        varchar room_label
        boolean is_break
    }
```

## Database rules Prisma can't express (hand-written SQL in the migrations)

| Rule                                                     | Where                                                                   |
| -------------------------------------------------------- | ----------------------------------------------------------------------- |
| Type / status / date checks                              | `examinations_*_chk`                                                    |
| A finalised exam can't change or be deleted              | `examinations_guard` trigger                                            |
| `max_marks > 0`, `0 <= pass_marks <= max_marks`          | `exam_subjects_*_chk`                                                   |
| One row per subject + component per exam                 | `exam_subjects_component_key` (expression index)                        |
| Absent ⇔ no marks; marks ≥ 0                             | `mark_entries_absent_chk`                                               |
| Marks ≤ the paper's maximum; FINAL marks locked          | `mark_entries_guard` trigger                                            |
| Bands within 0–100 and non-overlapping                   | `grade_bands_range_chk`, `grade_bands_no_overlap` (btree_gist)          |
| Bands of a scale used by a finalised exam are frozen     | `grade_bands_guard` trigger                                             |
| One published timetable per section                      | `timetables_one_published_idx`                                          |
| Day 1–7, end after start, breaks have no subject/teacher | `timetable_entries_*_chk`                                               |
| Teacher clashes across published timetables              | API (`TimetableService.clashes`) under an advisory lock when publishing |
