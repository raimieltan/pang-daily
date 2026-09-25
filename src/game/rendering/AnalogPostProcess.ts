import type { Camera } from "@babylonjs/core/Cameras/camera";
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import type { Scene } from "@babylonjs/core/scene";
import type { Observer } from "@babylonjs/core/Misc/observable";
import { AnalogSignal } from "./AnalogSignal";
import type { GraphicsSettings } from "./LightingConfig";

export type AnalogSource = {
  readonly speedKmh: number;
  readonly gear: number;
  readonly impactSerial: number;
  readonly impactStrength: number;
  readonly intro?: boolean;
};

ShaderStore.ShadersStore.analogFragmentShader = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform vec2 displaySize;
uniform vec4 signalA; // scanlines, grain, rgb px, tearing px
uniform vec4 signalB; // tracking px, jitter px, bleed, vignette
uniform vec4 grade;   // flicker, softness, saturation, black crush
uniform vec4 motion;  // tint, speed blur, master intensity, impact envelope
uniform vec4 tape;    // frame seed, tear event, tracking event, band position
uniform float clock;

float noise(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 sampleFrame(vec2 uv) { return texture2D(textureSampler, clamp(uv, vec2(0.001), vec2(0.999))).rgb; }
vec3 highlight(vec3 c) { return c * smoothstep(0.65, 0.96, max(c.r, max(c.g, c.b))); }
void main(void) {
  vec2 px = 1.0 / max(displaySize, vec2(1.0));
  vec2 centred = vUV - 0.5;
  float edges = smoothstep(0.13, 0.68, length(centred));
  float row = floor(vUV.y * displaySize.y);
  float rowNoise = noise(vec2(row, tape.x));
  // A narrow tear and an irregular rolling tracking band. The centre is protected.
  float band = 1.0 - smoothstep(0.004, 0.018, abs(vUV.y - tape.w));
  float rolling = 1.0 - smoothstep(0.009, 0.045, abs(vUV.y - fract(clock * 1.7)));
  float bottom = 1.0 - smoothstep(0.015, 0.07, vUV.y);
  vec2 uv = vUV;
  uv.x += px.x * motion.z * (band * tape.y * signalA.w * (rowNoise - 0.5) * 2.0
        + (rolling + bottom) * tape.z * signalB.x * sin(vUV.y * 91.0 + tape.x));
  uv.y += px.y * motion.z * signalB.y * tape.z * (noise(vec2(tape.x, 8.0)) - 0.5);
  float split = px.x * signalA.z * edges * motion.z;
  vec3 colour = vec3(sampleFrame(uv + vec2(split, 0.0)).r, sampleFrame(uv).g, sampleFrame(uv - vec2(split, 0.0)).b);
  vec3 soft = (sampleFrame(uv + vec2(px.x, 0.0)) + sampleFrame(uv - vec2(px.x, 0.0))) * 0.5;
  colour = mix(colour, soft, grade.y * motion.z);
  // Small peripheral speed smear, no history buffer or centre/HUD blur.
  vec2 trail = centred * px * 9.0 * motion.y * edges;
  vec3 streak = (sampleFrame(uv - trail) + sampleFrame(uv - trail * 2.0)) * 0.5;
  colour = mix(colour, streak, motion.y * edges * motion.z);
  vec3 bleed = highlight(sampleFrame(uv + vec2(px.x * 3.0, 0.0)))
             + highlight(sampleFrame(uv - vec2(px.x * 3.0, 0.0)))
             + highlight(sampleFrame(uv + vec2(px.x * 8.0, px.y)))
             + highlight(sampleFrame(uv - vec2(px.x * 8.0, px.y)));
  colour += bleed * 0.25 * signalB.z * motion.z;
  float luma = dot(colour, vec3(0.299, 0.587, 0.114));
  colour = mix(vec3(luma), colour, mix(1.0, grade.z, motion.z));
  // Faded blue shadows, subtle contaminated magenta highlights; no neon wash.
  colour += motion.x * motion.z * mix(vec3(-0.2, 0.3, 0.65), vec3(0.45, -0.2, 0.2), luma);
  colour = max(vec3(0.0), (colour - grade.w * motion.z) * (1.0 + grade.w * 2.0 * motion.z));
  float scan = pow(0.5 + 0.5 * cos(vUV.y * displaySize.y * 3.14159265), 3.0);
  colour *= 1.0 - scan * signalA.x * motion.z;
  // Luma-dependent tape noise, clustered line variation and rare RGB dropouts.
  vec2 cell = floor(vUV * displaySize);
  float n = noise(cell + vec2(tape.x * 0.73, tape.x * 1.37)) - 0.5;
  float clump = 0.5 + noise(floor(cell / vec2(9.0, 3.0)) + tape.x);
  float shadow = mix(1.4, 0.35, smoothstep(0.02, 0.7, luma));
  vec3 chroma = vec3(noise(cell + tape.x), noise(cell.yx - tape.x), noise(cell + tape.x + 83.0)) - 0.5;
  colour += (vec3(n * clump + (rowNoise - 0.5) * 0.18) + chroma * 0.18) * signalA.y * shadow * motion.z;
  float speck = step(0.99955, noise(cell * 0.71 + tape.x));
  colour += speck * max(chroma, vec3(0.0)) * signalA.y * 4.0 * motion.z;
  colour += (rowNoise - 0.5) * rolling * tape.z * signalB.x * 0.012 * motion.z;
  colour *= 1.0 + (noise(vec2(tape.x, 0.0)) - 0.5) * grade.x * motion.z;
  colour += motion.w * 0.045 * motion.z;
  colour *= 1.0 - signalB.w * smoothstep(0.18, 0.72, length(centred)) * motion.z;
  gl_FragColor = vec4(max(colour, vec3(0.0)), 1.0);
}`;

/** One reusable final colour pass, after tone mapping/bloom/FXAA. Never a static overlay. */
export class AnalogPostProcess {
  readonly signal = new AnalogSignal();
  readonly pass: PostProcess;
  private readonly observer: Observer<Scene>;
  private settings: GraphicsSettings;
  private previousGear?: number;
  private previousImpact = 0;
  private previousIntro = false;
  private attached = true;

  constructor(private readonly scene: Scene, private readonly camera: Camera, settings: GraphicsSettings, private readonly source?: AnalogSource) {
    this.settings = settings;
    this.pass = new PostProcess("analog-video", "analog", ["displaySize", "signalA", "signalB", "grade", "motion", "tape", "clock"], null, 1, camera, Texture.BILINEAR_SAMPLINGMODE);
    this.pass.onApply = (effect) => {
      const engine = scene.getEngine();
      const s = this.signal, p = s.current, cfg = this.settings;
      effect.setFloat2("displaySize", engine.getRenderWidth() * engine.getHardwareScalingLevel(), engine.getRenderHeight() * engine.getHardwareScalingLevel());
      effect.setFloat4("signalA", p.scanlines, cfg.grain ? p.grain : 0, cfg.chromaticAberration ? p.rgb : 0, p.tearing);
      effect.setFloat4("signalB", p.tracking, p.jitter, cfg.bloom ? p.bleed : 0, cfg.vignette ? p.vignette : 0);
      effect.setFloat4("grade", p.flicker, p.softness, p.saturation, p.crush);
      effect.setFloat4("motion", p.tint, p.motionBlur, s.intensity, s.impactEnvelope);
      effect.setFloat4("tape", s.reducedMotion ? 0 : s.frame, s.tearEnvelope, s.trackingEnvelope, s.band);
      effect.setFloat("clock", s.time);
    };
    this.observer = scene.onBeforeRenderObservable.add(() => {
      if (!this.attached) return;
      const input = this.source;
      const paused = scene.metadata?.analogPaused === true;
      if (input && !paused) {
        if (this.previousGear !== undefined && input.gear !== this.previousGear) this.signal.transition();
        if (input.impactSerial !== this.previousImpact) this.signal.impact(input.impactStrength);
        if (this.previousIntro && !input.intro) this.signal.transition();
        this.previousGear = input.gear;
        this.previousImpact = input.impactSerial;
        this.previousIntro = !!input.intro;
      }
      this.signal.update(Math.min(0.1, scene.getEngine().getDeltaTime() / 1000 || 1 / 60), paused ? 0 : input?.speedKmh ?? 0, paused ? "menu" : input?.intro ? "intro" : undefined);
    });
    this.configure(settings);
  }

  /** Pipeline rebuilds detach/reorder passes. Reattach this last, without recompiling it. */
  configure(settings: GraphicsSettings): void {
    this.settings = settings;
    this.signal.setPreset(settings.analogPreset);
    this.signal.intensity = settings.analogIntensity;
    this.signal.reducedMotion = settings.reducedMotion;
    this.signal.overrides = settings.analogOverrides;
    this.camera.detachPostProcess(this.pass);
    this.attached = settings.analog;
    if (this.attached) this.camera.attachPostProcess(this.pass);
  }

  dispose(): void {
    this.scene.onBeforeRenderObservable.remove(this.observer);
    this.pass.dispose(this.camera);
  }
}
