import { SOCIAL_CONTENT } from '@pang-daily/game-core/social/catalog';
import { createSocialState, SocialSession } from '@pang-daily/game-core/social/SocialSession';
import { getReputationProgress } from '@pang-daily/game-core/social/reputation';
import type { SocialState } from '@pang-daily/game-core/social/contract';
import type { Prisma } from '../generated/prisma/client';
type Tx = Prisma.TransactionClient;
export async function loadSocialState(tx: Tx, playerId: string): Promise<SocialState> {
 const player = await tx.playerProfile.findUniqueOrThrow({ where: { id: playerId }, include: {
  npcs: { include: { flags: true, milestones: true, favors: { include: { job: true } } } },
  reputation: true, reputationSources: true, crews: { include: { membership: true } }, unlocks: true,
  socialEvents: { orderBy: { sequence: 'asc' }, include: { effects: true } },
 } });
 const social = createSocialState(SOCIAL_CONTENT);
 for (const npc of player.npcs) {
   social.npcs[npc.npcId] = { introduced: npc.introduced, trust: npc.trust, respect: npc.respect,
     relationshipFlags: npc.flags.map(flag => flag.flagId), favorIds: npc.favors.filter(favor => ['offered', 'accepted'].includes(favor.status)).map(favor => favor.favorId), eventIds: npc.milestones.map(event => event.eventContentId) };
   for (const favor of npc.favors) social.favors[favor.favorId] = { favorId: favor.favorId, npcId: npc.npcId, status: favor.status, runId: favor.job?.runId ?? null };
 }
 for (const scene of player.reputation) social.reputation[scene.sceneId] = { sceneId: scene.sceneId, points: scene.points };
 for (const reward of player.reputationSources) social.reputationRewards[reward.sourceKey] = { sourceKey: reward.sourceKey, count: reward.count };
 for (const crew of player.crews) social.crews[crew.crewId] = { crewId: crew.crewId, points: crew.points, introduced: crew.introduced,
   invitation: crew.invitation, membership: crew.membership!.status, joins: crew.membership!.joins };
 for (const unlock of player.unlocks) if (SOCIAL_CONTENT.unlocks.some(item => item.id === unlock.unlockId)) social.unlocks[unlock.unlockId] = { unlockId: unlock.unlockId, unlocked: true };
 const scenePoints = new Map<string, number>();
 social.appliedEvents = player.socialEvents.map(event => {
   const before = scenePoints.get(event.sceneId ?? '') ?? 0;
   const after = before + (event.reputationDelta ?? 0);
   if (event.sceneId) scenePoints.set(event.sceneId, after);
   return { eventId: event.eventId, sourceId: event.sourceId, sourceKey: event.sourceKey, fingerprint: event.fingerprint,
     type: event.type, targetId: event.targetContentId, contextId: event.contextContentId, reason: event.reason,
     effects: event.effects.map(effect => ({ npcId: effect.npcId, trustDelta: effect.trustDelta, respectDelta: effect.respectDelta, flagsAdded: effect.flagsAdded, flagsRemoved: effect.flagsRemoved })),
     ...(event.sceneId && event.reputationSourceKey && event.reputationDelta !== null ? { reputation: { sceneId: event.sceneId,
       sourceKey: event.reputationSourceKey, pointsDelta: event.reputationDelta, fromTier: getReputationProgress(before).tier, toTier: getReputationProgress(after).tier } } : {}) };
 });
 return social;
}

