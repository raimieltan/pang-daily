import { ConflictException } from '@nestjs/common';
import { CHAPTER_ONE, chapterBeatSatisfied, nextChapterBeat } from '@pang-daily/game-core/progression/chapter';
import type { Prisma } from '../generated/prisma/client';
type Tx = Prisma.TransactionClient;
/** Gameplay evidence, chapter markers and content unlock commit in the same transaction. */
export async function advanceChapter(tx: Tx, playerId: string, sourceReference: string, requestedBeat?: string) {
 const chapter = await tx.chapterProgress.findUniqueOrThrow({ where: { playerId_chapterId: { playerId, chapterId: CHAPTER_ONE.id } }, include: { markers: true } });
 const completed = chapter.markers.map(marker => marker.markerId);
 let current = nextChapterBeat(completed);
 if (requestedBeat && completed.includes(requestedBeat)) return;
 if (requestedBeat && current !== requestedBeat) throw new ConflictException({ code: 'CHAPTER_BEAT_ORDER', message: 'Continue the current chapter beat first.' });
 const [mechanic, rival, job, race] = await Promise.all([
  tx.npcRelationship.findUniqueOrThrow({ where: { playerId_npcId: { playerId, npcId: 'mang_boy' } } }),
  tx.npcRelationship.findUniqueOrThrow({ where: { playerId_npcId: { playerId, npcId: 'casey' } } }),
  tx.jobProgress.count({ where: { playerId, status: 'completed' } }),
  tx.raceResult.count({ where: { playerId, outcome: { in: ['win', 'loss'] } } }),
 ]);
 const facts = { metMechanic: mechanic.introduced, metRival: rival.introduced, completedJob: job > 0, finishedRace: race > 0 };
 if (requestedBeat && !chapterBeatSatisfied(requestedBeat, facts)) throw new ConflictException({ code: 'CHAPTER_REQUIREMENT', message: 'Complete the required gameplay action first.' });
 while (current && chapterBeatSatisfied(current, facts)) {
  await tx.chapterMarker.create({ data: { playerId, chapterId: CHAPTER_ONE.id, markerId: current, sourceReference } });
  completed.push(current); current = nextChapterBeat(completed);
 }
 await tx.chapterProgress.update({ where: { playerId_chapterId: { playerId, chapterId: CHAPTER_ONE.id } }, data: { currentBeatId: current, completedAt: current ? null : chapter.completedAt ?? new Date() } });
 if (!current) await tx.locationUnlock.upsert({ where: { playerId_unlockId: { playerId, unlockId: CHAPTER_ONE.completionUnlockId } }, create: { playerId, unlockId: CHAPTER_ONE.completionUnlockId, source: CHAPTER_ONE.id, sourceReference }, update: {} });
}
