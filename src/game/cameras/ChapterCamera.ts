import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { GameSystem } from '../engine/types';
import type { ChaseCamera } from './ChaseCamera';
import type { PlayerVehicle } from '../vehicles/PlayerVehicle';
import type { PlayerModes } from '../player/PlayerModes';
import type { DialogueController } from '../social/DialogueController';
import type { RuntimeBootstrap } from '@/game-core/persistence/RuntimeBootstrap';

const FRAME: Record<string, { eye: Vector3; aim: Vector3; radius: number }> = {
 talyer_mang_boy: { eye: new Vector3(23, 2.8, 146), aim: new Vector3(25, 1.4, 158), radius: 30 },
 kyo_order: { eye: new Vector3(131, 2.7, 93), aim: new Vector3(140, 1.5, 103), radius: 28 },
 casey_intro: { eye: new Vector3(131, 2.6, 91), aim: new Vector3(139, 1.45, 97), radius: 28 },
};

/** Brief, skippable framing layered over the existing chase/walk camera. It never owns gameplay. */
export class ChapterCamera implements GameSystem {
 readonly name = 'chapterCamera';
 private weight = 0;
 private openingSeconds: number;
 private setbackSeconds = 0;
 private previousBeat: string | null;
 private readonly side = new Vector3();
 private readonly aim = new Vector3();
 constructor(
  private readonly chase: ChaseCamera,
  private readonly car: PlayerVehicle,
  private readonly modes: PlayerModes,
  private readonly dialogue: DialogueController,
  private readonly chapters: () => RuntimeBootstrap['chapters'],
  private readonly inspectionOpen: () => boolean = () => false,
 ) {
  const chapter = this.chapters()?.find(c => c.id === 'chapter_1');
  this.previousBeat = chapter?.currentBeatId ?? null;
  this.openingSeconds = chapter?.currentBeatId === 'meet_mang_boy' && chapter.markers.length === 1 ? 3.6 : 0;
 }
 update(dt: number): void {
  const beat = this.chapters()?.find(c => c.id === 'chapter_1')?.currentBeatId ?? null;
  if (beat !== this.previousBeat) {
   if (beat === 'repair_daily' && this.previousBeat === 'finish_first_race') this.setbackSeconds = 3.6;
   if (beat !== 'repair_daily') this.setbackSeconds = 0;
   this.previousBeat = beat;
  }
  const idle = this.car.speed < 1 && this.modes.mode === 'driving';
  // Hold the reveal until the player actually stops; never swing the camera mid-drive.
  if (idle) {
   this.openingSeconds = Math.max(0, this.openingSeconds - dt);
   this.setbackSeconds = Math.max(0, this.setbackSeconds - dt);
  }
  // The racing camera has priority. Moving or reduced-motion players keep their normal view.
  const person = this.modes.mode === 'walking' ? this.dialogue.activeDialogueId ?? (this.inspectionOpen() ? 'talyer_mang_boy' : null) : null;
  const frame = person ? FRAME[person] : undefined;
  const near = frame && Vector3.Distance(this.modes.position, frame.aim) < frame.radius;
  const carMoment = idle && (this.openingSeconds > 0 || this.setbackSeconds > 0);
  const target = this.chase.reducedMotion ? 0 : near || carMoment ? 1 : 0;
  this.weight += (target - this.weight) * (1 - Math.exp(-5 * dt));
  if (this.weight < .002) { this.weight = 0; return; }
  const live = this.chase.camera.position.clone();
  const liveAim = this.chase.camera.getTarget().clone();
  if (near && frame) {
   this.side.copyFrom(frame.eye);
   this.aim.copyFrom(frame.aim);
  } else if (carMoment) {
   const p = this.car.position, f = this.car.forward;
   this.side.set(p.x - f.x * 5 + f.z * 4.5, p.y + 2.6, p.z - f.z * 5 - f.x * 4.5);
   this.aim.set(p.x, p.y + .95, p.z);
  }
  Vector3.LerpToRef(live, this.side, this.weight, this.chase.camera.position);
  Vector3.LerpToRef(liveAim, this.aim, this.weight, this.aim);
  this.chase.camera.setTarget(this.aim);
  this.chase.camera.fov = this.chase.camera.fov * (1 - this.weight) + .82 * this.weight;
 }
 dispose(): void {}
}
