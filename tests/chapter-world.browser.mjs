import { chromium, expect } from '@playwright/test';

/** Real Babylon world and React HUD, with the existing server commands for longer driving legs. */
const base = process.env.CHAPTER_BROWSER_BASE_URL ?? 'http://localhost:3000';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));
const username = `chapterworld_${Date.now()}`, password = 'chapter-world-password';
try {
 await page.goto(base);
 await page.getByRole('button', { name: 'Create an account' }).click();
 await page.getByLabel('Username').fill(username);
 await page.getByLabel('Password').fill(password);
 await page.getByRole('button', { name: 'Create account' }).click();
 await expect(page.getByRole('heading', { name: 'An old daily. Yours.' })).toBeVisible();
 if (process.env.CHAPTER_BROWSER_SCREENSHOT) await page.screenshot({ path: '/tmp/pang-chapter-origin.png' });
 await page.getByRole('button', { name: /Family hand-me-down/ }).click();
 await expect(page.locator('canvas')).toBeVisible({ timeout: 30000 });
 await expect(page.getByTestId('chapter-note')).toContainText('Something is wrong', { timeout: 60000 });
 await page.goto(`${base}/?spawn=talyer&quality=low`);
 await expect(page.getByTestId('chapter-note')).toContainText('Something is wrong', { timeout: 60000 });
 await expect(page.getByTestId('interaction-prompt')).toBeVisible({ timeout: 60000 });
 console.log('SPAWN PROMPT', await page.getByTestId('interaction-prompt').textContent());
 await page.getByTestId('interaction-prompt').click();
 await page.waitForTimeout(1200);
 console.log('EXIT PROMPT', await page.getByTestId('interaction-prompt').textContent());
 await page.keyboard.down('w');
 await page.waitForTimeout(7000);
 console.log('WALK PROMPT', await page.getByTestId('interaction-prompt').textContent());
 await page.keyboard.up('w');
 if (process.env.CHAPTER_BROWSER_SCREENSHOT) await page.screenshot({ path: '/tmp/pang-chapter-walk.png' });
 await expect(page.getByTestId('interaction-prompt')).toContainText('Repairs', { timeout: 10000 });
 await page.getByTestId('interaction-prompt').click();
 const dialogue = page.getByRole('dialog', { name: /Conversation with Tito Jun/ });
 await expect(dialogue).toBeVisible({ timeout: 15000 });
 await expect(dialogue).toContainText('brake');
 await expect(page.getByRole('region', { name: 'Talyer inspection and repair' })).toHaveCount(0);
 await dialogue.getByRole('button', { name: 'Leave conversation' }).click();
 await expect(page.getByRole('region', { name: 'Talyer inspection and repair' })).toBeVisible();
 await expect(page.getByTestId('chapter-note')).toContainText('Earn the first money');
 if (process.env.CHAPTER_BROWSER_SCREENSHOT) await page.screenshot({ path: '/tmp/pang-chapter-talyer.png' });
 expect(pageErrors).toEqual([]);
 console.log('PASS Chapter 1 origin → real talyer world interaction → Tito Jun dialogue → repair inspection and durable job guidance');
} finally { await context.close(); await browser.close(); }
