import { EARLY_ECONOMY } from '../../game-core/economy/balance';
import { afterEach, expect, it, vi } from 'vitest';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { GameBridge } from '../bridge';
import { VehicleSession } from '../../game-core/maintenance/VehicleSession';
import { BANWA_DALAGAN_1996 as car } from '../../game-core/vehicles';
import { InteractionSystem } from '../interaction/InteractionSystem';
import { interactablesFromZones } from '../interaction/Interaction';
import { HUB_LAYOUT } from '../world/hub/hubLayout';
import { FuelSystem } from './FuelSystem';
import { MaintenanceSystem } from './MaintenanceSystem';
import { fuelRejection } from './fuelAccess';
import { bindMaintenanceStore, useMaintenanceStore } from '../../state/maintenanceStore';
import type { PlayerMode } from '../player/PlayerMode';
import { drivingFuelLiters } from '../../game-core/economy/economy';

const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).reverse().forEach(off => off()));
function setup() {
  const bridge = new GameBridge(), session = new VehicleSession(); session.consumeFuel(car, 10);
  const focus = { position: new Vector3(12.5, 0, 19), mode: 'walking' as PlayerMode };
  const position = new Vector3(10, 0, 19);
  const sample = { speedMps: 0, throttle: 1, brake: 0, slip: 0, handbrake: 0, grounded: true, racing: false };
  const vehicle = { definition: { spec: car }, performanceStats: { fuelConsumption: 1 }, impactSerial: 0, impactStrength: 0, maintenanceSample: () => sample, setCondition: vi.fn(), setFuelAvailable: vi.fn() };
  const zones = interactablesFromZones(HUB_LAYOUT.chunks.flatMap(c => c.zones));
  const interactions = new InteractionSystem(bridge.runtime, focus, [() => zones]);
  const unbind = bindMaintenanceStore(bridge.ui.events);
  const maintenance = new MaintenanceSystem(bridge.runtime, session, vehicle, () => focus.mode === 'driving');
  const fuel = new FuelSystem(bridge.runtime, session, car, { interactions, rejection: () => fuelRejection({ mode: focus.mode, player: focus.position, car: position, speedKmh: sample.speedMps * 3.6, racing: sample.racing, fuelLiters: session.summary(car).fuelLiters }, zones) });
  const errors: string[] = []; bridge.ui.events.on('commandRejected', e => errors.push(e.reason));
  cleanup.push(() => { fuel.dispose(); maintenance.dispose(); interactions.dispose(); unbind(); bridge.dispose(); });
  return { bridge, commands: bridge.ui.commands, session, focus, position, sample, fuel, maintenance, vehicle, errors };
}
it('opens an authored pump, quotes, pays once, publishes and restores fuel', () => {
  const s = setup(); s.commands.interact();
  expect(useMaintenanceStore.getState().fuelOpen).toBe(true);
  s.commands.quoteFuel({ budgetPhp: 130 });
  const quote = useMaintenanceStore.getState().fuelQuote!;
  expect(quote).toMatchObject({ liters: 2, costPhp: 130 });
  s.commands.purchaseFuel(quote.id); s.commands.purchaseFuel(quote.id);
  expect(s.session.summary(car)).toMatchObject({ fuelLiters: 37, walletPhp: 4870 });
  expect(useMaintenanceStore.getState().fuelReceipt).toEqual({ liters: 2, costPhp: 130 });
  expect(s.session.snapshot().transactions.filter(t => t.kind === 'fuel_purchase')).toHaveLength(1);
  expect(new VehicleSession(s.session.snapshot()).summary(car)).toEqual(s.session.summary(car));
});
it('rejects remote commands, moving cars, races, unaffordable and stale purchases', () => {
  const s = setup(); s.commands.quoteFuel({ liters: 2 }); expect(useMaintenanceStore.getState().fuelQuote).toBeNull();
  s.commands.interact(); s.commands.quoteFuel({ liters: 2 });
  const quote = useMaintenanceStore.getState().fuelQuote!;
  s.session.spend(5000, { kind: 'fee', description: 'Test', source: 'test' });
  const before = s.session.snapshot(); s.commands.purchaseFuel(quote.id); expect(s.session.snapshot()).toEqual(before);
  s.sample.speedMps = 2; s.commands.purchaseFuel(quote.id); expect(useMaintenanceStore.getState().fuelOpen).toBe(false);
  s.sample.speedMps = 0; s.sample.racing = true; s.commands.interact(); expect(useMaintenanceStore.getState().fuelOpen).toBe(false);
  s.sample.racing = false; s.commands.interact(); s.commands.quoteFuel({ liters: 2 });
  s.focus.position.x = 100; s.fuel.update(); expect(useMaintenanceStore.getState().fuelOpen).toBe(false);
  expect(s.session.snapshot()).toEqual(before);
});
it('requires the car nearby and a current fuel quantity, and dismisses cleanly', () => {
  const s = setup(); s.position.x = 40; s.commands.interact(); expect(useMaintenanceStore.getState().fuelOpen).toBe(false);
  s.position.x = 10; s.commands.interact(); s.commands.quoteFuel({ targetLiters: 45 });
  const quote = useMaintenanceStore.getState().fuelQuote!;
  s.session.refuel(car, { liters: 1 });
  const before = s.session.snapshot(); s.commands.purchaseFuel(quote.id); expect(s.session.snapshot()).toEqual(before);
  s.commands.dismissFuel(); expect(useMaintenanceStore.getState().fuelOpen).toBe(false);
});
it('consumes by distance in either direction, flushes on disposal and restores engine availability', () => {
  expect(drivingFuelLiters(-20, 1, 60)).toBeCloseTo(.36);
  expect(drivingFuelLiters(20, 1, 1 / 60) * 60).toBeCloseTo(drivingFuelLiters(20, 1, 1));
  const s = setup(); s.maintenance.update(5); expect(s.session.summary(car).fuelLiters).toBe(35);
  s.focus.mode = 'driving'; s.sample.speedMps = 20; s.maintenance.update(.5); s.maintenance.dispose();
  expect(s.session.summary(car).fuelLiters).toBeCloseTo(34.997);
});
it('cuts engine drive on depletion and restores it after refueling', () => {
  const s = setup(); s.session.consumeFuel(car, 34.999); s.focus.mode = 'driving'; s.sample.speedMps = 20;
  s.maintenance.update(.5); expect(s.vehicle.setFuelAvailable).toHaveBeenLastCalledWith(false);
  s.maintenance.update(.5); expect(s.session.summary(car).fuelLiters).toBe(0);
  s.session.refuel(car, { liters: 1 }); expect(s.vehicle.setFuelAvailable).toHaveBeenLastCalledWith(true);
});

