import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { expect, it } from 'vitest';
import { CharacterVisual } from './CharacterVisual';

it('seats a rider above the saddle with hands forward and feet below the knees', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const rider = new CharacterVisual(scene, new StandardMaterial('person', scene), 1.7);
    rider.sitOnMotorcycle();
    for (const mesh of rider.root.getChildMeshes()) mesh.computeWorldMatrix(true);
    const hips = scene.getTransformNodeByName('player:hips')!;
    const hand = scene.getMeshByName('player:forearm:1')!;
    const knee = scene.getMeshByName('player:shin:1')!;
    expect(hips.position.y).toBeCloseTo(.91);
    const fingertips = Vector3.TransformCoordinates(new Vector3(0, -.25, .005), hand.getWorldMatrix());
    expect(fingertips.z).toBeGreaterThan(.2);
    expect(knee.getAbsolutePosition().y).toBeLessThan(hips.position.y);
    expect(knee.getAbsolutePosition().z).toBeGreaterThan(.05);
  } finally { scene.dispose(); engine.dispose(); }
});
it('folds both walking shins behind the thighs throughout a stride', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const walker = new CharacterVisual(scene, new StandardMaterial('walker', scene), 1.7);
    const bent = new Set<number>();
    for (let frame = 0; frame < 120; frame++) {
      walker.update(1 / 60, 1.65, true);
      for (const side of [-1, 1]) {
        const shin = scene.getMeshByName(`player:shin:${side}`)!;
        // Inspect in thigh space so hip swing cannot hide an inverted knee.
        const ankle = Vector3.TransformCoordinates(
          new Vector3(0, -.38, 0), shin.computeWorldMatrix(true),
        );
        const thighSpace = Vector3.TransformCoordinates(
          ankle, shin.parent!.computeWorldMatrix(true).clone().invert(),
        );
        expect(thighSpace.z).toBeLessThanOrEqual(1e-6);
        if (thighSpace.z < -.05) bent.add(side);
      }
    }
    expect(bent.size).toBe(2);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
