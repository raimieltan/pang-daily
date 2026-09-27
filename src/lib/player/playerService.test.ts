import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerBootstrap } from '@pang-daily/contracts';
import { playerApi } from './playerApi';
import { playerService } from './playerService';
import { usePlayerMetaStore } from '@/state/playerMetaStore';
import { BANWA_DALAGAN_1996 as car } from '@/game-core/vehicles/catalog';
import { createSocialState } from '@/game-core/social/SocialSession';
import { VehicleSession } from '@/game-core/maintenance/VehicleSession';
import { InventorySession } from '@/game-core/inventory/InventorySession';
import { JobSession } from '@/game-core/jobs/JobSession';
import { HUB_JOBS } from '@/game-core/jobs/catalog';
vi.mock('./playerApi', () => ({ playerApi: { bootstrap: vi.fn(), command: vi.fn(), marketplace: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn() } }));
function fixture(revision = '1'): PlayerBootstrap {
  const vehicleId = '10000000-0000-4000-8000-000000000001';
  return { bootstrapVersion: 1, saveVersion: 2, contentVersion: 'm3-content-1', revision,
    profile: { id: '20000000-0000-4000-8000-000000000001', displayName: 'Test', activeVehicleId: vehicleId },
    economy: { balanceCentavos: '500000', revision },
    vehicles: [{ id: vehicleId, definitionId: car.id, condition: structuredClone(car.condition.typical), conditionRevision: '0', fuelLiters: 30, paint: '#123456', rideHeightM: 0, stockSpoilerRemoved: false }],
    inventory: { revision: '0', parts: [], installed: [] }, social: { state: createSocialState(), rivals: [] },
    progression: { jobs: [], recentRaces: [], unlockedLocations: [{ unlockId: 'test', locationId: 'hub' }], chapters: [] } };
}
beforeEach(() => { vi.resetAllMocks(); usePlayerMetaStore.setState({ player: null }); });
describe('player service canonical hydration', () => {
  it('hydrates all meta state using one bootstrap and no browser progression reads', async () => {
    vi.mocked(playerApi.bootstrap).mockResolvedValue(fixture());
    const loaded = await playerService.bootstrap();
    expect(loaded.bootstrap.vehicles.walletPhp).toBe(5000);
    expect(usePlayerMetaStore.getState().player).toMatchObject({ displayName: 'Test', revision: '1', unlocks: [{ id: 'test', locationId: 'hub' }] });
    expect(playerApi.bootstrap).toHaveBeenCalledOnce();
    expect(playerApi.command).not.toHaveBeenCalled();
  });
  it('reload reconstructs state from the backend instead of the previous in-memory snapshot', async () => {
    vi.mocked(playerApi.bootstrap).mockResolvedValueOnce(fixture());
    await playerService.bootstrap();
    usePlayerMetaStore.setState({ player: null });
    const fresh = fixture('2'); fresh.economy.balanceCentavos = '300000';
    vi.mocked(playerApi.bootstrap).mockResolvedValueOnce(fresh);
    const loaded = await playerService.bootstrap();
    expect(loaded.bootstrap.vehicles.walletPhp).toBe(3000);
    expect(usePlayerMetaStore.getState().player?.revision).toBe('2');
  });
  it('rejects older bootstrap responses and leaves newer canonical state intact', async () => {
    vi.mocked(playerApi.bootstrap).mockResolvedValueOnce(fixture('10')).mockResolvedValueOnce(fixture('9'));
    await playerService.bootstrap();
    await expect(playerService.bootstrap()).rejects.toThrow('older save');
    expect(usePlayerMetaStore.getState().player?.revision).toBe('10');
  });
  it('does not hydrate an aborted or failed bootstrap', async () => {
    const abort = new AbortController(); abort.abort();
    vi.mocked(playerApi.bootstrap).mockResolvedValueOnce(fixture()).mockRejectedValueOnce(new Error('Offline'));
    await expect(playerService.bootstrap(abort.signal)).rejects.toThrow('Aborted');
    await expect(playerService.bootstrap()).rejects.toThrow('Offline');
    expect(usePlayerMetaStore.getState().player).toBeNull();
  });
  it('publishes confirmed mutations to meta and runtime together and reports failed saves', async () => {
    vi.mocked(playerApi.bootstrap).mockResolvedValue(fixture());
    const { bootstrap: initial } = await playerService.bootstrap();
    const wallet = new VehicleSession(initial.vehicles), inventory = new InventorySession(initial.inventory);
    const jobs = new JobSession(wallet, HUB_JOBS, initial.jobs), report = vi.fn(), refresh = vi.fn();
    const persistence = playerService.persistence({ initial, wallet, inventory, jobs, report, refresh });
    const intent = { type: 'vehicle_appearance', vehicleId: car.id, paint: '#abcdef' };
    vi.mocked(playerApi.command).mockRejectedValueOnce(new Error('Offline'));
    await expect(persistence.execute(intent)).rejects.toThrow('Offline');
    expect(report).toHaveBeenCalledWith('Offline');
    expect(refresh).not.toHaveBeenCalled();
    expect(usePlayerMetaStore.getState().player?.revision).toBe('1');
    vi.mocked(playerApi.command).mockResolvedValue({ resourceId: null, transactionId: null, sequence: null, amountCentavos: '0', balanceCentavos: '500000', details: {} });
    const fresh = fixture('2'); fresh.vehicles[0].paint = '#abcdef';
    vi.mocked(playerApi.bootstrap).mockResolvedValue(fresh);
    await persistence.execute(intent);
    expect(vi.mocked(playerApi.command).mock.calls[0][1]).toBe(vi.mocked(playerApi.command).mock.calls[1][1]);
    expect(inventory.snapshot().appearance[car.id].paint).toBe('#abcdef');
    expect(usePlayerMetaStore.getState().player?.runtime.inventory.appearance[car.id].paint).toBe('#abcdef');
    expect(report).toHaveBeenLastCalledWith(null);
  });
});

