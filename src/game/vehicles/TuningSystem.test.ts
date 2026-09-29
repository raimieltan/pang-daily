import { afterEach, expect, it } from 'vitest';
import { GameBridge } from '../bridge';
import { InventorySession } from '../../game-core/inventory/InventorySession';
import { VehicleSession } from '../../game-core/maintenance/VehicleSession';
import { TUNE_LABOR_PHP, type TuneId } from '../../game-core/tuning/tunes';
import { RWD_BOX_SEDAN, STARTER_HATCH, STARTER_SEDAN } from './VehicleDefinition';
import { TuningSystem, type TuningView } from './TuningSystem';

const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).reverse().forEach(off => off()));

function setup(definition = RWD_BOX_SEDAN, saved?: unknown) {
  const bridge = new GameBridge(), inventory = new InventorySession(saved), session = new VehicleSession();
  let rejection: string | null = null;
  const applied: TuneId[] = [], errors: string[] = [];
  const state: { view: TuningView | null } = { view: null };
  bridge.ui.events.on('tuningState', view => { state.view = view; });
  bridge.ui.events.on('commandRejected', ({ reason }) => errors.push(reason));
  const vehicle = { id: definition.spec.id, definition, useTune: (tune: TuneId) => { applied.push(tune); } };
  const system = new TuningSystem(bridge.runtime, inventory, session, vehicle, () => rejection);
  cleanup.push(() => bridge.dispose(), () => system.dispose());
  return { bridge, inventory, session, applied, errors, state, reject: (why: string | null) => { rejection = why; } };
}

it('switches street → drift → street at Tito Jun, charging labor each time and saving per car', async () => {
  const s = setup();
  const cash = s.session.summary(RWD_BOX_SEDAN.spec).walletPhp;
  expect(s.applied.at(-1)).toBe('street');
  expect(s.state.view?.options.map(o => o.id)).toEqual(['street', 'drift']);
  s.bridge.ui.commands.setVehicleTune('drift'); await Promise.resolve();
  expect(s.inventory.tune(RWD_BOX_SEDAN.spec.id)).toBe('drift');
  expect(s.applied.at(-1)).toBe('drift');
  s.bridge.ui.commands.setVehicleTune('street'); await Promise.resolve();
  expect(s.applied.at(-1)).toBe('street');
  expect(s.session.summary(RWD_BOX_SEDAN.spec).walletPhp).toBe(cash - 2 * TUNE_LABOR_PHP);
  // Re-selecting the current tune is free and refused.
  s.bridge.ui.commands.setVehicleTune('street'); await Promise.resolve();
  expect(s.errors.at(-1)).toMatch(/already runs/);
  expect(s.session.summary(RWD_BOX_SEDAN.spec).walletPhp).toBe(cash - 2 * TUNE_LABOR_PHP);
});

it('restores the saved tune on load and only changes it at the talyer', async () => {
  const first = setup();
  first.bridge.ui.commands.setVehicleTune('drift'); await Promise.resolve();
  const reloaded = setup(RWD_BOX_SEDAN, first.inventory.snapshot());
  expect(reloaded.applied.at(-1)).toBe('drift');
  reloaded.reject('Park at the talyer first.');
  reloaded.bridge.ui.commands.setVehicleTune('street'); await Promise.resolve();
  expect(reloaded.errors.at(-1)).toBe('Park at the talyer first.');
  expect(reloaded.inventory.tune(RWD_BOX_SEDAN.spec.id)).toBe('drift');
});

it('gives every drivable car, FWD included, a distinct street and drift preset', () => {
  for (const car of [STARTER_SEDAN, STARTER_HATCH, RWD_BOX_SEDAN]) expect(car.tunes.drift).not.toBe(car.tunes.street);
  const fwd = setup(STARTER_HATCH);
  expect(fwd.state.view?.drivetrain).toBe('FWD');
});
