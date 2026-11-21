import { expect, request, test, type Page } from '@playwright/test';
import { ACCOUNTS, resetDatabase } from './db.ts';
import { API_PORT } from './env.ts';

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
 * Through the API: a current year (always containing today), the teacher's staff record linked to
 * their login, Class 1 – A with that teacher as class teacher, and two students.
 */
async function seedClass() {
  const api = await request.newContext({ baseURL: `http://localhost:${API_PORT}/api/v1/` });
  const { accessToken } = await (
    await api.post('auth/login', {
      data: { identifier: ACCOUNTS.admin.email, password: ACCOUNTS.admin.password },
    })
  ).json();
  const headers = { Authorization: `Bearer ${accessToken}` };
  const post = async (url: string, data: object) => {
    const res = await api.post(url, { headers, data });
    expect(res.ok(), `${url}: ${await res.text()}`).toBe(true);
    return res.json();
  };
  const t = today();
  const y = Number(t.slice(0, 4));
  const year = await post('academic-years', {
    name: `${y}-${y + 1}`,
    startDate: addDays(t, -60),
    endDate: addDays(t, 60),
  });
  await post(`academic-years/${year.id}/activate`, {});

  const users = await (
    await api.get(`users?search=${encodeURIComponent(ACCOUNTS.teacher.email)}`, { headers })
  ).json();
  const employee = await post('employees', {
    firstName: 'Sunita',
    lastName: 'Verma',
    designation: 'PRT',
    joiningDate: '2020-06-01',
  });
  const link = await api.patch(`employees/${employee.id}/user`, {
    headers,
    data: { userId: users.items[0].id },
  });
  expect(link.ok()).toBe(true);

  const classes = (await (await api.get('public/classes')).json()) as {
    id: string;
    name: string;
  }[];
  const section = await post('sections', {
    academicYearId: year.id,
    classId: classes.find((c) => c.name === 'Class 1')!.id,
    name: 'A',
    classTeacherId: employee.id,
  });
  for (const firstName of ['Aarav', 'Bhavya']) {
    await post('students', {
      firstName,
      lastName: 'Sharma',
      dateOfBirth: '2019-05-10',
      guardians: [
        { fullName: 'Ramesh Sharma', relationship: 'FATHER', phone: '9829012345', isPrimary: true },
      ],
      enrolment: { academicYearId: year.id, sectionId: section.id, enrolmentDate: addDays(t, -60) },
    });
  }
  await api.dispose();
}

