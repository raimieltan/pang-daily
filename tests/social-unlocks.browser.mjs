import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium, expect } from '@playwright/test';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ configFile: false, root, optimizeDeps: { entries: ['tests/fixtures/social-unlocks.html'] }, resolve: { alias: { '@': `${root}src` } }, esbuild: { jsx: 'automatic' }, server: { host: '127.0.0.1', port: 4176, strictPort: true } });
let browser;
try {
 await server.listen(); browser = await chromium.launch({ headless: true });
 const page = await browser.newPage(); const errors = [];
 page.on('pageerror', error => errors.push(error.message));
 await page.goto('http://127.0.0.1:4176/tests/fixtures/social-unlocks.html');
 await page.waitForFunction(() => !!window.socialUnlockTest);
 const call = (method, ...args) => page.evaluate(({ method, args }) => window.socialUnlockTest[method](...args), { method, args });
 expect(await call('raceAccess')).toContain('unavailable');
 await call('seed'); await call('tick'); await call('tick');
 expect(await call('notices')).toHaveLength(4);
 expect(await call('raceAccess')).toBeNull();
 await expect(page.getByTestId('recognition')).toContainText('Discovered:');

 await call('openMarket');
 await page.getByRole('button', { name: `${await call('sukiTitle')}, ₱1,000`, exact: true }).click();
 await expect(page.getByText('Jun’s suki part offer · 10% off', { exact: true })).toBeVisible();
 await page.getByRole('button', { name: 'Buy now · ₱900' }).click();
 const before = await call('wallet');
 await call('lose'); await page.getByRole('button', { name: 'Pay ₱900', exact: true }).click();
 await expect(page.getByRole('alert')).toContainText('Seller offer unavailable');
 expect(await call('wallet')).toEqual(before);
 expect((await call('inventory')).items).toHaveLength(0);
 console.log('PASS seller offer UI sends benefit ID; lost eligibility rejects without payment/delivery');

 // Restore thresholds without replaying already-consumed social events.
 await page.evaluate(() => { const key = 'pang-daily.social-session.v1'; const state = JSON.parse(sessionStorage.getItem(key)); state.npcs.jun_surplus.trust = 52; state.npcs.mang_boy.trust = 58; state.npcs.casey.trust = 53; state.reputation.iloilo_scene.points = 16; sessionStorage.setItem(key, JSON.stringify(state)); });
 await call('closeMarket'); await call('openMarket');
 await page.getByRole('button', { name: `${await call('sukiTitle')}, ₱1,000`, exact: true }).click();
 await page.getByRole('button', { name: 'Buy now · ₱900' }).click();
 await page.getByRole('button', { name: 'Pay ₱900', exact: true }).click();
 await expect(page.getByRole('status').filter({ hasText: 'Paid ₱900' })).toBeVisible();
 expect((await call('wallet')).walletPhp).toBe(before.walletPhp - 900);
 await page.getByRole('button', { name: /Your parts/ }).click();
 await expect(page.getByTestId('actual-condition')).toHaveCount(0);
 await page.getByRole('button', { name: 'Have Mang Boy inspect · ₱150' }).click();
 await expect(page.getByTestId('actual-condition')).toHaveCount(1);
 console.log('PASS discounted purchase, owned paid price, explicit paid inspection');

 await call('closeMarket'); await call('openRepair');
 await expect(page.getByText('Mang Boy’s repair benefit · 10% off', { exact: true })).toBeVisible();
 await page.getByRole('group', { name: 'Choose repairs' }).getByRole('checkbox').nth(2).check();
 const pay = page.getByRole('button', { name: /^Pay .* & repair$/ });
 const price = Number((await pay.innerText()).match(/₱([\d,]+)/)[1].replaceAll(',', ''));
 const repairBefore = await call('wallet'); await pay.click();
 await expect(page.getByRole('status').filter({ hasText: 'restored to 100%' })).toContainText(`Paid ₱${price}`);
 expect((await call('wallet')).walletPhp).toBe(repairBefore.walletPhp - price);
 await call('closeRepair'); await call('openCrew');
 const dialogue = page.getByRole('dialog');
 await dialogue.getByRole('button', { name: /Tambay ako/ }).click();
 await dialogue.getByRole('button', { name: /Sige, join ako/ }).click();
 expect((await call('social')).crews.kyo_regulars.membership).toBe('member');
 await call('closeCrew'); await call('lose');
 expect(await call('raceAccess')).toBeNull();
 await call('tick'); expect(await call('notices')).toHaveLength(4);
 await page.reload(); await page.waitForFunction(() => !!window.socialUnlockTest);
 await call('tick'); expect(await call('notices')).toEqual([]);
 expect((await call('social')).crews.kyo_regulars.membership).toBe('member');
 await call('openRepair');
 await expect(page.getByText('Mang Boy’s repair benefit · 10% off', { exact: true })).toHaveCount(0);
 await expect(page.getByRole('heading', { name: 'Inspection & repair' })).toBeVisible();
 expect(errors).toEqual([]);
 console.log('PASS repair quote/payment, crew acceptance, retained race discovery/membership, reload deduplication, poor-standing basic repair; no browser errors');
} finally { await browser?.close(); await server.close(); }
