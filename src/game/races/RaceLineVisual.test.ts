import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { expect, it } from 'vitest';
import { RaceLineVisual, raceLineZones } from './RaceLineVisual';

it('marks braking before a slower bend and builds a removable road strip', () => {
  const points = Array.from({ length: 25 }, (_, i) => ({ x: 0, y: 0, z: i * 5, speed: i < 12 ? 25 : 10 }));
  const zones = raceLineZones(points);
  expect(zones.slice(0, 12)).toContain('brake');
  expect(zones.at(-1)).toBe('drive');
  const engine = new NullEngine(), scene = new Scene(engine);
  const visual = new RaceLineVisual(scene, points);
  expect(scene.meshes.some(mesh => mesh.name === 'race-line' && mesh.getTotalVertices() === points.length * 2)).toBe(true);
  visual.dispose();
  expect(scene.meshes.some(mesh => mesh.name === 'race-line')).toBe(false);
  scene.dispose(); engine.dispose();
});
