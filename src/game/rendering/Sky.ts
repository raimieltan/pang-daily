import { Constants } from "@babylonjs/core/Engines/constants";
import { Effect } from "@babylonjs/core/Materials/effect";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector2, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { SubMesh } from "@babylonjs/core/Meshes/subMesh";
import type { Scene } from "@babylonjs/core/scene";
import type { GameSystem } from "../engine/types";
import type { SceneMood } from "./LightingConfig";
import type { SceneLighting } from "./SceneLighting";

/** Well inside the chase camera's 2 km far clip. */
const DOME_RADIUS = 900;
/** Cloud drift, in cloud-plane units per second. */
const WIND: readonly [number, number] = [0.012, 0.005];

Effect.ShadersStore.skyVertexShader = /* glsl */ `
precision highp float;
attribute vec3 position;
uniform mat4 worldViewProjection;
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}`;

// Colours arrive linear. Output matches what a StandardMaterial would write: gamma space, and
// fully image-processed (exposure, ACES, contrast) only when no post-process does it later.
Effect.ShadersStore.skyFragmentShader = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform vec3 zenith, horizon, fogColor, bodyColor, bodyDir, cloudLit, cloudShade, glowColor;
uniform float bodyCos, bodyGlow, bodyIsMoon, cloudCover, stars, glowStrength, time;
uniform vec2 wind;
uniform float toneMap, exposure, contrast;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 hash3(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}

