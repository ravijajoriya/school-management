# User acceptance testing (UAT): Admin and Teacher portals

**For:** the school's principal, office staff, accountant and two or three teachers.
**When:** before go-live. Use a test copy loaded with demo data (`pnpm demo:seed`), or with the school's own data after a rehearsal import.

Logins on a demo copy (password `Demo@1234`):

| Login               | Who                             |
| ------------------- | ------------------------------- |
| `office@demo.local` | Office assistant (limited role) |
| `sunita@demo.local` | Class teacher, Class 1 A        |
| `anil@demo.local`   | Class teacher, Class 8 A, Maths |
| `pooja@demo.local`  | Subject teacher only            |

The admin login is given separately.

## How to record results

- For each line, mark **Pass**, or **Fail** with a short note (what you did, what you expected, what happened).
- Rate every failure:
  - **Critical:** wrong money, marks or data, or someone sees what they shouldn't.
  - **High:** a task can't be done.
  - **Medium:** a workaround exists.
  - **Low:** cosmetic.
- **Go-live needs no open critical or high failures.**

## Admin Portal

| #   | Area          | Task                                                                                      | Expected                                                                              | Result |
| --- | ------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------ |
| A1  | Sign-in       | Sign in; change the temporary password; sign out and in again                             | Password change is forced once; the session works                                     |        |
| A2  | Dashboard     | Open the dashboard                                                                        | Today, Fees, Students & admissions, Academics & operations show sensible numbers      |        |
| A3  | Users & roles | Create a staff login with a role; remove a permission from that role                      | The user sees only what the role allows                                               |        |
| A4  | Website       | Edit the About page, preview, publish; post an announcement                               | Visible on the public site only after publishing                                      |        |
| A5  | Admissions    | Submit an enquiry on the public site; follow it up; convert it to a student               | The enquiry moves through statuses; the student is created in the right class         |        |
| A6  | Students      | Register a student with two guardians; upload a photo and a document; edit the phone      | Saved; the document opens only when signed in                                         |        |
| A7  | Promotions    | Promote one class to next year; retain one student; transfer one out                      | New enrolments are correct; history is kept                                           |        |
| A8  | Attendance    | View today's daily report; correct a past day with a reason                               | The correction appears in the audit log                                               |        |
| A9  | Leave         | Approve one leave request; reject one with a reason                                       | The teacher sees the outcome                                                          |        |
| A10 | Fees: set-up  | Create a fee plan for a class; generate dues                                              | Every current student is billed once; generating again doesn't double-bill            |        |
| A11 | Fees: collect | Collect a part payment in cash and a full payment by cheque; print both receipts          | Receipt numbers are sequential; balances are right; amount in words is right          |        |
| A12 | Fees: correct | Void one payment with a reason; mark the cheque as bounced                                | Balances are restored; the receipt shows "Cancelled"                                  |        |
| A13 | Fees: reports | Dues, collection and concession reports for this month; download dues as Excel            | Totals agree with the receipts collected in A11/A12                                   |        |
| A14 | Exams         | Set up an exam with papers; open marks entry; approve marks; finalise                     | After finalising, marks can't change                                                  |        |
| A15 | Results       | View section results; print a report card; download results as Excel                      | Grades, divisions, ranks and attendance as agreed with the school                     |        |
| A16 | Timetable     | Create a timetable; try to give one teacher two classes at once; publish                  | The clash is blocked; the teacher sees the published week                             |        |
| A17 | Transport     | Add a vehicle and a route with stops; assign two students; print the route sheet          | Capacity is respected; guardian phones appear on the sheet                            |        |
| A18 | Complaints    | Log a complaint; assign it; resolve it with notes                                         | It can't be resolved without notes; the history shows each step                       |        |
| A19 | Inventory     | Add a category and three items; mark one "Needs repair"                                   | The summary shows the value and "needs attention"                                     |        |
| A20 | Payroll       | Prepare this month; edit two staff; approve; mark as paid; print a payslip                | Starts from last month; can't edit after approval; net in words is right              |        |
| A21 | Certificates  | Issue a Bonafide certificate; try a TC for a current student; issue a TC after withdrawal | The TC is refused until the student has left and owes no fees; numbers are sequential |        |
| A22 | ID cards      | Print student cards for one section and staff cards                                       | One card per person with the right details and photo                                  |        |
| A23 | Reports       | Reports & Exports: check class strength; download three different reports                 | Files open in Excel; the downloads appear in the audit log                            |        |
| A24 | Import        | Import a small student file with one mistake, fix it, import; then opening balances       | Nothing is saved while there are errors; the reconciliation shows "Matches"           |        |
| A25 | Audit log     | Find the actions you did today                                                            | Each change shows who, when, before and after                                         |        |
| A26 | Office role   | Sign in as `office@demo.local`; try to open Payroll or Users by typing the address        | Refused ("no access"); the menu shows only allowed items                              |        |

## Teacher Portal

| #   | Area       | Task                                                                        | Expected                                                     | Result |
| --- | ---------- | --------------------------------------------------------------------------- | ------------------------------------------------------------ | ------ |
| T1  | Sign-in    | Sign in as a teacher                                                        | Lands on the Teacher Portal, not the Admin Portal            |        |
| T2  | My classes | Open My classes and a class roster                                          | Only own sections; guardian phones visible                   |        |
| T3  | Attendance | Mark today's attendance for own class (one absent, one late); try yesterday | Saved for today; yesterday is not allowed                    |        |
| T4  | Marks      | Enter marks for an assigned subject; try above the maximum; submit          | Above-maximum refused; after submitting, marks are read-only |        |
| T5  | Timetable  | Open My timetable                                                           | The week matches the published timetables                    |        |
| T6  | Leave      | Apply for leave; cancel it; apply again                                     | Overlapping dates refused; the office sees the request       |        |
| T7  | Meetings   | Schedule a parent meeting for own student; mark it held with notes          | Can't schedule for another class's student                   |        |
| T8  | Payslips   | Open My payslips                                                            | Only approved months; own payslip only                       |        |
| T9  | Access     | Type an admin address (e.g. `/admin/fees/collect`)                          | "No access"                                                  |        |

## Sign-off

| Role       | Name | Date | Signature | Open issues (critical/high) |
| ---------- | ---- | ---- | --------- | --------------------------- |
| Principal  |      |      |           |                             |
| Office     |      |      |           |                             |
| Accountant |      |      |           |                             |
| Teacher    |      |      |           |                             |
