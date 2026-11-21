# ADR 0005: Phase 4 (attendance and teacher leave)

Status: accepted (leave types pending school confirmation) · Date: 2026-11-21

Tables: `attendance_records`, `leave_requests`. ERD: [phase-4-attendance-leave.md](../erd/phase-4-attendance-leave.md).

## School decisions (confirmed 2026-11-21)

| Question                               | Decision                                                                                            |
| -------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Who marks a section's daily attendance | **The class teacher only.** The office can mark or correct any section.                             |
| Sessions per day                       | **Once a day** (`FULL_DAY`). The column also accepts `MORNING` / `AFTERNOON` for later.             |
| Teacher edit window                    | **Same day only.** After midnight (school time zone), only the office can change it, with a reason. |
| Does Late count as present?            | **Yes.** Late counts towards the attendance percentage but is still shown separately.               |

## Defaults still to confirm with the school

| Question            | Default applied                                                                                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Leave types         | Casual, Sick / medical, Earned, Maternity, On duty, Leave without pay, Other.                                                                                                                                      |
| Leave balances      | Not tracked (the PDF has no balance table). Requests and history only.                                                                                                                                             |
| Back-dated leave    | Allowed (e.g. sick leave applied for on return). A single request covers at most 180 calendar days.                                                                                                                |
| Days counted        | Calendar days, both ends included. There is no holiday calendar yet, so Sundays and holidays are included.                                                                                                         |
| Low attendance flag | Below 75% (the RBSE eligibility rule) is highlighted in reports.                                                                                                                                                   |
| Working days        | A day counts as a working day for a section when attendance was taken for it. There is no holiday calendar, so unmarked days are not counted as absences. The percentage is over the days marked for each student. |

## Attendance

| Decision                                                                                                                                                                                                          | Reason                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| One row per `(student_enrolment_id, attendance_date, session_code)`, enforced by a unique index. Whole-class marking and single-student marking both use `PUT /attendance/sheet` with 1..n entries.               | One record model for bulk and individual entry, as the PDF requires. Re-saving the same sheet never duplicates rows.      |
| Attendance points at the **enrolment**, not the student.                                                                                                                                                          | The year, class and section come from the enrolment, so history stays correct after promotion.                            |
| A sheet lists the enrolments that belonged to the section on that date (joined on or before it, not left before it).                                                                                              | Students who join mid-year are not marked absent for days before they joined, and leavers drop off after their exit date. |
| If a student is moved to another section, their earlier records move with the enrolment.                                                                                                                          | The enrolment is the single source of truth. This is acceptable because moves are rare and happen early in the year.      |
| Unchanged entries are skipped. Changed rows record `updated_by` / `updated_at`. A database check makes `updated_by` and `updated_at` appear together.                                                             | Corrections are visible on the row ("Changed by … — reason") without a separate history table.                            |
| Any write to a **past date** needs `attendance.manage` and a reason of at least 5 characters. The reason is saved in `correction_reason` and in the audit log (`attendance.corrected`, before/after per student). | The controlled edit window and audit trail the PDF asks for.                                                              |
| Future dates, dates outside the academic year and closed years are refused.                                                                                                                                       | Closed years stay read-only, as in Phase 3.                                                                               |
| Every unmarked student starts as Present on the sheet; the teacher taps A or L for the exceptions.                                                                                                                | Fastest way to take attendance for a class of 40.                                                                         |
| The daily report flags class teachers on approved leave.                                                                                                                                                          | The office can see at a glance which classes it must mark itself.                                                         |

## Leave

| Decision                                                                                                                                                                                  | Reason                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `PENDING → APPROVED / REJECTED`; the applicant can cancel a pending request, or approved leave that has not started.                                                                      | The standard workflow; approved leave that has already started stays on record. |
| No two pending/approved requests for the same employee may overlap. The API checks this, and a Postgres **exclusion constraint** (`btree_gist`) is the backstop; a violation returns 409. | Enforced even if two requests arrive at the same moment.                        |
| Approved and rejected rows must have `reviewed_by` and `reviewed_at` (database check). Rejecting needs remarks.                                                                           | Every decision is attributable and explained.                                   |
| Nobody can review their own request.                                                                                                                                                      | Separation of duties, e.g. when the principal also has a staff record.          |
| Applying needs a login linked to an active staff record.                                                                                                                                  | `leave_requests.employee_id` belongs to the staff record, not the login.        |

## Permissions

New permissions:

- `attendance.mark_assigned`: class teacher, own section, today.
- `attendance.read`: all sheets and reports.
- `attendance.manage`: any section, past-day corrections.
- `leave.apply`: own leave.
- `leave.read`: all requests.
- `leave.approve`: approve or reject requests.

| Decision                                                                                                                                                                                                                                  | Reason                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| The **Teacher role** gets `attendance.mark_assigned` and `leave.apply` by default (`DEFAULT_ROLE_PERMISSIONS`). The seed grants these only when a permission is first created, so later edits under Roles & Permissions are never undone. | Teachers need them on day one; the school stays in control afterwards.                                         |
| These two are **self-service** permissions. Holding only them still sends a user to the Teacher Portal, and the privilege-escalation guard ignores them, so a user manager can still manage teachers.                                     | Before this phase, "has any permission" meant "admin". That rule would have sent teachers to the Admin Portal. |

## Migration numbering

The PDF names this phase's migrations `010_attendance` and `011_leave`. Phase 3 already used `010` (unique subject names, ADR 0004), so these are `011_attendance` and `012_leave`. Later phases shift by one.
