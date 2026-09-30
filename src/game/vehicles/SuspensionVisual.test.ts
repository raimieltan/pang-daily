import { readFileSync } from 'node:fs';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { describe, it, expect } from 'vitest';
import { BANWA_DALAGAN_1996 } from '@/game-core/vehicles';
import { VehicleModel } from './VehicleModel';
import { VehicleVisual } from './VehicleVisual';
import { SuspensionSolver } from '@/game-core/suspension/solver';
import { createSuspension } from '@/game-core/suspension/schema';
const baseline = { mass: 1080, frontWeight: .62, wheelbase: 2.5, track: 1.456, cgHeight: .52, frontSpring: 28000, rearSpring: 24000 };
describe('rendered suspension geometry', () => {
  it('moves independent hubs and keeps camber/heading separate from spin', async () => {
    const engine = new NullEngine(), scene = new Scene(engine);
    try {
      const model = await VehicleModel.load(scene, BANWA_DALAGAN_1996, new Uint8Array(readFileSync('public/model/banwa_dalagan_1996_modular.glb')));
      const visual = VehicleVisual.wrap(model), solver = new SuspensionSolver(baseline, createSuspension(baseline));
      solver.preview(1 / 60, 0, 0, -.3);
      solver.corners[0].wheelPosition.y += .04;
      visual.updateSuspension(.1, solver, [10, 10, 10, 10]);
      expect(model.wheels[0].hub.position.y).toBeGreaterThan(model.wheels[1].hub.position.y + .03);
      const orientation = model.wheels[0].hub.rotationQuaternion!.clone();
      visual.updateSuspension(.1, solver, [50, 50, 50, 50]);
      expect(model.wheels[0].hub.rotationQuaternion!.equals(orientation)).toBe(true);
      expect(model.wheels[0].socket.parent).not.toBe(model.wheels[0].hub);
      expect(model.wheels[0].hub.rotationQuaternion!.y).toBeLessThan(0);
    } finally { scene.dispose(); engine.dispose(); }
  });
  it('mirrors camber and toe: both tops lean inward and both fronts point inward', async () => {
    const engine = new NullEngine(), scene = new Scene(engine);
    try {
      const model = await VehicleModel.load(scene, BANWA_DALAGAN_1996, new Uint8Array(readFileSync('public/model/banwa_dalagan_1996_modular.glb')));
      const visual = VehicleVisual.wrap(model), solver = new SuspensionSolver(baseline, createSuspension(baseline));
      solver.saved.setup.corners.forEach(c => { c.camber = -3 * Math.PI / 180; c.toe = .5 * Math.PI / 180; });
      solver.preview(1 / 60);
      visual.updateSuspension(.1, solver, [20, 20, 20, 20]);
      const axes = (i: number) => {
        const q = model.wheels[i].hub.rotationQuaternion!;
        return { up: Vector3.Up().rotateByQuaternionToRef(q, new Vector3()), forward: Vector3.Forward().rotateByQuaternionToRef(q, new Vector3()) };
      };
      for (const [left, right] of [[0, 1], [2, 3]]) {
        const l = axes(left), r = axes(right);
        expect(l.up.x).toBeGreaterThan(.01); expect(r.up.x).toBeLessThan(-.01);
        expect(l.up.x).toBeCloseTo(-r.up.x, 4);
        expect(l.forward.x).toBeGreaterThan(0); expect(r.forward.x).toBeLessThan(0);
        expect(l.forward.x).toBeCloseTo(-r.forward.x, 4);
      }
    } finally { scene.dispose(); engine.dispose(); }
  });
});
