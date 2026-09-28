import { freePlayFixture } from './fixtures/free-play';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { bootstrapSchema, type PlayerAction } from '@pang-daily/contracts';
import { HUB_JOBS } from '@pang-daily/game-core/jobs/catalog';
import { raceEconomy } from '@pang-daily/game-core/economy/raceRules';
import { rivalHistory } from '@pang-daily/game-core/social/rivalHistory';
import { getReputationProgress } from '@pang-daily/game-core/social/reputation';
import { createApplication } from '../src/bootstrap';
import { DatabaseService } from '../src/database/database.service';

test('durable social and content progression', async t => {
 const app = await createApplication(); await app.listen(0, '127.0.0.1'); const base = await app.getUrl();
 const db = app.get(DatabaseService).client;
 async function call(path: string, cookie: string, body?: unknown) {
  return fetch(`${base}/api${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-Pang-Request': '1', Origin: 'http://localhost:3000' }, body: body === undefined ? undefined : JSON.stringify(body) });
 }
 async function load(cookie: string) { return bootstrapSchema.parse(await (await call('/player/bootstrap', cookie)).json()); }
 async function account(campaign = false) {
  const response = await call('/auth/register', '', { username: `prog_${randomUUID().slice(0,8)}`, password: 'progression-test-password' });
  assert.equal(response.status, 201); const cookie = response.headers.get('set-cookie')!.split(';')[0];
  const dto = await load(cookie);
  if (!campaign) await freePlayFixture(db, dto.profile.id);
  else await command(cookie, { type: 'starter_origin', originId: 'family' });
  return { cookie, playerId: dto.profile.id, car: dto.vehicles[0].id };
 }
 async function command(cookie: string, action: PlayerAction, status = 200, key = randomUUID()) {
  const response = await call('/player/commands', cookie, { key, action }); const result = await response.json();
  assert.equal(response.status, status, JSON.stringify(result)); return result;
 }
 const introduce = (cookie: string, dialogueId: string) => command(cookie, { type: 'social_introduce', dialogueId });
 const choose = (cookie: string, dialogueId: string, nodeId: string, choiceId: string, status = 200) => command(cookie, { type: 'social_choice', dialogueId, nodeId, choiceId }, status);
 async function job(cookie: string, definitionId = 'kyo_ice_run') {
  const definition = HUB_JOBS.find(job => job.id === definitionId)!;
  const started = await command(cookie, { type: 'job_start', definitionId });
  await command(cookie, { type: 'job_begin', runId: started.resourceId });
  for (const objective of definition.objectives) await command(cookie, { type: 'job_objective', runId: started.resourceId, objectiveId: objective.id, elapsedMs: 0, cargoDamage: 0 });
  return started.resourceId as string;
 }
 async function race(a: Awaited<ReturnType<typeof account>>, win = true) {
  const definition = raceEconomy('barangay_sprint')!, attemptId = randomUUID();
  await command(a.cookie, { type: 'race_start', definitionId: definition.id, attemptId, vehicleId: a.car });
  const elapsedMs = win ? 5000 : definition.rivalTimeMs + 1000;
  await db.raceResult.update({ where: { playerId_attemptId: { playerId: a.playerId, attemptId } }, data: { startedAt: new Date(Date.now() - elapsedMs - 1000) } });
  for (let checkpointIndex = 1; checkpointIndex <= definition.checkpoints; checkpointIndex++) await command(a.cookie, { type: 'race_checkpoint', attemptId, checkpointIndex, elapsedMs: Math.round(elapsedMs * checkpointIndex / (definition.checkpoints + 1)) });
  const action: PlayerAction = { type: 'race_complete', attemptId, elapsedMs, finish: true };
  const key = randomUUID(), receipt = await command(a.cookie, action, 200, key);
  return { attemptId, action, key, receipt };
 }
 try {
  await t.test('older profile gains the Kyo friend with safe defaults and persists a one-time referral', async () => {
   const a = await account();
   const original = await load(a.cookie);
   await db.npcRelationship.delete({ where: { playerId_npcId: { playerId: a.playerId, npcId: 'kyo_barista' } } });
   const migrated = await load(a.cookie);
   assert.deepEqual(migrated.economy, original.economy);
   assert.deepEqual(migrated.vehicles, original.vehicles);
   assert.deepEqual(migrated.inventory, original.inventory);
   assert.deepEqual(migrated.progression, original.progression);
   assert.deepEqual(migrated.social.state.npcs.kyo_barista, original.social.state.npcs.kyo_barista);
   await introduce(a.cookie, 'kyo_order');
   await choose(a.cookie, 'kyo_order', 'kyo_first', 'meet_kyo');
   const key = randomUUID();
   const referral = { type: 'social_choice', dialogueId: 'kyo_order', nodeId: 'kyo_familiar', choiceId: 'introduce_mang_boy' } as const;
   await command(a.cookie, referral, 200, key);
   const saved = await load(a.cookie);
   assert.equal(saved.social.state.npcs.kyo_barista.trust, 52);
   assert.ok(saved.social.state.npcs.kyo_barista.relationshipFlags.includes('introduced_mang_boy'));
   assert.ok(await db.npcRelationship.findUnique({ where: { playerId_npcId: { playerId: a.playerId, npcId: 'kyo_barista' } } }));
   await command(a.cookie, referral, 200, key);
   assert.deepEqual((await load(a.cookie)).social.state, saved.social.state);
   await introduce(a.cookie, 'talyer_mang_boy');
   await choose(a.cookie, 'talyer_mang_boy', 'mang_referred', 'promise_help_referred');
   assert.equal((await load(a.cookie)).social.state.favors.mang_boy_parts_help.status, 'offered');
  });
  await t.test('social history retains deduplication envelopes while limiting detailed effects', async () => {
   const a = await account();
   const events = Array.from({ length: 201 }, (_, index) => ({
    id: randomUUID(), playerId: a.playerId, sequence: index + 1,
    eventId: `historic:${index}`, sourceId: `historic:${index}`, sourceKey: `historic:${index}`,
    fingerprint: '{}', type: 'conversation', targetContentId: 'kyo_barista',
    contextContentId: 'kyo_familiar', reason: 'Historic conversation',
   }));
   await db.socialEvent.createMany({ data: events });
   await db.socialEventEffect.createMany({ data: events.map(event => ({
    socialEventId: event.id, playerId: a.playerId, npcId: 'kyo_barista',
    trustDelta: 0, respectDelta: 0, flagsAdded: [], flagsRemoved: [],
   })) });
   await introduce(a.cookie, 'kyo_order');
   assert.equal(await db.socialEvent.count({ where: { playerId: a.playerId } }), 202);
   assert.equal(await db.socialEventEffect.count({ where: { playerId: a.playerId } }), 200);
   assert.ok(await db.socialEvent.findUnique({ where: { playerId_sourceKey: { playerId: a.playerId, sourceKey: 'historic:0' } } }));
  });
  await t.test('strict intents, invalid content and cross-player references cannot assign social truth', async () => {
   const a = await account(), b = await account();
   for (const action of [{ type: 'social_introduce', dialogueId: 'casey_intro', trust: 100 }, { type: 'set_reputation', points: 999 }, { type: 'unlock', unlockId: 'midnight_run' }, { type: 'social_choice', playerId: b.playerId, dialogueId: 'casey_intro', nodeId: 'kyo_crew', choiceId: 'crew_accept' }]) assert.equal((await call('/player/commands', a.cookie, { key: randomUUID(), action })).status, 400);
   await introduce(a.cookie, 'casey_intro');
   assert.equal((await command(a.cookie, { type: 'social_introduce', dialogueId: 'ghost' }, 400)).code, 'INVALID_COMMAND_CONTENT');
   await choose(a.cookie, 'casey_intro', 'kyo_crew', 'crew_accept', 409);
   assert.equal((await load(b.cookie)).social.state.npcs.casey.introduced, false);
   const run = await command(a.cookie, { type: 'job_start', definitionId: 'kyo_ice_run' });
   await command(b.cookie, { type: 'job_end', runId: run.resourceId, outcome: 'abandoned', reason: 'Guessed run' }, 404);
   const result = await race(b);
   await command(a.cookie, result.action, 404);
   assert.equal((await call('/player/commands', '', { key: randomUUID(), action: { type: 'social_introduce', dialogueId: 'casey_intro' } })).status, 401);
  });
  await t.test('NPC favors, rewards and chapter continuation survive reload; duplicate completion is inert', async () => {
   const a = await account(true);
   assert.equal((await load(a.cookie)).progression.chapters[0].currentBeatId, 'meet_mang_boy');
   await command(a.cookie, { type: 'chapter_continue', chapterId: 'chapter_1', beatId: 'finish_first_race' }, 409);
   await command(a.cookie, { type: 'chapter_continue', chapterId: 'chapter_1', beatId: 'meet_mang_boy' }, 409);
   await introduce(a.cookie, 'talyer_mang_boy');
   await choose(a.cookie, 'talyer_mang_boy', 'mang_first', 'promise_help');
   const accepted = await command(a.cookie, { type: 'job_start', definitionId: 'talyer_oil_errand' });
   let loaded = await load(a.cookie);
   assert.equal(loaded.progression.jobs[0].status, 'accepted');
   assert.equal(loaded.social.state.favors.mang_boy_parts_help.runId, accepted.resourceId);
   await command(a.cookie, { type: 'job_begin', runId: accepted.resourceId });
   const definition = HUB_JOBS.find(job => job.id === 'talyer_oil_errand')!;
   for (const objective of definition.objectives) await command(a.cookie, { type: 'job_objective', runId: accepted.resourceId, objectiveId: objective.id, elapsedMs: 0, cargoDamage: 0 });
   const before = await load(a.cookie);
   await command(a.cookie, { type: 'job_objective', runId: accepted.resourceId, objectiveId: definition.objectives.at(-1)!.id, elapsedMs: 0, cargoDamage: 0 });
   loaded = await load(a.cookie);
   assert.deepEqual(loaded.social.state, before.social.state); assert.deepEqual(loaded.economy, before.economy);
   assert.equal(loaded.social.state.npcs.mang_boy.trust, 60);
   assert.equal(loaded.social.state.favors.mang_boy_parts_help.status, 'completed');
   assert.equal(loaded.social.state.unlocks.mang_boy_service.unlocked, true);
   assert.equal(loaded.progression.chapters[0].currentBeatId, 'meet_casey');
   await introduce(a.cookie, 'kyo_order');
   await choose(a.cookie, 'kyo_order', 'kyo_first', 'meet_kyo');
   await choose(a.cookie, 'kyo_order', 'kyo_familiar', 'meet_regulars');
   await choose(a.cookie, 'kyo_order', 'kyo_scene', 'talk_builds');
   await introduce(a.cookie, 'casey_intro'); await race(a);
   loaded = await load(a.cookie);
   assert.equal(loaded.progression.chapters[0].currentBeatId, 'repair_daily');
   assert.equal(loaded.progression.chapters[0].completedAt, null);
   assert.equal(loaded.progression.chapters[0].markers.length, 6);
   assert.ok(!loaded.progression.unlockedLocations.some(unlock => unlock.unlockId === 'chapter_2_access'));
   await command(a.cookie, { type: 'chapter_continue', chapterId: 'chapter_1', beatId: 'finish_first_race' });
   assert.equal(await db.chapterMarker.count({ where: { playerId: a.playerId } }), 6);
  });
  await t.test('race continuity, inclusive thresholds, invitations and membership are deterministic across retries and sessions', async () => {
   const a = await account(); await introduce(a.cookie, 'casey_intro');
   const first = await race(a);
   let loaded = await load(a.cookie);
   assert.equal(getReputationProgress(loaded.social.state).tier, 'Unknown');
   assert.equal(loaded.social.state.npcs.casey.respect, 58);
   const payout = await db.raceResult.findUniqueOrThrow({ where: { playerId_attemptId: { playerId: a.playerId, attemptId: first.attemptId } } });
   assert.equal(payout.payoutTransactionId, first.receipt.transactionId);
   assert.equal(loaded.progression.recentRaces[0].payoutTransactionId, first.receipt.transactionId);
   assert.equal(loaded.progression.bestRaces?.[0].bestElapsedMs, '5000');
   await command(a.cookie, { ...first.action, type: 'race_complete', attemptId: first.attemptId, elapsedMs: 5001, finish: true }, 409);
   assert.equal((await db.transaction.findUniqueOrThrow({ where: { id: payout.payoutTransactionId! } })).sourceReference, first.attemptId);
   assert.deepEqual(await command(a.cookie, first.action, 200, first.key), first.receipt);
   await Promise.all(Array.from({ length: 4 }, () => command(a.cookie, first.action)));
   assert.deepEqual((await load(a.cookie)).social.state, loaded.social.state);
   await job(a.cookie); // 8 + 4 is exactly Regular's inclusive threshold.
   loaded = await load(a.cookie); assert.equal(getReputationProgress(loaded.social.state).points, 12);
   assert.equal(getReputationProgress(loaded.social.state).tier, 'Regular');
   assert.ok(loaded.social.state.unlocks.casey_wall_invitation.unlocked);
   await introduce(a.cookie, 'casey_intro');
   await choose(a.cookie, 'casey_intro', 'casey_post_race', 'congratulate_casey');
   await choose(a.cookie, 'casey_intro', 'casey_post_race', 'crew_info');
   await choose(a.cookie, 'casey_intro', 'kyo_crew', 'crew_invite');
   assert.equal((await load(a.cookie)).social.state.crews.kyo_regulars.invitation, 'invited');
   await choose(a.cookie, 'casey_intro', 'kyo_crew', 'crew_accept');
   loaded = await load(a.cookie); assert.equal(loaded.social.state.crews.kyo_regulars.membership, 'member');
   assert.equal(loaded.social.state.crews.kyo_regulars.points, 0);
   await choose(a.cookie, 'casey_intro', 'kyo_crew', 'crew_accept');
   assert.equal((await load(a.cookie)).social.state.crews.kyo_regulars.joins, 1);
   await race(a, false);
   const dnfId = randomUUID(); await command(a.cookie, { type: 'race_start', definitionId: 'barangay_sprint', attemptId: dnfId, vehicleId: a.car });
   await command(a.cookie, { type: 'race_complete', attemptId: dnfId, elapsedMs: 0, finish: false });
   loaded = await load(a.cookie);
   assert.deepEqual(rivalHistory(loaded.social.state).attempts.map(item => item.outcome), ['win', 'loss', 'dnf']);
   assert.equal(loaded.social.rivals[0].wins, 1); assert.equal(loaded.social.rivals[0].losses, 1); assert.equal(loaded.social.rivals[0].dnfs, 1);
   await call('/auth/logout', a.cookie, {});
   const credential = await db.playerProfile.findUniqueOrThrow({ where: { id: a.playerId }, include: { user: { include: { credential: true } } } });
   const response = await call('/auth/login', '', { username: credential.user.credential!.username, password: 'progression-test-password' });
   const cookie = response.headers.get('set-cookie')!.split(';')[0];
   assert.deepEqual((await load(cookie)).social.state, loaded.social.state);
  });
  await t.test('authored cooldown uses durable terminal time and survives reloading accepted runs', async () => {
   const a = await account(), definition = HUB_JOBS.find(job => job.id === 'hatid_suki_home')!;
   const original = definition.cooldownSeconds;
   definition.cooldownSeconds = 60;
   try {
    const runId = await job(a.cookie, definition.id);
    assert.equal((await load(a.cookie)).progression.jobs[0].status, 'completed');
    assert.equal((await command(a.cookie, { type: 'job_start', definitionId: definition.id }, 409)).code, 'JOB_COOLDOWN');
    await db.jobProgress.update({ where: { playerId_runId: { playerId: a.playerId, runId } }, data: { completedAt: new Date(Date.now() - 61000) } });
    await command(a.cookie, { type: 'job_start', definitionId: definition.id });
    assert.equal((await load(a.cookie)).progression.jobs.filter(job => job.status === 'accepted').length, 1);
   } finally { definition.cooldownSeconds = original; }
  });
  await t.test('leaving and one rejoin preserve independent crew standing and suspended race access', async () => {
   const a = await account(); await introduce(a.cookie, 'casey_intro'); await race(a); await job(a.cookie);
   await introduce(a.cookie, 'casey_intro');
   await choose(a.cookie, 'casey_intro', 'casey_post_race', 'congratulate_casey');
   await choose(a.cookie, 'casey_intro', 'casey_post_race', 'crew_info');
   await choose(a.cookie, 'casey_intro', 'kyo_crew', 'crew_invite'); await choose(a.cookie, 'casey_intro', 'kyo_crew', 'crew_accept');
   await choose(a.cookie, 'casey_intro', 'kyo_crew', 'crew_leave');
   assert.equal((await load(a.cookie)).social.state.crews.kyo_regulars.membership, 'left');
   await command(a.cookie, { type: 'race_start', definitionId: 'midnight_run', attemptId: randomUUID(), vehicleId: a.car }, 409);
   await choose(a.cookie, 'casey_intro', 'kyo_crew', 'crew_rejoin_invite'); await choose(a.cookie, 'casey_intro', 'kyo_crew', 'crew_rejoin');
   assert.equal((await load(a.cookie)).social.state.crews.kyo_regulars.joins, 2);
   const member = await db.crewMembership.findUniqueOrThrow({ where: { playerId_crewId: { playerId: a.playerId, crewId: 'kyo_regulars' } } });
   assert.equal(member.leftAt, null); assert.ok(member.joinedAt);
   await choose(a.cookie, 'casey_intro', 'kyo_crew', 'crew_leave_again');
   assert.equal((await load(a.cookie)).social.state.crews.kyo_regulars.points, 0);
   await choose(a.cookie, 'casey_intro', 'kyo_crew', 'crew_accept'); // Old acceptance cannot restore membership.
   assert.equal((await load(a.cookie)).social.state.crews.kyo_regulars.membership, 'left');
  });
  await t.test('failure after reward creation rolls back wallet, progression and social ledger together', async () => {
   const a = await account(); const definition = HUB_JOBS.find(job => job.id === 'kyo_ice_run')!;
   const started = await command(a.cookie, { type: 'job_start', definitionId: definition.id });
   await command(a.cookie, { type: 'job_begin', runId: started.resourceId });
   for (const objective of definition.objectives.slice(0,-1)) await command(a.cookie, { type: 'job_objective', runId: started.resourceId, objectiveId: objective.id, elapsedMs: 0, cargoDamage: 0 });
   const before = await load(a.cookie);
   // Scoped failure injection exercises the real database transaction after the payout write.
   await db.$executeRawUnsafe(`CREATE FUNCTION progression_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."playerId" = '${a.playerId}'::uuid THEN RAISE EXCEPTION 'injected social failure'; END IF; RETURN NEW; END $$`);
   await db.$executeRawUnsafe('CREATE TRIGGER progression_test_failure BEFORE INSERT ON "SocialEvent" FOR EACH ROW EXECUTE FUNCTION progression_test_failure()');
   const action: PlayerAction = { type: 'job_objective', runId: started.resourceId, objectiveId: definition.objectives.at(-1)!.id, elapsedMs: 0, cargoDamage: 0 }, key = randomUUID();
   try {
    await command(a.cookie, action, 500, key);
    const after = await load(a.cookie); assert.deepEqual(after.economy, before.economy); assert.deepEqual(after.social, before.social); assert.deepEqual(after.progression, before.progression);
    assert.equal(await db.transaction.count({ where: { playerId: a.playerId, kind: 'JOB_REWARD' } }), 0);
   } finally {
    await db.$executeRawUnsafe('DROP TRIGGER progression_test_failure ON "SocialEvent"');
    await db.$executeRawUnsafe('DROP FUNCTION progression_test_failure()');
   }
   await command(a.cookie, action, 200, key);
   assert.equal(await db.transaction.count({ where: { playerId: a.playerId, kind: 'JOB_REWARD' } }), 1);
  });
 } finally { await app.close(); }
});
