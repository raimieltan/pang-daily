import { rejectCommand } from '../integrity/errors';
import { CHAPTER_ONE, chapterBeatSatisfied, nextChapterBeat } from '@pang-daily/game-core/progression/chapter';
import { SOCIAL_CONTENT } from '@pang-daily/game-core/social/catalog';
import { SocialSession } from '@pang-daily/game-core/social/SocialSession';
import { loadSocialState, saveSocialState } from './social-state';
import type { Prisma } from '../generated/prisma/client';
type Tx = Prisma.TransactionClient;

async function milestone(tx: Tx, playerId: string, milestoneId: 'brake_setback' | 'daily_recovered' | 'saved_parking') {
 const before = await loadSocialState(tx, playerId), session = new SocialSession(SOCIAL_CONTENT, before);
 session.applyEvent({ type: 'milestone', npcId: milestoneId === 'brake_setback' ? 'mang_boy' : 'kyo_barista', milestoneId, sourceId: `chapter_1:${milestoneId}`, eventId: `chapter_1:${milestoneId}` });
 await saveSocialState(tx, playerId, before, session);
}
/** All evidence, one-time condition changes, social effects and unlocks commit atomically. */
export async function advanceChapter(tx: Tx, playerId: string, sourceReference: string, requestedBeat?: string) {
 const chapter = await tx.chapterProgress.findUniqueOrThrow({ where: { playerId_chapterId: { playerId, chapterId: CHAPTER_ONE.id } }, include: { markers: true } });
 const completed = chapter.markers.map(marker => marker.markerId);
 let current = nextChapterBeat(completed);
 if (requestedBeat && completed.includes(requestedBeat)) return;
 if (requestedBeat && current !== requestedBeat) rejectCommand('CHAPTER_BEAT_ORDER', 'Continue the current chapter beat first.');
 const [social, job, race, car] = await Promise.all([
  loadSocialState(tx, playerId),
  tx.jobProgress.count({ where: { playerId, status: 'completed', jobDefinitionId: CHAPTER_ONE.firstJobId } }),
  tx.raceResult.count({ where: { playerId, raceDefinitionId: CHAPTER_ONE.firstRaceId, outcome: { in: ['win', 'loss'] } } }),
  tx.vehicle.findFirstOrThrow({ where: { playerId, acquisitionKey: 'starter_vehicle' }, include: { condition: true } }),
 ]);
 const setback = chapter.markers.find(marker => marker.markerId === 'brake_setback');
 // Wallet sequence is commit-ordered by the player lock; database NOW() is transaction-start time.
 // A repair that waited behind a race transaction can have an earlier timestamp.
 let setbackSequence: bigint | null = null;
 if (setback) {
  try { const source = JSON.parse(setback.sourceReference) as { walletSequence?: string }; if (source.walletSequence && /^\d+$/.test(source.walletSequence)) setbackSequence = BigInt(source.walletSequence); } catch { /* Older marker sources use their timestamp. */ }
 }
 const repair = setback ? await tx.transaction.findFirst({ where: { playerId, vehicleId: car.id, kind: 'REPAIR_COST', ...(setbackSequence === null ? { createdAt: { gte: setback.completedAt } } : { sequence: { gt: setbackSequence } }), components: { some: { componentId: 'brakes' } } } }) : null;
 const facts = { originChosen: completed.includes('choose_origin'), metMechanic: social.npcs.mang_boy.introduced,
  completedJob: job > 0, metRival: social.npcs.casey.introduced, metRegulars: social.unlocks.met_kyo_regulars?.unlocked === true,
  finishedRace: race > 0, setbackApplied: !!setback, repairedAfterSetback: !!repair && Number(car.condition?.brakes) >= .95,
  recognized: social.unlocks.chapter_1_recognition?.unlocked === true };
 if (requestedBeat && current !== 'brake_setback' && !chapterBeatSatisfied(requestedBeat, facts)) rejectCommand('CHAPTER_REQUIREMENT', 'Complete the required gameplay action first.');
 while (current) {
  if (current === 'brake_setback') {
   // The prior race marker is required. Even an early repair cannot cancel this durable failure.
   if (!completed.includes('finish_first_race')) break;
   await tx.vehicleCondition.update({ where: { vehicleId: car.id }, data: { brakes: Math.min(Number(car.condition!.brakes), CHAPTER_ONE.setbackBrakes), revision: { increment: 1 } } });
   facts.setbackApplied = true;
  }
  if (!chapterBeatSatisfied(current, facts)) break;
  const markerSource = current === 'brake_setback'
   ? JSON.stringify({ cause: sourceReference, walletSequence: (await tx.wallet.findUniqueOrThrow({ where: { playerId } })).revision.toString() })
   : sourceReference;
  await tx.chapterMarker.create({ data: { playerId, chapterId: CHAPTER_ONE.id, markerId: current, sourceReference: markerSource } });
  if (current === 'brake_setback') await milestone(tx, playerId, 'brake_setback');
  if (current === 'repair_daily') await milestone(tx, playerId, 'daily_recovered');
  if (current === 'kyo_recognition') await milestone(tx, playerId, 'saved_parking');
  completed.push(current); current = nextChapterBeat(completed);
 }
 await tx.chapterProgress.update({ where: { playerId_chapterId: { playerId, chapterId: CHAPTER_ONE.id } }, data: { currentBeatId: current, completedAt: current ? null : chapter.completedAt ?? new Date() } });
 if (!current) await tx.locationUnlock.upsert({ where: { playerId_unlockId: { playerId, unlockId: CHAPTER_ONE.completionUnlockId } }, create: { playerId, unlockId: CHAPTER_ONE.completionUnlockId, source: CHAPTER_ONE.id, sourceReference }, update: {} });
}
