import { describe, expect, it } from 'vitest';
import { TireSession, performStep, puncture, stepAssembly, stockVehicleTires, tireCheckpointRejection, type VehicleTireState } from '.';

const clone = (s: VehicleTireState) => structuredClone(s);

describe('tire checkpoint validation', () => {
  it('stock sets are deterministic, so client and server agree on ids', () => {
    expect(stockVehicleTires('car')).toEqual(stockVehicleTires('car'));
    expect(new TireSession().exportVehicle('car')).toEqual(stockVehicleTires('car'));
  });

  it('accepts driving damage and roadside wheel moves', () => {
    const tires = new TireSession();
    const before = tires.exportVehicle('car');
    puncture(tires.mounted('car', 'FL')!, 'SLOW_LEAK');
    stepAssembly(tires.mounted('car', 'FL')!, 120, 15, 'asphalt');
    for (const [step, corner] of [['loosen', 'FL'], ['raise', 'FL'], ['remove', 'FL'], ['stow', null], ['take_spare', null], ['install', 'FL']] as const)
      performStep(tires, 'car', step, corner, { speedKmh: 0 });
    expect(tireCheckpointRejection(before, tires.exportVehicle('car'))).toBeNull();
  });

  it('refuses healing, new wheels, new tools and duplicated wheels', () => {
    const before = stockVehicleTires('car');
    puncture(before.assemblies[before.car.corners.FL!], 'BLOWOUT');
    const heal = clone(before); Object.assign(heal.assemblies[heal.car.corners.FL!], { failure: 'HEALTHY', pressureKpa: 220, health: 1 });
    expect(tireCheckpointRejection(before, heal)).toMatch(/cannot/);
    const noTools = clone(before); noTools.car.jack = false;
    expect(tireCheckpointRejection(before, noTools)).toBeNull();
    const toolsBack = clone(noTools); toolsBack.car.jack = true;
    expect(tireCheckpointRejection(noTools, toolsBack)).toBe('Tools cannot appear outside a service.');
    const extra = clone(before); extra.car.trunk.push('car#99'); extra.assemblies['car#99'] = { ...before.assemblies[before.car.spare!], id: 'car#99' };
    expect(tireCheckpointRejection(before, extra)).toBe('Wheels cannot appear or disappear outside a service.');
    const twice = clone(before); twice.car.corners.FR = twice.car.corners.FL;
    expect(tireCheckpointRejection(before, twice)).toBe('A wheel is in two places at once.');
    const donut = clone(before); donut.assemblies[donut.car.corners.RR!].spec = 'donut';
    expect(tireCheckpointRejection(before, donut)).toBe('A tire changed type outside a service.');
  });
});

describe('server-synced TireSession', () => {
  function server() {
    const sent: { type: string; [key: string]: unknown }[] = [];
    let revision = 0;
    return { sent, remote: { execute: async (action: { type: string; [key: string]: unknown }) => {
      sent.push(structuredClone(action));
      return { details: { tireRevision: String(++revision) } as Record<string, string | number | boolean | null> };
    } } };
  }

  it('loads confirmed tires, checkpoints failures at once and routine changes on an interval', async () => {
    const saved = stockVehicleTires('car');
    puncture(saved.assemblies[saved.car.corners.RL!], 'BLOWOUT');
    let clock = 0;
    const tires = new TireSession(undefined, undefined, () => clock);
    const { sent, remote } = server();
    tires.useServer(remote, { car: { revision: '7', state: saved } });
    expect(tires.mounted('car', 'RL')!.failure).toBe('BLOWOUT');
    puncture(tires.mounted('car', 'FL')!, 'SLOW_LEAK');
    tires.save({ urgent: true });
    await tires.flush();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ type: 'vehicle_tires', vehicleId: 'car', revision: '7' });
    // Routine drift waits for the interval; the next push carries the server's new revision.
    stepAssembly(tires.mounted('car', 'FL')!, 5, 10, 'asphalt');
    clock = 5; tires.save(); await tires.flush();
    expect(sent).toHaveLength(2);
    expect(sent[1]).toMatchObject({ revision: '1' });
    clock = 10; stepAssembly(tires.mounted('car', 'FL')!, 5, 10, 'asphalt'); tires.save();
    await Promise.resolve();
    expect(sent).toHaveLength(2);
    clock = 40; tires.save();
    await tires.flush();
    expect(sent).toHaveLength(3);
    // Unchanged state is never resent.
    await tires.flush();
    expect(sent).toHaveLength(3);
  });

  it('applies a server-priced service result', async () => {
    const tires = new TireSession();
    const fixed = stockVehicleTires('car');
    puncture(tires.mounted('car', 'FL')!, 'BLOWOUT');
    type Details = Record<string, string | number | boolean | null>;
    tires.useServer({ execute: async (action): Promise<{ details: Details }> => action.type === 'tire_service'
      ? { details: { tireRevision: '9', tires: JSON.stringify(fixed) } } : { details: { tireRevision: '8' } } }, {});
    await tires.service('car', `tire:${fixed.car.corners.FL}`);
    expect(tires.mounted('car', 'FL')!.failure).toBe('HEALTHY');
  });
});
