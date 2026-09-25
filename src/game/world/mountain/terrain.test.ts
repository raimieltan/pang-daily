import { describe, expect, it } from 'vitest';
import { terrainHeight } from './MountainWorld';

describe('mountain terrain boundary', () => {
  it('meets the low surrounding ground on every outer edge', () => {
    for (const [x, z] of [[250, 1000], [250, 3000], [3750, 3000], [2000, -250], [2000, 4750]]) {
      expect(terrainHeight(x, z)).toBeLessThanOrEqual(-1);
      expect(Math.abs(terrainHeight(x + (x === 3750 ? -1 : 1), z) - terrainHeight(x, z))).toBeLessThan(1);
    }
  });
});