const mat3 ACESIn = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
const mat3 ACESOut = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
vec3 aces(vec3 c) {
  c = ACESIn * c;
  c = (c * (c + 0.0245786) - 0.000090537) / (c * (0.983729 * c + 0.4329510) + 0.238081);
  return clamp(ACESOut * c, 0.0, 1.0);
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float up = max(h, 0.0);
  float toBody = dot(d, bodyDir);
  float nearBody = max(toBody, 0.0);

  // The chase camera mostly sees the lowest 25 degrees, so the gradient does its work early.
  vec3 sky = mix(horizon, zenith, 1.0 - exp(-up * 5.0));
  // Warm scatter low on the sun's side of the sky.
  sky += bodyColor * bodyGlow * 0.35 * pow(nearBody, 3.0) * pow(1.0 - up, 4.0);
  sky += glowColor * glowStrength * exp(-up * 9.0);

  // Stars: one jittered point per cell of a grid wrapped on the dome.
  if (stars > 0.0) {
    vec3 p = d * 220.0;
    vec3 id = floor(p);
    vec3 r = hash3(id);
    float dist = length(fract(p) - 0.5 - (r - 0.5) * 0.7);
    float twinkle = 0.65 + 0.35 * sin(time * (1.5 + r.y * 4.0) + r.z * 40.0);
    float star = step(0.975, r.x) * smoothstep(0.09, 0.0, dist) * (0.4 + 1.6 * r.y * r.y) * twinkle;
    sky += vec3(0.9, 0.95, 1.0) * star * stars * smoothstep(0.03, 0.3, h);
  }

  // Sun or moon disc with a soft halo. The moon gets faint maria and a cooler rim.
  float edge = (1.0 - bodyCos) * 0.25;
  float disc = smoothstep(bodyCos - edge, bodyCos + edge, toBody);
  float maria = mix(1.0, 0.78 + 0.22 * noise(d.xz * 900.0 + d.y * 400.0), bodyIsMoon);
  vec3 body = bodyColor * disc * maria * mix(4.0, 1.4, bodyIsMoon);
  vec3 halo = bodyColor * bodyGlow * (pow(nearBody, 900.0) * 0.8 + pow(nearBody, 60.0) * 0.35 + pow(nearBody, 8.0) * 0.12);
  sky += body + halo;

  // Clouds on a flat layer overhead, flattening towards the horizon.
  vec2 uv = d.xz / (h + 0.25) * 1.1 + wind * time;
  float n = fbm(uv);
  float cover = smoothstep(1.0 - cloudCover, 1.0 - cloudCover + 0.32, n) * smoothstep(0.0, 0.22, h);
  // Denser towards the sun means the side facing it is lit: a cheap one-tap light march.
  vec2 sunward = normalize(bodyDir.xz + 1e-4) * 0.09;
  float shade = clamp(0.55 + (n - fbm(uv + sunward)) * 5.0, 0.0, 1.0);
  vec3 cloud = mix(cloudShade, cloudLit, shade);
  cloud += bodyColor * bodyGlow * pow(nearBody, 10.0) * (1.0 - cover) * 0.9; // silver lining
  cloud += glowColor * glowStrength * exp(-up * 5.0); // city glow underlighting
  sky = mix(sky - body * cover, cloud, cover * 0.94);

  vec3 c = mix(fogColor, sky, smoothstep(-0.015, 0.1, h));

  vec3 graded = pow(clamp(aces(c * exposure), 0.0, 1.0), vec3(1.0 / 2.2));
  vec3 hi = graded * graded * (3.0 - 2.0 * graded);
  graded = contrast < 1.0 ? mix(vec3(0.5), graded, contrast) : mix(graded, hi, contrast - 1.0);
  gl_FragColor = vec4(toneMap > 0.5 ? graded : pow(max(c, 0.0), vec3(1.0 / 2.2)), 1.0);
}`;

/**
 * Procedural sky dome that follows `SceneLighting`'s time of day: gradient, sun or moon,
 * drifting clouds, twinkling stars and sodium city glow. No textures, one draw call.
 * The dome draws after every other opaque mesh (see `skyLast`), so its shader only runs on
 * pixels nothing else covered.
 */
export class Sky implements GameSystem {
  readonly name = "sky";
  readonly mesh: Mesh;
  private readonly material: ShaderMaterial;
  private readonly bodyDir = new Vector3();
  private applied: SceneMood | null = null;
  private time = 0;

  constructor(
    private readonly scene: Scene,
    private readonly lighting: SceneLighting,
  ) {
    this.mesh = CreateSphere("sky", { diameter: DOME_RADIUS * 2, segments: 24 }, scene);
    this.mesh.infiniteDistance = true;
    this.mesh.isPickable = false;
    this.mesh.applyFog = false;
    this.mesh.alwaysSelectAsActiveMesh = true;

    this.material = new ShaderMaterial("sky", scene, "sky", {
      attributes: ["position"],
      uniforms: [
        "worldViewProjection",
        ...["zenith", "horizon", "fogColor", "bodyColor", "bodyDir", "cloudLit", "cloudShade", "glowColor"],
        ...["bodyCos", "bodyGlow", "bodyIsMoon", "cloudCover", "stars", "glowStrength", "time", "wind"],
        ...["toneMap", "exposure", "contrast"],
      ],
    });
    this.material.backFaceCulling = false;
    this.material.disableDepthWrite = true;
    this.material.depthFunction = Constants.LEQUAL;
    this.material.setVector2("wind", new Vector2(...WIND));
    this.mesh.material = this.material;
    this.update(0);
  }

  update(dt: number): void {
    this.time += dt;
    const m = this.material;
    if (this.applied !== this.lighting.mood) this.applyMood(this.lighting.mood);
    const ip = this.scene.imageProcessingConfiguration;
    m.setFloat("time", this.time);
    m.setFloat("toneMap", ip.isEnabled && !ip.applyByPostProcess ? 1 : 0);
    m.setFloat("exposure", ip.exposure);
    m.setFloat("contrast", ip.contrast);
  }

  private applyMood(mood: SceneMood): void {
    this.applied = mood;
    const { sky } = mood;
    const m = this.material;
    const linear = (hex: string) => Color3.FromHexString(hex).toLinearSpace();
    m.setColor3("zenith", linear(sky.zenith));
    m.setColor3("horizon", linear(sky.horizon));
    m.setColor3("fogColor", linear(mood.fog.color));
    m.setColor3("bodyColor", linear(sky.body.color));
    m.setColor3("cloudLit", linear(sky.clouds.lit));
    m.setColor3("cloudShade", linear(sky.clouds.shade));
    m.setColor3("glowColor", linear(sky.cityGlow.color));
    m.setVector3("bodyDir", bodyDirection(mood, this.bodyDir));
    m.setFloat("bodyCos", Math.cos((sky.body.sizeDeg / 2) * (Math.PI / 180)));
    m.setFloat("bodyGlow", sky.body.glow);
    m.setFloat("bodyIsMoon", this.lighting.timeOfDay === "night" ? 1 : 0);
    m.setFloat("cloudCover", sky.clouds.cover);
    m.setFloat("stars", sky.stars);
    m.setFloat("glowStrength", sky.cityGlow.strength);
  }

  dispose(): void {
    this.material.dispose();
    this.mesh.dispose();
  }
}

/** Toward the sun/moon: opposite the key light's bearing, raised to the mood's elevation. */
export function bodyDirection(mood: SceneMood, out = new Vector3()): Vector3 {
  const [x, , z] = mood.key.direction;
  const bearing = Math.atan2(-x, -z);
  const elevation = mood.sky.body.elevationDeg * (Math.PI / 180);
  return out.set(Math.sin(bearing) * Math.cos(elevation), Math.sin(elevation), Math.cos(bearing) * Math.cos(elevation));
}

/** Wraps an opaque sort so `sky` always draws last among opaque meshes. */
export function skyLast(sky: AbstractMesh, compare: (a: SubMesh, b: SubMesh) => number) {
  return (a: SubMesh, b: SubMesh): number => Number(a.getMesh() === sky) - Number(b.getMesh() === sky) || compare(a, b);
}
