import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Scene } from '@babylonjs/core/scene';
import { expect, it } from 'vitest';
import { CharacterVisual } from './CharacterVisual';
import { CREW } from './crew';
import { buildCrewCar } from '../vehicles/crewCars';

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
    for (const model of ['lancer', 'civic_rs', 'city'] as const) {
      const car = buildCrewCar(scene, material, model, '#ffffff', model);
      const { minimum: min, maximum: max } = car.getBoundingInfo().boundingBox;
      expect(min.y).toBeCloseTo(0, 1);
      expect(max.z - min.z).toBeGreaterThan(4.3);
      expect(max.x - min.x).toBeLessThan(2.1);
      expect(car.getTotalIndices() / 3).toBeLessThan(1500);
    }
  } finally { scene.dispose(); engine.dispose(); }
});
