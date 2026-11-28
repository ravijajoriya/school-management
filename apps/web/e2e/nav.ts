import type { Page } from '@playwright/test';

const exactText = (s: string) => new RegExp(`^${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);

/**
 * Clicks a link in the portal sidebar. Sidebar sections (People, Fees, …) are collapsible, so the
 * link's section is opened first when it is collapsed. On small screens the menu is opened first.
 */
export async function navTo(page: Page, label: string) {
  // Phones and tablets: the sidebar is a drawer behind the menu button.
  const menu = page.getByRole('button', { name: 'Open menu' });
  if (await menu.isVisible()) await menu.click();
  const nav = page.getByRole('navigation', { name: /Portal navigation$/ });
  const link = nav.getByRole('link', { name: label, exact: true });
  if (!(await link.isVisible())) {
    await nav
      .locator('[data-nav-group]')
      .filter({ has: page.locator('a', { hasText: exactText(label) }) })
      .getByRole('button')
      .first()
      .click();
  }
  await link.click();
}

/**
 * Answers the in-app confirm/prompt dialog (these replaced window.confirm and window.prompt):
 * optionally fills its input, then clicks the dialog's confirm button.
 */
export async function confirmDialog(page: Page, button: string, fill?: string) {
  const dialog = page.getByRole('dialog').last();
  if (fill !== undefined)
    await dialog.getByRole('textbox').or(dialog.locator('input')).first().fill(fill);
  await dialog.getByRole('button', { name: button, exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
}
