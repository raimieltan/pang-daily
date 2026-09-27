import { describe, expect, it } from 'vitest';
import type { PlayerBootstrap } from '@pang-daily/contracts';
import { BANWA_DALAGAN_1996 } from '@/game-core/vehicles/catalog';
import { VehicleSession } from '@/game-core/maintenance/VehicleSession';
import { InventorySession } from '@/game-core/inventory/InventorySession';
import { createSocialState, SocialSession } from '@/game-core/social/SocialSession';
import { SOCIAL_CONTENT } from '@/game-core/social/catalog';
import { runtimeBootstrap } from './runtimeBootstrap';

const vehicleId = '10000000-0000-4000-8000-000000000001';
const partId = '20000000-0000-4000-8000-000000000001';
function fixture(): PlayerBootstrap {
  return { bootstrapVersion: 1, saveVersion: 2, contentVersion: 'm3-content-1', revision: '0',
    profile: { id: '30000000-0000-4000-8000-000000000001', displayName: 'Test', activeVehicleId: vehicleId },
    economy: { balanceCentavos: '500123', revision: '17' },
    vehicles: [{ id: vehicleId, definitionId: BANWA_DALAGAN_1996.id, condition: BANWA_DALAGAN_1996.condition.typical,
      conditionRevision: '2', fuelLiters: 34.5, paint: '#123456', rideHeightM: -.03, stockSpoilerRemoved: true }],
    inventory: { revision: '0', parts: [], installed: [] }, social: { state: createSocialState(SOCIAL_CONTENT), rivals: [] },
    progression: { jobs: [], recentRaces: [], unlockedLocations: [], chapters: [] } };
}
describe('API bootstrap → game domain', () => {
  it('loads exact money and existing conditions without fabricating a grant or replaying historical ledger entries', () => {
    const dto = fixture();
    const state = runtimeBootstrap(dto);
    const session = new VehicleSession(state.vehicles);
    expect(session.snapshot().walletPhp).toBe(5001.23);
    expect(session.snapshot().transactions).toEqual([]);
    expect(session.summary(BANWA_DALAGAN_1996).fuelLiters).toBe(34.5);
    expect(session.earn(1.01, { kind: 'fixture', source: 'test', description: 'Test' })).toMatchObject({ id: 18, balancePhp: 5002.24 });
    expect(new VehicleSession(session.snapshot()).snapshot()).toEqual(session.snapshot());
    expect(state.instanceIdByDefinition[BANWA_DALAGAN_1996.id]).toBe(vehicleId);
    expect(new InventorySession(state.inventory).appearance(BANWA_DALAGAN_1996.id)).toEqual({ paint: '#123456', rideHeightM: -.03 });
    expect(new SocialSession(SOCIAL_CONTENT, state.social).snapshot()).toEqual(state.social);
  });
  it('maps multi-slot installation to one actual owned part and retains retired keys', () => {
    const dto = fixture();
    dto.inventory.parts.push({ id: partId, definitionId: 'used_coilovers_01', acquisitionKey: 'fixture-grant', condition: .8,
      revealedBy: 'known', finish: null, origin: 'grant', sourceReference: 'test', sellerId: null, paidCentavos: null, purchaseSequence: null,
      advertisedGrade: null, acquiredAt: new Date(0).toISOString(), retired: false });
    dto.inventory.installed.push({ ownedPartId: partId, vehicleId, slots: ['shocks','springs'] });
    const inventory = new InventorySession(runtimeBootstrap(dto).inventory);
    expect(inventory.installation(partId)).toEqual({ vehicleId: BANWA_DALAGAN_1996.id, slots: ['shocks','springs'] });
    dto.inventory.installed = [];
    dto.inventory.parts[0].retired = true;
    const retired = new InventorySession(runtimeBootstrap(dto).inventory);
    expect(retired.hasAcquisition('fixture-grant')).toBe(true);
    expect(retired.items()).toEqual([]);
  });
  it('fails explicitly for incompatible numeric values and duplicate definition instances', () => {
    const dto = fixture();
    dto.economy.balanceCentavos = '9007199254740992';
    expect(() => runtimeBootstrap(dto)).toThrow('numeric limits');
    dto.economy.balanceCentavos = '500000';
    dto.vehicles.push({ ...dto.vehicles[0], id: '10000000-0000-4000-8000-000000000002' });
    expect(() => runtimeBootstrap(dto)).toThrow('multiple copies');
  });
  it('rejects missing ownership or incomplete multi-slot state instead of silently resetting inventory', () => {
    const dto = fixture();
    dto.inventory.installed.push({ ownedPartId: partId, vehicleId, slots: ['shocks'] });
    expect(() => runtimeBootstrap(dto)).toThrow('ownership');
  });
});
