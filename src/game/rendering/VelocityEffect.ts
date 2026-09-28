const START_KMH = 75;
const FULL_KMH = 155;

/** Shared nonlinear speed response for the camera and the final colour pass. */
export function velocityTarget(speedKmh: number): number {
  if (!Number.isFinite(speedKmh)) return 0;
  const t = Math.max(0, Math.min(1, (Math.abs(speedKmh) - START_KMH) / (FULL_KMH - START_KMH)));
  const smooth = t * t * (3 - 2 * t);
  return Math.pow(smooth, 2.5);
}

export class VelocityEnvelope {
  value = 0;

  step(dt: number, speedKmh: number, enabled = true): number {
    const target = enabled ? velocityTarget(speedKmh) : 0;
    const seconds = target > this.value ? 0.22 : 0.38;
    const frame = Math.max(0, Math.min(dt, 0.25));
    this.value += (target - this.value) * (1 - Math.exp(-frame / seconds));
    return this.value;
  }

  reset(): void { this.value = 0; }
}
