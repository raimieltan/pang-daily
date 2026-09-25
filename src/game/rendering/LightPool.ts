/**
 * Picks which lamps get one of the scene's few real point lights. Pure (no Babylon), so the
 * policy is unit-tested; `SceneLighting` applies the result to actual lights.
 *
 * The shader cost of forward lighting scales with lights per material, and changing the count
 * recompiles every lit shader, so the pool size is fixed and lamps take turns: the nearest
 * lamps to a focus point (just ahead of the car) own a slot, and a slot only moves to a new lamp
 * after fading its old one out. Lamps without a slot still show their lens glow and ground pool,
 * so nothing visibly switches off.
 */

export type PoolCandidate = { readonly x: number; readonly z: number; readonly range: number };

export type PoolSlot = {
  /** Candidate index, or -1 when free. */
  lamp: number;
  /** 0..1 fade applied to the lamp's intensity. */
  weight: number;
  target: 0 | 1;
};

export class LightPoolSelector {
  readonly slots: PoolSlot[];

  constructor(
    private readonly candidates: readonly PoolCandidate[],
    size: number,
    private readonly fadeSeconds = 0.35,
  ) {
    this.slots = Array.from({ length: size }, () => ({ lamp: -1, weight: 0, target: 0 as const }));
  }

  /** The `slots.length` lamps that matter most seen from (x, z): nearest, big lights counting from further. */
  wanted(x: number, z: number): number[] {
    return this.candidates
      .map((c, i) => ({ i, score: Math.hypot(c.x - x, c.z - z) - c.range * 0.5 }))
      .sort((a, b) => a.score - b.score)
      .slice(0, this.slots.length)
      .map(({ i }) => i);
  }

  update(dt: number, x: number, z: number): void {
    const wanted = new Set(this.wanted(x, z));
    for (const slot of this.slots) {
      if (slot.lamp >= 0 && wanted.delete(slot.lamp)) slot.target = 1;
      else slot.target = 0;
    }
    // Hand lamps still waiting to free slots only (faded out), never mid-fade: no pops.
    for (const lamp of wanted) {
      const free = this.slots.find((s) => s.target === 0 && s.weight === 0);
      if (!free) break;
      free.lamp = lamp;
      free.target = 1;
    }
    const step = this.fadeSeconds > 0 ? dt / this.fadeSeconds : 1;
    for (const slot of this.slots) {
      slot.weight = slot.target ? Math.min(1, slot.weight + step) : Math.max(0, slot.weight - step);
      if (slot.weight === 0 && slot.target === 0) slot.lamp = -1;
    }
  }
}
