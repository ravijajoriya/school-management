# ADR 0007: Phase 6 (examinations, results and timetable)

Status: accepted (grading and result rules pending school confirmation) · Date: 2026-11-21

Tables: `examinations`, `exam_subjects`, `mark_entries`, `grading_scales`, `grade_bands`, `timetables`, `timetable_entries`. ERD: [phase-6-exams-results-timetable.md](../erd/phase-6-exams-results-timetable.md).

## Defaults to confirm with the school (and RBSE samples)

| Question               | Default applied                                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Grade bands            | A suggested 8-point scale: A1 91–100, A2 81–90.99, B1 71–80.99, B2 61–70.99, C1 51–60.99, C2 41–50.99, D 33–40.99, E 0–32.99. Fully editable; scales can be per year and/or class.    |
| Pass mark              | Per paper; if not set, 33% of the maximum (rounded up).                                                                                                                               |
| Subject result         | Components (Theory, Practical, Internal) are added up. The subject is passed only if **every component** reaches its own pass mark. Absent = not passed.                              |
| Overall result         | PASS if every subject is passed; FAIL otherwise. INCOMPLETE while a core subject has no mark. No grace marks or supplementary rule yet.                                               |
| Division               | For a pass: First ≥ 60%, Second ≥ 45%, Third ≥ 33% (RBSE style).                                                                                                                      |
| Rank                   | Within the section, among passed students, by percentage; equal percentages share a rank.                                                                                             |
| Optional subjects      | There is no table of which student takes which optional subject, so a student with **no marks** in an optional subject is treated as not taking it and it is left out of their total. |
| Who enters marks       | The teacher assigned to that subject and section (`teacher_assignments`). The office (`exams.manage`) can enter any marks.                                                            |
| Report card attendance | Days present and marked up to the exam's end date, from Phase 4 attendance (Late counts as present).                                                                                  |

## Workflow

- **Exam:** `DRAFT → SCHEDULED → MARKS_ENTRY → FINALIZED`.
  - Papers (subjects and components with maximum and pass marks) can change only while the exam is DRAFT or SCHEDULED and has no marks.
  - Marks entry can be paused (back to SCHEDULED).
  - FINALIZED is permanent: a database trigger rejects any change to, or deletion of, a finalised exam.
- **Marks:** each student's mark goes `DRAFT → SUBMITTED → APPROVED → FINAL`.
  - Teachers save drafts and then submit the whole section; submitting needs every student marked or absent, except in optional subjects.
  - `marks.approve` approves, or returns the section to draft with a remark (audited).
  - Finalising needs every mark approved and every current student marked in each core subject. It turns all marks FINAL and fixes the exam's grading scale.
- **Database guarantees:**
  - Absent ⇔ no marks (CHECK).
  - Marks can never exceed the paper's maximum (trigger).
  - FINAL marks cannot be changed or deleted (trigger).
  - No overlapping grade bands (exclusion constraint).

## Results are versioned, not copied

There is no results table. Results are computed from marks every time with one function, used by the screen, the report card and the performance report. They stay reproducible because the inputs are locked once an exam is finalised:

- FINAL marks are immutable.
- The exam's `grading_scale_id` (an addition to the PDF's columns) is fixed at finalisation.
- A grading scale used by a finalised exam can no longer change (trigger on `grade_bands`).

To grade future exams differently, create a new scale.

## Timetables

| Decision                                                                                                                                                                                                                                                              | Reason                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| A timetable belongs to one section and year (composite FK). Only DRAFT timetables can be edited; to change a published one, copy it, edit it and publish the copy.                                                                                                    | Teachers and students never see a half-edited week. |
| At most one PUBLISHED timetable per section (partial unique index). Publishing archives the previous one.                                                                                                                                                             | No ambiguity about which week is in force.          |
| Publishing checks **teacher clashes**: the same teacher in overlapping time on the same day, either inside the timetable or against every other published timetable of the year. Any clash returns 409 with readable messages. A database lock serialises publishing. | The PDF's "timetable conflicts are blocked".        |
| The subject's default teacher is the one assigned to that subject in the section.                                                                                                                                                                                     | Fewer clicks; it mirrors `teacher_assignments`.     |
| Days are Monday–Saturday (the column allows 1–7). Times are stored as `TIME` and handled as "HH:MM".                                                                                                                                                                  | The school week.                                    |

Teachers see **My timetable**: their week across every published timetable of the current year. The office can look up any teacher's week.

## Permissions

New permissions:

- `exams.read`, `exams.manage`
- `marks.enter_assigned`: Teacher role default, self-service.
- `marks.approve`
- `timetable.read`, `timetable.manage`

Class teachers can view their own section's results and report cards without `exams.read`.

## Migration numbering

The PDF's `015/016/017` are `016_examinations`, `017_grading` and `018_timetable` here. The exam → grading scale foreign key is added in `017_grading`, after the grading tables exist, as the PDF recommends for cross-phase FKs.
