import { afterEach, describe, expect, it, vi } from 'vitest';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { BANWA_DALAGAN_1996 as car } from '../../game-core/vehicles';
import { VehicleSession } from '../../game-core/maintenance/VehicleSession';
import type { WearSample } from '../../game-core/maintenance/condition';
import { GameBridge } from '../bridge';
import { InteractionSystem } from '../interaction/InteractionSystem';
import { interactablesFromZones } from '../interaction/Interaction';
import { HUB_LAYOUT } from '../world/hub/hubLayout';
import { MaintenanceSystem } from './MaintenanceSystem';
import { talyerRejection } from './talyerAccess';
import type { PlayerMode } from '../player/PlayerMode';
import { bindMaintenanceStore, useMaintenanceStore } from '../../state/maintenanceStore';

const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).reverse().forEach(fn => fn()); });
function setup(session = new VehicleSession()) {
  const bridge = new GameBridge();
  const focus = { mode: 'walking' as PlayerMode, position: new Vector3(16, 0, 157) };
  const position = new Vector3(16, 0, 158);
  let racing = false;
  const sample: WearSample = { speedMps: 0, throttle: .8, brake: .2, slip: .3, handbrake: 0, grounded: true, racing: false };
  const vehicle = { definition: { spec: car }, impactSerial: 0, impactStrength: 0, setCondition: vi.fn(),
    hoodOpen: false, setHoodOpen(open: boolean) { this.hoodOpen = open; },
    maintenanceSample: (race: boolean) => ({ ...sample, racing: race }) };
  const interactions = new InteractionSystem(bridge.runtime, focus, [() => interactablesFromZones(HUB_LAYOUT.chunks.flatMap(c => c.zones))]);
  const unbind = bindMaintenanceStore(bridge.ui.events);
  const system = new MaintenanceSystem(bridge.runtime, session, vehicle, () => focus.mode === 'driving', () => racing,
    { interactions, rejection: () => talyerRejection({ mode: focus.mode, player: focus.position, car: position, speedKmh: Math.abs(sample.speedMps) * 3.6, racing }) });
  const rejected: string[] = [];
  bridge.ui.events.on('commandRejected', ({ reason }) => rejected.push(reason));
  cleanups.push(() => { system.dispose(); interactions.dispose(); unbind(); bridge.dispose(); });
  return { system, session, commands: bridge.ui.commands, focus, position, sample, vehicle, rejected, setRacing: (value: boolean) => { racing = value; } };
}

describe('driving → talyer → payment bridge loop', () => {
  it('opens the hood only during an authorized inspection and closes it on dismissal, departure or disposal', () => {
    const s = setup();
    s.setRacing(true); s.commands.inspectVehicle();
    expect(s.vehicle.hoodOpen).toBe(false);
    s.setRacing(false); s.commands.inspectVehicle();
    expect(s.vehicle.hoodOpen).toBe(true);
    s.commands.dismissRepair();
    expect(s.vehicle.hoodOpen).toBe(false);
    s.commands.inspectVehicle();
    s.focus.position.x = 70; s.system.update(.1);
    expect(s.vehicle.hoodOpen).toBe(false);
    s.focus.position.x = 16; s.commands.inspectVehicle();
    expect(s.vehicle.hoodOpen).toBe(true);
    s.system.dispose();
    expect(s.vehicle.hoodOpen).toBe(false);
  });
  it('wears during driving, inspects using F interaction and repairs selected systems', () => {
    const s = setup(); const before = s.session.summary(car);
    s.focus.mode = 'driving'; s.sample.speedMps = 25; s.setRacing(true);
    for (let i = 0; i < 600; i++) s.system.update(.1);
    expect(useMaintenanceStore.getState().summary!.condition.engine).toBeLessThan(before.condition.engine);
    s.setRacing(false); s.focus.mode = 'walking'; s.sample.speedMps = 0;
    s.commands.interact();
    const quote = useMaintenanceStore.getState().quote!;
    expect(quote.lines).toHaveLength(5);
    const cost = quote.lines.find(line => line.component === 'brakes')!.costPhp;
    const oldEngine = s.session.summary(car).condition.engine;
    s.commands.repairVehicle(quote.id, ['brakes']);
    expect(useMaintenanceStore.getState().summary).toMatchObject({ walletPhp: 5000 - cost, condition: { brakes: 1, engine: oldEngine } });
    expect(useMaintenanceStore.getState().receipt?.costPhp).toBe(cost);
    s.commands.repairVehicle(quote.id, ['brakes']);
    expect(s.session.summary(car).walletPhp).toBe(5000 - cost);
    expect(s.rejected).toHaveLength(1);
  });
  it('keeps wear across car recovery/scene replacement and flushes partial seconds on dispose', () => {
    const s = setup(); s.focus.mode = 'driving'; s.sample.speedMps = 20;
    s.system.update(.4); s.system.dispose();
    const saved = s.session.summary(car);
    expect(saved.condition.tires).toBeLessThan(car.condition.typical.tires);
    const replacement = setup(s.session);
    expect(replacement.vehicle.setCondition).toHaveBeenLastCalledWith(saved.condition);
    expect(replacement.session.summary(car)).toEqual(saved);
  });
  it('does not wear a parked car and applies each impact only once', () => {
    const s = setup(); const before = s.session.summary(car);
    s.system.update(10); expect(s.session.summary(car)).toEqual(before);
    s.vehicle.impactSerial++; s.vehicle.impactStrength = .8; s.system.update(.1);
    const damaged = s.session.summary(car);
    expect(damaged.condition.suspension).toBeLessThan(before.condition.suspension);
    s.system.update(.1); expect(s.session.summary(car)).toEqual(damaged);
  });
  it('blocks remote repairs, race-time inspection and stale quotes without charging', () => {
    const s = setup(); s.commands.inspectVehicle(); const quote = useMaintenanceStore.getState().quote!;
    s.position.x = 100; s.commands.repairVehicle(quote.id, ['tires']);
    expect(useMaintenanceStore.getState().quote).toBeNull(); expect(s.session.summary(car).walletPhp).toBe(5000);
    s.position.x = 16; s.setRacing(true); s.commands.inspectVehicle(); expect(useMaintenanceStore.getState().quote).toBeNull();
    s.setRacing(false); s.commands.inspectVehicle(); const stale = useMaintenanceStore.getState().quote!;
    s.vehicle.impactSerial++; s.vehicle.impactStrength = .5; s.system.update(.1);
    s.commands.repairVehicle(stale.id, ['tires']);
    expect(s.rejected.at(-1)).toContain('Condition changed'); expect(s.session.summary(car).walletPhp).toBe(5000);
    s.focus.position.x = 70; s.system.update(.1); expect(useMaintenanceStore.getState().quote).toBeNull();
  });
});
