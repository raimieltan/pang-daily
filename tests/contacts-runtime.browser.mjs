import { chromium, expect } from '@playwright/test';
const browser = await chromium.launch({ headless: true });
try {
 const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
 const errors = []; page.on('pageerror', error => errors.push(error.message));
 await page.goto(process.env.CONTACTS_GAME_URL ?? 'http://127.0.0.1:3004/');
 const button = page.getByRole('button', { name: 'Contacts · P', exact: true });
 await expect(button).toBeVisible({ timeout: 60000 });
 await expect(page.locator('.tape-loading')).toHaveCount(0, { timeout: 60000 });
 await button.click();
 const contacts = page.getByRole('dialog', { name: 'Phone · Contacts' });
 await expect(contacts).toBeVisible(); await expect(contacts).toContainText('No contacts yet');
 await expect(contacts.getByRole('button', { name: 'Close contacts' })).toBeFocused();
 await page.keyboard.press('Escape'); await expect(button).toBeFocused();
 await page.keyboard.press('p'); await expect(contacts).toBeVisible();
 await page.screenshot({ path: '/tmp/pang-contacts-runtime.png' });
 await contacts.getByRole('button', { name: 'Close contacts' }).click(); await expect(button).toBeFocused();
 await page.setViewportSize({ width: 390, height: 844 });
 await button.click(); await expect(contacts).toBeVisible();
 expect(await contacts.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
 await page.screenshot({ path: '/tmp/pang-contacts-runtime-mobile.png' });
 await page.keyboard.press('Escape'); await expect(button).toBeFocused();
 expect(errors).toEqual([]);
 console.log('PASS production game HUD phone entry, live runtime pause/open/close, keyboard/focus restoration, desktop/mobile layouts; no browser errors');
} finally { await browser.close(); }
