/** Stable campaign IDs. Existing milestone IDs remain compatible with durable saves. */
export const CHAPTER_ONE = {
 id: 'chapter_1',
 beats: ['choose_origin', 'meet_mang_boy', 'complete_first_job', 'meet_casey', 'finish_first_race', 'brake_setback', 'repair_daily', 'kyo_recognition'],
 completionUnlockId: 'chapter_2_access',
 firstJobId: 'talyer_oil_errand',
 firstRaceId: 'barangay_sprint',
 setbackBrakes: .3,
} as const;
export const STARTER_ORIGINS = [
 { id: 'family', name: 'Family hand-me-down', cashPhp: 1200, brakes: .65, description: 'It sat for years. More cash left, but the brakes need attention.' },
 { id: 'marketplace', name: 'Cheap Marketplace find', cashPhp: 900, brakes: .72, description: 'Most savings went to the seller. The best brakes of the three, with little cash left.' },
 { id: 'project', name: 'Unfinished project', cashPhp: 600, brakes: .55, description: 'Someone gave up on it. Lowest cash and the most brake work.' },
] as const;
export type ChapterBeatId = typeof CHAPTER_ONE.beats[number];
export type BeatStatus = 'locked' | 'available' | 'active' | 'completed' | 'recoverable';
export type ChapterFacts = {
 originChosen?: boolean; metMechanic: boolean; completedJob: boolean; metRival: boolean; finishedRace: boolean;
 metRegulars?: boolean; setbackApplied?: boolean; repairedAfterSetback?: boolean; recognized?: boolean;
 activeJob?: boolean; failedJob?: boolean; activeRace?: boolean; failedRace?: boolean;
};
export function chapterBeatSatisfied(beatId: string, facts: ChapterFacts): boolean {
 switch (beatId) {
  case 'choose_origin': return facts.originChosen === true;
  case 'meet_mang_boy': return facts.metMechanic;
  case 'complete_first_job': return facts.completedJob;
  case 'meet_casey': return facts.metRival && facts.metRegulars === true;
  case 'finish_first_race': return facts.finishedRace;
  case 'brake_setback': return facts.setbackApplied === true;
  case 'repair_daily': return facts.repairedAfterSetback === true;
  case 'kyo_recognition': return facts.recognized === true;
  default: return false;
 }
}
export function nextChapterBeat(completed: readonly string[]): ChapterBeatId | null {
 if (completed.some(id => !CHAPTER_ONE.beats.includes(id as ChapterBeatId))) throw new Error('Unknown chapter beat');
 const prefix = CHAPTER_ONE.beats.slice(0, completed.length);
 if (new Set(completed).size !== completed.length || prefix.some(id => !completed.includes(id))) throw new Error('Invalid chapter sequence');
 return CHAPTER_ONE.beats[completed.length] ?? null;
}
/** Status is a read model of durable evidence, never a second writable campaign save. */
export function chapterBeatStates(completed: readonly string[], facts: ChapterFacts): { id: ChapterBeatId; status: BeatStatus }[] {
 const current = nextChapterBeat(completed);
 return CHAPTER_ONE.beats.map(id => ({ id, status: completed.includes(id) ? 'completed' : id !== current ? 'locked'
  : (id === 'complete_first_job' && facts.activeJob) || (id === 'finish_first_race' && facts.activeRace) ? 'active'
  : id === 'repair_daily' || (id === 'complete_first_job' && facts.failedJob) || (id === 'finish_first_race' && facts.failedRace) ? 'recoverable' : 'available' }));
}
export const CHAPTER_GUIDANCE: Record<ChapterBeatId, string> = {
 choose_origin: 'Choose how this daily became yours.',
 meet_mang_boy: 'The brakes pull. Visit Tito Jun at the talyer on the north street; park and talk at the bay.',
 complete_first_job: 'Tito Jun needs oil & coolant. Use the talyer job board. The errand can be done on foot and retried.',
 meet_casey: 'Head east to KYO Coffee. Talk at the counter, meet Sean and Michael, then find Casey outside.',
 finish_first_race: 'Casey invited you to the Barangay sprint on the north street. No entry fee. Finishing matters; winning is optional.',
 brake_setback: 'The old brakes have given out. Return to the talyer.',
 repair_daily: 'Repair the starter car’s brakes at the talyer. The oil errand pays ₱300 and can be repeated on foot, even with an empty tank. Repair only the brakes to save cash; doing more delays your build.',
 kyo_recognition: 'Your daily is back. Return to the KYO counter; someone saved your parking spot.',
};
