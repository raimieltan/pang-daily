import type { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CreateSphereVertexData } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { CharacterVisual } from '../characters/CharacterVisual';
import type { GameSystem } from '../engine/types';
import type { WorldKit } from '../world/WorldChunk';
import { RESIDENTS, type Resident } from '../world/population';
import type { NpcSound } from './RoadsidePeople';

export const MAX_NEARBY_RESIDENTS = 32;
const DRAW_DISTANCE = 135;
type ActiveResident = { visual: CharacterVisual; ball: Mesh | null; time: number; chatter: number; steps: number; beat: number; previousX: number; previousZ: number };

/** A short, authored pavement walk with a pause at either end; never wanders into traffic. */
export function residentPose(person: Resident, time: number) {
  const start = { x: person.x, y: person.y ?? 0, z: person.z, heading: person.heading * Math.PI / 180, speed: 0 };
  if (!person.to) return start;
  const dx = person.to.x - person.x, dz = person.to.z - person.z;
  const length = Math.hypot(dx, dz);
  if (length < .01) return start;
  const travel = length / .8, leg = travel + 2, cycle = time % (leg * 2);
  const back = cycle >= leg, along = back ? cycle - leg : cycle;
  const moving = along < travel;
  const fraction = Math.min(1, along / travel);
  const t = back ? 1 - fraction : fraction;
  return { x: person.x + dx * t, y: (person.y ?? 0) + ((person.to.y ?? person.y ?? 0) - (person.y ?? 0)) * t,
    z: person.z + dz * t, heading: Math.atan2(dx, dz) + (back ? Math.PI : 0), speed: moving ? .8 : 0 };
}

/** Streams only nearby residents. All activity and sound advance with simulation time. */
export class NeighborhoodLife implements GameSystem {
  readonly name = 'neighborhoodLife';
  private readonly active = new Map<Resident, ActiveResident>();
  private streamTime = 1;

  constructor(private readonly scene: Scene, private readonly kit: WorldKit,
    private readonly focus: () => { x: number; y?: number; z: number },
    private readonly sound: (sound: NpcSound) => void,
    private readonly residents: readonly Resident[] = RESIDENTS) {}

  private refresh() {
    const at = this.focus();
    const distance = (person: Resident) => Math.hypot(person.x - at.x, (person.y ?? 0) - (at.y ?? 0), person.z - at.z);
    const nearby = this.residents.filter(person => distance(person) < DRAW_DISTANCE)
      .sort((a, b) => distance(a) - distance(b)).slice(0, MAX_NEARBY_RESIDENTS);
    const wanted = new Set(nearby);
    for (const [person, state] of this.active) if (!wanted.has(person)) {
      state.visual.root.dispose(); this.active.delete(person);
    }
    for (const person of nearby) if (!this.active.has(person)) {
      const visual = new CharacterVisual(this.scene, this.kit.lit, 1.7, {
        shirt: person.shirt, coffee: person.activity === 'coffee',
        skin: ['#b88059', '#c5916a', '#986746'][person.voice % 3],
      });
      visual.root.name = `resident-${person.id}`;
      const ball = person.activity === 'basketball' ? this.basketball(visual.root) : null;
      this.active.set(person, { visual, ball, time: 0, chatter: 3 + person.voice * 2,
        steps: 0, beat: 0, previousX: person.x, previousZ: person.z });
    }
  }

  private basketball(parent: Mesh) {
    const ball = new Mesh(`${parent.name}-ball`, this.scene);
    const data = CreateSphereVertexData({ diameter: .24, segments: 8 });
    const positions = data.positions!;
    data.colors = [];
    for (let i = 0; i < positions.length; i += 3) {
      const seam = Math.abs(positions[i]) < .015 || Math.abs(positions[i + 1]) < .015 || Math.abs(positions[i + 2]) < .015;
      data.colors.push(...(seam ? [.14, .09, .055, 1] : [.68, .27, .07, 1]));
    }
    data.applyToMesh(ball); ball.material = this.kit.lit; ball.isPickable = false;
    ball.parent = parent;
    return ball;
  }

  update(dt: number) {
    this.streamTime += dt;
    if (this.streamTime >= .5) { this.refresh(); this.streamTime = 0; }
    const at = this.focus();
    for (const [person, state] of this.active) {
      state.time += dt;
      const phase = person.voice * .37, t = state.time + phase;
      const pose = residentPose(person, state.time);
      state.visual.root.position.set(pose.x, pose.y, pose.z);
      state.visual.root.rotation.y = pose.heading;
      if (person.activity === 'walk') state.visual.update(dt, pose.speed, true);
      else if (person.activity === 'sit' || person.activity === 'coffee') state.visual.cafeIdle(dt, phase, person.activity === 'sit');
      else state.visual.ambientIdle(dt, phase, person.activity);
      const distance = Math.hypot(pose.x - at.x, pose.y - (at.y ?? 0), pose.z - at.z);
      if (state.ball) {
        state.ball.position.set(.34, .13 + .82 * Math.abs(Math.sin(t * Math.PI / .8)), .4);
        state.ball.rotation.z = t * 2;
      }
      const beat = Math.floor(t / (state.ball ? .8 : 2.4));
      if (beat !== state.beat && distance < 15 && (state.ball || person.activity === 'work')) {
        this.sound({ kind: state.ball ? 'basketball' : 'work', voice: person.voice, distance });
      }
      state.beat = beat;
      state.steps += Math.hypot(pose.x - state.previousX, pose.z - state.previousZ);
      if (state.steps >= .65) {
        state.steps %= .65;
        if (distance < 10) this.sound({ kind: 'footstep', voice: person.voice, distance });
      }
      state.previousX = pose.x; state.previousZ = pose.z;
      state.chatter -= dt;
      if (state.chatter <= 0) {
        state.chatter = 13 + person.voice * 4;
        if (distance < 18) this.sound({ kind: 'chatter', voice: person.voice, distance });
      }
    }
  }

  dispose() { this.active.forEach(state => state.visual.root.dispose()); this.active.clear(); }
}
