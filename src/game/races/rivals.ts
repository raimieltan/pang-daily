import { bodyPart } from '@/game-core/exterior';
import { NPC_CAR_BUILDS, npcCarId, type NpcCarBuildId } from '@/game-core/exterior/npcBuilds';
import { calculateVehiclePerformance } from '@/game-core/performance/calculator';
import { getVehicleDefinition } from '@/game-core/vehicles';
import { NO_MODIFIERS } from '@/game-core/vehicles/vehicleStats';
import { physicalWheelModifiers, wheelModifiers, wheelPart, wheelSetup } from '@/game-core/wheels';
import { STOCK_SETUP, type WheelSetup } from '@/game-core/tires';

export type RaceTier = 1 | 2 | 3 | 4 | 5;
export type RaceRival = {
  npcId?: string; vehicleId?: string;
  name: string; paint: string; build: NpcCarBuildId; tier: RaceTier;
  /** Paid once per win. */
  prizePhp: number;
};

/**
 * The build's stats. `physical` leaves out the wheel set's grip and braking, which the physics
 * gets per corner from `rivalWheelSetup` through the simulated tires.
 */
export function rivalBuildStats(buildId: NpcCarBuildId | null, { physical = false } = {}) {
  const build = buildId ? NPC_CAR_BUILDS[buildId] : undefined;
  const spec = getVehicleDefinition(npcCarId(build));
  const set = build && 'wheels' in build ? wheelPart(build.wheels) : undefined;
  const listed = set ? wheelModifiers(spec, set) : NO_MODIFIERS;
  const wheels = physical ? physicalWheelModifiers(listed) : listed;
  const panelsKg = (build?.parts ?? []).reduce((kg, entry) => kg + (bodyPart(entry.id)?.effects.weightKg ?? 0), 0);
  const performance = build && 'performance' in build ? build.performance : [];
  const installed = performance.map((p, i) => ({ id: `${buildId}-${i}`, partId: p.id, condition: p.condition }));
  return calculateVehiclePerformance(spec, installed, undefined, { modifiers: { ...wheels, addedWeightKg: wheels.addedWeightKg + panelsKg } }).stats;
}

/** The build's road wheel set for its simulated tires (fresh rubber: rivals don't carry tread wear). */
export function rivalWheelSetup(buildId: NpcCarBuildId | null): WheelSetup {
  const build = buildId ? NPC_CAR_BUILDS[buildId] : undefined;
  const set = build && 'wheels' in build ? wheelPart(build.wheels) : undefined;
  return { ...STOCK_SETUP, ...wheelSetup(set ?? null) };
}

export function rival(data: RaceRival): RaceRival { return data; }
