import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Light } from "@babylonjs/core/Lights/light";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Scene } from "@babylonjs/core/scene";
import type { GameSystem } from "../engine/types";
import type { LampData } from "../world/WorldLayout";
import { DEFAULT_TIME_OF_DAY, LIGHT_PROFILES, MOODS, type SceneMood, type TimeOfDay } from "./LightingConfig";
import { LightPoolSelector } from "./LightPool";

/** Lights every world material always sees besides the pool: ambient, sun/moon, the car's headlight. */
const FIXED_WORLD_LIGHTS = 5; // Ambient, sun/moon, player beam and two pooled traffic beams.
/** The pool follows a point this far ahead of the car, so lamps light up before you reach them. */
const FOCUS_AHEAD_M = 14;

export type LightingFocus = { readonly position: Vector3; readonly forward: Vector3 };

/**
 * Scene-wide mood for the current time of day (`MOODS`) plus the pooled lamp lights (see
 * LightPool). Every mood keeps an ambient floor so nothing reads as pure black, and a rim light
 * that only touches the player's car (Car Rule). By day the lamps are off; at night they carry
 * the scene. Switching time only changes light values and colours, never the light count, so it
 * recompiles nothing.
 */
export class SceneLighting implements GameSystem {
  readonly name = "sceneLighting";
  readonly ambient: HemisphericLight;
  /** The sun by day, the moon at night. */
  readonly key: DirectionalLight;
  readonly carRim: DirectionalLight;
  private lights: PointLight[] = [];
  private selector: LightPoolSelector;
  private readonly focus = new Vector3();
  private readonly colors: Color3[];

  constructor(
    private readonly scene: Scene,
    private readonly lamps: readonly LampData[],
    private readonly worldMaterials: readonly StandardMaterial[],
    /** Unlit glow materials, dimmed by day. */
    private readonly glowMaterials: readonly StandardMaterial[],
    poolSize: number,
    time: TimeOfDay = DEFAULT_TIME_OF_DAY,
  ) {
    this.colors = lamps.map((l) => Color3.FromHexString(LIGHT_PROFILES[l.profile].color));
    scene.fogMode = Scene.FOGMODE_EXP2;

    this.ambient = new HemisphericLight("scene:ambient", Vector3.Up(), scene);
    this.ambient.specular = Color3.Black();

    this.key = new DirectionalLight("scene:key", Vector3.Down(), scene);
    this.key.specular = Color3.Black();

    this.carRim = new DirectionalLight("scene:carRim", Vector3.Down(), scene);
    // An empty include list means "every mesh": keep the rim off until a car is attached.
    this.carRim.setEnabled(false);

    this.selector = new LightPoolSelector(this.candidates(), 0);
    this.setPoolSize(poolSize);
    this.setTimeOfDay(time);
  }

  private currentTime: TimeOfDay = DEFAULT_TIME_OF_DAY;

  get timeOfDay(): TimeOfDay {
    return this.currentTime;
  }

  get mood(): SceneMood {
    return MOODS[this.currentTime];
  }

  /** Applies `time`'s mood. Cheap: values only, no light added or removed. */
  setTimeOfDay(time: TimeOfDay): void {
    this.currentTime = time;
    const m = MOODS[time];
    const scene = this.scene;
    scene.clearColor = Color4.FromColor3(Color3.FromHexString(m.clearColor), 1);
    scene.fogColor = Color3.FromHexString(m.fog.color);
    scene.fogDensity = m.fog.density;

    this.ambient.diffuse = Color3.FromHexString(m.ambient.sky);
    this.ambient.groundColor = Color3.FromHexString(m.ambient.ground);
    this.ambient.intensity = m.ambient.intensity;

    this.key.direction.set(...m.key.direction);
    this.key.diffuse = Color3.FromHexString(m.key.color);
    this.key.intensity = m.key.intensity;

    this.carRim.direction.set(...m.carRim.direction);
    this.carRim.diffuse = Color3.FromHexString(m.carRim.color);
    this.carRim.intensity = m.carRim.intensity;

    for (const material of this.glowMaterials) material.emissiveColor.set(m.glow, m.glow, m.glow);
  }

  private target: LightingFocus | null = null;

  /** The car the pool follows and the rim light touches. */
  attachCar(focus: LightingFocus, meshes: AbstractMesh[]): void {
    this.target = focus;
    this.carRim.includedOnlyMeshes = meshes;
    this.carRim.setEnabled(true);
  }

  get poolSize(): number {
    return this.lights.length;
  }

  /** Changes the number of real lamp lights. Recompiles world shaders: quality changes only. */
  setPoolSize(size: number): void {
    for (const light of this.lights) light.dispose();
    this.lights = Array.from({ length: size }, (_, i) => {
      const light = new PointLight(`scene:pool${i}`, Vector3.Zero(), this.scene);
      light.intensity = 0;
      // Sparse lamps reveal bodywork and damp asphalt as the car passes beneath them.
      light.specular = new Color3(0.5, 0.46, 0.4);
      light.falloffType = Light.FALLOFF_STANDARD;
      return light;
    });
    this.selector = new LightPoolSelector(this.candidates(), size);
    for (const material of this.worldMaterials) material.maxSimultaneousLights = size + FIXED_WORLD_LIGHTS;
  }

  update(dt: number): void {
    if (this.target) {
      const { position, forward } = this.target;
      this.focus.copyFrom(forward).scaleInPlace(FOCUS_AHEAD_M).addInPlace(position);
    }
    this.selector.update(dt, this.focus.x, this.focus.z);
    // Pool lights stay enabled: `setEnabled` resyncs every mesh's light list (and can change
    // shader defines), so a free slot is just a light at zero intensity.
    const level = this.mood.lamps;
    this.selector.slots.forEach((slot, i) => {
      const light = this.lights[i];
      if (slot.lamp < 0 || level === 0) {
        light.intensity = 0;
        return;
      }
      const lamp = this.lamps[slot.lamp];
      const profile = LIGHT_PROFILES[lamp.profile];
      light.position.set(...lamp.at);
      light.diffuse.copyFrom(this.colors[slot.lamp]);
      light.range = profile.range;
      light.intensity = profile.intensity * (lamp.strength ?? 1) * slot.weight * level;
    });
  }

  dispose(): void {
    for (const light of this.lights) light.dispose();
    this.ambient.dispose();
    this.key.dispose();
    this.carRim.dispose();
  }

  private candidates() {
    return this.lamps.map((l) => ({ x: l.at[0], z: l.at[2], range: LIGHT_PROFILES[l.profile].range }));
  }
}
