/**
 * Scene lighting (morning, afternoon, night) and post-processing tuning (ART_DIRECTION §2.3, §4, §5, §13).
 * Every value the lighting pass reads lives here, so the mood can be tuned without touching
 * the systems. Colours are sRGB hex. Rationale and measured costs: docs/NIGHT_LIGHTING.md.
 */

/** A kind of light fixture. Lamps in layouts reference one of these by id. */
import type { AnalogParameters, AnalogPreset } from "./AnalogConfig";

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
    description: "Road: sodium orange street lamp. Overlapping warm pools keep the road readable.",
    color: "#ff9a3c",
    intensity: 1.5,
    range: 32,
    poolRadius: 18,
    poolStrength: 0.3,
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

export type TimeOfDay = "morning" | "afternoon" | "night";

export const TIMES_OF_DAY: readonly TimeOfDay[] = ["morning", "afternoon", "night"];

export const DEFAULT_TIME_OF_DAY: TimeOfDay = "night";

/** Scene-wide mood for one time of day: sky, fog, ambient, key light, car rim, and how lit the lamps are. */
export type SceneMood = {
  readonly clearColor: string;
  readonly fog: { readonly color: string; readonly density: number };
  /** Ambient floor: keeps unlit areas readable, never pitch black. */
  readonly ambient: { readonly sky: string; readonly ground: string; readonly intensity: number };
  /** Key directional light: the sun by day, faint moonlight at night. Direction is where it shines toward. */
  readonly key: { readonly color: string; readonly intensity: number; readonly direction: readonly [number, number, number] };
  /**
   * Car Rule: a light that only touches the player's car, from above-behind the camera side,
   * so paint and silhouette read even on an unlit road.
   */
  readonly carRim: { readonly color: string; readonly intensity: number; readonly direction: readonly [number, number, number] };
  /** Scales every lamp's real light and ground pool. 0 turns them off (and hides the pools). */
  readonly lamps: number;
  /** Scales the unlit glow material (shopfront glass, signs, lenses). Below 1 so they don't glow in daylight. */
  readonly glow: number;
  /** Scales the car's headlight beam. */
  readonly headlight: number;
  readonly exposure: number;
  /** Bright daylight surfaces would bloom at the night threshold. */
  readonly bloomThreshold: number;
  readonly sky: SkyMood;
};

/**
 * Procedural sky dome (Sky.ts). The horizon always melts into `fog.color`, so fogged
 * buildings and the sky meet without a seam.
 */
export type SkyMood = {
  readonly zenith: string;
  /** Band just above the horizon, before it fades into the fog colour. */
  readonly horizon: string;
  /** Sun by day, moon at night. Sits on the key light's compass bearing at `elevationDeg`. */
  readonly body: {
    readonly color: string;
    readonly sizeDeg: number;
    readonly elevationDeg: number;
    /** Halo and horizon scatter around the disc. */
    readonly glow: number;
  };
  readonly clouds: { readonly lit: string; readonly shade: string; readonly cover: number };
  /** 0 hides them; 1 is a clear provincial night. */
  readonly stars: number;
  /** Sodium light pollution hugging the horizon. */
  readonly cityGlow: { readonly color: string; readonly strength: number };
};

