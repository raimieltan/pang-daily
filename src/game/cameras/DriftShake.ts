/** Short, damped lateral camera impulse; zero after the impact frame. */
export function driftShake(age: number, strength: number): number {
  if (age <= 0 || age >= .3 || strength <= 0) return 0;
  const falloff = (1 - age / .3) ** 2;
  return Math.sin(age * 100) * falloff * Math.min(1, strength) * .045;
}
