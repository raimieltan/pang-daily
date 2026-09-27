import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../src/generated/prisma/client';
import { validateEnvironment } from '../src/config/environment';

const env = validateEnvironment(process.env);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });
after(() => db.$disconnect());
type Tx = Prisma.TransactionClient;
const rollback = new Error('fixture rollback');
async function fixture(tx: Tx) {
  const user = await tx.user.create({ data: { identityProvider: 'test', identitySubject: randomUUID() } });
  const player = await tx.playerProfile.create({ data: { userId: user.id, displayName: 'PAN-74 fixture',
    saveVersion: { create: { contentVersion: 'm3-content-1' } }, wallet: { create: {} }, inventory: { create: {} } } });
  const vehicle = await tx.vehicle.create({ data: { playerId: player.id, definitionId: 'banwa_dalagan_1996',
    acquisitionKey: 'starter', paint: '#884422', condition: { create: {
      engine: '.8', transmission: '.8', suspension: '.8', brakes: '.8', tires: '.8', body: '.8', electrical: '.8', clutch: '.8', cooling: '.8', fuelLiters: '45',
    } } } });
  const part = await tx.ownedPart.create({ data: { playerId: player.id, partDefinitionId: 'used_coilovers_01',
    acquisitionKey: 'grant:coilovers', origin: 'grant', sourceReference: 'test-fixture', condition: '.75' } });
  return { player, vehicle, part };
}
async function valid(work: (tx: Tx) => Promise<void>) {
  await assert.rejects(db.$transaction(async (tx) => { await work(tx); throw rollback; }, { timeout: 15000 }),
    (error: unknown) => error === rollback);
}
async function invalid(work: (tx: Tx) => Promise<void>, pattern: RegExp) {
  await assert.rejects(db.$transaction(work, { timeout: 15000 }), pattern);
}
async function credit(tx: Tx, playerId: string, amount = 500000n) {
  const receipt = await tx.transaction.create({ data: { playerId, sequence: 1n, amountCentavos: amount,
    balanceBeforeCentavos: 0n, balanceAfterCentavos: amount, kind: 'starting_cash', source: 'new_game',
    sourceReference: 'initialization', description: 'Initial grant', requestId: randomUUID() } });
  await tx.wallet.update({ where: { playerId }, data: { balanceCentavos: amount, revision: 1n } });
  return receipt;
}

test('PAN-74 representative state is relational, exact, owner-linked, and supports multi-slot parts', async () => {
  await valid(async (tx) => {
    const { player, vehicle, part } = await fixture(tx);
    const receipt = await credit(tx, player.id, 500001n);
    await tx.installedPart.create({ data: { ownedPartId: part.id, playerId: player.id, vehicleId: vehicle.id,
      slots: { create: ['shocks', 'springs'].map(slotId => ({ slotId })) } } });
    await tx.playerProfile.update({ where: { id: player.id }, data: { activeVehicleId: vehicle.id } });
    const job = await tx.jobProgress.create({ data: { playerId: player.id, runId: 'kyo_ice_run#1', jobDefinitionId: 'kyo_ice_run',
      status: 'completed', completedAt: new Date(), objectiveIndex: 2, elapsedMs: 45000n } });
    await tx.raceResult.create({ data: { playerId: player.id, vehicleId: vehicle.id, attemptId: 'race-attempt-1',
      raceDefinitionId: 'barangay_sprint', rivalNpcId: 'casey', rivalVehicleContentId: 'casey_daily',
      outcome: 'win', position: 1, elapsedMs: 30000n, completedAt: new Date() } });
    await tx.npcRelationship.create({ data: { playerId: player.id, npcId: 'casey', introduced: true,
      flags: { create: { flagId: 'trusted_friend' } }, milestones: { create: { eventContentId: 'met_casey_at_kyo' } },
      rival: { create: { rivalVehicleContentId: 'casey_daily', metAtHub: true } } } });
    await tx.npcRelationship.create({ data: { playerId: player.id, npcId: 'mang_boy',
      favors: { create: { favorId: 'mang_boy_parts_help', status: 'accepted', jobProgressId: job.id } } } });
    await tx.sceneReputation.create({ data: { playerId: player.id, sceneId: 'iloilo_scene', points: 30 } });
    await tx.reputationRewardSource.create({ data: { playerId: player.id, sourceKey: 'race:barangay_sprint', count: 1 } });
    await tx.playerCrewStanding.create({ data: { playerId: player.id, crewId: 'kyo_regulars', introduced: true, invitation: 'accepted',
      membership: { create: { status: 'member', joins: 1, joinedAt: new Date() } } } });
    await tx.locationUnlock.create({ data: { playerId: player.id, unlockId: 'talyer_favor', source: 'social', sourceReference: 'met_at_talyer' } });
    await tx.chapterProgress.create({ data: { playerId: player.id, chapterId: 'chapter_1', currentBeatId: 'meet_casey',
      markers: { create: { markerId: 'met_mang_boy', sourceReference: 'met_at_talyer' } } } });
    await tx.idempotencyRecord.create({ data: { playerId: player.id, scope: 'job.complete', key: 'request-1',
      requestHash: 'a'.repeat(64), requestId: randomUUID(), status: 'succeeded', completedAt: new Date(), responseStatus: 200,
      resourceId: job.id, response: { runId: job.runId } } });
    await tx.socialEvent.create({ data: { playerId: player.id, eventId: 'event-1', sourceId: 'dialogue-1', sourceKey: 'dialogue:casey:intro',
      fingerprint: 'canonical-input-hash', type: 'dialogue', targetContentId: 'casey', contextContentId: 'intro', reason: 'Introduction',
      effects: { create: { npcId: 'casey', trustDelta: 1, respectDelta: 0, flagsAdded: [], flagsRemoved: [] } } } });
    assert.equal((await tx.wallet.findUniqueOrThrow({ where: { playerId: player.id } })).balanceCentavos, 500001n);
    assert.equal((await tx.transaction.findUniqueOrThrow({ where: { id: receipt.id } })).sourceReference, 'initialization');
    assert.equal((await tx.playerSaveVersion.findUniqueOrThrow({ where: { playerId: player.id } })).schemaVersion, 2);
    assert.equal(await tx.installedPartSlot.count({ where: { vehicleId: vehicle.id } }), 2);
    // Force deferred checks inside the rollback fixture so a broken ledger cannot hide behind rollback.
    await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE');
  });
});

