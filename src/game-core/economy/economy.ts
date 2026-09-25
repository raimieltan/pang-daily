import { z } from 'zod';

/** PHP at public boundaries; integer centavos for all balance arithmetic. */
export function centavos(php: number): number {
  const value = Math.round(php * 100);
  if (!Number.isFinite(php) || !Number.isSafeInteger(value) || Math.abs(value / 100 - php) > 1e-8)
    throw new Error('Money must be a finite amount with at most two decimal places.');
  return value;
}
export const moneySchema = z.number().nonnegative().refine(v => {
  try { centavos(v); return true; } catch { return false; }
});
export const transactionSchema = z.object({
  id: z.number().int().positive(), timestamp: z.string().datetime(), kind: z.string().min(1),
  amountPhp: z.number().refine(v => { try { return centavos(v) !== 0; } catch { return false; } }),
  balanceBeforePhp: moneySchema, balancePhp: moneySchema,
  description: z.string().min(1), source: z.string().min(1), relatedEntityId: z.string().optional(),
  vehicleId: z.string().nullable(), components: z.array(z.enum(['engine', 'transmission', 'brakes', 'suspension', 'tires'])),
});
export type Transaction = z.infer<typeof transactionSchema>;
export type MoneySource = Pick<Transaction, 'kind' | 'description' | 'source' | 'relatedEntityId'>;
export const FUEL_CAPACITY_LITERS = 45;
/** Arcade tuning, not a live fuel-price feed. */
export const FUEL_PRICE_PHP_PER_LITER = 65;
export type FuelRequest = { liters: number } | { targetLiters: number } | { budgetPhp: number };
export type FuelEstimate = { liters: number; costPhp: number; pricePhpPerLiter: number };
export function quoteFuel(current: number, request: FuelRequest): FuelEstimate | { rejected: string } {
  const requested = 'liters' in request ? request.liters : 'targetLiters' in request ? request.targetLiters - current : request.budgetPhp / FUEL_PRICE_PHP_PER_LITER;
  if (!Number.isFinite(requested) || requested <= 0) return { rejected: 'Choose a positive fuel quantity or budget.' };
  const liters = Math.floor(Math.min(requested, FUEL_CAPACITY_LITERS - current) * 1000 + 1e-9) / 1000;
  const costPhp = Math.round(liters * FUEL_PRICE_PHP_PER_LITER * 100) / 100;
  if (liters <= 0 || costPhp <= 0) return { rejected: 'Tank is full or quantity is too small.' };
  return { liters, costPhp, pricePhpPerLiter: FUEL_PRICE_PHP_PER_LITER };
}
/** Extend this catalog as future service gameplay is added. These expenses do not simulate component repairs. */
export const MAINTENANCE_SERVICES = { oil_change: { label: 'Oil change', costPhp: 900 }, fluids: { label: 'Fluid service', costPhp: 350 }, tune_up: { label: 'Tune-up', costPhp: 1200 } } as const;
export type MaintenanceService = keyof typeof MAINTENANCE_SERVICES;

/** Arcade consumption: 0.2 L/km, up to 50% extra under full throttle; no idle tax. */
export function drivingFuelLiters(speedMps: number, throttle: number, dt: number): number {
  if (![speedMps, throttle, dt].every(Number.isFinite) || dt <= 0) return 0;
  return Math.abs(speedMps) * dt / 1000 * .2 * (1 + Math.max(0, Math.min(1, throttle)) * .5);
}
