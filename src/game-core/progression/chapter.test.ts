import { describe, expect, it } from 'vitest';
import { CHAPTER_ONE, chapterBeatSatisfied, nextChapterBeat } from './chapter';
describe('chapter sequence', () => {
 it('continues every durable prefix and rejects gaps or unknown IDs', () => {
  for (let i = 0; i <= CHAPTER_ONE.beats.length; i++) expect(nextChapterBeat(CHAPTER_ONE.beats.slice(0,i))).toBe(CHAPTER_ONE.beats[i] ?? null);
  expect(() => nextChapterBeat(['meet_casey'])).toThrow('sequence');
  expect(() => nextChapterBeat(['ghost'])).toThrow('Unknown');
  expect(() => nextChapterBeat(['meet_mang_boy', 'meet_mang_boy'])).toThrow('sequence');
 });
 it('requires the matching gameplay evidence', () => {
  const facts = { metMechanic: true, completedJob: false, metRival: false, finishedRace: false };
  expect(chapterBeatSatisfied('meet_mang_boy', facts)).toBe(true);
  for (const id of ['complete_first_job','meet_casey','finish_first_race','ghost']) expect(chapterBeatSatisfied(id, facts)).toBe(false);
 });
});
