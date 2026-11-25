import { expect, request, test, type Page } from '@playwright/test';
import { ACCOUNTS, resetDatabase } from './db.ts';
import { API_PORT } from './env.ts';
import { confirmDialog, navTo } from './nav.ts';

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const addDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill(ACCOUNTS.admin.email);
  await page.getByLabel('Password').fill(ACCOUNTS.admin.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

/** Through the API: a current year with Class 1 – A and one student. */
async function seedStudent() {
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
    startDate: addDays(t, -90),
    endDate: addDays(t, 200),
  });
  await post(`academic-years/${year.id}/activate`, {});
  const classes = (await (await api.get('public/classes')).json()) as {
    id: string;
    name: string;
  }[];
  const section = await post('sections', {
    academicYearId: year.id,
    classId: classes.find((c) => c.name === 'Class 1')!.id,
    name: 'A',
  });
  await post('students', {
    firstName: 'Aarav',
    lastName: 'Sharma',
    dateOfBirth: '2019-05-10',
    guardians: [
      { fullName: 'Ramesh Sharma', relationship: 'FATHER', phone: '9829012345', isPrimary: true },
    ],
    enrolment: { academicYearId: year.id, sectionId: section.id, enrolmentDate: addDays(t, -60) },
  });
  await api.dispose();
}

test.describe('Fees & receipts', () => {
  test.beforeEach(async ({ page }) => {
    resetDatabase();
    await seedStudent();
    page.on('dialog', (d) => void d.accept());
  });

  test('the office sets up fees, collects a payment, prints the receipt and voids it', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await signIn(page);

    // Fee head and a plan for Class 1, then bill the class.
    await navTo(page, 'Fee Heads');
    await expect(page).toHaveURL(/\/admin\/fees\/heads$/);
    await page.getByRole('button', { name: 'New fee head' }).click();
    const headDialog = page.getByRole('dialog', { name: 'New fee head' });
    await headDialog.getByLabel('Code').fill('TUITION');
    await headDialog.getByLabel('Name').fill('Tuition fee');
    await headDialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('cell', { name: 'Tuition fee' })).toBeVisible();

    await navTo(page, 'Fee Plans');
    await expect(page).toHaveURL(/\/admin\/fees\/plans$/);
    await page.getByRole('button', { name: 'New fee plan' }).click();
    const planDialog = page.getByRole('dialog', { name: 'New fee plan' });
    await planDialog.getByRole('combobox', { name: /^Class/ }).selectOption({ label: 'Class 1' });
    await planDialog.getByLabel('Plan name').fill('Annual fees');
    await planDialog.getByLabel('Fee head 1').selectOption({ label: 'Tuition fee' });
    await planDialog.getByLabel('Instalment label 1').fill('Q1');
    await planDialog.getByLabel('Amount 1').fill('3000');
    await planDialog.getByLabel('Due date 1').fill(addDays(today(), -10));
    await planDialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('not billed yet')).toBeVisible();
    await page.getByRole('button', { name: 'Generate dues' }).click();
    await confirmDialog(page, 'Generate dues');
    await expect(page.getByText('1 dues created for Class 1.')).toBeVisible();

    // Collect: the overdue instalment is pre-selected.
    await navTo(page, 'Collect Fees');
    await expect(page).toHaveURL(/\/admin\/fees\/collect$/);
    await page.getByLabel('Find student').fill('Aarav');
    await page.getByRole('button', { name: /Aarav Sharma/ }).click();
    await expect(page.getByLabel('Paying now for Tuition fee — Q1')).toHaveValue('3000');
    await page.getByRole('button', { name: 'Record ₹3,000 & print receipt' }).click();

    await expect(page).toHaveURL(/\/admin\/fees\/receipts\//);
    await expect(page.getByText(/Payment recorded — receipt RCT\//)).toBeVisible();
    await expect(page.getByText('Rupees Three Thousand Only')).toBeVisible();
    await expect(page.getByText('Ramesh Sharma')).toBeVisible();

    // The ledger shows it paid; void it and the due is payable again.
    await page.goto('/admin/fees/payments');
    await page.getByRole('link', { name: 'Aarav Sharma' }).click();
    await expect(page.getByRole('row', { name: 'Tuition fee — Q1' })).toContainText('Paid');
    await page.getByRole('button', { name: 'Void / reverse' }).click();
    const voidDialog = page.getByRole('dialog', { name: /Void or reverse RCT\// });
    await voidDialog.getByLabel('Reason').fill('Entered for the wrong student');
    await voidDialog.getByRole('button', { name: 'Void payment' }).click();
    await expect(page.getByRole('row', { name: 'Tuition fee — Q1' })).toContainText('Unpaid');
    await expect(page.getByRole('listitem', { name: /Payment RCT\// })).toContainText('Void');

    // The receipt is kept, marked cancelled.
    await page.getByRole('link', { name: 'Receipt', exact: true }).click();
    await expect(page.getByRole('status')).toContainText(
      'This receipt is cancelled: Entered for the wrong student',
    );
  });
});
