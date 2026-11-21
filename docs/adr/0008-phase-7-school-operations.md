# ADR 0008: Phase 7 (school operations)

Status: accepted (defaults pending school confirmation) · Date: 2026-11-22

Tables: `vehicles`, `transport_routes`, `route_stops`, `student_transport`, `complaints`, `parent_teacher_meetings`, `inventory_categories`, `inventory_items`, `salary_components`, `payroll_runs`, `payroll_records`, `payroll_items`, `certificate_templates`, `certificate_issues`, `id_card_templates`, `id_card_batches`. ERD: [phase-7-school-operations.md](../erd/phase-7-school-operations.md).

## Decisions taken with the project owner

| Question      | Decision                                                                                                                                                                                                          |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Payroll       | **Simple monthly payroll.** Earning and deduction components; amounts are entered per employee. PF, ESI, professional tax and TDS are plain deduction amounts, with no statutory calculation. Printable payslips. |
| Certificates  | **Transfer Certificate (TC), Bonafide and Character**, from editable templates.                                                                                                                                   |
| Transport fee | **Not billed automatically.** Transport records only the route and stop. The office bills transport through a fee plan or a one-off charge in Fees.                                                               |

## Defaults to confirm with the school

| Question                    | Default applied                                                                                                                                                               |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Salary components           | Basic, DA, HRA, Conveyance (earnings); PF, ESI, Professional tax, TDS, Leave without pay (deductions). All editable.                                                          |
| Who is in a month's payroll | Every active staff member who joined by the month's last day. Staff can be added or removed while the payroll is a draft.                                                     |
| TC rules                    | Issued only after the student's transfer, withdrawal or completion is recorded, and only when no fees are outstanding. A second TC for the same student prints "(Duplicate)". |
| Certificate numbers         | Per certificate type and calendar year: `TC/2026/0001`, `BONAFIDE/2026/0001`, `CHARACTER/2026/0001`.                                                                          |
| Certificate wording         | Starter wording for all three; the school should replace it with its approved wording.                                                                                        |
| Complaint numbers           | `CMP-YYYY-00001` (one running sequence).                                                                                                                                      |
| Who handles complaints      | Staff with `complaints.manage` (or ADMIN). Resolving or closing needs resolution notes.                                                                                       |
| Vehicle capacity            | A route whose vehicle is full refuses new students.                                                                                                                           |
| ID card fields              | Name, class or designation, admission number or staff code, blood group, parent phone and photo; address optional. Staff cards have no photo yet (no staff photo field).      |

## Transport

- A student's transport is a date range per enrolment: route, optional stop, start date and end date.
- A database exclusion constraint (`student_transport_no_overlap`) stops one student being on two routes on the same day. Assigning a new route ends the current open assignment the day before the new one starts.
- A composite foreign key keeps the stop on the chosen route.
- Stops are ordered and can be renamed or reordered. A stop that has ever been used can't be removed (rename it instead), so past records stay meaningful.
- Vehicles flag insurance or permit renewal within 30 days. The route sheet is printable: riders by stop, with guardian phones.

## Complaints and parent–teacher meetings

- Complaint history (logged, assigned, status changes) is read from the append-only audit log, so there is no separate history table.
- Meetings: teachers hold the new self-service permission `meetings.schedule_own` (a Teacher role default that does not open the Admin Portal). With it they schedule and record meetings for students of sections they teach or class-teach.
- The office (`meetings.read` / `meetings.manage`) sees and schedules meetings for anyone.
- A teacher can't have two scheduled meetings at the same time (partial unique index). Marking a meeting as held needs notes.

## Inventory

- An asset register with no stock movements. Each item has a category, a quantity, a location, a condition and a purchase cost.
- Asset codes are entered or generated (`AST-00001`).
- Items disposed of in practice are marked "Disposed"; deleting an item is only for entries made by mistake (audited). The summary report gives the purchase value per category, excluding disposed items.

## Payroll

- **Workflow:** a run covers one calendar month (CHECK) and moves `DRAFT → APPROVED → PAID`. `APPROVED → DRAFT` (reopen) is allowed with an audited reason. PAID is final.
- **Database locks:**
  - The `payroll_runs_guard` trigger enforces the status transitions and rejects any change to a paid run. Only a draft run can be deleted.
  - `payroll_lines_guard` rejects inserting, changing or deleting records and lines unless their run is a draft.
- **Pre-fill:** a new month copies each employee's lines from their latest earlier payroll, using active components only.
- **Payslips stay stable:** each line stores a copy of the component's name and type, so renaming a component later never changes an old payslip. `net = gross − deductions` and `net ≥ 0` are CHECKs.
- **Self-service:** every staff member sees their own payslips under **My payslips** in the Teacher Portal, but only once the month is approved.

## Certificates and ID cards

- **Templates are plain text** with `{{placeholders}}`; HTML is never accepted.
  - Unknown placeholders are rejected when the template is saved.
  - The rendered text is shown as text, so a template can never inject markup.
  - The `template_html` column keeps the PDF's name.
- **Issued certificates never change:** the final wording, number, school details and issuer are frozen in `snapshot`. The `certificate_issues_guard` trigger blocks any update or delete. Editing a template only affects certificates issued afterwards.
- **No race on numbers:** numbering uses a transaction advisory lock per prefix, so two clerks never get the same number.
- **ID cards:**
  - A template holds the colour and which fields to show.
  - A batch records who printed which sections. Cards render from current records, so a reprint picks up corrections.
  - Student photos come through a dedicated endpoint guarded by `id_cards.generate`.

## Permissions

New permissions:

- `transport.read`, `transport.manage`
- `complaints.read`, `complaints.manage`
- `meetings.schedule_own`: Teacher default, self-service.
- `meetings.read`, `meetings.manage`
- `inventory.read`, `inventory.manage`
- `payroll.read`, `payroll.manage`, `payroll.approve`
- `certificates.issue`, `certificates.manage_templates`
- `id_cards.generate`

Payroll preparation (`manage`) and approval (`approve`) are separate permissions, so the school can split them between people.

The student search on these screens uses the student list, so screens that pick a student also need `students.read`.

## Migration numbering

The PDF's Phase 7 migrations are `019_transport`, `020_complaints_meetings`, `021_inventory`, `022_payroll` and `023_certificates_idcards` here.

Additions to the PDF's columns:

- `payroll_items.component_name` and `payroll_items.component_type` (the copy kept for stable payslips).
- `salary_components.sort_order`.
- `complaints.resolved_at`.
- `id_card_batches.filters`.
