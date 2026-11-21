import { expect, test, type Page } from '@playwright/test';
import { ACCOUNTS, resetDatabase } from './db.ts';
import { navTo } from './nav.ts';

async function signInAsAdmin(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill(ACCOUNTS.admin.email);
  await page.getByLabel('Password').fill(ACCOUNTS.admin.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test.describe('Public website & CMS', () => {
  test.beforeEach(() => resetDatabase());

  test('a parent submits an admission enquiry and staff follow it up', async ({ page }) => {
    await page.goto('/admissions');
    await page.getByLabel("Parent's Name").fill('Ramesh Sharma');
    await page.getByLabel('Contact Number').fill('98290 12345');
    await page.getByLabel("Child's Name").fill('Aarav Sharma');
    await page.getByLabel('Class Seeking Admission For').selectOption({ label: 'Class 5' });
    await page.getByRole('button', { name: 'Submit Enquiry' }).click();

    const status = page.getByRole('status');
    await expect(status).toContainText('Your reference number is');
    const reference = (await status.locator('strong').textContent())!.trim();
    expect(reference).toMatch(/^ENQ-\d{4}-\d{5}$/);

    await signInAsAdmin(page);
    await expect(page.getByText('New enquiries')).toBeVisible();
    await navTo(page, 'Enquiries');
    await page.getByRole('link', { name: reference }).click();
    await expect(page.getByRole('heading', { name: 'Aarav Sharma' })).toBeVisible();

    await page.getByLabel('What happened?').fill('Called the parent; campus visit on Saturday.');
    await page.getByLabel('Change status to').selectOption({ label: 'Visit scheduled' });
    await page.getByRole('button', { name: 'Save follow-up' }).click();

    await expect(page.getByLabel('Status', { exact: true })).toHaveValue('VISIT_SCHEDULED');
    await expect(page.getByLabel('Assigned to')).toHaveValue(/.+/);
    await expect(page.getByText('Called the parent; campus visit on Saturday.')).toBeVisible();
  });

  test('page edits stay private until published', async ({ page, browser }) => {
    await signInAsAdmin(page);
    await navTo(page, 'Website Pages');
    await page.getByRole('link', { name: /Home page/ }).click();

    const heading = page.getByLabel('Highlighted words (gold)').first();
    await heading.fill('Brighter Tomorrows');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Draft saved.')).toBeVisible();

    const visitor = await browser.newPage();
    await visitor.goto('/');
    await expect(visitor.getByRole('heading', { level: 1 })).toContainText('Bright Futures');

    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(page.getByText('Published!')).toBeVisible();
    await visitor.reload();
    await expect(visitor.getByRole('heading', { level: 1 })).toContainText('Brighter Tomorrows');
    await visitor.close();
  });

  test('a published announcement appears on the home page', async ({ page }) => {
    await signInAsAdmin(page);
    await navTo(page, 'Announcements');
    await page.getByRole('button', { name: 'New announcement' }).click();
    const dialog = page.getByRole('dialog', { name: 'New announcement' });
    await dialog.getByLabel('Title').fill('School closed on Makar Sankranti');
    await dialog.getByLabel('Text').fill('The school will remain closed on 14th January.');
    await dialog.getByLabel('Status').selectOption('PUBLISHED');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('row', { name: /Makar Sankranti/ })).toContainText('On website');

    await page.goto('/');
    await page.getByRole('link', { name: /School closed on Makar Sankranti/ }).click();
    await expect(page.getByText('The school will remain closed on 14th January.')).toBeVisible();
  });

  test('contact messages reach the admin inbox', async ({ page }) => {
    await page.goto('/contact');
    await page.getByLabel('Your Name').fill('Neha Gupta');
    await page.getByLabel('Email Address').fill('neha@example.com');
    await page.getByLabel('Contact Number').fill('9876501234');
    await page.getByLabel('Your Message').fill('What are the school timings?');
    await page.getByRole('button', { name: 'Send Message' }).click();
    await expect(page.getByRole('status')).toContainText('Your message has been sent');

    await signInAsAdmin(page);
    await navTo(page, 'Contact Messages');
    await expect(page.getByText('What are the school timings?')).toBeVisible();
    await page.getByRole('button', { name: 'Mark read' }).click();
    await expect(page.getByText('No messages')).toBeVisible();
  });
});