test('cross-player part installation is rejected by composite ownership FKs', async () => {
  await invalid(async (tx) => {
    const a = await fixture(tx), b = await fixture(tx);
    await tx.installedPart.create({ data: { playerId: a.player.id, vehicleId: a.vehicle.id, ownedPartId: b.part.id } });
  }, /foreign key/i);
});
test('missing owned part cannot be installed', async () => {
  await invalid(async (tx) => {
    const a = await fixture(tx);
    await tx.installedPart.create({ data: { playerId: a.player.id, vehicleId: a.vehicle.id, ownedPartId: randomUUID() } });
  }, /foreign key/i);
});
test('active vehicle must belong to the selecting player', async () => {
  await invalid(async (tx) => {
    const a = await fixture(tx), b = await fixture(tx);
    await tx.playerProfile.update({ where: { id: a.player.id }, data: { activeVehicleId: b.vehicle.id } });
  }, /foreign key/i);
});
test('one physical part cannot occupy two cars', async () => {
  await invalid(async (tx) => {
    const a = await fixture(tx);
    await tx.installedPart.create({ data: { playerId: a.player.id, vehicleId: a.vehicle.id, ownedPartId: a.part.id } });
    await tx.installedPart.create({ data: { playerId: a.player.id, vehicleId: a.vehicle.id, ownedPartId: a.part.id } });
  }, /unique constraint/i);
});
test('one vehicle slot cannot contain two parts', async () => {
  await invalid(async (tx) => {
    const a = await fixture(tx);
    await tx.installedPart.create({ data: { playerId: a.player.id, vehicleId: a.vehicle.id, ownedPartId: a.part.id } });
    await tx.installedPartSlot.create({ data: { playerId: a.player.id, vehicleId: a.vehicle.id, ownedPartId: a.part.id, slotId: 'shocks' } });
    await tx.installedPartSlot.create({ data: { playerId: a.player.id, vehicleId: a.vehicle.id, ownedPartId: a.part.id, slotId: 'shocks' } });
  }, /unique constraint/i);
});
test('receipt ownership cannot be borrowed from another player', async () => {
  await invalid(async (tx) => {
    const a = await fixture(tx), b = await fixture(tx);
    const receipt = await credit(tx, b.player.id);
    await tx.ownedPart.create({ data: { playerId: a.player.id, partDefinitionId: 'stock_shocks_set', acquisitionKey: 'purchase',
      origin: 'parts_shop', sourceReference: 'shop:1', paidCentavos: 100n, transactionId: receipt.id } });
  }, /foreign key/i);
});