it('uses final performance fuel consumption while preserving the stock distance/load calculation', () => {
  const s = setup(); s.focus.mode = 'driving'; s.sample.speedMps = 20;
  s.vehicle.performanceStats.fuelConsumption = 1.5;
  s.maintenance.update(.5); s.maintenance.dispose();
  expect(s.session.summary(car).fuelLiters).toBeCloseTo(35 - drivingFuelLiters(20, 1, .5) * 1.5);
});

it('sells a capped paid reserve can for a stranded empty car, with no duplicate charge', () => {
  const s = setup(); s.session.consumeFuel(car, 35); s.position.set(2200, 100, 3000);
  s.commands.interact();
  expect(useMaintenanceStore.getState().fuelOpen).toBe(true);
  s.commands.quoteFuel({ liters: 45 });
  const quote = useMaintenanceStore.getState().fuelQuote!;
  expect(quote.liters).toBe(EARLY_ECONOMY.recovery.reserveCanMaxLiters);
  const before = s.session.snapshot().walletPhp;
  s.commands.purchaseFuel(quote.id); s.commands.purchaseFuel(quote.id);
  expect(s.session.summary(car).fuelLiters).toBe(quote.liters);
  expect(s.session.snapshot().walletPhp).toBe(before - quote.costPhp);
  expect(s.session.snapshot().transactions.filter(tx => tx.kind === 'fuel_purchase')).toHaveLength(1);
  s.fuel.update(); expect(useMaintenanceStore.getState().fuelOpen).toBe(false);
});
