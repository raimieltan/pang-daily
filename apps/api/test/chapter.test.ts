import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { bootstrapSchema, type PlayerAction } from '@pang-daily/contracts';
import { CHAPTER_ONE, STARTER_ORIGINS, nextChapterBeat } from '@pang-daily/game-core/progression/chapter';
import { HUB_JOBS } from '@pang-daily/game-core/jobs/catalog';
import { raceEconomy } from '@pang-daily/game-core/economy/raceRules';
import { repairLines } from '@pang-daily/game-core/maintenance/condition';
import { BANWA_DALAGAN_1996 } from '@pang-daily/game-core/vehicles/catalog';
import { getReputationProgress } from '@pang-daily/game-core/social/reputation';
import { createApplication } from '../src/bootstrap';
import { DatabaseService } from '../src/database/database.service';

test('fresh profile reaches Chapter 1 completion through shared systems', async t => {
 const app = await createApplication(); await app.listen(0, '127.0.0.1'); const base = await app.getUrl();
 const db = app.get(DatabaseService).client;
 async function call(path: string, cookie: string, body?: unknown) {
  return fetch(`${base}/api${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-Pang-Request': '1', Origin: 'http://localhost:3000' }, body: body === undefined ? undefined : JSON.stringify(body) });
 }
 async function load(cookie: string) {
  const dto = bootstrapSchema.parse(await (await call('/player/bootstrap', cookie)).json());
  const chapter = dto.progression.chapters[0];
  assert.equal(chapter.currentBeatId, nextChapterBeat(chapter.markers));
  assert.deepEqual(chapter.beats?.map(beat => beat.id), [...CHAPTER_ONE.beats]);
  return dto;
 }
 async function account() {
  const response = await call('/auth/register', '', { username: `ch1_${randomUUID().slice(0,8)}`, password: 'chapter-test-password' });
  assert.equal(response.status, 201); const cookie = response.headers.get('set-cookie')!.split(';')[0];
  return { cookie, dto: await load(cookie) };
 }
 async function command(cookie: string, action: PlayerAction, status = 200, key = randomUUID()) {
  const response = await call('/player/commands', cookie, { key, action }); const result = await response.json();
  assert.equal(response.status, status, JSON.stringify(result)); return result;
 }
 const introduce = (cookie: string, dialogueId: string) => command(cookie, { type: 'social_introduce', dialogueId });
 const choose = (cookie: string, dialogueId: string, nodeId: string, choiceId: string) => command(cookie, { type: 'social_choice', dialogueId, nodeId, choiceId });
 async function job(cookie: string) {
  const definition = HUB_JOBS.find(j => j.id === CHAPTER_ONE.firstJobId)!;
  const started = await command(cookie, { type: 'job_start', definitionId: definition.id });
  const accepted = await load(cookie); // accepted run persists before beginning
  if (accepted.progression.chapters[0].currentBeatId === 'complete_first_job') assert.equal(accepted.progression.chapters[0].beats?.find(beat => beat.id === 'complete_first_job')?.status, 'active');
  await command(cookie, { type: 'job_begin', runId: started.resourceId });
  for (const objective of definition.objectives) {
   await command(cookie, { type: 'job_objective', runId: started.resourceId, objectiveId: objective.id, elapsedMs: 0, cargoDamage: 0 });
   await load(cookie);
  }
  return { type: 'job_objective', runId: started.resourceId, objectiveId: definition.objectives.at(-1)!.id, elapsedMs: 0, cargoDamage: 0 } as const;
 }
 try {
  await t.test('origins differ, converge and cannot reset cash or condition', async () => {
   for (const origin of STARTER_ORIGINS) {
    const a = await account();
    assert.equal(a.dto.progression.chapters[0].currentBeatId, 'choose_origin');
    await command(a.cookie, { type: 'starter_origin', originId: origin.id });
    const saved = await load(a.cookie);
    assert.equal(saved.economy.balanceCentavos, String(origin.cashPhp * 100));
    assert.equal(saved.vehicles[0].condition.brakes, origin.brakes);
    assert.equal(saved.progression.chapters[0].currentBeatId, 'meet_mang_boy');
    await command(a.cookie, { type: 'starter_origin', originId: origin.id });
    assert.deepEqual((await load(a.cookie)).economy, saved.economy);
    await command(a.cookie, { type: 'starter_origin', originId: STARTER_ORIGINS.find(o => o.id !== origin.id)!.id }, 409);
   }
  });
  await t.test('loss, abandon, low-funds recovery, reload and duplicate effects', async () => {
   const a = await account(), cookie = a.cookie, car = a.dto.vehicles[0].id, playerId = a.dto.profile.id;
   await command(cookie, { type: 'chapter_continue', chapterId: 'chapter_1', beatId: 'kyo_recognition' }, 409);
   await command(cookie, { type: 'starter_origin', originId: 'project' });
   const sale = await command(cookie, { type: 'vehicle_sell', vehicleId: car }, 409);
   assert.equal(sale.code, 'CHAPTER_CAR_REQUIRED');
   await command(cookie, { type: 'race_start', definitionId: CHAPTER_ONE.firstRaceId, attemptId: randomUUID(), vehicleId: car }, 409);
   await command(cookie, { type: 'job_start', definitionId: CHAPTER_ONE.firstJobId }, 409);
   await introduce(cookie, 'talyer_mang_boy');
   assert.equal((await load(cookie)).progression.chapters[0].currentBeatId, 'complete_first_job');
   const abandoned = await command(cookie, { type: 'job_start', definitionId: CHAPTER_ONE.firstJobId });
   await command(cookie, { type: 'job_end', runId: abandoned.resourceId, outcome: 'abandoned', reason: 'Try again' });
   assert.equal((await load(cookie)).progression.chapters[0].currentBeatId, 'complete_first_job');
   const finishJob = await job(cookie), jobSave = await load(cookie);
   await command(cookie, finishJob); assert.deepEqual((await load(cookie)).economy, jobSave.economy);
   await introduce(cookie, 'kyo_order');
   await choose(cookie, 'kyo_order', 'kyo_first', 'meet_kyo');
   await choose(cookie, 'kyo_order', 'kyo_familiar', 'meet_regulars');
   await choose(cookie, 'kyo_order', 'kyo_scene', 'hear_michael');
   await load(cookie);
   await choose(cookie, 'kyo_order', 'kyo_advice', 'listen_michael');
   let saved = await load(cookie);
   assert.equal(saved.social.state.npcs.michael.respect, 54);
   assert.equal(saved.social.state.npcs.sean.introduced, true);
   await introduce(cookie, 'casey_intro');
   const race = raceEconomy(CHAPTER_ONE.firstRaceId)!;
   const dnf = randomUUID(); await command(cookie, { type: 'race_start', definitionId: race.id, attemptId: dnf, vehicleId: car });
   await command(cookie, { type: 'race_complete', attemptId: dnf, elapsedMs: 0, finish: false });
   assert.equal((await load(cookie)).progression.chapters[0].currentBeatId, 'finish_first_race');
   const attemptId = randomUUID(), elapsedMs = race.rivalTimeMs + 1000;
   await command(cookie, { type: 'race_start', definitionId: race.id, attemptId, vehicleId: car });
   await db.raceResult.update({ where: { playerId_attemptId: { playerId, attemptId } }, data: { startedAt: new Date(Date.now() - elapsedMs - 1000) } });
   for (let checkpointIndex = 1; checkpointIndex <= race.checkpoints; checkpointIndex++) {
    await command(cookie, { type: 'race_checkpoint', attemptId, checkpointIndex, elapsedMs: Math.round(elapsedMs * checkpointIndex / (race.checkpoints + 1)) });
    await load(cookie);
   }
   const finishRace = { type: 'race_complete', attemptId, elapsedMs, finish: true } as const;
   await command(cookie, finishRace);
   saved = await load(cookie);
   assert.equal(saved.progression.chapters[0].currentBeatId, 'repair_daily');
   assert.equal(saved.vehicles[0].condition.brakes, .3);
   assert.equal(saved.social.rivals[0].losses, 1);
   await command(cookie, finishRace);
   assert.deepEqual((await load(cookie)).vehicles, saved.vehicles);
   // Spend remaining cash through the shared fuel system and exhaust the tank via validated wear.
   const fuel = Math.floor(Number(saved.economy.balanceCentavos) / 6500) * 1000;
   await command(cookie, { type: 'vehicle_checkpoint', vehicleId: car, revision: saved.vehicles[0].conditionRevision, conditionLoss: Object.fromEntries(Object.keys(saved.vehicles[0].condition).map(k => [k, 0])) as typeof saved.vehicles[0]['condition'], fuelConsumedMilliliters: Math.round(saved.vehicles[0].fuelLiters * 1000), odometerDeltaMeters: 0 });
   if (fuel) await command(cookie, { type: 'fuel_purchase', vehicleId: car, milliliters: fuel });
   saved = await load(cookie);
   await command(cookie, { type: 'vehicle_checkpoint', vehicleId: car, revision: saved.vehicles[0].conditionRevision, conditionLoss: Object.fromEntries(Object.keys(saved.vehicles[0].condition).map(k => [k, 0])) as typeof saved.vehicles[0]['condition'], fuelConsumedMilliliters: Math.round(saved.vehicles[0].fuelLiters * 1000), odometerDeltaMeters: 0 });
   await command(cookie, { type: 'vehicle_repair', vehicleId: car, components: ['brakes'] }, 409);
   // Repeat the real no-fuel job; favor/social rewards remain consumed while wages stay available.
   for (let i = 0; i < 20; i++) {
    saved = await load(cookie);
    const quote = repairLines(BANWA_DALAGAN_1996, saved.vehicles[0].condition).find(line => line.component === 'brakes')!;
    if (Number(saved.economy.balanceCentavos) >= quote.costPhp * 100) break;
    await job(cookie);
   }
   // Server ledger sequence, not wall-clock timestamps, proves repair happened after the setback.
   await db.chapterMarker.update({ where: { playerId_chapterId_markerId: { playerId, chapterId: CHAPTER_ONE.id, markerId: 'brake_setback' } }, data: { completedAt: new Date(Date.now() + 60_000) } });
   await command(cookie, { type: 'vehicle_repair', vehicleId: car, components: ['brakes'] });
   saved = await load(cookie);
   assert.equal(saved.progression.chapters[0].currentBeatId, 'kyo_recognition');
   await command(cookie, finishRace); // cannot damage the repaired brakes twice
   assert.deepEqual((await load(cookie)).vehicles, saved.vehicles);
   await introduce(cookie, 'kyo_order');
   await choose(cookie, 'kyo_order', 'kyo_recognition', 'take_parking');
   const complete = await load(cookie);
   assert.equal(complete.progression.chapters[0].currentBeatId, null);
   assert.ok(complete.progression.chapters[0].completedAt);
   assert.equal(complete.progression.chapters[0].markers.length, 8);
   assert.ok(complete.progression.unlockedLocations.some(u => u.unlockId === CHAPTER_ONE.completionUnlockId));
   assert.ok(getReputationProgress(complete.social.state).points >= 12);
   assert.ok(complete.social.state.npcs.kyo_barista.relationshipFlags.includes('saved_parking'));
   await choose(cookie, 'kyo_order', 'kyo_recognition', 'take_parking');
   await command(cookie, { type: 'chapter_continue', chapterId: 'chapter_1', beatId: 'kyo_recognition' });
   assert.deepEqual((await load(cookie)).social, complete.social);
   assert.equal(await db.locationUnlock.count({ where: { playerId, unlockId: CHAPTER_ONE.completionUnlockId } }), 1);
   await job(cookie); await introduce(cookie, 'casey_intro');
   assert.equal((await load(cookie)).progression.chapters[0].completedAt, complete.progression.chapters[0].completedAt);
  });
 } finally { await app.close(); }
});
