import { describe, expect, it } from 'vitest';
import { VehicleSession } from '../maintenance/VehicleSession';
import { BANWA_DALAGAN_1996 as car } from '../vehicles';
import { loadVehicleSession } from '../../game/maintenance/sessionStorage';
import { quoteFuel } from './economy';

const source = { kind: 'job_payment', description: 'Delivery', source: 'job' };
describe('authoritative economy', () => {
  it('earns and spends exact centavos with a complete contiguous ledger', () => {
    const session = new VehicleSession();
    expect(session.earn(100.25, source)).toMatchObject({ amountPhp: 100.25, balanceBeforePhp: 5000, balancePhp: 5100.25 });
    expect(session.spend(50.15, { ...source, kind: 'parts_purchase' })).toMatchObject({ amountPhp: -50.15, balanceBeforePhp: 5100.25, balancePhp: 5050.1 });
    const tx = session.snapshot().transactions;
    expect(tx.map(t => t.id)).toEqual([1, 2, 3]);
    expect(tx[2]).toMatchObject({ timestamp: expect.any(String), description: 'Delivery', source: 'job' });
    expect(new VehicleSession(session.snapshot()).snapshot()).toEqual(session.snapshot());
  });
  it('does not expose mutable ledger entries', () => {
    const session = new VehicleSession();
    const receipt = session.earn(1, source);
    if ('rejected' in receipt) throw new Error(receipt.rejected);
    receipt.balancePhp = 0;
    expect(session.snapshot().transactions.at(-1)?.balancePhp).toBe(5001);
  });
  it('rejects invalid amounts and insufficient funds without changing state', () => {
    const session = new VehicleSession(), before = session.snapshot();
    for (const amount of [0, -1, NaN, Infinity, .001, 1e20]) {
      expect(session.earn(amount, source)).toHaveProperty('rejected');
      expect(session.spend(amount, source)).toHaveProperty('rejected');
    }
    expect(session.spend(5001, source)).toHaveProperty('rejected');
    expect(session.snapshot()).toEqual(before);
  });
  it('quotes liters, target quantity and PHP budgets with a capacity cap', () => {
    expect(quoteFuel(20, { liters: 2 })).toMatchObject({ liters: 2, costPhp: 130 });
    expect(quoteFuel(20, { targetLiters: 25 })).toMatchObject({ liters: 5, costPhp: 325 });
    expect(quoteFuel(20, { budgetPhp: 130 })).toMatchObject({ liters: 2, costPhp: 130 });
    expect(quoteFuel(44, { liters: 10 })).toMatchObject({ liters: 1, costPhp: 65 });
  });
  it('persists fuel, service expenses and ledger together', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); } };
    const session = loadVehicleSession(storage);
    session.consumeFuel(car, 10);
    expect(session.refuel(car, { liters: 2 })).toMatchObject({ costPhp: 130 });
    expect(session.summary(car).fuelLiters).toBe(37);
    expect(session.service(car, 'oil_change')).toMatchObject({ kind: 'maintenance', amountPhp: -900 });
    expect(loadVehicleSession(storage).snapshot()).toEqual(session.snapshot());
  });
  it('does not apply fuel or repairs when payment fails', () => {
    const session = new VehicleSession(); session.consumeFuel(car, 10); session.spend(5000, source);
    const quote = session.quote(car), before = session.snapshot();
    expect(session.refuel(car, { liters: 2 })).toHaveProperty('rejected');
    expect(session.repair(car, quote, ['engine'])).toHaveProperty('rejected');
    expect(session.service(car, 'fluids')).toHaveProperty('rejected');
    expect(session.snapshot()).toEqual(before);
  });
  it('calculates repairs and publishes payment and repaired condition atomically', () => {
    const session = new VehicleSession(), quote = session.quote(car);
    expect(quote.totalPhp).toBe(quote.lines.reduce((sum, line) => sum + line.costPhp, 0));
    const cost = quote.lines.find(line => line.component === 'brakes')!.costPhp;
    let observed = 0;
    session.subscribe(() => { observed++; expect(session.summary(car).condition.brakes).toBe(1); expect(session.snapshot().walletPhp).toBe(5000 - cost); });
    expect(session.repair(car, quote, ['brakes'])).toMatchObject({ costPhp: cost });
    expect(observed).toBe(1);
  });
  it('migrates legacy saves and rejects ledger tampering', () => {
    const session = new VehicleSession(); session.ensureVehicle(car);
    const snapshot = session.snapshot();
    const legacy = { ...snapshot, version: 1, vehicles: { [car.id]: { condition: snapshot.vehicles[car.id].condition, revision: 0 } }, transactions: snapshot.transactions.map(({ id, kind, amountPhp, balancePhp, vehicleId, components }) => ({ id, kind, amountPhp, balancePhp, vehicleId, components })) };
    expect(new VehicleSession(legacy).summary(car)).toMatchObject({ walletPhp: 5000, fuelLiters: 45 });
    snapshot.walletPhp = 9000;
    expect(new VehicleSession(snapshot).snapshot().walletPhp).toBe(5000);
  });
});
