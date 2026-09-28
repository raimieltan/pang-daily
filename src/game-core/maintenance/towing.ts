/** A tow moves the car to the talyer. Repairs and fuel are charged separately. */
export const TOW_COST_PHP = 3500;
export const FREE_TOW_TRUST = 60;

export function towCostPhp(towCount: number, mangJunTrust: number): number {
  return towCount === 0 && mangJunTrust >= FREE_TOW_TRUST ? 0 : TOW_COST_PHP;
}
