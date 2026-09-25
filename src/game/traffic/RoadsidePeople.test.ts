import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { expect, it } from 'vitest';
import { WorldKit } from '../world/WorldChunk';
import { RoadsidePeople } from './RoadsidePeople';

it('walks back and forth on the shoulder without entering the traffic lane', () => {
  const engine = new NullEngine(); const scene = new Scene(engine);
  const kit = new WorldKit(scene);
  try {
    const people = new RoadsidePeople(scene, kit, [{ from: 0, to: 12, side: 1 }], (s, offset) =>
      ({ x: offset, y: s / 20, z: s, heading: 0, width: 6.2 }), () => ({ x: 0, z: 0 }));
    const person = scene.getMeshByName('roadside-person-0')!;
    const start = person.position.clone();
    for (let i = 0; i < 600; i++) {
      people.update(.1);
      expect(person.position.x).toBeGreaterThan(4.5);
      expect(person.position.z).toBeGreaterThanOrEqual(0);
      expect(person.position.z).toBeLessThanOrEqual(12);
      expect(person.position.y).toBeLessThan(person.position.z / 20);
    }
    expect(person.position.equals(start)).toBe(false);
    people.dispose();
    expect(scene.getMeshByName('roadside-person-0')).toBeNull();
  } finally { kit.dispose(); scene.dispose(); engine.dispose(); }
});
