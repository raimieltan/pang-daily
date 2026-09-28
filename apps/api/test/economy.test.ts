import { freePlayFixture } from './fixtures/free-play';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { bootstrapSchema, type PlayerAction, type CommandReceipt } from '@pang-daily/contracts';
import { createApplication } from '../src/bootstrap';
import { DatabaseService } from '../src/database/database.service';
import { AUTO_PARTS_STOCK } from '@pang-daily/game-core/shops/AutoPartsShop';
import { HIRAYA_KIDLAT_1997 } from '@pang-daily/game-core/vehicles/catalog';
import { HUB_JOBS } from '@pang-daily/game-core/jobs/catalog';
import { raceEconomy } from '@pang-daily/game-core/economy/raceRules';
const product = [...AUTO_PARTS_STOCK].sort((a,b) => a.pricePhp - b.pricePhp)[0];
test('server economy and garage commands preserve exact ledger and ownership', async t => {
  const app = await createApplication(); await app.listen(0, '127.0.0.1'); const base = await app.getUrl();
  const db = app.get(DatabaseService).client;
  async function call(path: string, cookie = '', method = 'GET', body?: unknown) {
    return fetch(`${base}/api${path}`, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-Pang-Request': '1', Origin: 'http://localhost:3000' }, body: body === undefined ? undefined : JSON.stringify(body) });
  }
  async function account() {
    const response = await call('/auth/register', '', 'POST', { username: `eco_${randomUUID().slice(0,8)}`, password: 'test-password-for-economy' });
    assert.equal(response.status, 201); const cookie = response.headers.get('set-cookie')!.split(';')[0];
    const bootstrap = bootstrapSchema.parse(await (await call('/player/bootstrap', cookie)).json());
    await freePlayFixture(db, bootstrap.profile.id);
    return { cookie, bootstrap, playerId: bootstrap.profile.id, car: bootstrap.vehicles[0].id };
  }
  async function command(cookie: string, action: PlayerAction, key = randomUUID(), expected = 200) {
    const response = await call('/player/commands', cookie, 'POST', { key, action });
    const body = await response.json(); assert.equal(response.status, expected, JSON.stringify(body));
    if (expected === 200 && action.type === 'job_start') await command(cookie, { type: 'job_begin', runId: body.resourceId });
    return body as CommandReceipt & { code: string };
  }
  async function grant(playerId: string, amount = 50000000n) {
    // A ledger-backed test fixture; no public credit/balance endpoint exists.
    await db.$transaction(async tx => {
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { playerId } });
      await tx.transaction.create({ data: { playerId, sequence: wallet.revision + 1n, amountCentavos: amount, balanceBeforeCentavos: wallet.balanceCentavos, balanceAfterCentavos: wallet.balanceCentavos + amount, kind: 'test_fixture', source: 'test', sourceReference: randomUUID(), description: 'Integration funding', requestId: randomUUID() } });
      await tx.wallet.update({ where: { playerId }, data: { balanceCentavos: wallet.balanceCentavos + amount, revision: wallet.revision + 1n } });
    });
  }
  try {
    await t.test('development cash grants a fixed amount once per request key', async () => {
      const a = await account();
      const before = (await db.wallet.findUniqueOrThrow({ where: { playerId: a.playerId } })).balanceCentavos;
      const key = randomUUID(), action: PlayerAction = { type: 'dev_grant' };
      const first = await command(a.cookie, action, key);
      assert.equal(first.amountCentavos, '5000000');
      assert.deepEqual(await command(a.cookie, action, key), first);
      assert.equal((await db.wallet.findUniqueOrThrow({ where: { playerId: a.playerId } })).balanceCentavos, before + 5_000_000n);
      assert.equal((await call('/player/commands', a.cookie, 'POST', { key: randomUUID(), action: { type: 'dev_grant', amountPhp: 500000 } })).status, 400);
    });
    await t.test('anonymous and client-assigned balances/prices/rewards are rejected', async () => {
      assert.equal((await call('/player/commands', '', 'POST', { key: randomUUID(), action: { type: 'part_purchase', definitionId: product.partId } })).status, 401);
      const a = await account();
      for (const action of [{ type: 'set_balance', balance: 999999 }, { type: 'part_purchase', definitionId: product.partId, pricePhp: 1 }, { type: 'job_reward', amount: 999999 }, { type: 'race_complete', attemptId: randomUUID(), elapsedMs: 1000, finish: true, winner: true }]) assert.equal((await call('/player/commands', a.cookie, 'POST', { key: randomUUID(), action })).status, 400);
      assert.equal((await call('/wallet', a.cookie, 'PATCH', { balance: 100000 })).status, 404);
    });
    await t.test('parallel duplicate purchase creates exactly one debit and physical part; conflicting key fails', async () => {
      const a = await account(); await grant(a.playerId, 100000n); const key = randomUUID(), action: PlayerAction = { type: 'part_purchase', definitionId: product.partId };
      const receipts = await Promise.all(Array.from({ length: 8 }, () => command(a.cookie, action, key)));
      for (const receipt of receipts) assert.deepEqual(receipt, receipts[0]);
      assert.equal(await db.ownedPart.count({ where: { playerId: a.playerId } }), 1);
      assert.equal(await db.transaction.count({ where: { playerId: a.playerId, kind: 'PART_PURCHASE' } }), 1);
      assert.equal((await db.wallet.findUniqueOrThrow({ where: { playerId: a.playerId } })).balanceCentavos, 600000n - BigInt(product.pricePhp) * 100n);
      assert.equal((await command(a.cookie, { type: 'vehicle_purchase', definitionId: HIRAYA_KIDLAT_1997.id }, key, 409)).code, 'IDEMPOTENCY_CONFLICT');
    });
    await t.test('competing purchases cannot overdraw the wallet or create unpaid inventory', async () => {
      const a = await account(); await grant(a.playerId, 500000n); const expensive = AUTO_PARTS_STOCK.find(p => p.pricePhp > 5000 && p.pricePhp <= 10000)!;
      assert.ok(expensive);
      const responses = await Promise.all(Array.from({ length: 4 }, () => call('/player/commands', a.cookie, 'POST', { key: randomUUID(), action: { type: 'part_purchase', definitionId: expensive.partId } })));
      assert.equal(responses.filter(r => r.status === 200).length, 1);
      for (const response of responses.filter(r => r.status !== 200)) { assert.equal(response.status, 409); assert.equal((await response.json()).code, 'INSUFFICIENT_FUNDS'); }
      assert.equal(await db.ownedPart.count({ where: { playerId: a.playerId } }), 1);
      assert.equal(await db.transaction.count({ where: { playerId: a.playerId, kind: 'PART_PURCHASE' } }), 1);
    });
    await t.test('vehicle purchase rollback, ownership, acquisition, selection, sale and reload', async () => {
      const a = await account(), b = await account();
      const before = await db.wallet.findUniqueOrThrow({ where: { playerId: a.playerId } });
      assert.equal((await command(a.cookie, { type: 'vehicle_purchase', definitionId: HIRAYA_KIDLAT_1997.id }, randomUUID(), 409)).code, 'INSUFFICIENT_FUNDS');
      assert.equal(await db.vehicle.count({ where: { playerId: a.playerId } }), 1);
      assert.equal((await db.wallet.findUniqueOrThrow({ where: { playerId: a.playerId } })).revision, before.revision);
      await grant(a.playerId);
      const receipt = await command(a.cookie, { type: 'vehicle_purchase', definitionId: HIRAYA_KIDLAT_1997.id });
      assert.equal((await command(a.cookie, { type: 'vehicle_select', vehicleId: b.car }, randomUUID(), 404)).code, 'OWNED_RESOURCE_NOT_FOUND');
      assert.equal((await command(a.cookie, { type: 'vehicle_sell', vehicleId: a.car }, randomUUID(), 409)).code, 'ACTIVE_VEHICLE');
      await command(a.cookie, { type: 'vehicle_select', vehicleId: receipt.resourceId! });
      await command(a.cookie, { type: 'vehicle_sell', vehicleId: a.car });
      const loaded = bootstrapSchema.parse(await (await call('/player/bootstrap', a.cookie)).json());
      assert.equal(loaded.profile.activeVehicleId, receipt.resourceId); assert.equal(loaded.vehicles.length, 1); assert.equal(loaded.vehicles[0].definitionId, HIRAYA_KIDLAT_1997.id);
      assert.equal(await db.vehicle.count({ where: { id: a.car, retiredAt: { not: null } } }), 1);
      assert.equal(await db.transaction.count({ where: { playerId: a.playerId, kind: 'VEHICLE_SALE' } }), 1);
    });
    await t.test('repair and fuel charge exact server costs, persist condition, and reject stale/improving wear', async () => {
      const a = await account(); await grant(a.playerId);
      const vehicle = a.bootstrap.vehicles[0], key = randomUUID();
      await command(a.cookie, { type: 'vehicle_checkpoint', vehicleId: a.car, revision: vehicle.conditionRevision, conditionLoss: Object.fromEntries(Object.entries(vehicle.condition).map(([key, value]) => [key, key === 'engine' ? value - .5 : key === 'tires' ? value - .3 : 0])) as typeof vehicle.condition, fuelConsumedMilliliters: 15000, odometerDeltaMeters: 1200 });
      assert.equal((await command(a.cookie, { type: 'vehicle_checkpoint', vehicleId: a.car, revision: vehicle.conditionRevision, conditionLoss: vehicle.condition, fuelConsumedMilliliters: 45000, odometerDeltaMeters: 0 }, randomUUID(), 409)).code, 'VEHICLE_REVISION_CONFLICT');
      const repair = await command(a.cookie, { type: 'vehicle_repair', vehicleId: a.car, components: ['engine','tires'] }, key);
      assert.ok(BigInt(repair.amountCentavos) < 0n); assert.deepEqual(await command(a.cookie, { type: 'vehicle_repair', vehicleId: a.car, components: ['engine','tires'] }, key), repair);
      const fuel = await command(a.cookie, { type: 'fuel_purchase', vehicleId: a.car, milliliters: 1001 });
      assert.equal(fuel.amountCentavos, '-6507');
      const loaded = bootstrapSchema.parse(await (await call('/player/bootstrap', a.cookie)).json());
      assert.equal(loaded.vehicles[0].condition.engine, 1); assert.equal(loaded.vehicles[0].condition.tires, 1); assert.equal(loaded.vehicles[0].fuelLiters, 31.001);
      assert.equal((await command(a.cookie, { type: 'vehicle_checkpoint', vehicleId: a.car, revision: loaded.vehicles[0].conditionRevision, conditionLoss: loaded.vehicles[0].condition, fuelConsumedMilliliters: 45000, odometerDeltaMeters: 0 }, randomUUID(), 409)).code, 'INVALID_WEAR_CHECKPOINT');
      assert.equal((await command(a.cookie, { type: 'fuel_purchase', vehicleId: a.car, milliliters: 15000 }, randomUUID(), 409)).code, 'FUEL_CAPACITY_EXCEEDED');
    });
    await t.test('insufficient repair funds leave every component, wallet and receipt unchanged', async () => {
      const a = await account(); const balance = (await db.wallet.findUniqueOrThrow({ where: { playerId: a.playerId } })).balanceCentavos;
      await grant(a.playerId, -balance);
      const before = await db.vehicleCondition.findUniqueOrThrow({ where: { vehicleId: a.car } });
      await command(a.cookie, { type: 'vehicle_repair', vehicleId: a.car, components: ['engine','tires'] }, randomUUID(), 409);
      assert.deepEqual(await db.vehicleCondition.findUniqueOrThrow({ where: { vehicleId: a.car } }), before);
      assert.equal(await db.transaction.count({ where: { playerId: a.playerId, kind: 'REPAIR_COST' } }), 0);
      assert.equal((await db.wallet.findUniqueOrThrow({ where: { playerId: a.playerId } })).balanceCentavos, 0n);
    });
    await t.test('installation, removal and resale preserve one physical item and reject owner guessing', async () => {
      const a = await account(), b = await account(); await grant(a.playerId);
      const purchase = await command(a.cookie, { type: 'part_purchase', definitionId: product.partId });
      assert.equal((await command(b.cookie, { type: 'part_install', vehicleId: b.car, partId: purchase.resourceId! }, randomUUID(), 404)).code, 'OWNED_RESOURCE_NOT_FOUND');
      await command(a.cookie, { type: 'part_install', vehicleId: a.car, partId: purchase.resourceId! });
      assert.equal(await db.installedPart.count({ where: { ownedPartId: purchase.resourceId! } }), 1);
      assert.equal((await command(a.cookie, { type: 'part_sell', partId: purchase.resourceId! }, randomUUID(), 409)).code, 'PART_INSTALLED');
      const loaded = bootstrapSchema.parse(await (await call('/player/bootstrap', a.cookie)).json()); assert.equal(loaded.inventory.installed[0].ownedPartId, purchase.resourceId);
      await command(a.cookie, { type: 'part_remove', vehicleId: a.car, partId: purchase.resourceId! });
      assert.equal(await db.installedPart.count({ where: { ownedPartId: purchase.resourceId! } }), 0);
      const key = randomUUID(); const sale = await command(a.cookie, { type: 'part_sell', partId: purchase.resourceId! }, key);
      assert.deepEqual(await command(a.cookie, { type: 'part_sell', partId: purchase.resourceId! }, key), sale);
      assert.equal(await db.transaction.count({ where: { playerId: a.playerId, kind: 'PART_SALE' } }), 1);
    });
    await t.test('incompatible body parts, multi-slot displacements, appearance and insufficient labor have no partial writes', async () => {
      const a = await account(); await grant(a.playerId);
      const grantPart = (definitionId: string) => db.ownedPart.create({ data: { playerId: a.playerId, partDefinitionId: definitionId, acquisitionKey: randomUUID(), origin: 'grant', sourceReference: 'test', condition: .8, revealedBy: 'known' } });
      const hatch = await command(a.cookie, { type: 'vehicle_purchase', definitionId: HIRAYA_KIDLAT_1997.id });
      const body = await grantPart('dalagan_fiberglass_skirts');
      assert.equal((await command(a.cookie, { type: 'part_install', vehicleId: hatch.resourceId!, partId: body.id }, randomUUID(), 409)).code, 'INCOMPATIBLE_PART');
      assert.equal(await db.installedPart.count({ where: { ownedPartId: body.id } }), 0);
      await command(a.cookie, { type: 'part_install', vehicleId: a.car, partId: body.id, finish: 'primer' });
      assert.equal((await command(a.cookie, { type: 'part_install', vehicleId: hatch.resourceId!, partId: body.id }, randomUUID(), 409)).code, 'PART_ALREADY_INSTALLED');
      const coils = await grantPart('used_coilovers_01'), shock = await grantPart('stock_shocks_set');
      await command(a.cookie, { type: 'part_install', vehicleId: a.car, partId: coils.id });
      assert.equal(await db.installedPartSlot.count({ where: { ownedPartId: coils.id } }), 2);
      await command(a.cookie, { type: 'part_install', vehicleId: hatch.resourceId!, partId: shock.id }, randomUUID(), 409);
      assert.equal(await db.installedPart.count({ where: { ownedPartId: shock.id } }), 0);
      await command(a.cookie, { type: 'part_install', vehicleId: a.car, partId: shock.id });
      assert.equal(await db.installedPartSlot.count({ where: { ownedPartId: coils.id } }), 0);
      await command(a.cookie, { type: 'vehicle_appearance', vehicleId: a.car, paint: '#123456', rideHeightM: -.02 });
      await command(a.cookie, { type: 'part_refinish', partId: body.id, finish: 'body_color' });
      const loaded = bootstrapSchema.parse(await (await call('/player/bootstrap', a.cookie)).json());
      assert.equal(loaded.vehicles.find(v => v.id === a.car)!.paint, '#123456'); assert.equal(loaded.inventory.parts.find(p => p.id === body.id)!.finish, 'body_color');
      const poor = await account(); await grant(poor.playerId, 100000n); const purchase = await command(poor.cookie, { type: 'part_purchase', definitionId: product.partId });
      // Exhaust remaining wallet using a ledger-backed fixture, never a balance assignment.
      const balance = (await db.wallet.findUniqueOrThrow({ where: { playerId: poor.playerId } })).balanceCentavos;
      if (balance) await grant(poor.playerId, -balance);
      const refused = await command(poor.cookie, { type: 'part_install', vehicleId: poor.car, partId: purchase.resourceId! }, randomUUID(), 409);
      assert.equal(refused.code, 'INSUFFICIENT_FUNDS'); assert.equal(await db.installedPart.count({ where: { ownedPartId: purchase.resourceId! } }), 0);
    });
    await t.test('job payout comes from catalog, ordered durable objectives and is paid once across different retry keys', async () => {
      const a = await account(), job = HUB_JOBS.find(j => j.id === 'talyer_oil_errand')!;
      const started = await command(a.cookie, { type: 'job_start', definitionId: job.id });
      await command(a.cookie, { type: 'job_objective', runId: started.resourceId!, objectiveId: job.objectives[1].id, elapsedMs: 0, cargoDamage: 0 }, randomUUID(), 409);
      await command(a.cookie, { type: 'job_objective', runId: started.resourceId!, objectiveId: job.objectives[0].id, elapsedMs: 0, cargoDamage: 0 });
      const key = randomUUID(), action: PlayerAction = { type: 'job_objective', runId: started.resourceId!, objectiveId: job.objectives[1].id, elapsedMs: 0, cargoDamage: 0 };
      const paid = await command(a.cookie, action, key); assert.equal(paid.amountCentavos, '30000');
      assert.deepEqual(await command(a.cookie, action, key), paid); await command(a.cookie, action);
      assert.equal(await db.transaction.count({ where: { playerId: a.playerId, kind: 'JOB_REWARD' } }), 1);
      assert.equal((await db.wallet.findUniqueOrThrow({ where: { playerId: a.playerId } })).balanceCentavos, 530000n);
      assert.equal(bootstrapSchema.parse(await (await call('/player/bootstrap', a.cookie)).json()).progression.jobs[0].status, 'completed');
    });
    await t.test('accepted jobs wait for begin and paused simulation time preserves the catalog bonus', async () => {
      const a = await account();
      const response = await call('/player/commands', a.cookie, 'POST', { key: randomUUID(), action: { type: 'job_start', definitionId: 'hatid_suki_home' } });
      assert.equal(response.status, 200); const accepted = await response.json();
      const run = await db.jobProgress.findUniqueOrThrow({ where: { playerId_runId: { playerId: a.playerId, runId: accepted.resourceId } } });
      assert.equal(run.status, 'accepted');
      await command(a.cookie, { type: 'job_objective', runId: run.runId, objectiveId: 'pickup', elapsedMs: 0, cargoDamage: 0 }, randomUUID(), 409);
      await db.jobProgress.update({ where: { id: run.id }, data: { acceptedAt: new Date(Date.now() - 300000) } });
      const key = randomUUID(), begun = await command(a.cookie, { type: 'job_begin', runId: run.runId }, key);
      assert.deepEqual(await command(a.cookie, { type: 'job_begin', runId: run.runId }, key), begun);
      await command(a.cookie, { type: 'job_objective', runId: run.runId, objectiveId: 'pickup', elapsedMs: 0, cargoDamage: 0 });
      const completed = await command(a.cookie, { type: 'job_objective', runId: run.runId, objectiveId: 'dropoff', elapsedMs: 60000, cargoDamage: 0 });
      assert.equal(completed.amountCentavos, '48000'); assert.equal(completed.details.bonusPhp, 100);
    });
    await t.test('race rewards derive outcome from route/time, require checkpoint order and protect duplicate completion', async () => {
      const a = await account(), race = raceEconomy('barangay_sprint')!, attemptId = randomUUID();
      await command(a.cookie, { type: 'race_start', definitionId: race.id, attemptId, vehicleId: a.car });
      await command(a.cookie, { type: 'race_complete', attemptId, elapsedMs: race.minimumTimeMs, finish: true }, randomUUID(), 409);
      await command(a.cookie, { type: 'race_checkpoint', attemptId, checkpointIndex: 2, elapsedMs: 1000 }, randomUUID(), 409);
      const elapsedMs = Math.max(race.minimumTimeMs, 5000);
      await db.raceResult.update({ where: { playerId_attemptId: { playerId: a.playerId, attemptId } }, data: { startedAt: new Date(Date.now() - elapsedMs - 1000) } });
      for (let index = 1; index <= race.checkpoints; index++) await command(a.cookie, { type: 'race_checkpoint', attemptId, checkpointIndex: index, elapsedMs: Math.round(elapsedMs * index / (race.checkpoints + 1)) });
      const key = randomUUID(), action: PlayerAction = { type: 'race_complete', attemptId, elapsedMs, finish: true };
      const receipt = await command(a.cookie, action, key); assert.equal(receipt.amountCentavos, String(race.prizePhp * 100)); assert.equal(receipt.details.outcome, 'win');
      assert.deepEqual(await command(a.cookie, action, key), receipt); await command(a.cookie, action);
      assert.equal(await db.transaction.count({ where: { playerId: a.playerId, kind: 'RACE_REWARD' } }), 1);
    });
    await t.test('server marketplace hides condition, charges its own asking price and cannot sell listing twice', async () => {
      const a = await account(), b = await account(); await grant(a.playerId);
      const listings = await (await call('/player/marketplace', a.cookie)).json(); assert.equal(listings.length, 8); assert.ok(!JSON.stringify(listings).includes('actualCondition'));
      const listing = listings[0]; await command(b.cookie, { type: 'market_purchase', listingId: listing.id }, randomUUID(), 404);
      const receipt = await command(a.cookie, { type: 'market_purchase', listingId: listing.id });
      assert.equal(receipt.amountCentavos, String(-listing.askingPricePhp * 100));
      const again = await command(a.cookie, { type: 'market_purchase', listingId: listing.id }); assert.equal(again.resourceId, receipt.resourceId);
      assert.equal(await db.ownedPart.count({ where: { playerId: a.playerId, sourceReference: listing.id } }), 1);
      await command(a.cookie, { type: 'part_inspect', partId: receipt.resourceId! });
      assert.equal((await db.ownedPart.findUniqueOrThrow({ where: { id: receipt.resourceId! } })).revealedBy, 'mechanic');
    });
    await t.test('refund retires original item atomically and cannot duplicate or refund another owner', async () => {
      const a = await account(), b = await account(); await grant(a.playerId, 100000n); const bought = await command(a.cookie, { type: 'part_purchase', definitionId: product.partId });
      await command(b.cookie, { type: 'refund', transactionId: bought.transactionId! }, randomUUID(), 404);
      const refund = await command(a.cookie, { type: 'refund', transactionId: bought.transactionId! }); assert.equal(refund.amountCentavos, String(product.pricePhp * 100));
      await command(a.cookie, { type: 'refund', transactionId: bought.transactionId! }, randomUUID(), 409);
      assert.equal((await db.wallet.findUniqueOrThrow({ where: { playerId: a.playerId } })).balanceCentavos, 600000n);
      assert.ok((await db.ownedPart.findUniqueOrThrow({ where: { id: bought.resourceId! } })).retiredAt);
    });
    await t.test('ownership insertion failure rolls back ledger, wallet and idempotency then retries safely', async () => {
      const a = await account(); await grant(a.playerId, 100000n); const key = randomUUID();
      await db.$executeRawUnsafe(`CREATE FUNCTION test_reject_economy_part() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."playerId" = '${a.playerId}'::uuid THEN RAISE EXCEPTION 'injected ownership failure'; END IF; RETURN NEW; END $$`);
      await db.$executeRawUnsafe('CREATE TRIGGER test_reject_economy_part BEFORE INSERT ON "OwnedPart" FOR EACH ROW EXECUTE FUNCTION test_reject_economy_part()');
      try {
        await command(a.cookie, { type: 'part_purchase', definitionId: product.partId }, key, 500);
        assert.equal(await db.transaction.count({ where: { playerId: a.playerId, kind: 'PART_PURCHASE' } }), 0);
        assert.equal((await db.wallet.findUniqueOrThrow({ where: { playerId: a.playerId } })).balanceCentavos, 600000n);
        assert.equal(await db.idempotencyRecord.count({ where: { playerId: a.playerId, key } }), 0);
      } finally { await db.$executeRawUnsafe('DROP TRIGGER test_reject_economy_part ON "OwnedPart"'); await db.$executeRawUnsafe('DROP FUNCTION test_reject_economy_part()'); }
      await command(a.cookie, { type: 'part_purchase', definitionId: product.partId }, key);
      const history = await (await call('/player/transactions', a.cookie)).json();
      assert.equal(history.transactions.length, 3); assert.equal(history.transactions[0].category, 'PART_PURCHASE'); assert.ok(history.transactions[0].requestId);
      let balance = 0n; for (const tx of history.transactions.toReversed()) { assert.equal(BigInt(tx.balanceBeforeCentavos), balance); balance += BigInt(tx.amountCentavos); assert.equal(BigInt(tx.balanceAfterCentavos), balance); }
      assert.equal(balance.toString(), history.balanceCentavos);
    });
  } finally { await app.close(); }
});
