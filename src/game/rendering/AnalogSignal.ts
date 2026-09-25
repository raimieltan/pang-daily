import { ANALOG_KEYS, ANALOG_PRESETS, analogAtSpeed, mixAnalog, type AnalogParameters, type AnalogPreset } from "./AnalogConfig";

/** Pure presentation envelope. No physics, camera transforms, timers or React dependencies. */
export class AnalogSignal {
  current: AnalogParameters = { ...ANALOG_PRESETS.GAMEPLAY };
  preset: AnalogPreset = "GAMEPLAY";
  reducedMotion = false;
  overrides: Partial<AnalogParameters> = {};
  intensity = 1;
  time = 0;
  frame = 0;
  band = 0.1;
  tearEnvelope = 0;
  trackingEnvelope = 0;
  impactEnvelope = 0;
  private impactLeft = 0;
  private impactStrength = 0;
  private tearLeft = 0;
  private trackingLeft = 0;
  private shiftLeft = 0;

  constructor(private readonly random: () => number = Math.random) {}

  setPreset(preset: AnalogPreset): void { this.preset = preset; }

  impact(strength: number): void {
    if (this.preset === "CLEAN" || this.reducedMotion) return;
    this.impactStrength = Math.max(0, Math.min(1, strength));
    this.impactLeft = 0.12 + this.impactStrength * 0.14;
  }

  transition(): void { this.shiftLeft = 0.12; }

  update(dt: number, speedKmh: number, context?: "menu" | "intro"): void {
    dt = Math.min(0.1, Math.max(0, dt));
    this.time += dt;
    this.frame = (this.frame + 1) % 10000;
    const clean = this.preset === "CLEAN";
    const preset = !clean && context ? (context === "intro" ? "RACE_INTRO" : "REPLAY") : this.preset;
    const target = { ...(preset === "GAMEPLAY" ? analogAtSpeed(speedKmh) : ANALOG_PRESETS[preset]), ...(!clean ? this.overrides : {}) };
    this.impactLeft = Math.max(0, this.impactLeft - dt);
    this.shiftLeft = Math.max(0, this.shiftLeft - dt);
    this.impactEnvelope = clean || this.reducedMotion ? 0 : Math.sin(Math.min(1, this.impactLeft / 0.04) * Math.PI / 2) * this.impactStrength * Math.min(1, this.impactLeft / 0.18);
    const pulse = this.impactEnvelope;
    for (const key of ANALOG_KEYS) {
      if (key !== "saturation") target[key] += Math.max(0, ANALOG_PRESETS.IMPACT[key] - target[key]) * pulse;
    }
    if (!clean && !this.reducedMotion) target.rgb += this.shiftLeft * 7;
    // Fast attack, smooth recovery. An impact cannot keep the image unstable after 300 ms.
    this.current = mixAnalog(this.current, target, 1 - Math.exp(-dt * (pulse > 0 ? 65 : 18)));
    const master = Math.max(0, Math.min(1, this.intensity));
    // Intensity is applied in the shader, not repeatedly multiplied into the smoothing state.
    this.tearLeft = Math.max(0, this.tearLeft - dt);
    this.trackingLeft = Math.max(0, this.trackingLeft - dt);
    const cinematic = context || preset === "REPLAY" || preset === "HEAVY_DAMAGE" || preset === "RACE_INTRO";
    if (!clean && !this.reducedMotion && master > 0) {
      // Poisson arrivals: probability per second, independent of frame rate. No periodic timer.
      if (!this.tearLeft && this.random() < 1 - Math.exp(-dt * (cinematic ? 0.9 : 0.055 + Math.min(300, Math.abs(speedKmh)) / 900))) {
        this.tearLeft = 0.035 + this.random() * 0.06;
        this.band = 0.04 + this.random() * 0.92;
      }
      if (!this.trackingLeft && this.random() < 1 - Math.exp(-dt * (cinematic ? 0.25 : 0.016))) this.trackingLeft = 0.15;
    } else {
      this.tearLeft = this.trackingLeft = 0;
    }
    this.tearEnvelope = Math.max(this.tearLeft > 0 ? 1 : 0, pulse);
    this.trackingEnvelope = Math.max(this.trackingLeft / 0.15, pulse);
    if (this.reducedMotion) {
      for (const key of ["jitter", "tearing", "tracking", "flicker", "motionBlur"] as const) this.current[key] = 0;
      this.current.rgb = Math.min(1.1, this.current.rgb);
    }
  }
}
