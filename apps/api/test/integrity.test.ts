import { freePlayFixture } from './fixtures/free-play';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { bootstrapSchema, type PlayerAction } from '@pang-daily/contracts';
import { AUTO_PARTS_STOCK } from '@pang-daily/game-core/shops/AutoPartsShop';
import { HUB_JOBS } from '@pang-daily/game-core/jobs/catalog';
import { HIRAYA_KIDLAT_1997 } from '@pang-daily/game-core/vehicles/catalog';
import { raceEconomy } from '@pang-daily/game-core/economy/raceRules';
import { createApplication } from '../src/bootstrap';
import { DatabaseService } from '../src/database/database.service';

const product = [...AUTO_PARTS_STOCK].sort((a, b) => a.pricePhp - b.pricePhp)[0];
test('shared command integrity boundary', async t => {
  const app = await createApplication(); await app.listen(0, '127.0.0.1');
  const base = await app.getUrl(), db = app.get(DatabaseService).client;
  async function call(path: string, cookie = '', body?: unknown) {
    return fetch(`${base}/api${path}`, { method: body === undefined ? 'GET' : 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-Pang-Request': '1', Origin: 'http://localhost:3000' },
      body: body === undefined ? undefined : JSON.stringify(body) });
  }
  async function load(cookie: string) { return bootstrapSchema.parse(await (await call('/player/bootstrap', cookie)).json()); }
  async function account() {
    const response = await call('/auth/register', '', { username: `safe_${randomUUID().slice(0, 8)}`, password: 'integrity-test-password' });
    assert.equal(response.status, 201);
    const cookie = response.headers.get('set-cookie')!.split(';')[0], state = await load(cookie);
    await freePlayFixture(db, state.profile.id);
    await db.$transaction(async tx => {
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { playerId: state.profile.id } });
      await tx.transaction.create({ data: { playerId: state.profile.id, sequence: wallet.revision + 1n, amountCentavos: 1000000n,
        balanceBeforeCentavos: wallet.balanceCentavos, balanceAfterCentavos: wallet.balanceCentavos + 1000000n,
        kind: 'test_grant', source: 'integrity_fixture', sourceReference: randomUUID(), description: 'Test budget', requestId: randomUUID() } });
      await tx.wallet.update({ where: { playerId: state.profile.id }, data: { balanceCentavos: wallet.balanceCentavos + 1000000n, revision: wallet.revision + 1n } });
    });
    return { cookie, playerId: state.profile.id, car: state.vehicles[0].id };
  }
  async function command(cookie: string, action: PlayerAction, key = randomUUID(), status = 200) {
    const response = await call('/player/commands', cookie, { key, action });
    const body = await response.json(); assert.equal(response.status, status, JSON.stringify(body)); return body;
  }
  async function prepareJob(cookie: string) {
    const job = HUB_JOBS.find(job => job.id === 'kyo_ice_run')!;
    const started = await command(cookie, { type: 'job_start', definitionId: job.id });
    await command(cookie, { type: 'job_begin', runId: started.resourceId });
    for (const objective of job.objectives.slice(0, -1)) await command(cookie, { type: 'job_objective', runId: started.resourceId, objectiveId: objective.id, elapsedMs: 0, cargoDamage: 0 });
    return { type: 'job_objective', runId: started.resourceId, objectiveId: job.objectives.at(-1)!.id, elapsedMs: 0, cargoDamage: 0 } as const;
  }
  async function prepareRace(a: Awaited<ReturnType<typeof account>>) {
    const race = raceEconomy('barangay_sprint')!, attemptId = randomUUID(), elapsedMs = Math.max(5000, race.minimumTimeMs);
    await command(a.cookie, { type: 'race_start', definitionId: race.id, attemptId, vehicleId: a.car });
    await db.raceResult.update({ where: { playerId_attemptId: { playerId: a.playerId, attemptId } }, data: { startedAt: new Date(Date.now() - elapsedMs - 1000) } });
    for (let checkpointIndex = 1; checkpointIndex <= race.checkpoints; checkpointIndex++) await command(a.cookie, { type: 'race_checkpoint', attemptId, checkpointIndex, elapsedMs: Math.round(elapsedMs * checkpointIndex / (race.checkpoints + 1)) });
    return { type: 'race_complete', attemptId, elapsedMs, finish: true } as const;
  }
  try {
    await t.test('actor identity and all owner-linked resources are protected', async () => {
      const a = await account(), b = await account();
      const part = await command(b.cookie, { type: 'part_purchase', definitionId: product.partId });
      const listing = (await (await call('/player/marketplace', b.cookie)).json())[0];
      const bState = await load(b.cookie);
      const conditionLoss = Object.fromEntries(Object.keys(bState.vehicles[0].condition).map(component => [component, 0])) as typeof bState.vehicles[0]['condition'];
      const run = await command(b.cookie, { type: 'job_start', definitionId: 'kyo_ice_run' });
      const attempts: PlayerAction[] = [
        { type: 'vehicle_select', vehicleId: b.car }, { type: 'vehicle_sell', vehicleId: b.car },
        { type: 'vehicle_repair', vehicleId: b.car, components: ['engine'] },
        { type: 'fuel_purchase', vehicleId: b.car, milliliters: 1 },
        { type: 'vehicle_checkpoint', vehicleId: b.car, revision: bState.vehicles[0].conditionRevision, conditionLoss, fuelConsumedMilliliters: 0, odometerDeltaMeters: 0 },
        { type: 'vehicle_appearance', vehicleId: b.car, paint: '#123456' },
        { type: 'part_sell', partId: part.resourceId }, { type: 'part_inspect', partId: part.resourceId },
        { type: 'part_refinish', partId: part.resourceId, finish: null },
        { type: 'part_install', vehicleId: a.car, partId: part.resourceId },
        { type: 'part_remove', vehicleId: b.car, partId: part.resourceId },
        { type: 'refund', transactionId: part.transactionId },
        { type: 'market_purchase', listingId: listing.id },
        { type: 'job_begin', runId: run.resourceId },
        { type: 'job_end', runId: run.resourceId, outcome: 'abandoned', reason: 'foreign run' },
        { type: 'job_objective', runId: run.resourceId, objectiveId: HUB_JOBS.find(job => job.id === 'kyo_ice_run')!.objectives[0].id, elapsedMs: 0, cargoDamage: 0 },
        { type: 'race_start', definitionId: 'barangay_sprint', attemptId: randomUUID(), vehicleId: b.car },
      ];
      for (const action of attempts) {
        const error = await command(a.cookie, action, randomUUID(), 404);
        assert.equal(error.code, 'OWNED_RESOURCE_NOT_FOUND'); assert.equal(error.kind, 'not_found'); assert.ok(error.requestId);
      }
      const race = await prepareRace(b); // Starting a race atomically abandons B's job.
      await command(a.cookie, race, randomUUID(), 404);
      await command(a.cookie, { type: 'race_checkpoint', attemptId: race.attemptId, checkpointIndex: 1, elapsedMs: 0 }, randomUUID(), 404);
      const beforeB = await load(b.cookie);
      await command(a.cookie, { type: 'social_introduce', dialogueId: 'casey_intro' });
      assert.deepEqual(await load(b.cookie), beforeB);
      const spoof = await call('/player/commands', a.cookie, { key: randomUUID(), playerId: b.playerId, action: { type: 'part_purchase', definitionId: product.partId } });
      assert.equal(spoof.status, 400);
      for (const path of ['/player/commands?playerId=foreign', '/player/marketplace?playerId=foreign', '/player/transactions?playerId=foreign']) {
        assert.equal((await call(path, a.cookie, path.includes('commands') ? { key: randomUUID(), action: { type: 'part_purchase', definitionId: product.partId } } : undefined)).status, 400);
      }
      assert.equal((await call('/player/commands', '', { key: randomUUID(), action: { type: 'part_purchase', definitionId: product.partId } })).status, 401);
    });
    await t.test('actor state is read after the player lock so concurrent selection cannot sell the active car', async () => {
      const a = await account(), definition = HIRAYA_KIDLAT_1997;
      const second = await db.vehicle.create({ data: { playerId: a.playerId, definitionId: definition.id,
        acquisitionKey: 'integrity-second-car', paint: definition.visual.defaultPaint,
        condition: { create: { ...definition.condition.typical, fuelLiters: 45 } } } });
      let release!: () => void, locked!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      const lockReady = new Promise<void>(resolve => { locked = resolve; });
      const holding = db.$transaction(async tx => {
        await tx.$queryRaw`SELECT "id" FROM "PlayerProfile" WHERE "id" = ${a.playerId}::uuid FOR UPDATE`;
        locked(); await gate;
      }, { timeout: 15000 });
      let selected: Promise<unknown> | undefined, sold: Promise<unknown> | undefined;
      try {
        await lockReady;
        selected = command(a.cookie, { type: 'vehicle_select', vehicleId: second.id });
        let queued = false;
        for (let attempt = 0; attempt < 40; attempt++) {
          const rows = await db.$queryRaw<{ count: bigint }[]>`SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE '%FROM "PlayerProfile"%'`;
          if (rows[0].count > 0n) { queued = true; break; }
          await new Promise(resolve => setTimeout(resolve, 25));
        }
        assert.ok(queued, 'selection must be waiting on the player lock');
        sold = command(a.cookie, { type: 'vehicle_sell', vehicleId: second.id }, randomUUID(), 409);
      } finally { release(); await holding; }
      await selected;
      const refusal = await sold as { code: string };
      assert.equal(refusal.code, 'ACTIVE_VEHICLE');
      assert.equal((await db.vehicle.findUniqueOrThrow({ where: { id: second.id } })).retiredAt, null);
      assert.equal((await load(a.cookie)).profile.activeVehicleId, second.id);
    });
    await t.test('strict validation rejects final progression state, invalid ranges and unknown content before writes', async () => {
      const a = await account(), before = await load(a.cookie);
      const zeroLoss = Object.fromEntries(Object.keys(before.vehicles[0].condition).map(component => [component, 0]));
      for (const action of [
        { type: 'set_wallet', balanceCentavos: '999999999' }, { type: 'set_inventory', parts: [] },
        { type: 'set_reputation', points: 160 }, { type: 'unlock', unlockId: 'midnight_run' },
        { type: 'crew_state', membership: 'member' }, { type: 'import', state: before },
        { type: 'part_purchase', definitionId: product.partId, pricePhp: 1 },
        { type: 'part_purchase', definitionId: 'unknown-part' }, { type: 'job_start', definitionId: 'unknown-job' },
        { type: 'race_start', definitionId: 'unknown-race', attemptId: randomUUID(), vehicleId: a.car },
        { type: 'social_introduce', dialogueId: 'unknown-dialogue' },
        { type: 'social_choice', dialogueId: 'casey_intro', nodeId: 'fake', choiceId: 'fake' },
        { type: 'race_complete', attemptId: randomUUID(), elapsedMs: -1, finish: true },
        { type: 'vehicle_repair', vehicleId: a.car, components: ['engine', 'engine'] },
        { type: 'vehicle_checkpoint', vehicleId: a.car, revision: '0', condition: before.vehicles[0].condition, fuelMilliliters: 45000, odometerDeltaMeters: 0 },
        { type: 'vehicle_checkpoint', vehicleId: a.car, revision: '0', conditionLoss: { ...zeroLoss, engine: -1 }, fuelConsumedMilliliters: 0, odometerDeltaMeters: 0 },
        { type: 'vehicle_checkpoint', vehicleId: a.car, revision: '0', conditionLoss: { ...zeroLoss, money: 10 }, fuelConsumedMilliliters: 0, odometerDeltaMeters: 0 },
      ]) {
        const response = await call('/player/commands', a.cookie, { key: randomUUID(), action });
        assert.equal(response.status, 400, JSON.stringify(action)); assert.equal((await response.json()).kind, 'validation');
      }
      const malformed = await fetch(`${base}/api/player/commands`, { method: 'POST',
        headers: { Cookie: a.cookie, 'Content-Type': 'application/json', 'X-Pang-Request': '1', Origin: 'http://localhost:3000' }, body: '{broken' });
      assert.equal(malformed.status, 400);
      const parserError = await malformed.json();
      assert.equal(parserError.kind, 'validation'); assert.ok(parserError.requestId);
      assert.deepEqual(await load(a.cookie), before);
      assert.equal(await db.idempotencyRecord.count({ where: { playerId: a.playerId } }), 0);
    });
    await t.test('duplicate keys are player-scoped and job/race settlement preserves original payout receipts', async () => {
      const a = await account(), b = await account(), key = randomUUID();
      const action: PlayerAction = { type: 'part_purchase', definitionId: product.partId };
      const receipts = await Promise.all(Array.from({ length: 4 }, () => command(a.cookie, action, key)));
      for (const receipt of receipts) assert.deepEqual(receipt, receipts[0]);
      assert.notEqual((await command(b.cookie, action, key)).resourceId, receipts[0].resourceId);
      const conflict = await command(a.cookie, { type: 'social_introduce', dialogueId: 'casey_intro' }, key, 409);
      assert.equal(conflict.code, 'IDEMPOTENCY_CONFLICT'); assert.equal(conflict.kind, 'conflict');
      const finalJob = await prepareJob(a.cookie), jobKey = randomUUID();
      const jobReceipt = await command(a.cookie, finalJob, jobKey);
      assert.deepEqual(await command(a.cookie, finalJob, jobKey), jobReceipt);
      assert.deepEqual(await command(a.cookie, finalJob), jobReceipt);
      await command(a.cookie, { ...finalJob, elapsedMs: 1 }, randomUUID(), 409);
      const finalRace = await prepareRace(a), raceKey = randomUUID();
      const raceReceipt = await command(a.cookie, finalRace, raceKey), before = await load(a.cookie);
      assert.deepEqual(await command(a.cookie, finalRace, raceKey), raceReceipt);
      assert.deepEqual(await command(a.cookie, finalRace), raceReceipt);
      assert.deepEqual((await load(a.cookie)).social, before.social);
      assert.equal(await db.transaction.count({ where: { playerId: a.playerId, kind: 'JOB_REWARD' } }), 1);
      assert.equal(await db.transaction.count({ where: { playerId: a.playerId, kind: 'RACE_REWARD' } }), 1);
    });
    for (const kind of ['purchase', 'repair', 'job', 'race'] as const) await t.test(`${kind} rolls back all domain writes if final receipt storage fails; same-key retry is safe`, async () => {
      const a = await account();
      const action: PlayerAction = kind === 'purchase' ? { type: 'part_purchase', definitionId: product.partId }
        : kind === 'repair' ? { type: 'vehicle_repair', vehicleId: a.car, components: ['brakes'] }
          : kind === 'job' ? await prepareJob(a.cookie) : await prepareRace(a);
      const before = await load(a.cookie), ledgerCount = await db.transaction.count({ where: { playerId: a.playerId } }), key = randomUUID();
      // Isolated test DB only. Fail after wallet/progression/social/chapter writes, at receipt insertion.
      await db.$executeRawUnsafe(`CREATE FUNCTION integrity_test_fail_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."playerId" = '${a.playerId}'::uuid THEN RAISE EXCEPTION 'integrity rollback probe'; END IF; RETURN NEW; END $$`);
      await db.$executeRawUnsafe('CREATE TRIGGER integrity_test_fail_receipt BEFORE INSERT ON "IdempotencyRecord" FOR EACH ROW EXECUTE FUNCTION integrity_test_fail_receipt()');
      try {
        const response = await call('/player/commands', a.cookie, { key, action });
        assert.equal(response.status, 500);
        const failure = await response.json(); assert.equal(failure.kind, 'internal');
        assert.equal(failure.code, 'INTERNAL_ERROR'); assert.ok(!JSON.stringify(failure).includes('rollback probe'));
        assert.deepEqual(await load(a.cookie), before);
        assert.equal(await db.transaction.count({ where: { playerId: a.playerId } }), ledgerCount);
        assert.equal(await db.idempotencyRecord.count({ where: { playerId: a.playerId, key } }), 0);
      } finally {
        await db.$executeRawUnsafe('DROP TRIGGER integrity_test_fail_receipt ON "IdempotencyRecord"');
        await db.$executeRawUnsafe('DROP FUNCTION integrity_test_fail_receipt()');
      }
      const receipt = await command(a.cookie, action, key);
      assert.deepEqual(await command(a.cookie, action, key), receipt);
      assert.equal(await db.transaction.count({ where: { playerId: a.playerId } }), ledgerCount + 1);
    });
  } finally { await app.close(); }
});
