import { readFileSync } from 'node:fs';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { describe, expect, it } from 'vitest';
import { BANWA_SILAK_1983 } from '@/game-core/vehicles';
import { parkedPlayerCars, playerCar } from './VehicleDefinition';
import { resolveHandlingPreset } from './handling/HandlingConfig';
import { HANDLING_PRESETS } from './handling/presets';
import { ArcadeHandlingModel } from './handling/ArcadeHandlingModel';
import { VehicleModel } from './VehicleModel';

describe('Lancer inspired modular RWD car', () => {
  it('selects a distinct RWD runtime with matching chassis and rear drive', () => {
    const car = playerCar('banwa_silak_1983');
    expect(car.spec).toBe(BANWA_SILAK_1983);
    const config = resolveHandlingPreset(HANDLING_PRESETS, car.handlingPreset);
    expect(config.drive.drivetrain).toBe('RWD');
    expect(config.chassis.frontWeight).toBe(car.spec.weight.frontWeightRatio);
    expect(config.chassis.massKg).toBe(car.spec.weight.curbKg);
    expect(car.collision.wheels.frontZ - car.collision.wheels.rearZ).toBe(car.spec.dimensions.wheelbaseM);
  });

  it('can accelerate on rear contact alone but not front contact alone', () => {
    const config = resolveHandlingPreset(HANDLING_PRESETS, playerCar('banwa_silak_1983').handlingPreset);
    const rear = new ArcadeHandlingModel(config);
    const front = new ArcadeHandlingModel(config);
    for (let i = 0; i < 120; i++) {
      rear.step(1 / 120, { throttle: 1, brake: 0, steer: 0 }, { front: 0, rear: 1 });
      front.step(1 / 120, { throttle: 1, brake: 0, steer: 0 }, { front: 1, rear: 0 });
    }
    expect(rear.state.vx).toBeGreaterThan(1);
    expect(front.state.vx).toBeCloseTo(0);
  });

  it('keeps both other cars available at home and respects account ownership', () => {
    const driven = playerCar('banwa_dalagan_1996');
    expect(parkedPlayerCars(driven).map(c => c.spec.id)).toEqual(['hiraya_kidlat_1997', 'banwa_silak_1983']);
    expect(parkedPlayerCars(driven, ['banwa_dalagan_1996'])).toEqual([]);
    expect(parkedPlayerCars(driven, ['banwa_dalagan_1996', 'banwa_silak_1983']).map(c => c.spec.id)).toEqual(['banwa_silak_1983']);
  });

  it('imports the exported GLB with working panel slots, paint and axle pivots', async () => {
    const engine = new NullEngine(); const scene = new Scene(engine);
    try {
      const bytes = new Uint8Array(readFileSync('public/model/lancer/lancer_box_1983_modular.glb'));
      const model = await VehicleModel.load(scene, BANWA_SILAK_1983, bytes);
      expect(model.warnings).toEqual([]);
      expect(model.stats.triangles).toBeLessThan(30000);
      expect(model.stats.drawCalls).toBeLessThanOrEqual(100);
      expect([...model.attachments.keys()]).toEqual(BANWA_SILAK_1983.visual.model.attachments.map(a => a.slot));
      for (const wheel of model.wheels) {
        wheel.hub.computeWorldMatrix(true);
        expect(wheel.radius).toBeCloseTo(.3, 3);
        expect(wheel.hub.getAbsolutePosition().y).toBeCloseTo(.3, 3);
      }
      const hood = scene.getNodeByName('hood_stock')!;
      const engineNode = scene.getNodeByName('engine_stock')!;
      hood.setEnabled(false);
      expect(engineNode.isEnabled()).toBe(true);
      const fender = scene.getNodeByName('fender_fl_stock')!;
      fender.setEnabled(false);
      expect(scene.getNodeByName('indicator_1')!.isEnabled()).toBe(false);
      expect(scene.getNodeByName('shell_base')!.isEnabled()).toBe(true);
      expect(scene.getMaterialByName('paint')).toBeTruthy();
      expect(scene.getNodeByName('rwd_prop_shaft')).toBeTruthy();
      expect(scene.getNodeByName('rwd_rear_axle')).toBeTruthy();
    } finally { scene.dispose(); engine.dispose(); }
  });
});
