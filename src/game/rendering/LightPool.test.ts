import { describe, expect, it } from "vitest";
import { LightPoolSelector, type PoolCandidate } from "./LightPool";

const street: PoolCandidate[] = Array.from({ length: 10 }, (_, i) => ({ x: i * 20, z: 0, range: 20 }));
const lampsOf = (pool: LightPoolSelector) =>
  pool.slots
    .filter((s) => s.lamp >= 0)
    .map((s) => s.lamp)
    .sort((a, b) => a - b);

describe("LightPoolSelector", () => {
  it("gives the slots to the lamps nearest the focus", () => {
    const pool = new LightPoolSelector(street, 3);
    pool.update(1, 41, 0);
    expect(lampsOf(pool)).toEqual([1, 2, 3]);
    expect(pool.slots.every((s) => s.weight === 1)).toBe(true);
  });

  it("lets a big light win from further away than a small one", () => {
    const pool = new LightPoolSelector(
      [
        { x: 10, z: 0, range: 8 },
        { x: -14, z: 0, range: 30 },
      ],
      1,
    );
    expect(pool.wanted(0, 0)).toEqual([1]);
  });

  it("fades a lamp out before its slot moves on, never switching one off instantly", () => {
    const pool = new LightPoolSelector(street, 2, 0.4);
    pool.update(1, 0, 0);
    expect(lampsOf(pool)).toEqual([0, 1]);

    // Drive far down the street: slots first fade out the old lamps...
    pool.update(0.2, 180, 0);
    expect(lampsOf(pool)).toEqual([0, 1]);
    expect(pool.slots.map((s) => s.weight)).toEqual([0.5, 0.5]);

    // ...then, once dark, take the new ones and fade them in.
    pool.update(0.2, 180, 0);
    expect(lampsOf(pool)).toEqual([]);
    pool.update(0.2, 180, 0);
    expect(lampsOf(pool)).toEqual([8, 9]);
    expect(pool.slots.every((s) => s.weight > 0 && s.weight < 1)).toBe(true);
  });

  it("keeps a lamp that stays wanted on the same slot", () => {
    const pool = new LightPoolSelector(street, 2);
    pool.update(1, 21, 0);
    const slotOf2 = pool.slots.findIndex((s) => s.lamp === 2);
    pool.update(1, 45, 0);
    expect(pool.slots.findIndex((s) => s.lamp === 2)).toBe(slotOf2);
    expect(pool.slots[slotOf2].weight).toBe(1);
  });
});
