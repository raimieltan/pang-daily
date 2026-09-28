import { describe, expect, it } from 'vitest';
import { CHAPTER_ONE, chapterBeatSatisfied, chapterBeatStates, nextChapterBeat, type ChapterFacts } from './chapter';
const empty: ChapterFacts = { metMechanic: false, completedJob: false, metRival: false, finishedRace: false };
describe('chapter sequence', () => {
 it('restores every durable prefix, independent of database row ordering, and rejects gaps', () => {
  for (let i = 0; i <= CHAPTER_ONE.beats.length; i++) {
   const saved = JSON.parse(JSON.stringify(CHAPTER_ONE.beats.slice(0, i))).reverse();
   expect(nextChapterBeat(saved)).toBe(CHAPTER_ONE.beats[i] ?? null);
  }
  for (const invalid of [['meet_casey'], ['ghost'], ['choose_origin','choose_origin']]) expect(() => nextChapterBeat(invalid)).toThrow();
 });
 it('requires the exact authored shared evidence for each milestone', () => {
  for (const id of CHAPTER_ONE.beats) expect(chapterBeatSatisfied(id, empty)).toBe(false);
  expect(chapterBeatSatisfied('meet_casey', { ...empty, metRival: true })).toBe(false);
  expect(chapterBeatSatisfied('meet_casey', { ...empty, metRival: true, metRegulars: true })).toBe(true);
  expect(chapterBeatSatisfied('repair_daily', { ...empty, setbackApplied: true })).toBe(false);
  expect(chapterBeatSatisfied('ghost', empty)).toBe(false);
 });
 it('projects active attempts, recoverable failures, locked successors and completion', () => {
  const opening = CHAPTER_ONE.beats.slice(0, 2);
  expect(chapterBeatStates(opening, { ...empty, activeJob: true })[2].status).toBe('active');
  expect(chapterBeatStates(opening, { ...empty, failedJob: true })[2].status).toBe('recoverable');
  expect(chapterBeatStates(opening, empty)[3].status).toBe('locked');
  expect(chapterBeatStates(CHAPTER_ONE.beats.slice(0, 6), empty)[6].status).toBe('recoverable');
  expect(chapterBeatStates(CHAPTER_ONE.beats, empty).every(beat => beat.status === 'completed')).toBe(true);
 });
});
