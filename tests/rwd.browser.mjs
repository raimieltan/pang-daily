import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ configFile: false, root,
  optimizeDeps: { entries: ['tests/fixtures/rwd.html'] }, resolve: { alias: { '@': `${root}src` } },
  esbuild: { jsx: 'automatic' }, server: { host: '127.0.0.1', port: 4188, strictPort: true } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true,
    ...(process.platform === 'darwin' ? { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' } : {}) });
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:4188/tests/fixtures/rwd.html?car=banwa_silak_1983&handling=rwd_drift');
  await expect(page.getByTestId('mechanical-telemetry')).toBeVisible({ timeout: 90000 });
  await expect(page.getByRole('table', { name: 'Individual tire telemetry' })).toContainText('RR');
  await page.getByLabel('Driver assistance').selectOption('raw');
  await page.waitForFunction(() => window.rwdTest.sample()?.mechanics.controls.profile === 'raw');
  await page.getByLabel('Driver assistance').selectOption('standard');
  await page.keyboard.down('w');
  await page.waitForFunction(() => window.rwdTest.sample()?.speedKmh > 20, null, { timeout: 20000 });
  await page.keyboard.down('a'); await page.waitForTimeout(250); await page.keyboard.up('a');
  await page.waitForTimeout(500);
  const sample = await page.evaluate(() => window.rwdTest.sample());
  expect(sample.mechanics.controls.device).toBe('keyboard');
  expect(sample.mechanics.wheels.every(w => Number.isFinite(w.slipRatio + w.temperature + w.verticalLoad))).toBe(true);
  expect(sample.mechanics.controls.throttleRaw).toBe(1);
  await page.keyboard.down('Space'); await page.waitForTimeout(180); await page.keyboard.up('Space');
  await page.keyboard.up('w');
  await page.screenshot({ path: '/tmp/pang-rwd-handling.png' });
  expect(await page.evaluate(() => window.rwdTest.errors())).toEqual([]);
  expect(errors).toEqual([]);
  console.log('PASS live RWD GLB/Havok scene, keyboard controls, assistance selection, per-wheel telemetry and handbrake; no browser errors');
} finally { await browser?.close(); await server.close(); }
