import { chromium, expect } from '@playwright/test';
const base = process.env.AUTH_BROWSER_BASE_URL ?? 'http://localhost:3000';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage(), errors = [];
page.on('pageerror', error => errors.push(error.message));
const name = `garage_${Date.now()}`;
async function command(action, key) {
  const result = await page.evaluate(async ({ action, key }) => {
    const response = await fetch('/api/player/commands', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Pang-Request': '1' }, body: JSON.stringify({ key: key ?? crypto.randomUUID(), action }) });
    const result = await response.json(); if (!response.ok) throw new Error(JSON.stringify(result)); return result;
  }, { action, key });
  if (action.type === 'job_start') await command({ type: 'job_begin', runId: result.resourceId });
  return result;
}
async function load() { return page.evaluate(async () => (await fetch('/api/player/bootstrap', { cache: 'no-store' })).json()); }
try {
  await page.goto(base); await page.getByRole('button', { name: 'Create an account', exact: true }).click();
  await page.getByLabel('Username', { exact: true }).fill(name); await page.getByLabel('Password', { exact: true }).fill('browser-economy-password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('FINDING SIGNAL', { exact: true })).toHaveCount(0, { timeout: 60000 });
  let state = await load(); const car = state.vehicles[0];
  // Record bounded simulation wear; charge the server's catalog repair/fuel rules.
  await command({ type: 'vehicle_checkpoint', vehicleId: car.id, revision: car.conditionRevision, conditionLoss: Object.fromEntries(Object.entries(car.condition).map(([key, value]) => [key, key === 'brakes' ? value - .5 : 0])), fuelConsumedMilliliters: 1000, odometerDeltaMeters: 1000 });
  const repairKey = crypto.randomUUID();
  const repair = await command({ type: 'vehicle_repair', vehicleId: car.id, components: ['brakes'] }, repairKey);
  expect(await command({ type: 'vehicle_repair', vehicleId: car.id, components: ['brakes'] }, repairKey)).toEqual(repair);
  await command({ type: 'fuel_purchase', vehicleId: car.id, milliliters: 1000 });
  await command({ type: 'vehicle_appearance', vehicleId: car.id, paint: '#4d705b', rideHeightM: -.02 });
  // Earn through ordered job operations; no arbitrary credit/fixture balance endpoint.
  for (let run = 0; run < 8; run++) {
    const job = await command({ type: 'job_start', definitionId: run === 0 ? 'talyer_oil_errand' : 'kyo_ice_run' });
    await command({ type: 'job_objective', runId: job.resourceId, objectiveId: 'pickup', elapsedMs: 0, cargoDamage: 0 });
    const finalAction = { type: 'job_objective', runId: job.resourceId, objectiveId: 'dropoff', elapsedMs: 0, cargoDamage: 0 };
    const finalKey = crypto.randomUUID();
    const completion = await command(finalAction, finalKey);
    if (run === 0) expect(await command(finalAction, finalKey)).toEqual(completion);
  }
  await command({ type: 'social_introduce', dialogueId: 'casey_intro' });
  await page.reload(); await expect(page.locator('canvas')).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('FINDING SIGNAL', { exact: true })).toHaveCount(0, { timeout: 60000 });
  state = await load(); expect(state.vehicles[0].paint).toBe('#4d705b'); expect(state.vehicles[0].condition.brakes).toBe(1); expect(state.vehicles[0].fuelLiters).toBe(45);
  expect(state.social.state.npcs.casey.introduced).toBe(true);
  expect(state.progression.jobs.filter(job => job.status === 'completed')).toHaveLength(8);
  // Buy through the actual phone UI; API listings and the runtime wallet agree.
  await page.getByRole('button', { name: 'Phone · Baligya', exact: true }).click();
  const listings = await page.evaluate(async () => (await fetch('/api/player/marketplace')).json());
  const listing = listings.filter(l => l.askingPricePhp * 100 <= Number(state.economy.balanceCentavos)).sort((a,b) => a.askingPricePhp - b.askingPricePhp)[0];
  expect(listing).toBeTruthy();
  await page.getByRole('button', { name: `${listing.title}, ₱${listing.askingPricePhp.toLocaleString('en-PH')}`, exact: true }).click();
  await page.getByRole('button', { name: /^Buy now/  }).click();
  await page.getByRole('button', { name: /^Pay ₱/ }).click();
  await expect(page.getByRole('status').filter({ hasText: /in (your )?trunk/ })).toBeVisible({ timeout: 15000 });
  const bought = await load(), owned = bought.inventory.parts.find(part => part.sourceReference === listing.id);
  expect(owned).toBeTruthy(); expect(BigInt(bought.economy.balanceCentavos)).toBe(BigInt(state.economy.balanceCentavos) - BigInt(listing.askingPricePhp * 100));
  const balance = bought.economy.balanceCentavos;
  await page.reload(); await expect(page.locator('canvas')).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('FINDING SIGNAL', { exact: true })).toHaveCount(0, { timeout: 60000 });
  const returning = await load(); expect(returning.economy.balanceCentavos).toBe(balance); expect(returning.inventory.parts.some(part => part.id === owned.id)).toBe(true);
  expect(returning.social.state.npcs.casey.introduced).toBe(true);
  expect(returning.progression.jobs.filter(job => job.status === 'completed')).toHaveLength(8);
  await page.getByRole('button', { name: 'Phone · Baligya', exact: true }).click();
  await page.getByRole('button', { name: /Your parts/ }).click();
  await expect(page.getByTestId('owned-part').filter({ hasText: listing.title })).toBeVisible();
  expect(errors).toEqual([]);
  console.log('PASS server-derived job rewards, idempotent repair, fuel, appearance, actual phone purchase and full reload');
} finally { await context.close(); await browser.close(); }
