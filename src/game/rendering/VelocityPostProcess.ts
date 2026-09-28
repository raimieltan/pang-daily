import type { Camera } from "@babylonjs/core/Cameras/camera";
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Observer } from "@babylonjs/core/Misc/observable";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import type { Scene } from "@babylonjs/core/scene";
import type { AnalogSource } from "./AnalogPostProcess";
import type { GraphicsSettings } from "./LightingConfig";
import { VelocityEnvelope } from "./VelocityEffect";

/** UV origin of the road's vanishing point. Adjust here if the chase framing changes. */
const VANISHING_POINT: readonly [number, number] = [0.5, 0.56];

ShaderStore.ShadersStore.velocityFragmentShader = /* glsl */ `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform vec2 displaySize;
uniform vec2 vanishingPoint;
uniform float strength;
uniform float clock;

float hash(float n) { return fract(sin(n * 127.1 + 78.233) * 43758.5453); }
vec3 frame(vec2 uv) { return texture2D(textureSampler, clamp(uv, vec2(0.001), vec2(0.999))).rgb; }

void main(void) {
  vec3 colour = frame(vUV);
  if (strength < 0.001) { gl_FragColor = vec4(colour, 1.0); return; }

  vec2 delta = vUV - vanishingPoint;
  delta.x *= displaySize.x / max(displaySize.y, 1.0);
  float radius = length(delta);
  float angle = atan(delta.y, delta.x);
  // Leave the car and the road immediately ahead of it readable.
  vec2 car = (vUV - vec2(0.5, 0.24)) / vec2(0.22, 0.21);
  float carClearance = smoothstep(0.9, 1.45, length(car));
  float periphery = smoothstep(0.18, 0.55, radius) * carClearance;

  // A small scene-space radial smear and colour split sell motion in the world.
  vec2 direction = delta / max(radius, 0.001);
  direction.x /= displaySize.x / max(displaySize.y, 1.0);
  vec2 pull = direction * 0.008 * strength * periphery;
  vec3 smear = (frame(vUV - pull) + frame(vUV - pull * 2.0) + frame(vUV - pull * 3.0)) / 3.0;
  colour = mix(colour, smear, 0.42 * strength * periphery);
  vec2 split = direction * 0.0018 * strength * periphery;
  colour = mix(colour, vec3(frame(vUV + split).r, colour.g, frame(vUV - split).b), 0.35 * strength * periphery);

  // Fixed angular cells keep the rays coherent as strength changes. Hashes create
  // clusters, gaps, varied starts and rare long foreground streaks.
  float sector = (angle + 3.14159265) * 17.0;
  float cell = floor(sector);
  float selected = hash(cell + 1.0);
  float density = mix(0.18, 0.68, strength);
  float rayEnabled = 1.0 - step(density, selected);
  float centre = hash(cell + 19.0);
  float angularDistance = abs(fract(sector) - centre);
  float width = mix(0.025, 0.13, clamp(radius / 0.9, 0.0, 1.0));
  width *= mix(0.55, 1.5, hash(cell + 31.0));
  float core = 1.0 - smoothstep(width * 0.25, width, angularDistance);
  float glow = 1.0 - smoothstep(width, width * 2.5, angularDistance);

  float giant = step(0.965, hash(cell + 47.0));
  float start = mix(0.12, 0.42, hash(cell + 59.0));
  float length = mix(0.08, 0.32, hash(cell + 71.0)) * mix(0.45, 1.8, strength);
  length = mix(length, 0.82, giant * strength);
  float phase = fract(clock * mix(0.8, 1.6, hash(cell + 83.0)) + hash(cell + 97.0));
  // The near end stays anchored; the far end grows toward the viewer each cycle.
  float end = start + length * phase;
  float segment = smoothstep(start, start + 0.025, radius) * (1.0 - smoothstep(end - 0.04, end, radius));
  float taper = smoothstep(start, end + 0.001, radius);
  float brightness = mix(0.35, 1.0, hash(cell + 109.0));
  float streak = rayEnabled * segment * taper * periphery * brightness * strength;
  colour += vec3(0.8, 0.9, 1.0) * streak * (core * 0.72 + glow * 0.14);
  colour *= 1.0 + 0.065 * strength * periphery;
  gl_FragColor = vec4(colour, 1.0);
}`;

/** Final GPU pass, after the analog pass, driven directly from vehicle speed. */
export class VelocityPostProcess {
  readonly pass: PostProcess;
  readonly envelope = new VelocityEnvelope();
  private readonly observer: Observer<Scene>;
  private attached = false;
  private clock = 0;
  private reducedMotion = false;

  constructor(private readonly scene: Scene, private readonly camera: Camera, private readonly source?: AnalogSource) {
    this.pass = new PostProcess("radial-velocity", "velocity", ["displaySize", "vanishingPoint", "strength", "clock"], null, 1, camera, Texture.BILINEAR_SAMPLINGMODE);
    this.pass.onApply = effect => {
      const engine = scene.getEngine();
      effect.setFloat2("displaySize", engine.getRenderWidth(), engine.getRenderHeight());
      effect.setFloat2("vanishingPoint", ...VANISHING_POINT);
      effect.setFloat("strength", this.envelope.value);
      effect.setFloat("clock", this.clock);
    };
    this.observer = scene.onBeforeRenderObservable.add(() => {
      const dt = Math.min(0.1, scene.getEngine().getDeltaTime() / 1000 || 1 / 60);
      const active = !this.reducedMotion && scene.metadata?.analogPaused !== true && !this.source?.intro;
      this.envelope.step(dt, this.source?.speedKmh ?? 0, active);
      this.clock += dt;
    });
  }

  configure(settings: GraphicsSettings): void {
    this.reducedMotion = settings.reducedMotion;
    this.camera.detachPostProcess(this.pass);
    this.attached = !!this.source && !settings.reducedMotion;
    if (this.attached) this.camera.attachPostProcess(this.pass);
    else this.envelope.reset();
  }

  dispose(): void {
    this.scene.onBeforeRenderObservable.remove(this.observer);
    this.pass.dispose(this.camera);
  }
}