for (const subject of ['npc', 'crew', 'job', 'race', 'command', 'acquisition']) {
  test(`duplicate ${subject} logical subject is rejected`, async () => {
    await invalid(async (tx) => {
      const a = await fixture(tx);
      const create = () => {
        switch (subject) {
          case 'npc': return tx.npcRelationship.create({ data: { playerId: a.player.id, npcId: 'casey' } });
          case 'crew': return tx.playerCrewStanding.create({ data: { playerId: a.player.id, crewId: 'kyo_regulars' } });
          case 'job': return tx.jobProgress.create({ data: { playerId: a.player.id, runId: 'run-1', jobDefinitionId: 'kyo_ice_run', status: 'failed', completedAt: new Date() } });
          case 'race': return tx.raceResult.create({ data: { playerId: a.player.id, vehicleId: a.vehicle.id, attemptId: 'attempt-1', raceDefinitionId: 'barangay_sprint' } });
          case 'command': return tx.idempotencyRecord.create({ data: { playerId: a.player.id, scope: 'purchase', key: 'key-1', requestHash: 'b'.repeat(64), requestId: 'request-1' } });
          default: return tx.ownedPart.create({ data: { playerId: a.player.id, partDefinitionId: 'stock_shocks_set', acquisitionKey: 'another-grant', origin: 'grant', sourceReference: 'test' } });
        }
      };
      await create(); await create();
    }, /unique constraint/i);
  });
}
test('one active job per player', async () => {
  await invalid(async (tx) => {
    const a = await fixture(tx);
    for (const runId of ['run-a', 'run-b']) await tx.jobProgress.create({ data: { playerId: a.player.id, runId, jobDefinitionId: 'kyo_ice_run' } });
  }, /unique constraint/i);
});
test('one active crew per player', async () => {
  await invalid(async (tx) => {
    const a = await fixture(tx);
    for (const crewId of ['kyo_regulars', 'future_crew']) await tx.playerCrewStanding.create({ data: { playerId: a.player.id, crewId,
      membership: { create: { status: 'member', joins: 1, joinedAt: new Date() } } } });
  }, /unique constraint/i);
});
test('progression history prevents deleting its player', async () => {
  await invalid(async (tx) => { const a = await fixture(tx); await tx.playerProfile.delete({ where: { id: a.player.id } }); }, /foreign key/i);
});
test('condition and trust are bounded', async () => {
  await invalid(async (tx) => {
    const a = await fixture(tx);
    await tx.vehicleCondition.update({ where: { vehicleId: a.vehicle.id }, data: { engine: '1.1' } });
  }, /constraint/i);
  await invalid(async (tx) => { const a = await fixture(tx); await tx.npcRelationship.create({ data: { playerId: a.player.id, npcId: 'casey', trust: 101 } }); }, /constraint/i);
});
test('ledger cannot drift, skip sequence, or be rewritten', async () => {
  await invalid(async (tx) => { const a = await fixture(tx); await tx.wallet.update({ where: { playerId: a.player.id }, data: { balanceCentavos: 1n } }); }, /Wallet must match/i);
  await invalid(async (tx) => {
    const a = await fixture(tx);
    await tx.transaction.create({ data: { playerId: a.player.id, sequence: 2n, amountCentavos: 1n, balanceBeforeCentavos: 0n,
      balanceAfterCentavos: 1n, kind: 'test', source: 'test', sourceReference: 'test', description: 'test', requestId: 'test' } });
  }, /sequence or opening balance mismatch/i);
  await invalid(async (tx) => { const a = await fixture(tx); const receipt = await credit(tx, a.player.id); await tx.transaction.delete({ where: { id: receipt.id } }); }, /append-only/i);
});
test('SQL-only indexes and version migration exist', async () => {
  assert.equal((await db.schemaVersion.findUniqueOrThrow({ where: { id: 1 } })).version, 4);
  const indexes = await db.$queryRaw<{ indexname: string }[]>`SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname IN ('JobProgress_one_active_per_player', 'CrewMembership_one_active_per_player')`;
  assert.equal(indexes.length, 2);
});

test('a repeated ledger source cannot be rewarded a second time', async () => {
  await invalid(async (tx) => {
    const a = await fixture(tx);
    await credit(tx, a.player.id);
    await tx.transaction.create({ data: { playerId: a.player.id, sequence: 2n, amountCentavos: 1n,
      balanceBeforeCentavos: 500000n, balanceAfterCentavos: 500001n, kind: 'starting_cash', source: 'new_game',
      sourceReference: 'initialization', description: 'Duplicate grant', requestId: randomUUID() } });
  }, /unique constraint/i);
});
test('retired acquisition keys remain protected against receipt replay', async () => {
  await invalid(async (tx) => {
    const a = await fixture(tx);
    await tx.ownedPart.update({ where: { id: a.part.id }, data: { retiredAt: new Date() } });
    await tx.ownedPart.create({ data: { playerId: a.player.id, partDefinitionId: 'used_coilovers_01', acquisitionKey: a.part.acquisitionKey,
      origin: 'grant', sourceReference: 'test-fixture' } });
  }, /unique constraint/i);
});
test('a receipt without the matching wallet update fails at commit', async () => {
  await invalid(async (tx) => {
    const a = await fixture(tx);
    await tx.transaction.create({ data: { playerId: a.player.id, sequence: 1n, amountCentavos: 1n,
      balanceBeforeCentavos: 0n, balanceAfterCentavos: 1n, kind: 'test', source: 'test', sourceReference: 'one',
      description: 'Unsettled', requestId: randomUUID() } });
  }, /Wallet must match/i);
});
