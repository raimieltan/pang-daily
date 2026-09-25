import type { Scene } from '@babylonjs/core/scene';
import { CharacterVisual } from '../characters/CharacterVisual';
import type { GameSystem } from '../engine/types';
import type { WorldKit } from '../world/WorldChunk';
import { CAFE_CUSTOMERS } from '../world/hub/cafePopulation';
import type { NpcSound } from './RoadsidePeople';

/** A small terrace crowd. Animation and chatter freeze with the scene. */
export class CafeCustomers implements GameSystem {
  readonly name = 'cafeCustomers';
  private readonly customers: { visual: CharacterVisual; chatter: number }[];

  constructor(scene: Scene, kit: WorldKit, private readonly focus: () => { x: number; z: number },
    private readonly sound: (sound: NpcSound) => void) {
    this.customers = CAFE_CUSTOMERS.map((person, i) => {
      // Seated customers match the authored 45 cm chair seats.
      const visual = new CharacterVisual(scene, kit.lit, person.seated ? 1.7 : 1.62 + (i % 3) * .05, {
        shirt: person.shirt, skin: ['#b88059', '#c5916a', '#986746'][i % 3],
        hair: i === 2 ? '#77716b' : '#252321', coffee: true,
      });
      visual.root.name = `cafe-customer-${i}`;
      visual.root.position.set(person.x, 0, person.z);
      visual.root.rotation.y = person.heading * Math.PI / 180;
      visual.cafeIdle(0, i * 1.37, person.seated);
      return { visual, chatter: 2 + i * 1.7 };
    });
  }

  update(dt: number) {
    const at = this.focus();
    this.customers.forEach((customer, i) => {
      const person = CAFE_CUSTOMERS[i];
      const distance = Math.hypot(person.x - at.x, person.z - at.z);
      customer.visual.root.setEnabled(distance < 160);
      if (distance >= 160) return;
      customer.visual.cafeIdle(dt, i * 1.37, person.seated);
      customer.chatter -= dt;
      if (customer.chatter <= 0) {
        customer.chatter = 14 + i * 1.3;
        if (distance < 18) this.sound({ kind: 'chatter', voice: person.voice, distance });
      }
    });
  }

  dispose() { this.customers.forEach(customer => customer.visual.root.dispose()); }
}
