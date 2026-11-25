import { expect, request, test, type Page } from '@playwright/test';
import { ACCOUNTS, resetDatabase } from './db.ts';
import { API_PORT } from './env.ts';
import { confirmDialog, navTo } from './nav.ts';

async function signIn(page: Page, identifier: string, password: string, landing: RegExp) {
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill(identifier);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(landing);
}

/** Session that contains today (April–March), e.g. 2026 for November 2026. */
function currentSessionStart() {
  const [year, month] = new Date()
    .toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    .split('-')
    .map(Number);
  return month >= 4 ? year : year - 1;
}

/** Sets up a current year with Class 1 – A through the API, so a test can start mid-flow. */
async function seedYearWithSection() {
  const api = await request.newContext({ baseURL: `http://localhost:${API_PORT}/api/v1/` });
  const login = await api.post('auth/login', {
    data: { identifier: ACCOUNTS.admin.email, password: ACCOUNTS.admin.password },
  });
  const { accessToken } = (await login.json()) as { accessToken: string };
  const headers = { Authorization: `Bearer ${accessToken}` };
  const y = currentSessionStart();
  const year = await (
    await api.post('academic-years', {
      headers,
      data: { name: `${y}-${y + 1}`, startDate: `${y}-04-01`, endDate: `${y + 1}-03-31` },
    })
  ).json();
  await api.post(`academic-years/${year.id}/activate`, { headers });
  const classes = (await (await api.get('public/classes')).json()) as {
    id: string;
    name: string;
  }[];
  const class1 = classes.find((c) => c.name === 'Class 1')!;
  const section = await api.post('sections', {
    headers,
    data: { academicYearId: year.id, classId: class1.id, name: 'A', capacity: 30 },
  });
  expect(section.ok()).toBe(true);
  await api.dispose();
}

