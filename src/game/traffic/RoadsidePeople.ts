import type { Scene } from '@babylonjs/core/scene';
import { CharacterVisual } from '../characters/CharacterVisual';
import type { GameSystem } from '../engine/types';
import type { WorldKit } from '../world/WorldChunk';
import { roadsideDrop } from '../world/mountain/route';

type WalkSite = { from: number; to: number; side: 1 | -1 };
type GroundSample = { x: number; y: number; z: number; heading: number; width: number };
export type NpcSound = { kind: 'footstep' | 'chatter' | 'basketball' | 'work'; voice: number; distance: number };

/** Small authored walks outside the pavement, with a pause before turning around. */
export class RoadsidePeople implements GameSystem {
  readonly name = 'roadsidePeople';
  private readonly people: { visual: CharacterVisual; site: WalkSite; s: number; direction: number; wait: number; speed: number; steps: number; chatter: number; voice: number }[];

  constructor(scene: Scene, kit: WorldKit, sites: readonly WalkSite[],
    private readonly sample: (s: number, offset: number) => GroundSample,
    private readonly focus: () => { x: number; z: number }, private readonly flatGround = false,
    private readonly sound?: (sound: NpcSound) => void) {
    this.people = sites.map((site, i) => {
      const visual = new CharacterVisual(scene, kit.lit, 1.6 + (i % 3) * .07);
      visual.root.name = `roadside-person-${i}`;
      return { visual, site, s: site.from + (site.to - site.from) * ((i % 3) / 3), direction: 1, wait: i % 3, speed: .75 + (i % 3) * .12, steps: 0, chatter: 3 + i * 2, voice: i % 3 };
    });
    this.update(0);
  }

  update(dt: number): void {
    dt = Math.max(0, Math.min(dt, .1));
    const focus = this.focus();
    for (const person of this.people) {
      const { visual, site } = person;
      const before = person.s;
      if (person.wait > 0) person.wait = Math.max(0, person.wait - dt);
      else {
        person.s = Math.max(site.from, Math.min(site.to, person.s + person.direction * person.speed * dt));
        if (person.s === site.to || person.s === site.from) { person.direction *= -1; person.wait = 2.5; }
      }
      const center = this.sample(person.s, 0), offset = site.side * (center.width / 2 + 2);
      const at = this.sample(person.s, offset);
      visual.root.position.set(at.x, at.y - (this.flatGround ? 0 : roadsideDrop(at.width, offset)), at.z);
      visual.root.rotation.y = at.heading + (person.direction < 0 ? Math.PI : 0);
      const distance = Math.hypot(at.x - focus.x, at.z - focus.z);
      const visible = distance < 220;
      person.steps += Math.abs(person.s - before);
      person.chatter -= dt;
      if (person.steps >= .65) {
        person.steps %= .65;
        if (distance < 10) this.sound?.({ kind: 'footstep', voice: person.voice, distance });
      }
      if (person.chatter <= 0) {
        person.chatter = 10 + person.voice * 3;
        if (distance < 18) this.sound?.({ kind: 'chatter', voice: person.voice, distance });
      }
      visual.root.setEnabled(visible);
      if (visible) visual.update(dt, dt ? Math.abs(person.s - before) / dt : 0, true);
    }
  }

  dispose(): void { this.people.forEach(person => person.visual.root.dispose()); }
}
