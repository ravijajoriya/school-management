/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';
import { ACCOUNTS, resetDatabase } from './db.ts';
import { navTo } from './nav.ts';

/** iPhone 16: 393 × 852 CSS pixels, touch screen. */
test.use({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true });

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill(ACCOUNTS.admin.email);
  await page.getByLabel('Password').fill(ACCOUNTS.admin.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

const noSidewaysScroll = async (page: Page) =>
  expect(
    await page
      .locator('main')
      .evaluate((m) => m.scrollWidth - document.documentElement.clientWidth),
  ).toBeLessThanOrEqual(0);

test.describe('Admin panel on a phone (iPhone 16)', () => {
  test.beforeEach(() => resetDatabase());

  test('menu drawer, lists that scroll sideways, bottom-sheet dialogs and 16px fields', async ({
    page,
  }) => {
    await signIn(page);
    const nav = page.getByRole('navigation', { name: /Portal navigation$/ });
    const menu = page.getByRole('button', { name: 'Open menu' });

    // The sidebar is off screen until the menu button opens it.
    await expect(nav).not.toBeInViewport();
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await expect(nav).toBeInViewport();
    // Escape closes it again.
    await page.keyboard.press('Escape');
    await expect(nav).not.toBeInViewport();
    await noSidewaysScroll(page);

    // Navigating from the drawer closes it.
    await navTo(page, 'Users');
    await expect(page).toHaveURL(/\/admin\/users$/);
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('heading', { name: 'Users', level: 1 })).toBeVisible();

    // Lists keep their columns and scroll sideways inside their box; the page itself doesn't.
    const table = page.locator('main table').first();
    await expect(table.locator('thead')).toBeVisible();
    await expect(table.getByRole('row', { name: new RegExp(ACCOUNTS.admin.email) })).toBeVisible();
    const box = table.locator('..');
    const scroll = await box.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
    expect(scroll.scroll).toBeGreaterThan(scroll.client);
    await noSidewaysScroll(page);
    // Swiping the list keeps the first column (name) and the filters in view.
    await box.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
    await expect(table.locator('tbody tr td').first()).toBeInViewport();
    await expect(
      page
        .getByRole('searchbox')
        .or(page.getByPlaceholder(/Search/))
        .first(),
    ).toBeInViewport();

    // Dialogs open as bottom sheets that fit the screen; fields use 16px text (no iOS zoom).
    await page.getByRole('button', { name: 'Add user' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(400); // slide-up animation
    const sheet = (await dialog.boundingBox())!;
    expect(Math.round(sheet.x)).toBe(0);
    expect(Math.round(sheet.width)).toBe(393);
    expect(Math.round(sheet.y + sheet.height)).toBe(852);
    const field = dialog.locator('input').first();
    expect(await field.evaluate((el) => getComputedStyle(el).fontSize)).toBe('16px');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    // A few busy pages fit the width too.
    for (const label of ['Students', 'Fee Reports', 'Audit Logs']) {
      await navTo(page, label);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await noSidewaysScroll(page);
    }
  });
});
