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

/** Through the API: current year; Class 5 – A with the E2E teacher as class teacher; two students. */
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
    designation: 'TGT',
    joiningDate: '2015-07-01',
  });
  await call('patch', `employees/${emp.id}/user`, { userId: users.items[0].id });
  const classes = (await (await api.get('public/classes')).json()) as {
    id: string;
    name: string;
  }[];
  const section = await call('post', 'sections', {
    academicYearId: year.id,
    classId: classes.find((c) => c.name === 'Class 5')!.id,
    name: 'A',
    classTeacherId: emp.id,
  });
  for (const [firstName, gender] of [
    ['Aarav', 'MALE'],
    ['Bhavya', 'FEMALE'],
  ]) {
    await call('post', 'students', {
      firstName,
      lastName: 'Sharma',
      gender,
      dateOfBirth: '2016-05-14',
      guardians: [
        { fullName: 'Ramesh Sharma', relationship: 'FATHER', phone: '9829012345', isPrimary: true },
      ],
      enrolment: { academicYearId: year.id, sectionId: section.id, enrolmentDate: addDays(t, -60) },
    });
  }
  await api.dispose();
}

async function pickStudent(page: Page, label: RegExp, name: string) {
  await page.getByLabel(label).fill(name.split(' ')[0]);
  await page.getByRole('button', { name: new RegExp(name) }).click();
}