test.describe('Academics, staff & students', () => {
  test.beforeEach(({ page }) => {
    resetDatabase();
    // Accept the "are you sure?" confirmations (make current, etc.).
    page.on('dialog', (d) => void d.accept());
  });

  test('the office sets up the year, registers a student and the class teacher sees them', async ({
    page,
    browser,
  }) => {
    await signIn(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password, /\/admin$/);

    // 1. Academic year, made current.
    await navTo(page, 'Academic Years');
    await page.getByRole('button', { name: 'New academic year' }).click();
    const yearDialog = page.getByRole('dialog', { name: 'New academic year' });
    const y = currentSessionStart();
    await expect(yearDialog.getByLabel('Name')).toHaveValue(`${y}-${y + 1}`);
    await yearDialog.getByRole('button', { name: 'Save' }).click();
    await page.getByRole('button', { name: 'Make current' }).click();
    await confirmDialog(page, 'Make current');
    await expect(page.getByText('Current', { exact: true })).toBeVisible();

    // 2. Staff record, linked to the teacher's existing login.
    await navTo(page, 'Staff');
    await page.getByRole('button', { name: 'Add staff member' }).click();
    const staffDialog = page.getByRole('dialog', { name: 'Add staff member' });
    await staffDialog.getByLabel('First name').fill('Sunita');
    await staffDialog.getByLabel('Last name').fill('Verma');
    await staffDialog.getByLabel('Designation').fill('PRT');
    await staffDialog.getByLabel('Email').fill(ACCOUNTS.teacher.email);
    await staffDialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('heading', { name: 'Sunita Verma' })).toBeVisible();
    await expect(page.getByText(/EMP-\d{4}/)).toBeVisible();
    await page.getByRole('button', { name: 'Link existing login' }).click();
    await page.getByRole('button', { name: `Link ${ACCOUNTS.teacher.fullName}` }).click();
    await expect(page.getByText(`Signs in with ${ACCOUNTS.teacher.email}`)).toBeVisible();

    // 3. Section with Sunita as class teacher.
    await navTo(page, 'Classes & Sections');
    await page.getByRole('button', { name: 'Add section to Class 1', exact: true }).click();
    const sectionDialog = page.getByRole('dialog', { name: 'New section in Class 1' });
    await expect(sectionDialog.getByLabel('Section name')).toHaveValue('A');
    await sectionDialog.getByLabel('Capacity').fill('30');
    await sectionDialog.getByLabel('Class teacher').selectOption({ label: 'Sunita Verma · PRT' });
    await sectionDialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('row', { name: /Sunita Verma/ })).toContainText('0 / 30');

    // 4. Register a student straight into Class 1 – A.
    await navTo(page, 'Students');
    await page.getByRole('button', { name: 'Register student' }).click();
    await page.getByLabel('First name').fill('Aarav');
    await page.getByLabel('Last name').fill('Sharma');
    await page.getByLabel('Date of birth').fill('2020-05-14');
    await page.getByLabel('Full name').fill('Ramesh Sharma');
    await page.getByLabel('Phone').fill('9829012345');
    await page.getByLabel('Class & section').selectOption({ label: 'Class 1 – A (0/30)' });
    await page.getByRole('button', { name: 'Register student' }).click();

    await expect(page.getByRole('heading', { name: 'Aarav Sharma' })).toBeVisible();
    await expect(page.getByText(/ADM-\d{4}-\d{5}/)).toBeVisible();
    await expect(page.getByRole('row', { name: /Class 1 – A/ })).toContainText('Studying');

    // 5. The class teacher sees the student in their roster, and nothing else.
    const teacherContext = await browser.newContext();
    const teacher = await teacherContext.newPage();
    await signIn(teacher, ACCOUNTS.teacher.email, ACCOUNTS.teacher.password, /\/teacher$/);
    // Dashboard: "Today's attendance" and "Your classes" both list the section.
    await expect(teacher.getByRole('link', { name: /Class 1 – A.*Class teacher/ })).toBeVisible();
    await expect(teacher.getByRole('link', { name: /Class 1 – A.*Mark today/ })).toBeVisible();
    await navTo(teacher, 'My classes');
    await expect(teacher).toHaveURL(/\/teacher\/classes$/);
    await teacher.getByRole('link', { name: /Class 1 – A/ }).click();
    await expect(teacher.getByRole('row', { name: /Aarav Sharma/ })).toContainText('Ramesh Sharma');
    await teacher.goto('/admin/students');
    await expect(teacher.getByRole('heading', { name: /have access to this page/ })).toBeVisible();
    await teacherContext.close();
  });

  test('an admission enquiry becomes an enrolled student in one step', async ({ page }) => {
    await seedYearWithSection();

    await page.goto('/admissions');
    await page.getByLabel("Parent's Name").fill('Sunita Verma');
    await page.getByLabel('Contact Number').fill('9001122334');
    await page.getByLabel("Child's Name").fill('Diya Verma');
    await page.getByLabel('Class Seeking Admission For').selectOption({ label: 'Class 1' });
    await page.getByRole('button', { name: 'Submit Enquiry' }).click();
    const reference = (await page.getByRole('status').locator('strong').textContent())!.trim();

    await signIn(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password, /\/admin$/);
    await navTo(page, 'Enquiries');
    await page.getByRole('link', { name: reference }).click();
    await page.getByRole('button', { name: 'Convert to student' }).click();

    const dialog = page.getByRole('dialog', { name: `Convert ${reference} to a student` });
    await expect(dialog.getByLabel('First name')).toHaveValue('Diya');
    await expect(dialog.getByLabel('Last name')).toHaveValue('Verma');
    await expect(dialog.getByLabel('Phone')).toHaveValue('9001122334');
    // The first section of the class the parent asked for is pre-selected.
    await expect(dialog.getByLabel('Class & section')).not.toHaveValue('');
    await dialog.getByLabel('Relationship').selectOption({ label: 'Mother' });
    await dialog.getByLabel('Date of birth').fill('2020-02-02');
    await dialog.getByRole('button', { name: 'Register & enrol' }).click();

    await expect(page.getByRole('heading', { name: 'Diya Verma' })).toBeVisible();
    await expect(page.getByText(`from enquiry ${reference}`)).toBeVisible();
    await expect(page.getByRole('row', { name: /Class 1 – A/ })).toContainText('Studying');

    // Back on the enquiry: it links to the student and cannot be converted twice.
    await page.goto('/admin/enquiries');
    await page.getByRole('link', { name: reference }).click();
    await expect(page.getByText('Admitted as')).toContainText('Diya Verma');
    await expect(page.getByLabel('Status', { exact: true })).toHaveValue('ADMISSION_CONFIRMED');
    await expect(page.getByRole('button', { name: 'Convert to student' })).toHaveCount(0);
  });
});
