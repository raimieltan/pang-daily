import { CHAPTER_ONE, type ChapterBeatId } from '@/game-core/progression/chapter';
import type { RuntimeBootstrap } from '@/game-core/persistence/RuntimeBootstrap';
import { loadSocialSession, type SocialStoragePort } from '../social/socialStorage';
import type { RuntimePort } from '../bridge';
import type { GameSystem } from '../engine/types';
import type { PlayerModes } from '../player/PlayerModes';

/** World-space destinations for existing interactions; none of these complete a beat. */
const WAYPOINTS: Partial<Record<ChapterBeatId, { x: number; z: number; name: string }>> = {
 meet_mang_boy: { x: 22, z: 158, name: 'Tito Jun’s talyer' },
 complete_first_job: { x: 41, z: 154, name: 'Talyer job board' },
 meet_casey: { x: 140, z: 103, name: 'KYO Coffee counter' },
 finish_first_race: { x: -65, z: 137.5, name: 'Barangay sprint start' },
 repair_daily: { x: 22, z: 158, name: 'Tito Jun’s talyer' },
 kyo_recognition: { x: 140, z: 103, name: 'KYO Coffee counter' },
};
export type ChapterDirection = { beatId: string; destination: string; meters: number; compass: string };
export function chapterDirection(beatId: string | null, x: number, z: number, regularsMet: boolean): ChapterDirection | null {
 if (!beatId || !CHAPTER_ONE.beats.includes(beatId as ChapterBeatId)) return null;
 const target = beatId === 'meet_casey' && regularsMet ? { x: 139, z: 97, name: 'Casey outside KYO' } : WAYPOINTS[beatId as ChapterBeatId];
 if (!target) return null;
 const dx = target.x - x, dz = target.z - z, degrees = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;
 const compass = ['N','NE','E','SE','S','SW','W','NW'][Math.round(degrees / 45) % 8];
 return { beatId, destination: target.name, meters: Math.round(Math.hypot(dx, dz)), compass };
}
export class ChapterGuide implements GameSystem {
 readonly name = 'chapterGuide';
 private elapsed = 1;
 private last = '';
 constructor(private readonly bridge: RuntimePort, private readonly modes: PlayerModes,
  private readonly storage: SocialStoragePort, private readonly busy: () => boolean,
  private readonly chapters: () => RuntimeBootstrap['chapters']) {}
 update(dt: number): void {
  this.elapsed += dt;
  if (this.elapsed < 1) return;
  this.elapsed = 0;
  const beat = this.chapters()?.find(c => c.id === CHAPTER_ONE.id)?.currentBeatId ?? null;
  const regularsMet = beat === 'meet_casey' && loadSocialSession(this.storage).snapshot().unlocks.met_kyo_regulars?.unlocked === true;
  const next = this.busy() ? null : chapterDirection(beat, this.modes.position.x, this.modes.position.z, regularsMet);
  const serialized = JSON.stringify(next);
  if (serialized !== this.last) { this.last = serialized; this.bridge.emit('chapterDirection', next); }
 }
 dispose(): void { this.bridge.emit('chapterDirection', null); }
}
