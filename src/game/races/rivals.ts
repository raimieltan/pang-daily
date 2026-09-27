import { bodyPart } from '@/game-core/exterior';
import { NPC_CAR_BUILDS, npcCarId, type NpcCarBuildId } from '@/game-core/exterior/npcBuilds';
import { calculateVehiclePerformance } from '@/game-core/performance/calculator';
import { getVehicleDefinition } from '@/game-core/vehicles';
import { NO_MODIFIERS } from '@/game-core/vehicles/vehicleStats';
import { wheelModifiers, wheelPart } from '@/game-core/wheels';
import { RIVAL_TUNING } from './Race';

export type RaceTier = 1 | 2 | 3 | 4 | 5;
export type RivalTuning = typeof RIVAL_TUNING;
export type RaceRival = {
  name: string; paint: string; build: NpcCarBuildId; tier: RaceTier;
  /** Paid once per win. */
  prizePhp: number;
  tuning: RivalTuning;
};

/** Driver commitment per tier: how hard they take corners and brake. The car sets the rest. */
export const TIER_SKILL: Readonly<Record<RaceTier, number>> = { 1: .88, 2: .96, 3: 1.04, 4: 1.12, 5: 1.2 };

function buildStats(buildId: NpcCarBuildId | null) {
  const build = buildId ? NPC_CAR_BUILDS[buildId] : undefined;
  const spec = getVehicleDefinition(npcCarId(build));
  const set = build && 'wheels' in build ? wheelPart(build.wheels) : undefined;
  const wheels = set ? wheelModifiers(spec, set) : NO_MODIFIERS;
  const panelsKg = (build?.parts ?? []).reduce((kg, entry) => kg + (bodyPart(entry.id)?.effects.weightKg ?? 0), 0);
  const performance = build && 'performance' in build ? build.performance : [];
  const installed = performance.map((p, i) => ({ id: `${buildId}-${i}`, partId: p.id, condition: p.condition }));
  return calculateVehiclePerformance(spec, installed, undefined, { modifiers: { ...wheels, addedWeightKg: wheels.addedWeightKg + panelsKg } }).stats;
}

const STOCK = buildStats(null);

/**
 * Kinematic pace from the rival's actual build and skill. Power-to-weight sets how hard they pull
 * out of corners, tyres and skill how fast they carry through them, brakes and skill how late they
 * brake. A stock Dalagan at tier 3 is roughly the original rival.
 */
export function rivalTuning(build: NpcCarBuildId, tier: RaceTier): RivalTuning {
  const stats = buildStats(build), skill = TIER_SKILL[tier];
  const powerToWeight = (stats.powerHp / stats.weightKg) / (STOCK.powerHp / STOCK.weightKg);
  return {
    speedScale: skill * Math.sqrt(stats.tireGrip / STOCK.tireGrip),
    acceleration: RIVAL_TUNING.acceleration * powerToWeight ** .85 * (.9 + .1 * skill),
    braking: RIVAL_TUNING.braking * (stats.brakeDecelerationMps2 / STOCK.brakeDecelerationMps2) * skill,
  };
}

export function rival(data: Omit<RaceRival, 'tuning'>): RaceRival {
  return { ...data, tuning: rivalTuning(data.build, data.tier) };
}
