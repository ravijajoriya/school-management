import { expect, test, type Page } from '@playwright/test';
import { ACCOUNTS, resetDatabase } from './db.ts';
import { navTo } from './nav.ts';

async function signIn(page: Page, identifier: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill(identifier);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

async function changePassword(page: Page, current: string, next: string) {
  await expect(page.getByRole('heading', { name: 'Change password' })).toBeVisible();
  await page.getByLabel('Current password').fill(current);
  await page.getByLabel('New password', { exact: true }).fill(next);
  await page.getByLabel('Confirm new password').fill(next);
  await page.getByRole('button', { name: 'Update password' }).click();
}

async function signOut(page: Page, fullName: string) {
  await page.getByRole('button', { name: new RegExp(fullName) }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

test.describe('Staff authentication', () => {
  test('admin first login: forced password change, then the admin portal', async ({ page }) => {
    resetDatabase({ adminPending: true });

    await page.goto('/admin/users');
    await expect(page).toHaveURL(/\/login$/);

    await signIn(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password);
    await expect(page).toHaveURL(/\/change-password$/);
    await changePassword(page, ACCOUNTS.admin.password, 'Fresh-Admin-2');

    await expect(
      page.getByRole('heading', { name: `Welcome, ${ACCOUNTS.admin.fullName}` }),
    ).toBeVisible();
    await expect(page.getByRole('navigation')).toContainText('Audit Logs');

    // The old password no longer works.
    await signOut(page, ACCOUNTS.admin.fullName);
    await signIn(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password);
    await expect(page.getByRole('alert')).toHaveText('Invalid email/phone or password');
  });

  test('admin adds a teacher who signs in with the temporary password', async ({ page }) => {
    resetDatabase();
    await signIn(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password);
    await navTo(page, 'Users');
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();

    await page.getByRole('button', { name: 'Add user' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add user' });
    await dialog.getByLabel('Full name').fill('Meera Joshi');
    await dialog.getByLabel('Phone').fill('98290 12345');
    await dialog.getByLabel('Teacher').check();
    await dialog.getByRole('button', { name: 'Create user' }).click();

    const passwordDialog = page.getByRole('dialog', { name: 'Temporary password' });
    const temporaryPassword = (await passwordDialog.locator('code').textContent())!.trim();
    expect(temporaryPassword).toMatch(/^\w{4}-\w{4}-\w{4}$/);
    await passwordDialog.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('row', { name: /Meera Joshi/ })).toContainText(
      'Password change pending',
    );

    await signOut(page, ACCOUNTS.admin.fullName);
    await signIn(page, '9829012345', temporaryPassword);
    await changePassword(page, temporaryPassword, 'Meera-Pass-9');
    await expect(page).toHaveURL(/\/teacher$/);
    await expect(page.getByRole('heading', { name: 'Welcome, Meera Joshi' })).toBeVisible();

    // Teachers cannot enter the admin portal.
    await page.goto('/admin');
    await expect(
      page.getByRole('heading', { name: 'You don’t have access to this page' }),
    ).toBeVisible();
  });

  test('session survives a page reload and ends on sign out', async ({ page }) => {
    resetDatabase();
    await signIn(page, ACCOUNTS.teacher.email, ACCOUNTS.teacher.password);
    await expect(page).toHaveURL(/\/teacher$/);

    await page.reload();
    await expect(
      page.getByRole('heading', { name: `Welcome, ${ACCOUNTS.teacher.fullName}` }),
    ).toBeVisible();

    await signOut(page, ACCOUNTS.teacher.fullName);
    await page.goto('/teacher');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('a deactivated user is signed out and cannot sign back in', async ({ page, browser }) => {
    resetDatabase();
    // Teacher signs in in one browser…
    const teacherContext = await browser.newContext();
    const teacherPage = await teacherContext.newPage();
    await signIn(teacherPage, ACCOUNTS.teacher.email, ACCOUNTS.teacher.password);
    await expect(teacherPage).toHaveURL(/\/teacher$/);

    // …while the admin deactivates them in another.
    await signIn(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password);
    await expect(page).toHaveURL(/\/admin$/);
    await navTo(page, 'Users');
    await page
      .getByRole('row', { name: /E2E Teacher/ })
      .getByRole('button', { name: 'Edit' })
      .click();
    const dialog = page.getByRole('dialog', { name: /Edit E2E Teacher/ });
    await dialog.getByLabel('Status').selectOption('INACTIVE');
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('row', { name: /E2E Teacher/ })).toContainText('Inactive');

    // The teacher's session is gone on the next page load.
    await teacherPage.reload();
    await expect(teacherPage).toHaveURL(/\/login$/);
    await signIn(teacherPage, ACCOUNTS.teacher.email, ACCOUNTS.teacher.password);
    await expect(teacherPage.getByRole('alert')).toContainText('inactive');
    await teacherContext.close();
  });
});
