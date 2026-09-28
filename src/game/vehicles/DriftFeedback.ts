/** Discrete callouts from continuous slip. Keeps frame-rate physics out of React. */
export class DriftFeedback {
  private active = false;
  private recovery = 0;
  private duration = 0;
  private chain = 1;
  private maxAngleShown = false;

  reset(): void {
    this.active = false;
    this.recovery = 0;
    this.duration = 0;
    this.chain = 1;
    this.maxAngleShown = false;
  }

  step(dt: number, rawIntensity: number): string | null {
    const intensity = Number.isFinite(rawIntensity) ? Math.max(0, Math.min(1, rawIntensity)) : 0;
    const frame = Number.isFinite(dt) ? Math.max(0, Math.min(dt, .8)) : 0;
    if (intensity < .35) {
      if (this.active) this.recovery += frame;
      if (this.recovery >= .55) this.reset();
      return null;
    }
    this.recovery = 0;
    if (!this.active) {
      this.active = true;
      return 'DRIFT';
    }
    this.duration += frame;
    if (intensity >= .85 && !this.maxAngleShown) {
      this.maxAngleShown = true;
      return 'MAX ANGLE';
    }
    if (this.duration >= this.chain * 1.2) {
      this.chain++;
      return `CHAIN x${this.chain}`;
    }
    return null;
  }
}
