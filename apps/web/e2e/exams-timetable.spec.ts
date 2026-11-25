import { expect, request, test, type Page } from '@playwright/test';
import { ACCOUNTS, resetDatabase } from './db.ts';
import { API_PORT } from './env.ts';
import { confirmDialog, navTo } from './nav.ts';

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const addDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

async function signIn(page: Page, identifier: string, password: string, landing: RegExp) {
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill(identifier);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(landing);
}

/**
 * Through the API: current year; Class 10 – A with the E2E teacher as class teacher and Maths
 * teacher; two students; a grading scale; a Half-yearly exam (Maths, 100) open for marks entry.
 */
async function seed() {
  const api = await request.newContext({ baseURL: `http://localhost:${API_PORT}/api/v1/` });
  const { accessToken } = await (
    await api.post('auth/login', {
      data: { identifier: ACCOUNTS.admin.email, password: ACCOUNTS.admin.password },
    })
  ).json();
  const headers = { Authorization: `Bearer ${accessToken}` };
  const call = async (method: 'post' | 'put' | 'patch', url: string, data: object) => {
    const res = await api[method](url, { headers, data });
    expect(res.ok(), `${url}: ${await res.text()}`).toBe(true);
    return res.json();
  };
  const t = today();
  const y = Number(t.slice(0, 4));
  const year = await call('post', 'academic-years', {
    name: `${y}-${y + 1}`,
    startDate: addDays(t, -90),
    endDate: addDays(t, 200),
  });
  await call('post', `academic-years/${year.id}/activate`, {});
  const users = await (
    await api.get(`users?search=${encodeURIComponent(ACCOUNTS.teacher.email)}`, { headers })
  ).json();
  const emp = await call('post', 'employees', {
    firstName: 'Anil',
    lastName: 'Meena',
    designation: 'TGT Maths',
    joiningDate: '2015-07-01',
  });
  await call('patch', `employees/${emp.id}/user`, { userId: users.items[0].id });
  const classes = (await (await api.get('public/classes')).json()) as {
    id: string;
    name: string;
  }[];
  const classId = classes.find((c) => c.name === 'Class 10')!.id;
  const section = await call('post', 'sections', {
    academicYearId: year.id,
    classId,
    name: 'A',
    classTeacherId: emp.id,
  });
  const subject = await call('post', 'subjects', { name: 'Mathematics' });
  const [cs] = await call('put', 'class-subjects', {
    academicYearId: year.id,
    classId,
    subjects: [{ subjectId: subject.id }],
  });
  await call('post', 'teacher-assignments', {
    academicYearId: year.id,
    employeeId: emp.id,
    sectionId: section.id,
    classSubjectId: cs.id,
  });
  for (const firstName of ['Aarav', 'Bhavya']) {
    await call('post', 'students', {
      firstName,
      lastName: 'Sharma',
      dateOfBirth: '2011-05-10',
      guardians: [
        { fullName: 'Ramesh Sharma', relationship: 'FATHER', phone: '9829012345', isPrimary: true },
      ],
      enrolment: { academicYearId: year.id, sectionId: section.id, enrolmentDate: addDays(t, -60) },
    });
  }
  await call('post', 'exams/grading-scales', {
    name: 'Standard',
    bands: [
      { minPercentage: 75, maxPercentage: 100, gradeLabel: 'A' },
      { minPercentage: 33, maxPercentage: 74.99, gradeLabel: 'B' },
      { minPercentage: 0, maxPercentage: 32.99, gradeLabel: 'E' },
    ],
  });
  const exam = await call('post', 'exams', {
    academicYearId: year.id,
    classId,
    name: 'Half-yearly',
    examType: 'HALF_YEARLY',
  });
  await call('put', `exams/${exam.id}/subjects`, {
    subjects: [{ classSubjectId: cs.id, maxMarks: 100 }],
  });
  await call('post', `exams/${exam.id}/status`, { status: 'SCHEDULED' });
  await call('post', `exams/${exam.id}/status`, { status: 'MARKS_ENTRY' });
  await api.dispose();
}

