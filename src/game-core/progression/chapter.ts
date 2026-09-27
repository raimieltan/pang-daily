/** Chapter 1's initial gameplay milestones. IDs and sequencing are independent of routes/UI. */
export const CHAPTER_ONE = {
 id: 'chapter_1',
 beats: ['meet_mang_boy', 'complete_first_job', 'meet_casey', 'finish_first_race'],
 completionUnlockId: 'chapter_2_access',
} as const;
export type ChapterFacts = { metMechanic: boolean; completedJob: boolean; metRival: boolean; finishedRace: boolean };
export function chapterBeatSatisfied(beatId: string, facts: ChapterFacts): boolean {
 switch (beatId) {
  case 'meet_mang_boy': return facts.metMechanic;
  case 'complete_first_job': return facts.completedJob;
  case 'meet_casey': return facts.metRival;
  case 'finish_first_race': return facts.finishedRace;
  default: return false;
 }
}
export function nextChapterBeat(completed: readonly string[]): string | null {
 if (completed.some(id => !CHAPTER_ONE.beats.includes(id as typeof CHAPTER_ONE.beats[number]))) throw new Error('Unknown chapter beat');
 const prefix = CHAPTER_ONE.beats.slice(0, completed.length);
 if (new Set(completed).size !== completed.length || prefix.some(id => !completed.includes(id))) throw new Error('Invalid chapter sequence');
 return CHAPTER_ONE.beats[completed.length] ?? null;
}
