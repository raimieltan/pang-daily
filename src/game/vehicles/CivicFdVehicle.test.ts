import { readFileSync } from 'node:fs';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { describe, expect, it } from 'vitest';
import { getVehicleDefinition } from '@/game-core/vehicles';
import { bodyPart, resolveBodyPartLook } from '@/game-core/exterior';
import { BodyPartSwapper } from './BodyPartSwapper';
import { HOME_PARKED_BAYS, CAR_DEALER_DISPLAY_BAYS } from '../world/hub/hubLayout';
import { PLAYER_CARS, parkedPlayerCars, playerCar } from './VehicleDefinition';
import { ArcadeHandlingModel, type DriverInput } from './handling/ArcadeHandlingModel';
import { resolveHandlingPreset } from './handling/HandlingConfig';
import { HANDLING_PRESETS } from './handling/presets';
import { VehicleModel } from './VehicleModel';

const ID = 'hiraya_kidlat_fd_2007';
function car(speed = 70) {
  const runtime = playerCar(ID);
  expect(runtime.spec.id).toBe(ID); // A missing registration must not silently test the starter.
  const model = new ArcadeHandlingModel(resolveHandlingPreset(HANDLING_PRESETS, runtime.tunes.street));
  model.state.vx = speed / 3.6;
  return model;
}
function drive(model: ArcadeHandlingModel, seconds: number, input: DriverInput) {
  for (let i = 0; i < Math.round(seconds * 120); i++) model.step(1 / 120, input, { front: 1, rear: 1 });
  return model;
}

