# Runbook: data migration at go-live

Goal: bring the school's existing records into the new system correctly, with proof that nothing was lost.

Tool: **Admin → Administration → Import Data**. It needs the `data_import.run` permission, plus permission for the data itself:

- `students.manage` for students
- `employees.manage` for staff
- `fees.configure` for opening balances

## What can be imported

| Import               | One row per         | Creates                                                                                                             |
| -------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Students             | student             | The student, one or two guardians (the first is the primary contact) and an enrolment in the current year's section |
| Staff                | staff member        | The staff record (logins are created later under Staff → Create login)                                              |
| Opening fee balances | student owing money | One due "Opening balance (previous system)" under fee head `OPENING`                                                |

Attendance and exam results from the old system are **not** imported. Keep the old registers and mark sheets for reference; the new system starts recording from go-live.

Each import page shows the exact columns. **Download template** gives an empty sheet with the right headers and an example row.

## Order of work

1. **Set up the structure first** (not imported):
   - The academic year (made current).
   - Classes and their sections.
   - Subjects.
   - Fee heads and fee plans.
2. **Staff:** import, then create logins for those who need them.
3. **Students:** import class by class, or all at once.
4. **Opening balances:** import only after students, because each balance needs a current student.
5. Generate this year's fee dues from the fee plans (Fees → Fee Plans) **after** the opening balances.

## Rehearsal (do this at least once before go-live)

1. Take a copy of the live database, or use a separate rehearsal database: `pnpm backup`, then `pnpm restore … --target <rehearsal-db>`.
2. Point a local copy of the system at the rehearsal database.
3. Run every import with the school's real files:
   - **Check file** until it is clean.
   - Then **Import**.
4. Reconcile against the old system (table below). Every line must match before go-live.
5. Record the timings and any fixes made to the files. Throw the rehearsal database away.

## Reconciliation checklist

The import result shows **in file** against **in system** for each line. In addition, the school's office checks:

| Check                         | Old system / register           | New system                                             | Who signs  |
| ----------------------------- | ------------------------------- | ------------------------------------------------------ | ---------- |
| Students per class/section    | Class register count            | Reports & Exports → Class strength                     | Principal  |
| Boys / girls per section      | Register                        | Class strength                                         | Office     |
| Staff count                   | Staff register                  | Staff list (export CSV)                                | Office     |
| Total fees outstanding        | Old fee software / ledger total | Import result "Total balance", then Fee Reports → Dues | Accountant |
| Three random students in full | Admission register              | Student page (name, DOB, guardian, phone, class, roll) | Office     |

## Rules the import enforces

- **Nothing is saved until the whole file is clean.** One wrong row means nothing is imported; fix it and check again.
- **Duplicates are refused:** within the file, and against what is already in the system. This covers admission numbers, roll numbers in a section and employee codes. Importing the same file twice is refused.
- **A student can have only one opening balance.**
- **Leave admission numbers or employee codes empty** to have the system number them (`ADM-2026-00001`, `EMP-0001`).
- **Accepted formats:**
  - Dates: DD/MM/YYYY or YYYY-MM-DD.
  - Gender: M/F (or MALE/FEMALE/OTHER).
  - Class: "Class 5", "5", "LKG" or "Nursery".
- **Every import is recorded** in the audit log and listed under "Past imports".

## If a mistake is found after importing

Imported records are ordinary records:

- Correct them on the student or staff page.
- Withdraw a student imported by mistake.
- For a wrong opening balance, record a waiver or adjustment (Fees). Don't try to delete it; fee records are protected.
