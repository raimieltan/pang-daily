import { expect, it } from 'vitest';
import { applySuspensionAction } from './actions';
import { createSuspension, type SavedSuspension } from './schema';
import { damageCorner } from './service';
const baseline = { mass: 1200, frontWeight: .6, wheelbase: 2.6, track: 1.5, cgHeight: .5, frontSpring: 28000, rearSpring: 24000 };
function apply(s: SavedSuspension, a: Parameters<typeof applySuspensionAction>[1]): SavedSuspension {
  const result = applySuspensionAction(s, a, baseline); if ('rejected' in result) throw new Error(result.rejected); return result;
}
it('checkpoint cannot perform alignment or silently undo damage', () => {
  const saved = createSuspension(baseline); damageCorner(saved, 0, 4000, 1);
  const incoming = structuredClone(saved); incoming.alignment[0].toe = -incoming.damage[0].deformation.toe;
  expect(applySuspensionAction(saved, { kind: 'checkpoint', state: incoming }, baseline)).toMatchObject({ rejected: expect.any(String) });
  const further = structuredClone(saved); damageCorner(further, 0, 1000, 1);
  expect(applySuspensionAction(saved, { kind: 'checkpoint', state: further }, baseline)).not.toHaveProperty('rejected');
});
it('saved presets restore their compatible kit and keep current damage', () => {
  let saved = apply(createSuspension(baseline), { kind: 'part', part: 'track' });
  const setup = structuredClone(saved.setup);
  saved = apply(saved, { kind: 'preset', name: 'My track', save: true });
  saved = apply(saved, { kind: 'preset', name: 'Stock', save: false });
  damageCorner(saved, 1, 4000, -1); const damage = structuredClone(saved.damage);
  saved = apply(saved, { kind: 'preset', name: 'My track', save: false });
  expect(saved.part).toBe('track'); expect(saved.setup).toEqual(setup); expect(saved.damage).toEqual(damage);
});
