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
