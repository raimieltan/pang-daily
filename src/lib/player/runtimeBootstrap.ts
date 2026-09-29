import type { PlayerBootstrap } from '@pang-daily/contracts';
import type { InventorySave, InventoryItem } from '@/game-core/inventory/InventorySession';
import type { JobSave } from '@/game-core/jobs/JobSession';
import { centavos } from '@/game-core/economy/economy';
import { partDefinition, type PartSlot } from '@/game-core/parts/parts';
import { DEFAULT_TUNE } from '@/game-core/tuning/tunes';

import type { RuntimeBootstrap } from '@/game-core/persistence/RuntimeBootstrap';
export type { RuntimeBootstrap } from '@/game-core/persistence/RuntimeBootstrap';
function safeInteger(value: string) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error('This save exceeds the current game client’s numeric limits.');
  return parsed;
}
function php(value: string) {
  const amount = safeInteger(value) / 100;
  if (centavos(amount) !== safeInteger(value)) throw new Error('This amount cannot be loaded exactly by this game client.');
  return amount;
}

/** Explicit API-to-domain adapter. UUID ownership remains available for later server commands. */
export function runtimeBootstrap(dto: PlayerBootstrap): RuntimeBootstrap {
  const instanceIdByDefinition: Record<string, string> = {};
  for (const vehicle of dto.vehicles) {
    if (instanceIdByDefinition[vehicle.definitionId]) throw new Error('This save needs a client supporting multiple copies of the same car.');
    instanceIdByDefinition[vehicle.definitionId] = vehicle.id;
  }
  const definitionByInstance = new Map(dto.vehicles.map(vehicle => [vehicle.id, vehicle.definitionId]));
  const activeDefinitionId = definitionByInstance.get(dto.profile.activeVehicleId);
  if (!activeDefinitionId) throw new Error('Your active car is missing from this save.');
  const items: InventoryItem[] = dto.inventory.parts.filter(part => !part.retired).map(part => {
    if (!partDefinition(part.definitionId)) throw new Error('This save contains an unknown part.');
    const paidPhp = part.paidCentavos ? php(part.paidCentavos) : 0;
    if (part.origin !== 'grant' && (!Number.isInteger(paidPhp) || paidPhp <= 0)) throw new Error('This purchase needs an updated game client.');
    if (part.origin === 'parts_shop' && (!part.purchaseSequence || safeInteger(part.purchaseSequence) < 1)) throw new Error('This purchase is missing its receipt.');
    if (part.origin === 'marketplace' && (!part.sellerId || !part.advertisedGrade)) throw new Error('This purchase is missing its seller details.');
    return { id: part.id, partId: part.definitionId, condition: part.condition, revealedBy: part.revealedBy,
      acquiredAt: Date.parse(part.acquiredAt), key: part.acquisitionKey, finish: part.finish,
      origin: part.origin === 'grant' ? { kind: 'grant', reason: part.sourceReference }
        : part.origin === 'marketplace' ? { kind: 'marketplace', listingId: part.sourceReference, sellerId: part.sellerId!, paidPhp, advertisedGrade: part.advertisedGrade! }
          : { kind: 'parts_shop', shopId: part.sourceReference, transactionId: part.purchaseSequence ? safeInteger(part.purchaseSequence) : 0, paidPhp } };
  });
  const installed: InventorySave['installed'] = {};
  for (const installation of dto.inventory.installed) {
    const vehicleId = definitionByInstance.get(installation.vehicleId);
    if (!vehicleId || !items.some(item => item.id === installation.ownedPartId)) throw new Error('Your installed part ownership is incomplete.');
    const part = partDefinition(items.find(item => item.id === installation.ownedPartId)!.partId)!;
    if (part.slots.length !== installation.slots.length || !part.slots.every(slot => installation.slots.includes(slot))) throw new Error('Your installed part slots are incomplete.');
    const slots = installed[vehicleId] ??= {};
    for (const slot of installation.slots) {
      if (slots[slot as PartSlot]) throw new Error('Your car has conflicting installed parts.');
      slots[slot as PartSlot] = installation.ownedPartId;
    }
  }
  const current = dto.progression.jobs.find(job => ['accepted', 'active'].includes(job.status));
  const history: JobSave['history'] = {};
  for (const job of dto.progression.jobs) {
    const counts = history[job.definitionId] ??= { completed: 0, failed: 0, abandoned: 0 };
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'abandoned') counts[job.status]++;
  }
  const jobSerial = Math.max(0, ...dto.progression.jobs.map(job => Number(job.runId.match(/#(\d+)$/)?.[1] ?? 0)));
  return {
    vehicles: { version: 2, walletPhp: php(dto.economy.balanceCentavos), towCount: dto.economy.towCount ?? 0, checkpoint: { balancePhp: php(dto.economy.balanceCentavos), sequence: safeInteger(dto.economy.revision) },
      transactions: [], vehicles: Object.fromEntries(dto.vehicles.map(vehicle => [vehicle.definitionId, { condition: vehicle.condition,
        revision: safeInteger(vehicle.conditionRevision), fuelLiters: vehicle.fuelLiters }])) },
    inventory: { version: 1, serial: items.length, items, installed,
      retiredKeys: dto.inventory.parts.filter(part => part.retired).map(part => part.acquisitionKey),
      appearance: Object.fromEntries(dto.vehicles.map(vehicle => [vehicle.definitionId, { paint: vehicle.paint, rideHeightM: vehicle.rideHeightM }])),
      stockSpoilerRemoved: Object.fromEntries(dto.vehicles.map(vehicle => [vehicle.definitionId, vehicle.stockSpoilerRemoved])),
      tunes: Object.fromEntries(dto.vehicles.map(vehicle => [vehicle.definitionId, vehicle.tune ?? DEFAULT_TUNE])) },
    jobs: { version: 1, serial: jobSerial, history, current: current ? { runId: current.runId, jobId: current.definitionId,
      status: current.status, objectiveIndex: current.objectiveIndex, elapsedSeconds: safeInteger(current.elapsedMs) / 1000,
      cargoLoaded: current.cargoLoaded, cargoDamage: current.cargoDamage, ...(current.reason ? { reason: current.reason } : {}) } : null },
    tires: Object.fromEntries(dto.vehicles.map(vehicle => [vehicle.definitionId, vehicle.tires ?? { revision: '0', state: null }])),
    social: dto.social.state, interruptedRaces: dto.progression.recentRaces.filter(race => race.outcome === 'started').map(race => ({ attemptId: race.attemptId, elapsedMs: safeInteger(race.lastCheckpointElapsedMs ?? '0') })), chapters: dto.progression.chapters, activeDefinitionId, ownedDefinitionIds: Object.keys(instanceIdByDefinition), instanceIdByDefinition,
  };
}
