import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Scene } from '@babylonjs/core/scene';
import { expect, it } from 'vitest';
import { CharacterVisual } from './CharacterVisual';
import { CREW } from './crew';

it('builds each named crew member on the shared rig and exhales from the mouth', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const material = new StandardMaterial('lit', scene);
    for (const member of CREW) {
      const visual = new CharacterVisual(scene, material, 1.7, { ...member.appearance(), vape: true });
      let peak = 0;
      for (let t = 0; t < 12; t += .1) peak = Math.max(peak, visual.vapeIdle(.1, 0, true));
      expect(peak, member.id).toBeGreaterThan(.9);
      const mouth = visual.mouth();
      expect(mouth.y).toBeGreaterThan(1);
      expect(mouth.y).toBeLessThan(1.5);
      const triangles = visual.root.getChildMeshes().reduce((n, m) => n + (m.getTotalIndices() / 3), 0);
      expect(triangles, member.id).toBeLessThan(2500);
      visual.root.dispose();
    }
  } finally { scene.dispose(); engine.dispose(); }
});