test.describe('Exams, results & timetable', () => {
  test.beforeEach(async ({ page }) => {
    resetDatabase();
    await seed();
    page.on('dialog', (d) => void d.accept());
  });

  test('a teacher enters marks; the office approves, finalises and prints a report card', async ({
    page,
    browser,
  }) => {
    test.setTimeout(60_000);
    await signIn(page, ACCOUNTS.teacher.email, ACCOUNTS.teacher.password, /\/teacher$/);
    await navTo(page, 'Marks entry');
    await expect(page).toHaveURL(/\/teacher\/marks$/);
    await page.getByRole('link', { name: /Half-yearly Mathematics/ }).click();
    await page.getByLabel('Marks for Aarav Sharma', { exact: true }).fill('92');
    await page.getByLabel('Marks for Bhavya Sharma', { exact: true }).fill('45');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Saved marks for 2 student(s).')).toBeVisible();
    await page.getByRole('button', { name: 'Submit for approval' }).click();
    await confirmDialog(page, 'Submit');
    await expect(page.getByText('Marks submitted for approval.')).toBeVisible();
    await expect(page.getByRole('row', { name: 'Aarav Sharma' })).toContainText('Submitted');

    const officeContext = await browser.newContext();
    const office = await officeContext.newPage();
    office.on('dialog', (d) => void d.accept());
    await signIn(office, ACCOUNTS.admin.email, ACCOUNTS.admin.password, /\/admin$/);
    await navTo(office, 'Examinations');
    await expect(office).toHaveURL(/\/admin\/exams$/);
    await office.getByRole('link', { name: /Half-yearly/ }).click();
    await office
      .getByRole('row', { name: /Mathematics Class 10 – A/ })
      .getByRole('link', { name: 'Review' })
      .click();
    await office.getByRole('button', { name: 'Approve' }).click();
    await expect(office.getByText('Marks approved.')).toBeVisible();
    await office.getByRole('link', { name: 'Back to exam' }).click();
    await office.getByRole('button', { name: 'Finalise results' }).click();
    await confirmDialog(office, 'Finalise');
    await expect(office.getByText('Results finalised and locked.')).toBeVisible();

    await office.getByRole('link', { name: /^Results/ }).click();
    await expect(office.getByRole('row', { name: 'Aarav Sharma' })).toContainText('Pass');
    await expect(office.getByRole('row', { name: 'Aarav Sharma' })).toContainText('A');
    await office
      .getByRole('row', { name: 'Aarav Sharma' })
      .getByRole('link', { name: 'Report card' })
      .click();
    await expect(office.getByText(/Report card · Half-yearly/)).toBeVisible();
    await expect(office.getByText('First division')).toBeVisible();
    await officeContext.close();
  });

  test('the office publishes a timetable and the teacher sees their week', async ({
    page,
    browser,
  }) => {
    test.setTimeout(60_000);
    await signIn(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password, /\/admin$/);
    await navTo(page, 'Timetables');
    await expect(page).toHaveURL(/\/admin\/timetables$/);
    await page.getByRole('button', { name: 'New timetable' }).click();
    const dialog = page.getByRole('dialog', { name: 'New timetable' });
    await dialog
      .getByRole('combobox', { name: /^Class & section/ })
      .selectOption({ label: 'Class 10 – A' });
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(page).toHaveURL(/\/admin\/timetables\/[0-9a-f-]+$/);
    await page.getByLabel('Monday period 1 subject').selectOption({ label: 'Mathematics' });
    await expect(page.getByLabel('Monday period 1 teacher')).toHaveValue(/.+/);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Timetable saved.')).toBeVisible();
    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(page.getByText(/^Published\./)).toBeVisible();

    const teacherContext = await browser.newContext();
    const teacher = await teacherContext.newPage();
    await signIn(teacher, ACCOUNTS.teacher.email, ACCOUNTS.teacher.password, /\/teacher$/);
    await navTo(teacher, 'My timetable');
    await expect(
      teacher.getByRole('cell', { name: /Mathematics\s*Class 10 – A/ }).first(),
    ).toBeVisible();
    // Live week: dated columns, a legend, and every lesson coloured by its status.
    await expect(teacher.getByText(/^Week of /)).toBeVisible();
    await expect(teacher.getByText('Upcoming', { exact: true })).toBeVisible();
    expect(await teacher.locator('[data-status]').count()).toBeGreaterThan(0);
    await teacherContext.close();
  });
});