test.describe('School operations', () => {
  test.beforeEach(async ({ page }) => {
    resetDatabase();
    await seed();
    page.on('dialog', (d) => void d.accept());
  });

  test('the office runs transport, complaints and certificates', async ({ page }) => {
    test.setTimeout(60_000);
    await signIn(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password, /\/admin$/);

    // Transport: a van, a route with a stop, and a student on it.
    await page.getByRole('link', { name: 'Transport', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/transport$/);
    await page
      .getByRole('navigation', { name: 'Transport' })
      .getByRole('link', { name: 'Vehicles' })
      .click();
    await expect(page).toHaveURL(/\/vehicles$/);
    await page.getByRole('button', { name: 'New vehicle' }).click();
    await page.getByLabel(/Registration number/).fill('rj 14 pa 1234');
    await page.getByLabel('Seats').fill('12');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('cell', { name: 'RJ 14 PA 1234' })).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Transport' })
      .getByRole('link', { name: 'Routes' })
      .click();
    await expect(page).toHaveURL(/\/admin\/transport$/);
    await page.getByRole('button', { name: 'New route' }).click();
    await page.getByLabel(/Route name/).fill('Route 1 – Vaishali Nagar');
    await page.getByLabel('Vehicle').selectOption({ label: 'RJ 14 PA 1234 (12 seats)' });
    await page.getByRole('button', { name: 'Add stop' }).click();
    await page.getByLabel('Stop 1', { exact: true }).fill('Gandhi Path');
    await page.getByLabel('Pick-up').fill('07:05');
    await page.getByRole('button', { name: 'Save route' }).click();
    await expect(page.getByRole('heading', { name: 'Route 1 – Vaishali Nagar' })).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Transport' })
      .getByRole('link', { name: 'Students' })
      .click();
    await expect(page).toHaveURL(/\/transport\/students$/);
    await page.getByRole('button', { name: 'Assign student' }).click();
    await pickStudent(page, /^Student/, 'Aarav Sharma');
    const assign = page.getByRole('dialog');
    await assign.getByLabel(/^Route/).selectOption({ label: 'Route 1 – Vaishali Nagar (0/12)' });
    await assign.getByLabel('Stop').selectOption({ label: 'Gandhi Path' });
    await page.getByRole('button', { name: 'Assign', exact: true }).click();
    await expect(page.getByRole('cell', { name: /Aarav Sharma/ })).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Transport' })
      .getByRole('link', { name: 'Routes' })
      .click();
    await page.getByRole('link', { name: 'Route sheet' }).click();
    await expect(page.getByRole('cell', { name: /Aarav Sharma/ })).toBeVisible();
    await expect(page.getByRole('cell', { name: '9829012345' })).toBeVisible();

    // Complaints: log one, then resolve it with notes.
    await page.getByRole('link', { name: 'Complaints', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/complaints$/);
    await page.getByRole('button', { name: 'Log complaint' }).click();
    await page.getByLabel('Category').first().selectOption('TRANSPORT');
    await page.getByLabel(/Subject/).fill('Bus late every morning');
    await page.getByLabel(/Details/).fill('The route 1 bus is 20 minutes late.');
    await page.getByRole('button', { name: 'Log complaint' }).last().click();
    await expect(page.getByRole('heading', { name: 'Bus late every morning' })).toBeVisible();
    await expect(page.getByText(/CMP-\d{4}-00001/)).toBeVisible();
    await page.getByLabel('Status').selectOption('RESOLVED');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Write how the complaint was resolved')).toBeVisible();
    await page.getByLabel('Resolution notes').fill('Driver briefed; timing fixed.');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Saved.')).toBeVisible();
    await expect(page.getByText(/status resolved/)).toBeVisible();

    // Certificates: a bonafide certificate with a number and frozen wording.
    await page.getByRole('link', { name: 'Certificates', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/certificates$/);
    await page.getByLabel(/^Certificate/).selectOption({ label: 'Bonafide Certificate' });
    await pickStudent(page, /^Student/, 'Bhavya Sharma');
    await page.getByLabel(/Purpose/).fill('passport application');
    await page.getByRole('button', { name: 'Issue certificate' }).click();
    await expect(page).toHaveURL(/\/admin\/certificates\/[0-9a-f-]+$/);
    await expect(page.getByText(/BONAFIDE\/\d{4}\/0001/)).toBeVisible();
    await expect(page.getByText(/Bhavya Sharma, daughter of Ramesh Sharma/)).toBeVisible();
  });

  test('payroll is prepared and approved, and the teacher sees the payslip and books a parent meeting', async ({
    page,
    browser,
  }) => {
    test.setTimeout(60_000);
    await signIn(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password, /\/admin$/);
    await page.getByRole('link', { name: 'Payroll', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/payroll$/);
    await page.getByRole('button', { name: 'Prepare payroll' }).click();
    await expect(page).toHaveURL(/\/admin\/payroll\/[0-9a-f-]+$/);
    await page
      .getByRole('row', { name: /Anil Meena/ })
      .getByRole('button', { name: 'Edit' })
      .click();
    await page.getByLabel('Basic pay').fill('30000');
    await page.getByLabel('House rent allowance (HRA)').fill('4500');
    await page.getByLabel('Provident fund (PF)').fill('1800');
    await expect(page.getByText(/Net pay:\s*₹32,700$/)).toBeVisible();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('row', { name: /Anil Meena/ })).toContainText('₹32,700');
    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(
      page.getByText('Payroll approved. Staff can now see their payslips.'),
    ).toBeVisible();
    await expect(
      page.getByRole('row', { name: /Anil Meena/ }).getByRole('button', { name: 'Edit' }),
    ).toHaveCount(0);

    const teacher = await browser.newPage();
    await signIn(teacher, ACCOUNTS.teacher.email, ACCOUNTS.teacher.password, /\/teacher$/);
    await teacher.getByRole('link', { name: 'My payslips' }).click();
    await expect(teacher).toHaveURL(/\/teacher\/payslips$/);
    await teacher.getByRole('link', { name: 'View' }).click();
    await expect(teacher.getByText(/Net pay:\s*₹32,700$/)).toBeVisible();
    await expect(teacher.getByText('Rupees Thirty Two Thousand Seven Hundred Only')).toBeVisible();

    await teacher.getByRole('link', { name: 'Parent meetings' }).click();
    await expect(teacher).toHaveURL(/\/teacher\/meetings$/);
    await teacher.getByRole('button', { name: 'Schedule meeting' }).click();
    await teacher.getByLabel(/^Student/).selectOption({ label: 'Aarav Sharma' });
    await teacher.getByLabel(/Date and time/).fill(`${addDays(today(), 3)}T10:30`);
    await teacher.getByLabel('Purpose').fill('Maths progress');
    await teacher.getByRole('button', { name: 'Schedule', exact: true }).click();
    await expect(teacher.getByRole('cell', { name: /Aarav Sharma/ })).toBeVisible();
    await teacher.getByRole('button', { name: 'Update' }).click();
    await teacher.getByLabel(/What was discussed/).fill('Agreed on extra practice.');
    await teacher.getByRole('button', { name: 'Mark as held' }).click();
    await teacher.getByLabel('Show').selectOption('');
    await expect(teacher.getByRole('row', { name: /Aarav Sharma/ })).toContainText('Completed');
  });
});
