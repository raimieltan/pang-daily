import { describe, it, expect, vi } from 'vitest';
import { ServerPersistence, type ServerPlayerRepository } from './ServerPersistence';
import { runtimeBootstrap } from '@/lib/player/runtimeBootstrap';
import type { PlayerBootstrap, CommandReceipt } from '@pang-daily/contracts';
import { BANWA_DALAGAN_1996 as car } from '@/game-core/vehicles/catalog';
import { VehicleSession } from '@/game-core/maintenance/VehicleSession';
import { InventorySession } from '@/game-core/inventory/InventorySession';
import { JobSession } from '@/game-core/jobs/JobSession';
import { HUB_JOBS } from '@/game-core/jobs/catalog';
import { createSocialState } from '@/game-core/social/SocialSession';
import { SOCIAL_CONTENT } from '@/game-core/social/catalog';
const carId = '10000000-0000-4000-8000-000000000001';
function setup() {
  const dto: PlayerBootstrap = { bootstrapVersion: 1, saveVersion: 2, contentVersion: 'm3-content-1', revision: '0',
    profile: { id: '20000000-0000-4000-8000-000000000001', displayName: 'Test', activeVehicleId: carId }, economy: { balanceCentavos: '500000', revision: '1' },
    vehicles: [{ id: carId, definitionId: car.id, condition: structuredClone(car.condition.typical), conditionRevision: '0', fuelLiters: 45, paint: '#123456', rideHeightM: 0, stockSpoilerRemoved: false }],
    inventory: { revision: '0', parts: [], installed: [] }, social: { state: createSocialState(SOCIAL_CONTENT), rivals: [] }, progression: { jobs: [], recentRaces: [], unlockedLocations: [], chapters: [] } };
  const initial = runtimeBootstrap(dto), wallet = new VehicleSession(initial.vehicles), inventory = new InventorySession(initial.inventory), jobs = new JobSession(wallet, HUB_JOBS, initial.jobs);
  const receipt: CommandReceipt = { resourceId: carId, transactionId: null, sequence: null, amountCentavos: '0', balanceCentavos: '500000', details: {} };
  const repository: ServerPlayerRepository = { command: vi.fn(async () => receipt), bootstrap: vi.fn(async () => structuredClone(dto)), marketplace: vi.fn(async () => []) };
  const report = vi.fn(), gateway = new ServerPersistence(repository, runtimeBootstrap, initial, wallet, inventory, jobs, report);
  wallet.usePersistence(gateway); inventory.usePersistence(gateway);
  return { dto, wallet, inventory, jobs, repository, gateway, report, receipt };
}
describe('server-confirmed runtime persistence', () => {
  it('rejects all local money and ownership mutations in authenticated sessions', () => {
    const { wallet, inventory } = setup();
    expect(wallet.earn(9999, { kind: 'cheat', source: 'test', description: 'No' })).toHaveProperty('rejected');
    expect(wallet.spend(1, { kind: 'purchase', source: 'test', description: 'No' })).toHaveProperty('rejected');
    expect(inventory.add({ partId: 'used_coilovers_01', condition: .8, origin: { kind: 'grant', reason: 'No' } })).toHaveProperty('rejected');
    expect(wallet.snapshot().walletPhp).toBe(5000); expect(inventory.items()).toEqual([]);
  });
  it('does not publish a successful purchase before server confirmation and coalesces duplicate clicks', async () => {
    const { dto, wallet, repository, gateway, receipt } = setup();
    let confirm!: (value: CommandReceipt) => void;
    vi.mocked(repository.command).mockImplementationOnce(() => new Promise(resolve => { confirm = resolve; }));
    const intent = { type: 'part_purchase', definitionId: 'new_stock_clutch', operationTag: 'same-quote' };
    const first = gateway.execute(intent), duplicate = gateway.execute(intent);
    expect(first).toBe(duplicate);
    await vi.waitFor(() => expect(repository.command).toHaveBeenCalledOnce());
    expect(wallet.snapshot().walletPhp).toBe(5000);
    dto.economy = { balanceCentavos: '400000', revision: '2' }; confirm(receipt);
    await first; expect(wallet.snapshot().walletPhp).toBe(4000);
    expect(vi.mocked(repository.command).mock.calls[0][0]).not.toHaveProperty('operationTag');
  });
  it('lost server response is retried with the same key and never adds a local reward', async () => {
    const { wallet, repository, gateway } = setup();
    vi.mocked(repository.command).mockRejectedValueOnce(new TypeError('Network disconnected'));
    const action = { type: 'part_purchase', definitionId: 'new_stock_clutch' };
    await expect(gateway.execute(action)).rejects.toThrow('Network disconnected');
    expect(wallet.snapshot().walletPhp).toBe(5000);
    await gateway.execute(action);
    expect(vi.mocked(repository.command).mock.calls[0][1]).toBe(vi.mocked(repository.command).mock.calls[1][1]);
  });
  it('failed bootstrap after commit retries hydration without sending a second purchase', async () => {
    const { repository, gateway } = setup();
    vi.mocked(repository.bootstrap).mockRejectedValueOnce(new Error('Read failed'));
    const action = { type: 'vehicle_appearance', vehicleId: car.id, paint: '#abcdef' };
    await expect(gateway.execute(action)).rejects.toThrow('Read failed');
    await gateway.execute(action);
    expect(repository.command).toHaveBeenCalledOnce();
    expect(vi.mocked(repository.command).mock.calls[0][0]).toMatchObject({ vehicleId: carId });
  });
  it('driving stays responsive during a checkpoint and keeps additional wear incurred while waiting', async () => {
    const { dto, wallet, repository, gateway } = setup();
    const before = wallet.summary(car).condition.engine;
    wallet.wear(car, { engine: .01, transmission: 0, suspension: 0, brakes: 0, tires: 0 });
    vi.mocked(repository.command).mockImplementationOnce(async action => {
      expect(action.type).toBe('vehicle_checkpoint');
      if (action.type !== 'vehicle_checkpoint') throw new Error('Wrong operation');
      dto.vehicles[0].condition = structuredClone(action.condition); dto.vehicles[0].conditionRevision = '1';
      wallet.wear(car, { engine: .02, transmission: 0, suspension: 0, brakes: 0, tires: 0 });
      return { resourceId: carId, transactionId: null, sequence: null, amountCentavos: '0', balanceCentavos: '500000', details: {} };
    });
    await gateway.execute({ type: 'vehicle_appearance', vehicleId: car.id, paint: '#abcdef' });
    expect(wallet.summary(car).condition.engine).toBeCloseTo(before - .03, 8);
    expect(vi.mocked(repository.command).mock.calls[0][0]).toMatchObject({ vehicleId: carId, revision: '0' });
  });
  it('a lost checkpoint response is recovered before later commands and does not block race settlement', async () => {
    const { repository, gateway } = setup();
    const network = new TypeError('Lost checkpoint response');
    vi.mocked(repository.command).mockRejectedValueOnce(network);
    const checkpoint = { type: 'race_checkpoint', attemptId: '30000000-0000-4000-8000-000000000001', checkpointIndex: 1, elapsedMs: 1000 };
    await expect(gateway.execute(checkpoint)).rejects.toThrow('Lost checkpoint response');
    await gateway.execute({ type: 'race_checkpoint', attemptId: checkpoint.attemptId, checkpointIndex: 2, elapsedMs: 2000 });
    await gateway.execute({ type: 'race_complete', attemptId: checkpoint.attemptId, elapsedMs: 3000, finish: true });
    const calls = vi.mocked(repository.command).mock.calls;
    expect(calls.map(call => call[0].type)).toEqual(['race_checkpoint','race_checkpoint','race_checkpoint','race_complete']);
    expect(calls[0][1]).toBe(calls[1][1]);
  });
  it('a committed repair with failed hydration is recovered before unsaved driving loss is checkpointed', async () => {
    const { dto, wallet, repository, gateway, receipt } = setup();
    vi.mocked(repository.command).mockImplementationOnce(async () => { dto.vehicles[0].condition.engine = 1; dto.vehicles[0].conditionRevision = '1'; return receipt; });
    vi.mocked(repository.bootstrap).mockRejectedValueOnce(new Error('Reload unavailable'));
    const action = { type: 'vehicle_repair', vehicleId: car.id, components: ['engine'] };
    await expect(gateway.execute(action)).rejects.toThrow('Reload unavailable');
    wallet.wear(car, { engine: .02, transmission: 0, suspension: 0, brakes: 0, tires: 0 });
    await gateway.execute(action);
    expect(repository.command).toHaveBeenCalledOnce();
    expect(wallet.summary(car).condition.engine).toBeCloseTo(.98, 8);
  });
  it('a refused purchase is not retried automatically when money later becomes available', async () => {
    const { repository, gateway } = setup();
    vi.mocked(repository.command).mockRejectedValueOnce(Object.assign(new Error('Not enough money'), { status: 409 }));
    await expect(gateway.execute({ type: 'part_purchase', definitionId: 'new_stock_clutch' })).rejects.toThrow('Not enough money');
    gateway.checkpoint(); await new Promise(resolve => setTimeout(resolve, 0));
    expect(repository.command).toHaveBeenCalledOnce();
  });
});
