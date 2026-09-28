import { describe, expect, it } from 'vitest';
import { chapterDirection } from './ChapterGuide';
describe('Chapter 1 world guidance', () => {
 it('projects authored destinations without changing chapter state', () => {
  expect(chapterDirection('meet_mang_boy', -78, 151, false)).toMatchObject({ destination: 'Tito Jun’s talyer', compass: 'E' });
  expect(chapterDirection('meet_casey', 131, 97, false)?.destination).toBe('KYO Coffee counter');
  expect(chapterDirection('meet_casey', 131, 97, true)?.destination).toBe('Casey outside KYO');
  expect(chapterDirection('finish_first_race', -65, 137.5, true)?.meters).toBe(0);
  expect(chapterDirection('repair_daily', -78, 151, true)?.destination).toBe('Tito Jun’s talyer');
  expect(chapterDirection(null, 0, 0, false)).toBeNull();
 });
});
