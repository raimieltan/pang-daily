import { z } from 'zod';
import { TUNE_LABOR_PHP } from '../economy/balance';

/**
 * Tito Jun's setup work: the same car, set up for the road or for sliding. A tune is saved per
 * car and never consumes parts, so the player can always ask for the other one back.
 */
export const TUNE_IDS = ['street', 'drift'] as const;
export const tuneIdSchema = z.enum(TUNE_IDS);
export type TuneId = z.infer<typeof tuneIdSchema>;
export const DEFAULT_TUNE: TuneId = 'street';
export { TUNE_LABOR_PHP };

type Layout = 'FWD' | 'RWD' | 'AWD';
export const TUNES: Record<TuneId, { label: string; description: Record<Layout, string> }> = {
  street: { label: 'Street', description: {
    FWD: 'Factory alignment and stability control. Predictable push, safe on a lift.',
    RWD: 'Soft throttle mid-corner and light traction control. Planted for the daily drive; slides only when you ask with the handbrake or a flick.',
    AWD: 'Factory alignment and traction control. Planted for the daily drive.',
  } },
  drift: { label: 'Drift', description: {
    FWD: 'Looser rear, stronger handbrake and less stability control. Lift off or pull the handbrake to swing the tail.',
    RWD: 'Locked-up diff, extra steering lock, traction control off and a sharp throttle. Holds angle on the gas.',
    AWD: 'Rear-biased feel, traction control off. Holds angle on the gas.',
  } },
};
