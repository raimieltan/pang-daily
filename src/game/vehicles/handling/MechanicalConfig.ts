import { z } from 'zod';

const positive = z.number().positive();
const unit = z.number().min(0).max(1);
export const assistanceProfileSchema = z.enum(['assisted', 'standard', 'simulation', 'raw']);
export type AssistanceProfile = z.infer<typeof assistanceProfileSchema>;

/** SI mechanical parameters; no model IDs or device-specific physics. */
export const mechanicalConfigSchema = z.strictObject({
  engine: z.strictObject({
    torqueNm: positive, idleRpm: positive, redlineRpm: positive,
    peakTorqueRpm: positive, inertia: positive,
    gearRatios: z.array(positive).min(1), reverseRatio: positive,
    finalDrive: positive, efficiency: unit, clutchTorqueNm: positive,
    shiftSeconds: positive,
  }),
  differential: z.strictObject({ type: z.enum(['open', 'lsd', 'welded']), lock: unit, preloadNm: z.number().nonnegative() }),
  wheel: z.strictObject({ radiusM: positive, inertia: positive }),
  tire: z.strictObject({
    peakSlipRatio: positive, loadExponent: z.number().min(.8).max(.95),
    relaxationSeconds: positive, recoverySeconds: positive,
    ambientC: z.number(), optimalC: positive, overheatC: positive,
    heatCapacity: positive, coolingRate: positive, wearPerJoule: z.number().nonnegative(),
  }),
  suspension: z.strictObject({
    frontSpring: positive, rearSpring: positive, damping: positive,
    frontAntiRoll: z.number().nonnegative(), rearAntiRoll: z.number().nonnegative(),
    rideHeightOffsetM: z.number().min(-.2).max(.2),
    camberDeg: z.number().min(-10).max(10), toeDeg: z.number().min(-3).max(3), casterDeg: z.number().min(0).max(15),
  }),
  steering: z.strictObject({ roadAngleDeg: z.number().min(5).max(65), driftAngleDeg: z.number().min(5).max(65), rackRate: positive, rackAcceleration: positive, returnRate: positive }),
  assistance: assistanceProfileSchema,
  tcs: z.enum(['off', 'sport', 'on']),
  esc: z.boolean(),
  abs: z.boolean(),
});
export type MechanicalConfig = z.infer<typeof mechanicalConfigSchema>;

export const STOCK_MECHANICAL: MechanicalConfig = {
  engine: { torqueNm: 215, idleRpm: 850, redlineRpm: 6500, peakTorqueRpm: 3800, inertia: .24,
    gearRatios: [3.3, 2.05, 1.4, 1.03, .82], reverseRatio: 3.2, finalDrive: 3.9, efficiency: .87, clutchTorqueNm: 320, shiftSeconds: .18 },
  differential: { type: 'open', lock: 0, preloadNm: 0 },
  wheel: { radiusM: .3, inertia: 1.3 },
  tire: { peakSlipRatio: .12, loadExponent: .88, relaxationSeconds: .035, recoverySeconds: .22,
    ambientC: 25, optimalC: 75, overheatC: 115, heatCapacity: 18000, coolingRate: .018, wearPerJoule: 1.5e-9 },
  suspension: { frontSpring: 28000, rearSpring: 24000, damping: .75, frontAntiRoll: 10000, rearAntiRoll: 7000,
    rideHeightOffsetM: 0, camberDeg: -1, toeDeg: .05, casterDeg: 6 },
  steering: { roadAngleDeg: 34, driftAngleDeg: 34, rackRate: 7, rackAcceleration: 22, returnRate: 5.5 },
  assistance: 'standard', tcs: 'off', esc: false, abs: true,
};
