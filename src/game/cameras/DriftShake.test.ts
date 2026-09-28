import { expect, it } from 'vitest';
import { driftShake } from './DriftShake';

it('kicks briefly at drift initiation and settles to zero', () => {
  expect(driftShake(0, 1)).toBe(0);
  expect(Math.abs(driftShake(.04, 1))).toBeGreaterThan(0);
  expect(driftShake(.4, 1)).toBe(0);
  expect(Math.abs(driftShake(.04, .5))).toBeLessThan(Math.abs(driftShake(.04, 1)));
});