test.describe('Attendance & leave', () => {
  test.beforeEach(async ({ page }) => {
    resetDatabase();
    await seedClass();
    page.on('dialog', (d) => void d.accept());
  });

  test('the class teacher marks today, and the office reviews and corrects attendance', async ({
    page,
    browser,
  }) => {
    test.setTimeout(60_000);
    // Teacher: dashboard → today's sheet → mark Bhavya absent → submit.
    await signIn(page, ACCOUNTS.teacher.email, ACCOUNTS.teacher.password, /\/teacher$/);
    await expect(page.getByRole('link', { name: /Class 1 – A/ }).first()).toContainText(
      'Mark today',
    );
    await page.getByRole('navigation').getByRole('link', { name: 'Attendance' }).click();
    await expect(page).toHaveURL(/\/teacher\/attendance$/);
    await page.getByRole('link', { name: /Class 1 – A/ }).click();
    const bhavya = page.getByRole('row', { name: 'Bhavya Sharma' });
    await bhavya.getByRole('radio', { name: 'Absent' }).check({ force: true });
    await bhavya.getByLabel('Remarks for Bhavya Sharma').fill('Fever');
    await page.getByRole('button', { name: 'Submit attendance' }).click();
    await expect(page.getByText(/^2 marked/)).toBeVisible();
    await expect(page.getByText('Marked 2/2')).toBeVisible();

    // Yesterday is read-only for the teacher.
    await page.getByLabel('Date').fill(addDays(today(), -1));
    await expect(
      page.getByText('Only the office can change attendance for past days.'),
    ).toBeVisible();

    // Office: dashboard and daily report reflect it.
    const officeContext = await browser.newContext();
    const office = await officeContext.newPage();
    office.on('dialog', (d) => void d.accept());
    await signIn(office, ACCOUNTS.admin.email, ACCOUNTS.admin.password, /\/admin$/);
    await expect(office.getByRole('link', { name: /Attendance today/ })).toContainText('50%');
    await office.getByRole('navigation').getByRole('link', { name: 'Daily Report' }).click();
    await expect(office).toHaveURL(/\/admin\/attendance\/daily$/);
    const row = office.getByRole('row', { name: /Class 1 – A/ });
    await expect(row).toContainText('Sunita Verma');
    await expect(row).toContainText('2/2');

    // Office corrects yesterday (not marked by the teacher) — a reason is required.
    await office.getByRole('navigation').getByRole('link', { name: 'Mark & Correct' }).click();
    await expect(office).toHaveURL(/\/admin\/attendance$/);
    await office.getByLabel('Class & section').selectOption({ label: 'Class 1 – A' });
    await office.getByLabel('Date', { exact: true }).fill(addDays(today(), -1));
    await office.getByRole('button', { name: 'Submit attendance' }).click();
    await expect(office.getByText(/Give a reason/)).toBeVisible();
    await office
      .getByLabel('Reason for changing past attendance')
      .fill('Entered from the paper register');
    await office.getByRole('button', { name: 'Submit attendance' }).click();
    await expect(office.getByText(/^2 marked/)).toBeVisible();
    await expect(office.getByRole('row', { name: 'Aarav Sharma' })).toContainText(
      'Entered from the paper register',
    );

    // The class register shows both days.
    await office.getByRole('navigation').getByRole('link', { name: 'Class Register' }).click();
    await expect(office).toHaveURL(/\/admin\/attendance\/register$/);
    await office.getByLabel('Class & section').selectOption({ label: 'Class 1 – A' });
    await office.getByLabel('Month').fill(today().slice(0, 7));
    await expect(office.getByRole('row', { name: 'Bhavya Sharma' })).toContainText('A');
    await officeContext.close();
  });

  test('a teacher applies for leave and the office approves it', async ({ page, browser }) => {
    await signIn(page, ACCOUNTS.teacher.email, ACCOUNTS.teacher.password, /\/teacher$/);
    await page.getByRole('navigation').getByRole('link', { name: 'My leave' }).click();
    await page.getByLabel('Type of leave').selectOption({ label: 'Sick / medical leave' });
    await page.getByLabel('From').fill(addDays(today(), 2));
    await page.getByLabel('To').fill(addDays(today(), 3));
    await expect(page.getByText('2 calendar days')).toBeVisible();
    await page.getByLabel('Reason').fill('Medical appointment in Jaipur');
    await page.getByRole('button', { name: 'Send for approval' }).click();
    await expect(page.getByText('Leave request sent for approval.')).toBeVisible();
    await expect(page.getByRole('listitem', { name: /Sick/ })).toContainText('Pending');

    const officeContext = await browser.newContext();
    const office = await officeContext.newPage();
    await signIn(office, ACCOUNTS.admin.email, ACCOUNTS.admin.password, /\/admin$/);
    await expect(office.getByRole('link', { name: /Leave requests to review/ })).toContainText('1');
    await office.getByRole('navigation').getByRole('link', { name: 'Staff Leave' }).click();
    await office
      .getByRole('row', { name: /Sunita Verma/ })
      .getByRole('button', { name: 'Approve' })
      .click();
    const dialog = office.getByRole('dialog', { name: /Approve leave for Sunita Verma/ });
    await dialog.getByLabel('Remarks (optional)').fill('Get well soon');
    await dialog.getByRole('button', { name: 'Approve' }).click();
    await expect(office.getByText('No pending requests')).toBeVisible();
    await officeContext.close();

    await page.reload();
    const item = page.getByRole('listitem', { name: /Sick/ });
    await expect(item).toContainText('Approved');
    await expect(item).toContainText('Get well soon');
  });
});
