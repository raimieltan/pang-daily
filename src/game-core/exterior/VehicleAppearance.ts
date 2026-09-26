import { z } from 'zod';

/** Per-owned-car visual setup; ride height is metres relative to factory height. */
export const vehicleAppearanceSchema = z.strictObject({
  paint: z.string().regex(/^#[0-9a-f]{6}$/i),
  rideHeightM: z.number().min(-0.15).max(0.15),
});
export type VehicleAppearance = z.infer<typeof vehicleAppearanceSchema>;
