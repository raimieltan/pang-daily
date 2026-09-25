import { expect, it } from 'vitest';
import { BANWA_DALAGAN_1996 as car } from '../../game-core/vehicles';
import { loadVehicleSession, VEHICLE_SESSION_KEY } from './sessionStorage';
import { impactWear } from '../../game-core/maintenance/condition';
it('restores money, wear and repairs when the runtime is recreated in the same tab', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const first = loadVehicleSession(storage);
  first.wear(car, impactWear(.7)); first.repair(car, first.quote(car), ['brakes', 'tires']);
  expect(loadVehicleSession(storage).snapshot()).toEqual(first.snapshot());
  values.set(VEHICLE_SESSION_KEY, '{broken');
  expect(loadVehicleSession(storage).summary(car).walletPhp).toBe(5000);
});
it('keeps in-memory repairs valid when storage is unavailable', () => {
  const session = loadVehicleSession({ getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } });
  const quote = session.quote(car);
  expect(session.repair(car, quote, ['tires'])).not.toHaveProperty('rejected');
  expect(session.summary(car).condition.tires).toBe(1);
});