describe('Civic FD inspired sedan', () => {
  it('registers a selectable car with enough home and dealer spaces for the full fleet', () => {
    const runtime = playerCar(ID);
    expect(runtime.spec).toBe(getVehicleDefinition(ID));
    expect(HOME_PARKED_BAYS.length).toBeGreaterThanOrEqual(Object.keys(PLAYER_CARS).length - 1);
    expect(CAR_DEALER_DISPLAY_BAYS.length).toBeGreaterThanOrEqual(Object.keys(PLAYER_CARS).length);
    expect(parkedPlayerCars(playerCar(null), [ID]).map(c => c.spec.id)).toEqual([ID]);
    expect(parkedPlayerCars(playerCar(null), []).map(c => c.spec.id)).toEqual([]);
  });

  it('drives through front contact only', () => {
    const front = car(0), rear = car(0);
    for (let i = 0; i < 120; i++) {
      front.step(1 / 120, { throttle: 1, brake: 0, steer: 0 }, { front: 1, rear: 0 });
      rear.step(1 / 120, { throttle: 1, brake: 0, steer: 0 }, { front: 0, rear: 1 });
    }
    expect(front.state.vx).toBeGreaterThan(1);
    expect(rear.state.vx).toBeCloseTo(0);
  });

  it('stays planted at moderate speed and washes wide with excess throttle', () => {
    const calm = drive(car(40), 2, { throttle: .25, brake: 0, steer: .35 });
    expect(Math.abs(calm.diagnostics.understeer)).toBeLessThan(.15);
    const light = drive(car(), 1.5, { throttle: .1, brake: 0, steer: .7 });
    const heavy = drive(car(), 1.5, { throttle: 1, brake: 0, steer: .7 });
    expect(heavy.diagnostics.understeer).toBeGreaterThan(light.diagnostics.understeer + .05);
    expect(Math.abs(heavy.diagnostics.rearSlip)).toBeLessThan(8 * Math.PI / 180);
  });

  it('tightens the line under trail braking and progressive lift-off', () => {
    const coast = drive(car(65), .8, { throttle: 0, brake: 0, steer: .55 });
    const trail = drive(car(65), .8, { throttle: 0, brake: .3, steer: .55 });
    expect(trail.state.loadShift).toBeGreaterThan(coast.state.loadShift);
    expect(trail.state.yawRate / trail.state.vx).toBeGreaterThan(coast.state.yawRate / coast.state.vx);
    const lift = drive(car(75), 2, { throttle: .5, brake: 0, steer: .7 });
    const before = lift.diagnostics.understeer;
    drive(lift, .7, { throttle: 0, brake: 0, steer: .7 });
    expect(lift.diagnostics.understeer).toBeLessThan(before);
    expect(Math.abs(lift.diagnostics.rearSlip)).toBeLessThan(10 * Math.PI / 180);
  });

  it('rotates with the handbrake and recovers when the front wheels pull', () => {
    const model = drive(car(), .4, { throttle: 0, brake: 0, steer: .7, handbrake: true });
    expect(model.diagnostics.handbrakeEffect).toBeGreaterThan(.7);
    expect(model.state.yawRate).toBeGreaterThan(.4);
    drive(model, 2, { throttle: .65, brake: 0, steer: 0 });
    expect(Math.abs(model.diagnostics.rearSlip)).toBeLessThan(5 * Math.PI / 180);
    expect(Math.abs(model.state.yawRate)).toBeLessThan(.15);
  });

  it('imports the GLB and independently removes panels without removing the chassis or engine', async () => {
    const definition = getVehicleDefinition(ID);
    const engine = new NullEngine(), scene = new Scene(engine);
    try {
      const bytes = new Uint8Array(readFileSync(`public${definition.visual.model.url}`));
      const model = await VehicleModel.load(scene, definition, bytes);
      expect(model.warnings).toEqual([]);
      for (const slot of ['hood', 'bumper_front', 'bumper_rear', 'fender_fl', 'fender_fr', 'side_skirts', 'spoiler', 'side_mirrors', 'headlight_l', 'taillight_r', 'exhaust'] as const) {
        const point = model.attachments.get(slot)!;
        expect(point.stock).toBeTruthy();
        point.stock!.setEnabled(false);
        expect(scene.getNodeByName('shell_base')!.isEnabled()).toBe(true);
        expect(scene.getNodeByName('engine_stock')!.isEnabled()).toBe(true);
        point.stock!.setEnabled(true);
      }
      for (const wheel of model.wheels) {
        expect(wheel.radius).toBeCloseTo(.316, 3);
        expect(wheel.hub.position.y).toBeCloseTo(.316, 3);
      }
      model.setPaint('#cc2222');
      model.setRideHeight(-.04);
      expect(model.rideHeight).toBe(-.04);
    } finally { scene.dispose(); engine.dispose(); }
  });

  it('fits its carbon-look hood at the stock seams and restores the factory panel', async () => {
    const hood = bodyPart('fd_carbon_look_hood');
    expect(hood).toBeDefined();
    const definition = getVehicleDefinition(ID);
    const engine = new NullEngine(), scene = new Scene(engine);
    try {
      const model = await VehicleModel.load(scene, definition, new Uint8Array(readFileSync(`public${definition.visual.model.url}`)));
      const swapper = new BodyPartSwapper(scene, model, path => new Uint8Array(readFileSync(`public${path}`)));
      const socket = model.attachments.get('hood')!;
      const before = socket.stock!.getHierarchyBoundingVectors(true);
      const look = resolveBodyPartLook(hood!, { condition: 1, finish: 'fake_carbon', bodyColor: model.paint, vehicleTags: definition.tags });
      await swapper.equip('hood', { part: hood!, look });
      expect(socket.stock!.isEnabled()).toBe(false);
      const after = socket.mounted!.getHierarchyBoundingVectors(true);
      for (const axis of ['x', 'y', 'z'] as const) {
        expect(after.min[axis]).toBeCloseTo(before.min[axis], 4);
        expect(after.max[axis]).toBeCloseTo(before.max[axis], 4);
      }
      expect(scene.getNodeByName('engine_stock')!.isEnabled()).toBe(true);
      await swapper.equip('hood', null);
      expect(socket.stock!.isEnabled()).toBe(true);
      swapper.dispose();
    } finally { scene.dispose(); engine.dispose(); }
  });
});
