import { CHAPTER_ONE } from '@pang-daily/game-core/progression/chapter';
import type { PrismaClient } from '../../src/generated/prisma/client';
/** Isolate economy/social integrity tests from campaign gates. No gameplay rewards are fabricated. */
export async function freePlayFixture(db: PrismaClient, playerId: string) {
 await db.chapterMarker.createMany({ data: CHAPTER_ONE.beats.map(markerId => ({ playerId, chapterId: CHAPTER_ONE.id, markerId, sourceReference: 'test_free_play' })) });
 await db.chapterProgress.update({ where: { playerId_chapterId: { playerId, chapterId: CHAPTER_ONE.id } }, data: { currentBeatId: null, completedAt: new Date() } });
}
