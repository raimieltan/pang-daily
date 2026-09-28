import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { BOOTSTRAP_VERSION, type PlayerBootstrap } from '@pang-daily/contracts';
import { chapterBeatStates, CHAPTER_ONE } from '@pang-daily/game-core/progression/chapter';
import { resolvePlayer } from './player-context';
import { loadSocialState } from './social-state';
import { DatabaseService } from './database.service';
import type { StarterState } from '../player/starter-state';

function incomplete(): never {
  throw new ConflictException({ code: 'PLAYER_STATE_INCOMPLETE', message: 'Your saved profile is incomplete. Progress has not been reset.', recovery: 'contact_support' });
}
@Injectable()
export class PlayerRepository {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}
  async bootstrap(userId: string, starter: StarterState, requestId: string): Promise<PlayerBootstrap> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.db.client.$transaction(async (tx) => {
          // Every initializer for this identity takes the same lock. Serialization failures are retried.
          await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
          const user = await tx.user.findUnique({ where: { id: userId }, include: { player: true } });
          if (!user || user.deactivatedAt) throw new UnauthorizedException({ code: 'AUTH_REQUIRED', message: 'Sign in to continue.' });
          if (!user.player) {
            const playerId = randomUUID(), vehicleId = randomUUID();
            await tx.playerProfile.create({ data: { id: playerId, userId, displayName: starter.displayName,
              saveVersion: { create: { schemaVersion: starter.saveVersion, contentVersion: starter.contentVersion } },
              wallet: { create: {} }, inventory: { create: {} },
              npcs: { create: starter.npcIds.map(npcId => ({ npcId, ...(npcId === starter.rival.npcId ? { rival: { create: { rivalVehicleContentId: starter.rival.vehicleContentId } } } : {}) })) },
              reputation: { create: starter.sceneIds.map(sceneId => ({ sceneId })) },
              crews: { create: starter.crewIds.map(crewId => ({ crewId, membership: { create: {} } })) },
              unlocks: { create: { unlockId: 'hub_access', locationContentId: starter.hubId, source: 'new_game', sourceReference: 'initialization' } },
              chapters: { create: { chapterId: starter.chapterId, currentBeatId: 'choose_origin' } },
              vehicles: { create: { id: vehicleId, definitionId: starter.vehicle.definitionId, acquisitionKey: 'starter_vehicle',
                paint: starter.vehicle.paint, rideHeightM: starter.vehicle.rideHeightM,
                condition: { create: { ...starter.vehicle.condition, fuelLiters: starter.vehicle.fuelLiters } } } },
            } });
            await tx.playerProfile.update({ where: { id: playerId }, data: { activeVehicleId: vehicleId } });
            await tx.transaction.create({ data: { playerId, sequence: 1n, amountCentavos: starter.startingCentavos,
              balanceBeforeCentavos: 0n, balanceAfterCentavos: starter.startingCentavos, kind: 'starting_cash',
              source: 'new_game', sourceReference: 'initialization', description: 'Starting cash', requestId } });
            await tx.wallet.update({ where: { playerId }, data: { balanceCentavos: starter.startingCentavos, revision: 1n } });
          }
          // The same actor-linked resolver is used by reads and commands.
          const actor = await resolvePlayer(tx, userId);
          // Repeatable snapshot covers every include/query in this transaction.
          const player = await tx.playerProfile.findUnique({ where: { id: actor.id }, include: {
            saveVersion: true, wallet: true, vehicles: { where: { retiredAt: null }, include: { condition: true, installations: { include: { slots: true } } } },
            inventory: { include: { parts: { include: { transaction: { select: { sequence: true } } } } } },
            npcs: { include: { flags: true, milestones: true, favors: { include: { job: true } }, rival: true } },
            reputation: true, reputationSources: true, crews: { include: { membership: true } },
            jobs: { orderBy: [{ acceptedAt: 'asc' }, { id: 'asc' }] },
            races: { orderBy: [{ startedAt: 'desc' }, { id: 'desc' }], take: 20 },
            unlocks: true, chapters: { include: { markers: true } },
          } });
          if (!player || player.archivedAt || !player.wallet || !player.saveVersion || !player.inventory || !player.activeVehicleId ||
            !player.vehicles.some(vehicle => vehicle.id === player.activeVehicleId) || player.vehicles.some(vehicle => !vehicle.condition) ||
            !player.npcs.some(npc => npc.npcId === starter.rival.npcId && npc.rival) ||
            !starter.sceneIds.every(id => player.reputation.some(scene => scene.sceneId === id)) ||
            !starter.crewIds.every(id => player.crews.some(crew => crew.crewId === id && crew.membership)) ||
            !player.unlocks.some(unlock => unlock.unlockId === 'hub_access') || !player.chapters.some(chapter => chapter.chapterId === starter.chapterId)) incomplete();
          if (player.saveVersion.schemaVersion !== starter.saveVersion || player.saveVersion.contentVersion !== starter.contentVersion) {
            throw new ConflictException({ code: 'SAVE_VERSION_INCOMPATIBLE', message: 'This save needs a compatible game version or migration.', recovery: 'update_or_migrate' });
          }
          const counts = await tx.raceResult.groupBy({ by: ['rivalNpcId', 'outcome'], where: { playerId: player.id }, _count: { _all: true } });
          const latestRivalRaces = await tx.raceResult.findMany({ where: { playerId: player.id, rivalNpcId: { not: null }, outcome: { not: 'started' } },
            distinct: ['rivalNpcId'], orderBy: [{ startedAt: 'desc' }, { id: 'desc' }] });
          const best = await tx.raceResult.groupBy({ by: ['raceDefinitionId'], where: { playerId: player.id, outcome: { in: ['win', 'loss'] } }, _min: { elapsedMs: true }, _count: { _all: true } });
          const wins = await tx.raceResult.groupBy({ by: ['raceDefinitionId'], where: { playerId: player.id, outcome: 'win' }, _count: { _all: true } });
          const social = await loadSocialState(tx, player.id);
          return { bootstrapVersion: BOOTSTRAP_VERSION, saveVersion: starter.saveVersion, contentVersion: starter.contentVersion,
            revision: player.saveVersion.revision.toString(), profile: { id: player.id, displayName: player.displayName, activeVehicleId: player.activeVehicleId },
            economy: { balanceCentavos: player.wallet.balanceCentavos.toString(), revision: player.wallet.revision.toString() },
            vehicles: player.vehicles.map(vehicle => ({ id: vehicle.id, definitionId: vehicle.definitionId, condition: Object.fromEntries(
              Object.keys(starter.vehicle.condition).map(key => [key, Number(vehicle.condition![key as keyof typeof starter.vehicle.condition])])) as PlayerBootstrap['vehicles'][number]['condition'],
              conditionRevision: vehicle.condition!.revision.toString(), fuelLiters: Number(vehicle.condition!.fuelLiters), paint: vehicle.paint,
              rideHeightM: Number(vehicle.rideHeightM), stockSpoilerRemoved: vehicle.stockSpoilerRemoved })),
            inventory: { revision: player.inventory.revision.toString(), parts: player.inventory.parts.map(part => ({ id: part.id, definitionId: part.partDefinitionId,
              acquisitionKey: part.acquisitionKey, condition: part.condition === null ? null : Number(part.condition), revealedBy: part.revealedBy, finish: part.finish,
              origin: part.origin, sourceReference: part.sourceReference, sellerId: part.sellerId, paidCentavos: part.paidCentavos?.toString() ?? null, purchaseSequence: part.transaction?.sequence.toString() ?? null,
              advertisedGrade: part.advertisedGrade, acquiredAt: part.acquiredAt.toISOString(), retired: part.retiredAt !== null })),
              installed: player.vehicles.flatMap(vehicle => vehicle.installations.map(installation => ({ ownedPartId: installation.ownedPartId, vehicleId: vehicle.id, slots: installation.slots.map(slot => slot.slotId) }))) },
            social: { state: social, rivals: player.npcs.flatMap(npc => npc.rival ? [{ npcId: npc.npcId,
              vehicleContentId: npc.rival.rivalVehicleContentId, metAtHub: npc.rival.metAtHub,
              wins: counts.find(row => row.rivalNpcId === npc.npcId && row.outcome === 'win')?._count._all ?? 0,
              losses: counts.find(row => row.rivalNpcId === npc.npcId && row.outcome === 'loss')?._count._all ?? 0,
              dnfs: counts.find(row => row.rivalNpcId === npc.npcId && row.outcome === 'dnf')?._count._all ?? 0,
              latestOutcome: (latestRivalRaces.find(race => race.rivalNpcId === npc.npcId)?.outcome as 'win' | 'loss' | 'dnf' | undefined) ?? null }] : []) },
            progression: { jobs: player.jobs.map(job => ({ runId: job.runId, definitionId: job.jobDefinitionId, status: job.status,
              objectiveIndex: job.objectiveIndex, elapsedMs: job.elapsedMs.toString(), cargoLoaded: job.cargoLoaded, cargoDamage: Number(job.cargoDamage), reason: job.reason })),
              recentRaces: player.races.map(race => ({ attemptId: race.attemptId, definitionId: race.raceDefinitionId, vehicleId: race.vehicleId,
                rivalNpcId: race.rivalNpcId, outcome: race.outcome, position: race.position, elapsedMs: race.elapsedMs?.toString() ?? null,
                completedAt: race.completedAt?.toISOString() ?? null, payoutTransactionId: race.payoutTransactionId, lastCheckpointElapsedMs: race.lastCheckpointElapsedMs.toString() })),
              bestRaces: best.map(row => ({ definitionId: row.raceDefinitionId, bestElapsedMs: row._min.elapsedMs!.toString(), finishes: row._count._all, wins: wins.find(win => win.raceDefinitionId === row.raceDefinitionId)?._count._all ?? 0 })),
              unlockedLocations: player.unlocks.map(unlock => ({ unlockId: unlock.unlockId, locationId: unlock.locationContentId })),
              chapters: player.chapters.map(chapter => ({ id: chapter.chapterId, currentBeatId: chapter.currentBeatId,
                completedAt: chapter.completedAt?.toISOString() ?? null, markers: chapter.markers.map(marker => marker.markerId),
              ...(chapter.chapterId === CHAPTER_ONE.id ? { beats: chapterBeatStates(chapter.markers.map(marker => marker.markerId), { metMechanic: false, completedJob: false, metRival: false, finishedRace: false, activeJob: player.jobs.some(j => j.jobDefinitionId === CHAPTER_ONE.firstJobId && (j.status === 'accepted' || j.status === 'active')), failedJob: player.jobs.some(j => j.jobDefinitionId === CHAPTER_ONE.firstJobId && (j.status === 'failed' || j.status === 'abandoned')), activeRace: player.races.some(r => r.raceDefinitionId === CHAPTER_ONE.firstRaceId && r.outcome === 'started'), failedRace: player.races.some(r => r.raceDefinitionId === CHAPTER_ONE.firstRaceId && r.outcome === 'dnf') }) } : {}) })) } };
        }, { isolationLevel: 'Serializable', timeout: 15000 });
      } catch (error) {
        if (attempt < 2 && error && typeof error === 'object' && 'code' in error && ['P2034', 'P2002'].includes(String(error.code))) continue;
        throw error;
      }
    }
    throw new Error('Unreachable bootstrap retry');
  }
}
