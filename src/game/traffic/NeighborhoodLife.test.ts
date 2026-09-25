import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { expect, it, vi } from 'vitest';
import { WorldKit } from '../world/WorldChunk';
import { NeighborhoodLife, MAX_NEARBY_RESIDENTS, residentPose } from './NeighborhoodLife';
import { RESIDENTS, type Resident } from '../world/population';

it('keeps walks within authored endpoints and pauses before returning', () => {
  for (const person of RESIDENTS.filter(p => p.to)) {
    const length = Math.hypot(person.to!.x - person.x, person.to!.z - person.z);
    expect(residentPose(person, length / .8 + 1).speed).toBe(0);
    for (let time = 0; time < 50; time += .17) {
      const p = residentPose(person, time);
      expect(p.x).toBeGreaterThanOrEqual(Math.min(person.x, person.to!.x) - 1e-8);
      expect(p.x).toBeLessThanOrEqual(Math.max(person.x, person.to!.x) + 1e-8);
      expect(p.z).toBeGreaterThanOrEqual(Math.min(person.z, person.to!.z) - 1e-8);
      expect(p.z).toBeLessThanOrEqual(Math.max(person.z, person.to!.z) + 1e-8);
    }
  }
});

it('limits nearby residents, animates the ball, emits nearby sounds and releases distant meshes', () => {
  const engine = new NullEngine(), scene = new Scene(engine), kit = new WorldKit(scene);
  let focus = { x: 0, y: 0, z: 0 };
  const sound = vi.fn();
  const residents: Resident[] = Array.from({ length: 50 }, (_, i) => ({
    id: `test-${i}`, area: 'test', x: i * .5, z: 0, heading: 0,
    activity: i === 0 ? 'basketball' : 'chat', shirt: '#888888', voice: i % 3,
  }));
  const baseline = scene.meshes.length;
  const life = new NeighborhoodLife(scene, kit, () => focus, sound, residents);
  try {
    life.update(.1);
    expect(scene.meshes.filter(m => /^resident-test-\d+$/.test(m.name))).toHaveLength(MAX_NEARBY_RESIDENTS);
    const ball = scene.getMeshByName('resident-test-0-ball')!;
    const before = ball.position.y;
    life.update(.2);
    expect(ball.position.y).not.toBe(before);
    for (let i = 0; i < 50; i++) life.update(.1);
    expect(sound.mock.calls.some(([s]) => s.kind === 'basketball')).toBe(true);
    expect(sound.mock.calls.some(([s]) => s.kind === 'chatter')).toBe(true);
    focus = { x: 1000, y: 0, z: 1000 };
    sound.mockClear(); life.update(.6);
    expect(scene.meshes.length).toBe(baseline);
    expect(sound).not.toHaveBeenCalled();
    focus = { x: 0, y: 0, z: 0 }; life.update(.6);
    life.dispose();
    expect(scene.meshes.length).toBe(baseline);
  } finally { life.dispose(); kit.dispose(); scene.dispose(); engine.dispose(); }
});