/** +x is east, +z is north (docs/HUB_LAYOUT.md). */
export const MOODS: Record<TimeOfDay, SceneMood> = {
  /** Fresh and slightly hazy: low sun out of the east, cool sky fill, long soft light. */
  morning: {
    clearColor: "#9cc3e8",
    fog: { color: "#bcd0e2", density: 0.0045 },
    ambient: { sky: "#c4d6ee", ground: "#7a6a52", intensity: 1 },
    key: { color: "#ffe4c2", intensity: 1.2, direction: [-0.8, -0.65, 0.3] },
    carRim: { color: "#dfe8ff", intensity: 0.2, direction: [-0.3, -0.6, -0.75] },
    lamps: 0,
    glow: 0.55,
    headlight: 0,
    exposure: 1.15,
    bloomThreshold: 0.95,
    sky: {
      zenith: "#2c6cc6",
      horizon: "#b8d2ea",
      body: { color: "#fff0d4", sizeDeg: 1.8, elevationDeg: 13, glow: 1 },
      clouds: { lit: "#fff3e2", shade: "#95a9c0", cover: 0.4 },
      stars: 0,
      cityGlow: { color: "#ffc27a", strength: 0 },
    },
  },
  /** Hot, bright tropical afternoon: high sun from the west, warm golden key, a little dusty haze. */
  afternoon: {
    clearColor: "#7fb2e4",
    fog: { color: "#cdd3d2", density: 0.0038 },
    ambient: { sky: "#b4cdea", ground: "#846c4a", intensity: 0.95 },
    key: { color: "#ffd8a0", intensity: 1.35, direction: [0.6, -0.9, -0.2] },
    carRim: { color: "#fff0d8", intensity: 0.2, direction: [-0.3, -0.6, -0.75] },
    lamps: 0,
    glow: 0.55,
    headlight: 0,
    exposure: 1.1,
    bloomThreshold: 0.95,
    sky: {
      zenith: "#1c5fc0",
      horizon: "#94bfe8",
      body: { color: "#fff6e2", sizeDeg: 1.6, elevationDeg: 52, glow: 0.7 },
      clouds: { lit: "#ffffff", shade: "#9fb0c2", cover: 0.52 },
      stars: 0,
      cityGlow: { color: "#ffd8a0", strength: 0 },
    },
  },
  /** Lo-fi nocturnal realism (ART_DIRECTION §2.3): cool ambient floor, faint moon, lamps carry the scene. */
  night: {
    clearColor: "#0e1118",
    fog: { color: "#10131a", density: 0.0065 },
    ambient: { sky: "#59647c", ground: "#252934", intensity: 0.4 },
    key: { color: "#93a3bf", intensity: 0.18, direction: [0.35, -1, 0.45] },
    carRim: { color: "#adb9cd", intensity: 0.12, direction: [-0.3, -0.6, -0.75] },
    lamps: 1,
    glow: 1,
    headlight: 1,
    exposure: 1.18,
    bloomThreshold: 0.78,
    sky: {
      zenith: "#03050b",
      horizon: "#161b29",
      body: { color: "#dfe6ff", sizeDeg: 2.4, elevationDeg: 24, glow: 0.35 },
      clouds: { lit: "#2a3246", shade: "#07090e", cover: 0.36 },
      stars: 1,
      cityGlow: { color: "#ff9a3c", strength: 0.07 },
    },
  },
};

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
  /** Threshold comes from the time of day's mood. */
  bloom: { weight: 0.22, kernel: 48, scale: 0.5 },
  grain: { intensity: 9, animated: true },
  vignette: { weight: 1.8, stretch: 0.35, color: "#000000" },
  chromaticAberration: { amount: 14, radialIntensity: 0.9 },
  /** Exposure comes from the time of day's mood. */
  toneMapping: { aces: true, contrast: 1.12 },
} as const;

export type GraphicsQuality = "high" | "medium" | "low";

export type GraphicsSettings = PostSettings & {
  quality: GraphicsQuality;
  analog: boolean;
  analogPreset: AnalogPreset;
  analogIntensity: number;
  analogOverrides: Partial<AnalogParameters>;
  reducedMotion: boolean;
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
    analog: true, analogPreset: "GAMEPLAY", analogIntensity: 1, analogOverrides: {}, reducedMotion: false,
    bloom: true,
    grain: true,
    vignette: true,
    chromaticAberration: true,
    fxaa: true,
    lightPoolSize: 4,
    lightPools: true,
    hardwareScaling: 1,
    gpuTimer: false,
  },
  medium: {
    quality: "medium",
    analog: true, analogPreset: "GAMEPLAY", analogIntensity: 1, analogOverrides: {}, reducedMotion: false,
    bloom: true,
    grain: true,
    vignette: true,
    chromaticAberration: true,
    fxaa: true,
    lightPoolSize: 3,
    lightPools: true,
    hardwareScaling: 1,
    gpuTimer: false,
  },
  low: {
    quality: "low",
    analog: false, analogPreset: "SUBTLE_VHS", analogIntensity: 1, analogOverrides: {}, reducedMotion: false,
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
