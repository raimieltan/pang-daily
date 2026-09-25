/**
 * Night-lighting and post-processing tuning (ART_DIRECTION §2.3, §4, §5, §13).
 * Every value the lighting pass reads lives here, so the mood can be tuned without touching
 * the systems. Colours are sRGB hex. Rationale and measured costs: docs/NIGHT_LIGHTING.md.
 */

/** A kind of light fixture. Lamps in layouts reference one of these by id. */
export type LightProfile = {
  readonly description: string;
  readonly color: string;
  /** Real point-light intensity when the lamp holds a pooled light (linear falloff to `range`). */
  readonly intensity: number;
  readonly range: number;
  /** Fake light pool on the ground: additive disc, always drawn, costs no light slot. */
  readonly poolRadius: number;
  readonly poolStrength: number;
};

export const LIGHT_PROFILES = {
  sodium: {
    description: "Road: sodium orange street lamp. Sparse and dim on purpose; roads stay darker than shops.",
    color: "#ff9a3c",
    intensity: 1.1,
    range: 24,
    poolRadius: 9,
    poolStrength: 0.22,
  },
  cafe: {
    description: "Coffee shop: warm café yellow from the shopfront and string lights.",
    color: "#ffc27a",
    intensity: 1.2,
    range: 18,
    poolRadius: 7,
    poolStrength: 0.26,
  },
  fluorescent: {
    description: "Talyer: cheap fluorescent white-green, flat and a little sickly.",
    color: "#dcffe6",
    intensity: 1.35,
    range: 16,
    poolRadius: 6,
    poolStrength: 0.24,
  },
  canopy: {
    description: "Gas station: bright cool-white canopy island, the brightest spot in the hub.",
    color: "#f2f6ff",
    intensity: 1.7,
    range: 22,
    poolRadius: 11,
    poolStrength: 0.34,
  },
  store: {
    description: "Convenience store: bright neutral-white spill from the glass front.",
    color: "#f6f8f4",
    intensity: 1.45,
    range: 18,
    poolRadius: 8,
    poolStrength: 0.3,
  },
  porch: {
    description: "Home/neighborhood: a lone bare bulb over a gate.",
    color: "#ffcf8f",
    intensity: 0.8,
    range: 12,
    poolRadius: 4.5,
    poolStrength: 0.2,
  },
} as const satisfies Record<string, LightProfile>;

export type LightProfileId = keyof typeof LIGHT_PROFILES;

/** Scene-wide mood: sky, fog, the ambient floor, moonlight, and the car-only rim light. */
export const NIGHT_MOOD = {
  clearColor: "#0e1118",
  fog: { color: "#10131a", density: 0.0065 },
  /** Ambient floor: keeps unlit areas readable (Night Rule), never pitch black. */
  ambient: { sky: "#5a6a8c", ground: "#1a1712", intensity: 0.32 },
  /** Cool moonlight: gives roofs, walls and trees a silhouette between lamps. */
  moon: { color: "#9fb2d6", intensity: 0.28, direction: [0.35, -1, 0.45] as const },
  /**
   * Car Rule: a light that only touches the player's car, from above-behind the camera side,
   * so paint and silhouette read even on an unlit road.
   */
  carRim: { color: "#c9d6f0", intensity: 0.55, direction: [-0.3, -0.6, -0.75] as const },
} as const;

export const VEHICLE_LIGHTS = {
  headlight: {
    color: "#fff1d6",
    /** Lens emissive; bright enough to bloom. */
    lensEmissive: "#fff4dc",
    intensity: 2.4,
    range: 55,
    /** Full cone, radians. One spot covers both lamps; two would double the per-pixel cost. */
    angle: 1.15,
    exponent: 1.6,
    /** Car space: mounted between the headlamps, aimed slightly down. */
    position: [0, 0.7, 2.2] as const,
    pitchDownDeg: 6,
  },
  taillight: { emissive: "#7a0a06", brakeEmissive: "#ff2a14" },
  reverse: { emissive: "#101010", activeEmissive: "#e8e8e8" },
} as const;

export type PostSettings = {
  bloom: boolean;
  grain: boolean;
  vignette: boolean;
  chromaticAberration: boolean;
  fxaa: boolean;
};

/** Numeric post-processing values. Toggles live in `GraphicsSettings`. */
export const POST_TUNING = {
  /** HDR pipeline so emissive lenses and signs can exceed the bloom threshold. */
  hdr: true,
  bloom: { threshold: 0.72, weight: 0.32, kernel: 32, scale: 0.5 },
  grain: { intensity: 9, animated: true },
  vignette: { weight: 1.8, stretch: 0.35, color: "#000000" },
  chromaticAberration: { amount: 14, radialIntensity: 0.9 },
  toneMapping: { aces: true, exposure: 1.25, contrast: 1.12 },
} as const;

export type GraphicsQuality = "high" | "medium" | "low";

export type GraphicsSettings = PostSettings & {
  quality: GraphicsQuality;
  /**
   * Real point lights handed to the nearest lamps. Every one is evaluated for every lit pixel
   * on screen, whatever its range, so this is the main per-pixel cost. Changing it recompiles
   * world shaders.
   */
  lightPoolSize: number;
  /** Fake additive ground pools under every lamp. */
  lightPools: boolean;
  /** Canvas resolution divisor (1 = native). */
  hardwareScaling: number;
  /** GPU frame timing for the debug readout. Off by default: timer queries cost on some drivers. */
  gpuTimer: boolean;
};

export const GRAPHICS_PRESETS: Record<GraphicsQuality, GraphicsSettings> = {
  high: {
    quality: "high",
    bloom: true,
    grain: true,
    vignette: true,
    chromaticAberration: false,
    fxaa: true,
    lightPoolSize: 4,
    lightPools: true,
    hardwareScaling: 1,
    gpuTimer: false,
  },
  medium: {
    quality: "medium",
    bloom: true,
    grain: true,
    vignette: true,
    chromaticAberration: false,
    fxaa: true,
    lightPoolSize: 3,
    lightPools: true,
    hardwareScaling: 1,
    gpuTimer: false,
  },
  low: {
    quality: "low",
    bloom: false,
    grain: false,
    vignette: true,
    chromaticAberration: false,
    fxaa: false,
    lightPoolSize: 2,
    lightPools: true,
    hardwareScaling: 1.5,
    gpuTimer: false,
  },
};

export const DEFAULT_GRAPHICS_QUALITY: GraphicsQuality = "high";