/** Only domain-produced snapshots enter this mapper, inside the gameplay command transaction. */
export async function saveSocialState(tx: Tx, playerId: string, before: SocialState, session: SocialSession) {
 session.discoverOpportunities();
 const next = session.snapshot();
 for (const [npcId, npc] of Object.entries(next.npcs)) {
  if (JSON.stringify(before.npcs[npcId]) === JSON.stringify(npc)) continue;
  await tx.npcRelationship.update({ where: { playerId_npcId: { playerId, npcId } }, data: { introduced: npc.introduced, trust: npc.trust, respect: npc.respect } });
  await tx.npcRelationshipFlag.deleteMany({ where: { playerId, npcId, flagId: { notIn: npc.relationshipFlags } } });
  for (const flagId of npc.relationshipFlags) await tx.npcRelationshipFlag.upsert({ where: { playerId_npcId_flagId: { playerId, npcId, flagId } }, create: { playerId, npcId, flagId }, update: {} });
  for (const eventContentId of npc.eventIds) await tx.npcMilestone.upsert({ where: { playerId_npcId_eventContentId: { playerId, npcId, eventContentId } }, create: { playerId, npcId, eventContentId }, update: {} });
  if (npcId === 'casey') await tx.rivalState.update({ where: { playerId_npcId: { playerId, npcId } }, data: { metAtHub: npc.introduced } });
 }
 for (const favor of Object.values(next.favors)) {
  if (JSON.stringify(before.favors[favor.favorId]) === JSON.stringify(favor)) continue;
  const job = favor.runId ? await tx.jobProgress.findUniqueOrThrow({ where: { playerId_runId: { playerId, runId: favor.runId } } }) : null;
  const data = { npcId: favor.npcId, status: favor.status, jobProgressId: job?.id ?? null };
  await tx.favorProgress.upsert({ where: { playerId_favorId: { playerId, favorId: favor.favorId } }, create: { playerId, favorId: favor.favorId, ...data }, update: data });
 }
 for (const row of Object.values(next.reputation)) await tx.sceneReputation.upsert({ where: { playerId_sceneId: { playerId, sceneId: row.sceneId } }, create: { playerId, ...row }, update: { points: row.points } });
 for (const row of Object.values(next.reputationRewards)) await tx.reputationRewardSource.upsert({ where: { playerId_sourceKey: { playerId, sourceKey: row.sourceKey } }, create: { playerId, ...row }, update: { count: row.count } });
 for (const crew of Object.values(next.crews)) {
  if (JSON.stringify(before.crews[crew.crewId]) === JSON.stringify(crew)) continue;
  const { crewId, points, introduced, invitation, membership, joins } = crew;
  await tx.playerCrewStanding.upsert({ where: { playerId_crewId: { playerId, crewId } }, create: { playerId, crewId, points, introduced, invitation }, update: { points, introduced, invitation } });
  await tx.crewMembership.update({ where: { playerId_crewId: { playerId, crewId } }, data: { status: membership, joins, ...(membership === 'member' ? { joinedAt: new Date(), leftAt: null } : membership === 'left' ? { leftAt: new Date() } : {}) } });
 }
 for (const unlock of Object.values(next.unlocks)) if (unlock.unlocked && !before.unlocks[unlock.unlockId]?.unlocked) {
  await tx.locationUnlock.upsert({ where: { playerId_unlockId: { playerId, unlockId: unlock.unlockId } }, create: { playerId, unlockId: unlock.unlockId, source: 'social_rules', sourceReference: next.appliedEvents.at(-1)?.sourceId ?? 'threshold' }, update: {} });
 }
 const seen = new Set(before.appliedEvents.map(event => event.eventId));
 for (const event of next.appliedEvents) if (!seen.has(event.eventId)) await tx.socialEvent.create({ data: {
  playerId, sequence: next.appliedEvents.indexOf(event) + 1, eventId: event.eventId, sourceId: event.sourceId, sourceKey: event.sourceKey, fingerprint: event.fingerprint,
  type: event.type, targetContentId: event.targetId, contextContentId: event.contextId, reason: event.reason,
  sceneId: event.reputation?.sceneId, reputationSourceKey: event.reputation?.sourceKey, reputationDelta: event.reputation?.pointsDelta,
  effects: { create: event.effects.map(effect => ({ ...effect })) },
 } });
 return next;
}
