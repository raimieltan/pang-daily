/**
 * Tire specs and the surfaces they roll on. Numbers are scales on the handling model's own
 * tire: a standard tire at nominal pressure on asphalt is exactly 1 / 1 / 0.
 */
export const TIRE_SPECS = {
  standard: {
    label: 'Road tire', gripScale: 1, slipScale: 1, rollingResistance: 0, nominalKpa: 220,
    /** No advisory limit. */
    recommendedMaxKph: null, overspeedWearPerKm: 0, puncturePenalty: 1,
  },
  donut: {
    label: 'Space-saver spare', gripScale: .78, slipScale: 1.3, rollingResistance: .006, nominalKpa: 420,
    /** Printed on the sidewall. Advisory only: going faster wears it out, nothing caps the car. */
    recommendedMaxKph: 80, overspeedWearPerKm: .12, puncturePenalty: 1.6,
  },
} as const;
export type TireSpecId = keyof typeof TIRE_SPECS;
export const TIRE_SPEC_IDS = Object.keys(TIRE_SPECS) as TireSpecId[];

export const TIRE_SURFACES = ['asphalt', 'concrete', 'tile', 'dirt', 'grass', 'gravel', 'wet_asphalt', 'mud'] as const;
export type TireSurface = (typeof TIRE_SURFACES)[number];

/** Friction, extra rolling drag (share of load) and puncture risk per km for each surface. */
export const SURFACE_TIRE: Record<TireSurface, { grip: number; rolling: number; hazardPerKm: number }> = {
  asphalt: { grip: 1, rolling: 0, hazardPerKm: 0 },
  wet_asphalt: { grip: .70, rolling: 0, hazardPerKm: 0 },
  mud: { grip: .25, rolling: .04, hazardPerKm: .005 },
  concrete: { grip: 1, rolling: 0, hazardPerKm: 0 },
  tile: { grip: .9, rolling: 0, hazardPerKm: 0 },
  dirt: { grip: .55, rolling: .01, hazardPerKm: .01 },
  grass: { grip: .35, rolling: .02, hazardPerKm: .004 },
  gravel: { grip: .45, rolling: .015, hazardPerKm: .03 },
};

/** Grip lost at bald tread: the definition's `tires → grip` condition hooks, now applied per tire. */
export function treadGripLoss(definition: { condition: { effects: readonly { component: string; stat: string; maxLoss: number }[] } }) {
  const kept = definition.condition.effects.filter(e => e.component === 'tires' && e.stat === 'grip')
    .reduce((share, e) => share * (1 - e.maxLoss), 1);
  return 1 - kept;
}
