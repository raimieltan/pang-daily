import { expect, it } from 'vitest';
import { minimapView } from './drivingEffects';

it('centers the minimap on the vehicle and keeps it inside the map bounds', () => {
  expect(minimapView({ x: 50, z: 60 }, { minX: 0, maxX: 100, minZ: 0, maxZ: 100 }, 40)).toEqual({ x: 30, y: 20, size: 40 });
  expect(minimapView({ x: 2, z: 3 }, { minX: 0, maxX: 100, minZ: 0, maxZ: 100 }, 40)).toEqual({ x: 0, y: 60, size: 40 });
});
