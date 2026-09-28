import { NPC_CAR_BUILDS, npcCarId } from '@/game-core/exterior/npcBuilds';
import { calculateVehiclePerformance } from '@/game-core/performance/calculator';
import { performanceHandling } from '../maintenance/conditionHandling';
import { playerCar } from '../vehicles/VehicleDefinition';
import { resolveHandlingPreset } from '../vehicles/handling/HandlingConfig';
import { HANDLING_PRESETS } from '../vehicles/handling/presets';
import type { RaceDefinition } from './Race';
import { buildRacingLine, carLimits } from './racingLine';
import { rivalBuildStats, rivalWheelSetup, type RaceTier } from './rivals';
import { STOCK_SETUP } from '@/game-core/tires';

/**
 * Share of the car's cornering and braking limit each tier drives at. The final tier
 * combines precise line tracking with a higher calibrated corner grip allowance.
 */
export const TIER_PACE: Readonly<Record<RaceTier, number>> = { 1: .8, 2: .85, 3: .89, 4: .92, 5: .97 };

/** The rival's own build and tune; anonymous races run a stock Dalagan. */
export function rivalCar(route: RaceDefinition) {
  const definition = playerCar(route.rival ? npcCarId(NPC_CAR_BUILDS[route.rival.build]) : null);
  const base = resolveHandlingPreset(HANDLING_PRESETS, definition.handlingPreset);
  const stock = calculateVehiclePerformance(definition.spec).stats;
  // `config` is the car as a whole (line planning); `physics` drives it, with the wheel set's grip
  // left to the simulated tires (`wheels`) so it isn't counted twice.
  const config = route.rival ? performanceHandling(base, stock, rivalBuildStats(route.rival.build)) : base;
  const physics = route.rival ? performanceHandling(base, stock, rivalBuildStats(route.rival.build, { physical: true })) : base;
  return { definition, config, physics, wheels: route.rival ? rivalWheelSetup(route.rival.build) : STOCK_SETUP };
}

/** Full-width minimum-time line and speed plan for this rival's car. */
export function rivalLine(route: RaceDefinition, config: ReturnType<typeof rivalCar>['config']) {
  const limits = carLimits(config, route.rival?.tier === 5 ? .7 : .6);
  const level = TIER_PACE[route.rival?.tier ?? 2];
  const margin = route.rival?.tier === 1 ? 2.4 : route.rival?.tier === 2 ? 2 : 1.8;
  return { limits, points: buildRacingLine(route.waypoints, limits, { level, margin }) };
}
