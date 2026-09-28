import { bodyPart } from '@/game-core/exterior';
import { NPC_CAR_BUILDS, npcCarId, type NpcCarBuildId } from '@/game-core/exterior/npcBuilds';
import { calculateVehiclePerformance } from '@/game-core/performance/calculator';
import { getVehicleDefinition } from '@/game-core/vehicles';
import { NO_MODIFIERS } from '@/game-core/vehicles/vehicleStats';
import { wheelModifiers, wheelPart } from '@/game-core/wheels';

export type RaceTier = 1 | 2 | 3 | 4 | 5;
export type RaceRival = {
  npcId?: string; vehicleId?: string;
  name: string; paint: string; build: NpcCarBuildId; tier: RaceTier;
  /** Paid once per win. */
  prizePhp: number;
};

export function rivalBuildStats(buildId: NpcCarBuildId | null) {
  const build = buildId ? NPC_CAR_BUILDS[buildId] : undefined;
  const spec = getVehicleDefinition(npcCarId(build));
  const set = build && 'wheels' in build ? wheelPart(build.wheels) : undefined;
  const wheels = set ? wheelModifiers(spec, set) : NO_MODIFIERS;
  const panelsKg = (build?.parts ?? []).reduce((kg, entry) => kg + (bodyPart(entry.id)?.effects.weightKg ?? 0), 0);
  const performance = build && 'performance' in build ? build.performance : [];
  const installed = performance.map((p, i) => ({ id: `${buildId}-${i}`, partId: p.id, condition: p.condition }));
  return calculateVehiclePerformance(spec, installed, undefined, { modifiers: { ...wheels, addedWeightKg: wheels.addedWeightKg + panelsKg } }).stats;
}

export function rival(data: RaceRival): RaceRival { return data; }
