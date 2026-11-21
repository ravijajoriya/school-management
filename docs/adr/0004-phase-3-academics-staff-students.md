# ADR 0004: Phase 3 (academic structure, staff and students)

Status: accepted (lifecycle rules and number formats pending school confirmation) · Date: 2026-11-21

Tables: `academic_years`, `subjects`, `sections`, `class_subjects`, `teacher_assignments`, `employees`, `employee_documents`, `students`, `student_guardians`, `student_enrolments`, `student_documents`. ERD: [phase-3-academics-staff-students.md](../erd/phase-3-academics-staff-students.md).

## Open questions: defaults used

The school has not yet confirmed these. The recommended defaults are in place and can be changed later.

| Question                   | Default applied                                                                                                                                                            |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admission number format    | `ADM-YYYY-NNNNN`, where YYYY is the registration year and NNNNN comes from one database sequence (it never resets). Staff can type a number instead, e.g. for old records. |
| Employee code format       | `EMP-0001` from a database sequence. Staff can type a code instead.                                                                                                        |
| Academic year              | April–March, named `2026-2027`. A new year defaults to the year after the latest one, or to the session that contains today when there are none.                           |
| Roll numbers               | Optional. Unique within a section. "Roll numbers" on a section numbers its students 1..n alphabetically and replaces existing numbers.                                     |
| Transfer and withdrawal    | Both end the current enrolment with a date and a reason. Records are kept and the student can be re-admitted later. Transfer certificates are not generated yet.           |
| Final class                | "Completed final class" closes the enrolment as COMPLETED and sets the student to INACTIVE.                                                                                |
| Teachers' view of students | Only sections where they are class teacher or have a subject assignment, for the current year: name, roll number, gender, date of birth and primary guardian phone.        |

## Academic years and structure

| Decision                                                                                                                                                                                                                   | Reason                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Years are `DRAFT → ACTIVE → CLOSED`. At most one year is active; the database enforces this with a partial unique index plus `is_active = (status = 'ACTIVE')`.                                                            | "Current year" is used by every screen, so it must never be ambiguous, even with two admins clicking at once.           |
| Making a year current closes the previously current year. Closed years are read-only for structure and enrolments.                                                                                                         | History (who was in which class) stays trustworthy after the year ends.                                                 |
| Years cannot overlap. Enrolment dates must fall inside their year.                                                                                                                                                         | Keeps attendance and reporting (later phases) date-consistent.                                                          |
| "Copy structure" copies sections (without class teachers) and class subjects from one year into an **empty** year.                                                                                                         | Setting up a new year takes one click; class teachers are chosen fresh each year.                                       |
| `sections.class_teacher_id` is the **only** class-teacher record. The PDF's `teacher_assignments.is_class_teacher` is omitted.                                                                                             | Two places for the same fact would drift apart.                                                                         |
| Composite foreign keys tie child rows to their year and class: an enrolment's `(section_id, academic_year_id, class_id)` must match its section, and a teacher assignment's section and class subject must share the year. | The database itself rejects a student "in Class 5" whose section belongs to Class 6, or an assignment that mixes years. |
| A section cannot be deleted while it has students or assignments, and its capacity cannot drop below its current student count. A subject in use by an assignment cannot be removed from a class.                          | Prevents orphaned records and silent data loss.                                                                         |
| Subject names are unique regardless of case (migration 010, expression index).                                                                                                                                             | Avoids "Hindi" and "hindi" appearing as two subjects in dropdowns.                                                      |

## Staff

- `employees` is the HR record. A login is optional (`user_id`, unique). The office can either **create a login** from the employee's email or phone (one-time temporary password, Teacher role selected by default) or **link an existing login**, for example the teacher account created in Phase 1.
- Only active employees can be class teachers or receive assignments.

## Students

| Decision                                                                                                                                                                                                               | Reason                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Registration creates the student, 1–4 guardians and (optionally) the enrolment in one transaction.                                                                                                                     | No half-registered students.                                                                           |
| Exactly one primary guardian per student. A partial unique index enforces "at most one" and the API enforces "at least one".                                                                                           | The primary guardian is the number teachers and the office call.                                       |
| One enrolment per student per year (`UNIQUE (student_id, academic_year_id)`).                                                                                                                                          | A student is in exactly one class each year; moving section edits the enrolment instead of adding one. |
| Section capacity is checked under a row lock (`SELECT … FOR UPDATE` on the section).                                                                                                                                   | Two admins enrolling at the same moment cannot overfill a section.                                     |
| Moving a student to another section clears their roll number.                                                                                                                                                          | Roll numbers belong to a section.                                                                      |
| Promotions run per section into a later year: **Promote** (to a higher class), **Retain** (same class) or **Complete** (final class). Each new enrolment points to the previous one (`previous_enrolment_id`, unique). | Promotion history is a simple chain, and the same student cannot be promoted twice.                    |
| Added `student_enrolments.exit_date` and `exit_reason`.                                                                                                                                                                | Transfers and withdrawals need a recorded date and reason; `exit_date >= enrolment_date` is checked.   |
| Transfers, withdrawals and promotions need the separate `students.lifecycle` permission.                                                                                                                               | These are hard to undo, so they can be given to fewer people than everyday student editing.            |

## Admission enquiry → student

- "Convert to student" on an enquiry registers the student with the primary guardian and enrolment in one transaction. It also sets the enquiry to `ADMISSION_CONFIRMED` and stores `converted_student_id`. Two audit entries are written: one for the student and one for the enquiry.
- `admission_enquiries.converted_student_id` is now a unique foreign key. A second conversion is refused (409), so one enquiry can never create two students.
- The form is pre-filled from the enquiry: name split into first and last, parent, phone, and the first section with room in the class sought.

## Private files

- Student and staff documents (PDF, JPEG, PNG up to 10 MB) and student photos (JPEG, PNG, WebP up to 2 MB). The type is detected from the file contents.
- Files are stored under `private/...` keys and served only through signed-in, permission-checked endpoints with `Cache-Control: private, no-store`. Unlike Phase 2 media, they never have a public URL.
- Every document download is written to the audit log.

## Permissions

New: `academics.read`, `academics.manage`, `employees.read`, `employees.manage`, `students.read`, `students.manage`, `students.lifecycle`. ADMIN holds all of them implicitly.

The Teacher role gets **none** of these. Teachers see their own sections through the teacher portal (`/teacher/sections`), which is limited on the server to sections where they are class teacher or have a subject assignment.
