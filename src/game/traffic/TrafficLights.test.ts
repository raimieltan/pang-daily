import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { expect, it } from 'vitest';
import { TrafficLights } from './TrafficLights';

it('lights nearby active vehicles at night, follows their heading, and releases beams in daylight', () => {
  const engine = new NullEngine(); const scene = new Scene(engine);
  try {
    const roots = [10, 20, 30, 40].map((z, i) => {
      const root = new TransformNode(`vehicle-${i}`, scene); root.position.z = z; return root;
    });
    roots[0].setEnabled(false); roots[1].rotation.y = Math.PI / 2;
    let night = 1;
    const lamps = new TrafficLights(scene, roots.map((root, i) => ({ root, motorcycle: i < 2 })), () => Vector3.Zero(), () => night);
    lamps.update();
    const beams = scene.lights.filter(light => light.name.startsWith('traffic:beam'));
    expect(beams).toHaveLength(2);
    expect(beams.every(light => light.intensity > 0)).toBe(true);
    expect(beams.map(light => light.parent)).toEqual([roots[1], roots[2]]);
    expect(roots[1].getChildMeshes().some(mesh => mesh.name.includes('headlamp'))).toBe(true);
    night = 0; lamps.update();
    expect(beams.every(light => light.intensity === 0)).toBe(true);
    night = 1; roots.forEach(root => root.setEnabled(false)); lamps.update();
    expect(beams.every(light => light.intensity === 0 && light.parent === null)).toBe(true);
    lamps.dispose();
    expect(scene.lights).toHaveLength(0);
  } finally { scene.dispose(); engine.dispose(); }
});
