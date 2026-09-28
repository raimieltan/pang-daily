import { CHAPTER_ONE, type ChapterBeatId } from './chapter';

/** Presentation copy follows durable chapter beat IDs; it never decides progression. */
export const CHAPTER_SCENES: Readonly<Record<ChapterBeatId, {
 number: string; title: string; place: string; line: string; next: string;
}>> = {
 choose_origin: { number: '00', title: 'Your daily', place: 'HOME', line: 'An old car, a thin wallet, and a road ahead.', next: 'Choose how it became yours.' },
 meet_mang_boy: { number: '01', title: 'Something is wrong', place: 'THE TALYER', line: 'The pedal pulls. Tito Jun has seen this before.', next: 'Visit the talyer bay for an inspection and a repair quote.' },
 complete_first_job: { number: '02', title: 'Earn the first money', place: 'TITO JUN’S BOARD', line: 'Oil and coolant do not pick themselves up.', next: 'Take the walking errand at the talyer board. It pays ₱300.' },
 meet_casey: { number: '03', title: 'Pull up at KYO', place: 'KYO COFFEE', line: 'Sean talks builds. Michael notices the brakes. Casey knows the road.', next: 'Meet the regulars at the counter, then speak to Casey outside.' },
 finish_first_race: { number: '04', title: 'The first run', place: 'NORTH STREET', line: 'Casey drives the same road better than you expect.', next: 'Finish the Barangay sprint. A loss still counts; a DNF can be retried.' },
 brake_setback: { number: '05', title: 'The bill comes due', place: 'THE DRIVE HOME', line: 'The old brakes finally give out.', next: 'Get the daily back to the talyer.' },
 repair_daily: { number: '06', title: 'Just keep it running', place: 'THE TALYER', line: 'This is the money you were saving for the build.', next: 'Repair the starter car’s brakes. Repeat the walking oil errand if cash or fuel is low.' },
 kyo_recognition: { number: '07', title: 'A place to park', place: 'KYO COFFEE', line: 'They noticed you came back in the daily.', next: 'Return to the KYO counter and take your saved spot.' },
};

export const CHAPTER_END_SCENE = {
 number: '08', title: 'Regular', place: 'KYO COFFEE',
 line: 'Nobody invited you tonight. Your spot was already there.',
 next: 'Chapter 1 complete. Work, drive, repair, visit KYO, and look toward the next road.',
};

export function chapterScene(currentBeatId: string | null) {
 return currentBeatId && CHAPTER_ONE.beats.includes(currentBeatId as ChapterBeatId)
  ? CHAPTER_SCENES[currentBeatId as ChapterBeatId] : CHAPTER_END_SCENE;
}
