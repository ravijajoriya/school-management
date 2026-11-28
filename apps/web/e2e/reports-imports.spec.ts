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

/** Through the API: current year with Class 5 – A (empty). */
async function seed() {
  const api = await request.newContext({ baseURL: `http://localhost:${API_PORT}/api/v1/` });
  const { accessToken } = await (
    await api.post('auth/login', {
      data: { identifier: ACCOUNTS.admin.email, password: ACCOUNTS.admin.password },
    })
  ).json();
  const headers = { Authorization: `Bearer ${accessToken}` };
  const call = async (url: string, data: object) => {
    const res = await api.post(url, { headers, data });
    expect(res.ok(), `${url}: ${await res.text()}`).toBe(true);
    return res.json();
  };
  const t = today();
  const y = Number(t.slice(0, 4));
  const year = await call('academic-years', {
    name: `${y}-${y + 1}`,
    startDate: addDays(t, -90),
    endDate: addDays(t, 200),
  });
  await call(`academic-years/${year.id}/activate`, {});
  const classes = (await (await api.get('public/classes')).json()) as {
    id: string;
    name: string;
  }[];
  await call('sections', {
    academicYearId: year.id,
    classId: classes.find((c) => c.name === 'Class 5')!.id,
    name: 'A',
  });
  await api.dispose();
}

const HEADER =
  'admission_number,first_name,last_name,gender,date_of_birth,class,section,roll_number,guardian_name,guardian_relationship,guardian_phone';

test.describe('Reports, exports & data import', () => {
  test.beforeEach(async ({ page }) => {
    resetDatabase();
    await seed();
    page.on('dialog', (d) => void d.accept());
  });

  test('the office checks a spreadsheet, fixes it, imports it and downloads reports', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await signIn(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password, /\/admin$/);

    await navTo(page, 'Import Data');
    await expect(page).toHaveURL(/\/admin\/imports$/);
    const template = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download template' }).click();
    expect((await template).suggestedFilename()).toBe('students-template.csv');

    // A file with a mistake: nothing is saved, the problem is listed by row.
    const bad = `${HEADER}\n2019/0456,Aarav,Sharma,M,14/05/2016,Class 5,A,1,Ramesh Sharma,FATHER,98290\n`;
    await page
      .getByLabel(/Spreadsheet/)
      .setInputFiles({ name: 'students.csv', mimeType: 'text/csv', buffer: Buffer.from(bad) });
    await page.getByRole('button', { name: 'Check file' }).click();
    await expect(page.getByText('1 problem in 1 rows. Nothing was saved')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'guardian_phone' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Import', exact: true })).toBeDisabled();

    const good = `${HEADER}\n2019/0456,Aarav,Sharma,M,14/05/2016,Class 5,A,1,Ramesh Sharma,FATHER,9829012345\n,Bhavya,Meena,F,02/08/2016,5,A,2,Kamla Meena,MOTHER,9414012345\n`;
    await page
      .getByLabel(/Spreadsheet/)
      .setInputFiles({ name: 'students.csv', mimeType: 'text/csv', buffer: Buffer.from(good) });
    await page.getByRole('button', { name: 'Check file' }).click();
    await expect(page.getByText('All 2 rows are valid. Click Import to add them.')).toBeVisible();
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await confirmDialog(page, 'Import');
    await expect(page.getByText('Imported 2 records from students.csv.')).toBeVisible();
    await expect(page.getByRole('row', { name: /Class 5 – A 2 2 Matches/ })).toBeVisible();
    await expect(page.getByRole('cell', { name: '2 of 2' })).toBeVisible();

    // The dashboard counts them; the reports page shows class strength and downloads Excel.
    await navTo(page, 'Dashboard');
    await expect(page).toHaveURL(/\/admin$/);
    const students = page.getByRole('region', { name: 'Students & admissions' });
    await expect(students.getByText(/^Students \(/)).toBeVisible();
    await expect(students).toContainText('2');

    await navTo(page, 'Reports & Exports');
    await expect(page).toHaveURL(/\/admin\/reports$/);
    await expect(page.getByRole('row', { name: /Class 5 – A .* 1 1 0 2/ })).toBeVisible();
    const strengthCard = page
      .locator('div')
      .filter({ has: page.getByRole('heading', { name: /Class strength/ }) })
      .first();
    const download = page.waitForEvent('download');
    await strengthCard.getByRole('button', { name: 'Excel' }).first().click();
    expect((await download).suggestedFilename()).toMatch(/^class-strength-.*\.xlsx$/);

    // Students list: export what is on screen as CSV.
    await navTo(page, 'Students');
    await expect(page).toHaveURL(/\/admin\/students$/);
    await expect(page.getByRole('link', { name: 'Aarav Sharma', exact: true })).toBeVisible();
    const csv = page.waitForEvent('download');
    await page.getByRole('button', { name: 'CSV' }).click();
    const file = await csv;
    expect(file.suggestedFilename()).toMatch(/^students-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
