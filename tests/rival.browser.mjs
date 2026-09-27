import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium, expect } from '@playwright/test';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ configFile: false, root, optimizeDeps: { entries: ['tests/fixtures/rival.html'] }, resolve: { alias: { '@': `${root}src` } }, esbuild: { jsx: 'automatic' }, server: { host: '127.0.0.1', port: 4177, strictPort: true } });
let browser;
try {
 await server.listen(); browser = await chromium.launch({ headless: true });
 const page = await browser.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
 await page.goto('http://127.0.0.1:4177/tests/fixtures/rival.html');
 await page.waitForFunction(() => !!window.rivalTest);
 const call = (method, ...args) => page.evaluate(({ method, args }) => window.rivalTest[method](...args), { method, args });
 const identity = await call('identity');
 expect(identity).toMatchObject({ npcId: 'casey', vehicleId: 'casey_daily', build: 'casey_kidlat_rs' });
 const dialogue = page.getByRole('dialog');
 for (const outcome of ['win', 'loss', 'dnf']) {
  await call('play', outcome);
  expect((await call('history')).latestOutcome).toBe(outcome);
  expect(await call('meet')).toBeUndefined();
  await expect(dialogue).toHaveAttribute('aria-label', 'Conversation with Casey');
  await expect(dialogue).toContainText({ win: 'Ginlampuwasan', loss: 'First loss', dnf: 'Wala mo natapos' }[outcome]);
  await expect(dialogue.getByTestId('rival-history')).toContainText('no cooldown');
  if (outcome === 'win') {
   const before = (await call('social')).npcs.casey;
   await dialogue.getByRole('button', { name: 'Maayo ka magdala, Casey.' }).click();
   const after = (await call('social')).npcs.casey;
   expect(after.trust).toBe(before.trust + 3); expect(after.respect).toBe(before.respect);
   expect(after.relationshipFlags).toContain('trusted_friend');
  }
  await dialogue.getByRole('button', { name: 'Diin kita mag-rematch?' }).click();
  await expect(dialogue).toContainText('north street');
  await call('close');
  const saved = await call('history');
  await page.reload(); await page.waitForFunction(() => !!window.rivalTest);
  expect(await call('identity')).toEqual(identity); expect(await call('history')).toEqual(saved);
  await call('meet'); await expect(dialogue).toContainText('Casey:'); await call('close');
 }
 expect(await call('history')).toMatchObject({ wins: 1, losses: 1, dnfs: 1, metAtHub: true });
 console.log('PASS actual race state machine win/loss/DNF → authored hub interaction → converse → reload → rematch; stable Casey/vehicle identity and history');

 const beforeShortcut = await call('wallet');
 await call('skippedFinish'); expect((await call('phase')).phase).toBe('RUNNING'); expect((await call('phase')).invalidFinish).toBe(true);
 expect((await call('history')).wins).toBe(1); expect(await call('wallet')).toEqual(beforeShortcut);
 await call('withdraw'); expect((await call('history')).dnfs).toBe(2);
 await call('start');
 await page.reload(); await page.waitForFunction(() => !!window.rivalTest);
 expect((await call('history')).dnfs).toBe(3);
 await page.reload(); await page.waitForFunction(() => !!window.rivalTest);
 expect((await call('history')).dnfs).toBe(3);
 for (let i = 0; i < 4; i++) await call('play', 'win');
 expect((await call('history')).wins).toBe(5);
 expect((await call('wallet')).transactions.filter(tx => tx.kind === 'race_prize')).toHaveLength(3);
 expect((await call('social')).npcs.casey.relationshipFlags).toContain('trusted_friend');
 expect(await call('errors')).toEqual([]); expect(errors).toEqual([]);
 console.log('PASS skipped finish cannot win/pay; interrupted reload counts one DNF; reward cap survives reload; Casey stays a friend and rematch remains usable');
} finally { await browser?.close(); await server.close(); }