it('prevents a signed-out runtime from issuing mutations against a later session', async () => {
  vi.mocked(playerApi.bootstrap).mockResolvedValue(fixture());
  const { bootstrap: initial } = await playerService.bootstrap();
  const wallet = new VehicleSession(initial.vehicles), inventory = new InventorySession(initial.inventory);
  const jobs = new JobSession(wallet, HUB_JOBS, initial.jobs);
  const persistence = playerService.persistence({ initial, wallet, inventory, jobs, report: vi.fn(), refresh: vi.fn() });
  await playerService.logout();
  expect(usePlayerMetaStore.getState().player).toBeNull();
  await playerService.bootstrap();
  await expect(persistence.execute({ type: 'vehicle_appearance', vehicleId: car.id, paint: '#abcdef' })).rejects.toThrow('session has ended');
  expect(playerApi.command).not.toHaveBeenCalled();
});

it('does not clear a rejected save error just because an idle checkpoint succeeds', async () => {
  vi.mocked(playerApi.bootstrap).mockResolvedValue(fixture());
  const { bootstrap: initial } = await playerService.bootstrap();
  const wallet = new VehicleSession(initial.vehicles), inventory = new InventorySession(initial.inventory);
  const jobs = new JobSession(wallet, HUB_JOBS, initial.jobs), report = vi.fn();
  const persistence = playerService.persistence({ initial, wallet, inventory, jobs, report, refresh: vi.fn() });
  vi.mocked(playerApi.command).mockRejectedValue(Object.assign(new Error('Purchase refused'), { status: 409 }));
  await expect(persistence.execute({ type: 'part_purchase', definitionId: 'new_stock_clutch' })).rejects.toThrow('Purchase refused');
  persistence.checkpoint();
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(report).toHaveBeenLastCalledWith('Purchase refused');
  expect(playerApi.command).toHaveBeenCalledOnce();
});

it('leaves legacy data untouched on failed bootstrap and retires it only after server hydration', async () => {
  const values = new Map([['pang-daily.vehicle-session.v1', '{broken']]);
  const local = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); } };
  const session = { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() };
  vi.stubGlobal('window', { localStorage: local, sessionStorage: session });
  try {
    vi.mocked(playerApi.bootstrap).mockRejectedValueOnce(new Error('Offline'));
    await expect(playerService.bootstrap()).rejects.toThrow('Offline');
    expect(values.has('pang-daily.vehicle-session.v1')).toBe(true);
    expect(values.has('pang-daily.server-transition.v1')).toBe(false);
    vi.mocked(playerApi.bootstrap).mockResolvedValue(fixture());
    const loaded = await playerService.bootstrap();
    expect(loaded.bootstrap.vehicles.walletPhp).toBe(5000);
    expect(values.has('pang-daily.vehicle-session.v1')).toBe(false);
    expect(values.has('pang-daily.server-transition.v1')).toBe(true);
    expect(playerApi.command).not.toHaveBeenCalled();
  } finally { vi.unstubAllGlobals(); }
});
