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

it('shows green, yellow, then red as a car approaches its braking point', () => {
  const points = Array.from({ length: 40 }, (_, i) => ({
    x: 0, y: 0, z: i * 5,
    speed: i < 10 ? 30 : i < 18 ? 30 - (i - 10) * 2.5 : i < 24 ? 10 : Math.min(30, 10 + (i - 24) * 2),
  }));
  const zones = raceLineZones(points, 8);
  expect(zones[0]).toBe('drive');
  expect(zones.slice(5, 10)).toContain('caution');
  expect(zones.slice(10, 17)).toContain('brake');
  expect(zones[30]).toBe('drive');
});
