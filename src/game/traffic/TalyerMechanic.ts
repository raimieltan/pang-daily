import type { Scene } from '@babylonjs/core/scene';
import { CharacterVisual } from '../characters/CharacterVisual';
import type { GameSystem } from '../engine/types';
import type { WorldKit } from '../world/WorldChunk';

/** Tito Jun stays at the bay workbench, using the same NPC visual system as the KYO regulars. */
export class TalyerMechanic implements GameSystem {
  readonly name = 'talyerMechanic';
  private readonly visual: CharacterVisual;

  constructor(scene: Scene, kit: WorldKit, private readonly focus: () => { x: number; z: number }) {
    this.visual = new CharacterVisual(scene, kit.lit, 1.7, {
      shirt: '#46554b',
      pants: '#30383d',
      shoes: '#242725',
      skin: '#a97552',
      hair: '#252623',
      sleeves: 'short',
    });
    this.visual.root.name = 'npc:tito_jun';
    this.visual.root.position.set(20.5, 0, 164);
    this.visual.root.rotation.y = Math.PI;
  }

  update(dt: number): void {
    const at = this.focus();
    const near = Math.hypot(at.x - 20.5, at.z - 164) < 100;
    this.visual.root.setEnabled(near);
    if (near) this.visual.ambientIdle(dt, 2.4, 'work');
  }

  dispose(): void { this.visual.root.dispose(); }
}
