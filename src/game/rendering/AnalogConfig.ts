/** Display pixels, not render-target texels. Keep the driving centre legible at every DPR. */
export type AnalogParameters = {
  scanlines: number;
  grain: number;
  rgb: number;
  tearing: number;
  tracking: number;
  jitter: number;
  bleed: number;
  vignette: number;
  flicker: number;
  softness: number;
  saturation: number;
  crush: number;
  tint: number;
  motionBlur: number;
};

const gameplay: AnalogParameters = {
  scanlines: 0.045, grain: 0.032, rgb: 1.1, tearing: 0.45, tracking: 0.18,
  jitter: 0.5, bleed: 0.12, vignette: 0.2, flicker: 0.008, softness: 0.2,
  saturation: 0.8, crush: 0.012, tint: 0.012, motionBlur: 0,
};
export const ANALOG_PRESETS = {
  CLEAN: { ...gameplay, scanlines: 0, grain: 0, rgb: 0, tearing: 0, tracking: 0, jitter: 0, bleed: 0, vignette: 0, flicker: 0, softness: 0, saturation: 1, crush: 0, tint: 0 },
  SUBTLE_VHS: { ...gameplay, scanlines: 0.025, grain: 0.019, rgb: 0.7, tearing: 0.2, tracking: 0.08, flicker: 0.004 },
  GAMEPLAY: gameplay,
  RACE_INTRO: { ...gameplay, scanlines: 0.09, grain: 0.075, rgb: 2.8, tearing: 3.5, tracking: 3, jitter: 2, flicker: 0.03, vignette: 0.32 },
  HIGH_SPEED: { ...gameplay, scanlines: 0.055, grain: 0.047, rgb: 2.3, tearing: 1.8, tracking: 0.6, jitter: 1, bleed: 0.2, motionBlur: 0.32 },
  IMPACT: { ...gameplay, grain: 0.13, rgb: 7, tearing: 8, tracking: 5, jitter: 3, flicker: 0.07, bleed: 0.24 },
  REPLAY: { ...gameplay, scanlines: 0.095, grain: 0.065, rgb: 2.2, tearing: 2.5, tracking: 1.6, jitter: 1.5, flicker: 0.025, vignette: 0.3 },
  HEAVY_DAMAGE: { ...gameplay, scanlines: 0.12, grain: 0.1, rgb: 4, tearing: 5, tracking: 3.5, jitter: 2, flicker: 0.04, vignette: 0.35 },
} satisfies Record<string, AnalogParameters>;
export type AnalogPreset = keyof typeof ANALOG_PRESETS;
export const ANALOG_PRESET_NAMES = Object.keys(ANALOG_PRESETS) as AnalogPreset[];
export const ANALOG_KEYS = Object.keys(gameplay) as (keyof AnalogParameters)[];
/** UI/command bounds. Saturation is a retained fraction; other fields increase the effect. */
export const ANALOG_LIMITS: Record<keyof AnalogParameters, readonly [number, number, number]> = {
  scanlines: [0, 0.15, 0.005], grain: [0, 0.14, 0.005], rgb: [0, 8, 0.1],
  tearing: [0, 8, 0.1], tracking: [0, 5, 0.1], jitter: [0, 3, 0.1],
  bleed: [0, 0.4, 0.01], vignette: [0, 0.4, 0.01], flicker: [0, 0.07, 0.001],
  softness: [0, 0.5, 0.01], saturation: [0.5, 1, 0.01], crush: [0, 0.025, 0.001],
  tint: [0, 0.04, 0.001], motionBlur: [0, 0.4, 0.01],
};

export function mixAnalog(a: AnalogParameters, b: AnalogParameters, t: number): AnalogParameters {
  const result = { ...a };
  for (const key of ANALOG_KEYS) result[key] = a[key] + (b[key] - a[key]) * t;
  return result;
}

/** Continuous speed bands; reverse uses absolute speed. No jump at a threshold. */
export function analogAtSpeed(speedKmh: number): AnalogParameters {
  const speed = Math.min(300, Math.abs(Number.isFinite(speedKmh) ? speedKmh : 0));
  const stops = [0, 40, 100, 160, 220, 300];
  const strengths = [0, 0.025, 0.18, 0.5, 0.85, 1];
  let i = 1;
  while (i < stops.length - 1 && speed > stops[i]) i++;
  const t = (speed - stops[i - 1]) / (stops[i] - stops[i - 1]);
  return mixAnalog(gameplay, ANALOG_PRESETS.HIGH_SPEED, strengths[i - 1] + (strengths[i] - strengths[i - 1]) * t);
}
