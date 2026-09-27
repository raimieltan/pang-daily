import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ configFile: false, root, optimizeDeps: { entries: ['tests/fixtures/contacts.html'] }, resolve: { alias: { '@': `${root}src` } }, esbuild: { jsx: 'automatic' }, server: { host: '127.0.0.1', port: 4177, strictPort: true } });
let browser;
try {
 await server.listen(); browser = await chromium.launch({ headless: true });
 const page = await browser.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message)); page.on('console', msg => { if (msg.type() === 'error') console.log(msg.text()); });
 const call = (method, ...args) => page.evaluate(({ method, args }) => window.contactsTest[method](...args), { method, args });
 await page.goto('http://127.0.0.1:4177/tests/fixtures/contacts.html'); await page.waitForFunction(() => !!window.contactsTest);
 const contacts = page.getByRole('dialog', { name: 'Phone · Contacts' });
 await page.getByRole('button', { name: 'Phone · Contacts' }).click();
 await expect(contacts).toContainText('No contacts yet'); await expect(contacts).toContainText('No crew connections yet'); await expect(contacts).toContainText('No known opportunities yet');
 await expect(contacts.getByRole('button', { name: 'Close contacts' })).toBeFocused();
 await page.keyboard.press('Escape'); await expect(page.locator('#phone')).toBeFocused();
 await page.keyboard.press('p'); await expect(contacts).toBeVisible();
 await page.keyboard.down('w'); await call('tick'); expect(await call('axes')).toEqual({ walk: 0, throttle: 0 }); await page.keyboard.up('w');
 await page.keyboard.press('Escape');
 await call('seed'); await call('clearNotices'); await page.locator('#phone').click();
 await expect(contacts).toContainText('Unfriendly'); await expect(contacts).toContainText('Respects your driving'); await expect(contacts).toContainText('Trust 20 / 100 · Respect 70 / 100'); await expect(contacts).toContainText('Favor: Oil errand'); await expect(contacts).toContainText('No outstanding favors.');
 await expect(contacts).toContainText('Reach Regular reputation'); await expect(contacts).toContainText('Talk to Casey at Kyo'); await expect(contacts).not.toContainText('10% off'); await expect(contacts).not.toContainText('The wall');
 await page.keyboard.press('Escape'); await call('race'); await call('tick');
 expect(await call('notices')).toHaveLength(1); await expect(page.getByTestId('social-feedback')).toContainText('Casey:'); await expect(page.getByTestId('social-feedback')).toContainText('Iloilo car scene: +5'); await expect(page.getByTestId('social-feedback')).toContainText('Discovered: Casey');
 await call('race'); await call('tick'); expect(await call('notices')).toHaveLength(1);
 await page.reload(); await page.waitForFunction(() => !!window.contactsTest); expect(await call('notices')).toEqual([]);
 await page.locator('#phone').click(); await expect(contacts).toContainText('Regular · 15'); await expect(contacts).toContainText('Casey’s invitation: The wall'); await page.keyboard.press('Escape');
 // Standard gamepad: Start opens, D-pad focuses and scrolls, A selects, B closes.
 const pad = async (button) => { await call('pad', button, true); await page.waitForTimeout(70); await call('pad', button, false); await page.waitForTimeout(70); };
 await page.waitForTimeout(70); await pad(9); await expect(contacts).toBeVisible(); await pad(13); await expect(contacts.getByRole('button', { name: 'Close contacts' })).not.toBeFocused(); await pad(15); await pad(1); await expect(contacts).toHaveCount(0); await expect(page.locator('#phone')).toBeFocused();
 await pad(9); await pad(0); await expect(contacts).toHaveCount(0);
 for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 800, height: 600 }, { width: 390, height: 844 }, { width: 667, height: 375 }]) {
  await page.setViewportSize(viewport); await page.locator('#phone').click(); await call('long');
  const scroller = contacts.getByLabel('Contacts and social progress');
  expect(await contacts.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await scroller.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  await contacts.getByText('Recent shared history', { exact: true }).first().click();
  if (viewport.width === 390) await page.screenshot({ path: '/tmp/pang-contacts-mobile.png' });
  await page.keyboard.press('Tab'); expect(await page.evaluate(() => !!document.activeElement.closest('[role="dialog"]'))).toBe(true);
  await page.keyboard.press('Escape'); await expect(page.locator('#phone')).toBeFocused();
  await page.locator('#talk').click(); const dialogue = page.getByRole('dialog', { name: 'Conversation with Casey' }); await expect(dialogue).toBeVisible(); await expect(dialogue.locator('button').first()).toBeFocused();
  await page.keyboard.press('Escape'); await expect(page.locator('#talk')).toBeFocused();
 }
 expect(errors).toEqual([]);
 console.log('PASS empty/populated contacts, trust/respect, favors/crew, spoiler-safe locks, grouped race feedback, idempotence/reload, keyboard/gamepad, long content/scroll/focus at five viewports');
} finally { await browser?.close(); await server.close(); }
