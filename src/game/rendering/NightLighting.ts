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
import { LIGHT_PROFILES, NIGHT_MOOD } from "./LightingConfig";
import { LightPoolSelector } from "./LightPool";

/** Lights every world material always sees besides the pool: ambient, moon, the car's headlight. */
const FIXED_WORLD_LIGHTS = 3;
/** The pool follows a point this far ahead of the car, so lamps light up before you reach them. */
const FOCUS_AHEAD_M = 14;

export type LightingFocus = { readonly position: Vector3; readonly forward: Vector3 };

/**
 * Scene-wide night mood plus the pooled lamp lights (see LightPool). The mood keeps the
 * Night Rule: a cool ambient floor and faint moonlight so nothing reads as pure black, and a
 * rim light that only touches the player's car (Car Rule).
 */
export class NightLighting implements GameSystem {
  readonly name = "nightLighting";
  readonly ambient: HemisphericLight;
  readonly moon: DirectionalLight;
  readonly carRim: DirectionalLight;
  private lights: PointLight[] = [];
  private selector: LightPoolSelector;
  private readonly focus = new Vector3();
  private readonly colors: Color3[];

  constructor(
    private readonly scene: Scene,
    private readonly lamps: readonly LampData[],
    private readonly worldMaterials: readonly StandardMaterial[],
    poolSize: number,
  ) {
    this.colors = lamps.map((l) => Color3.FromHexString(LIGHT_PROFILES[l.profile].color));
    const m = NIGHT_MOOD;
    scene.clearColor = Color4.FromColor3(Color3.FromHexString(m.clearColor), 1);
    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogColor = Color3.FromHexString(m.fog.color);
    scene.fogDensity = m.fog.density;

    this.ambient = new HemisphericLight("night:ambient", Vector3.Up(), scene);
    this.ambient.diffuse = Color3.FromHexString(m.ambient.sky);
    this.ambient.groundColor = Color3.FromHexString(m.ambient.ground);
    this.ambient.specular = Color3.Black();
    this.ambient.intensity = m.ambient.intensity;

    this.moon = new DirectionalLight("night:moon", new Vector3(...m.moon.direction), scene);
    this.moon.diffuse = Color3.FromHexString(m.moon.color);
    this.moon.specular = Color3.Black();
    this.moon.intensity = m.moon.intensity;

    this.carRim = new DirectionalLight("night:carRim", new Vector3(...m.carRim.direction), scene);
    this.carRim.diffuse = Color3.FromHexString(m.carRim.color);
    this.carRim.intensity = m.carRim.intensity;
    // An empty include list means "every mesh": keep the rim off until a car is attached.
    this.carRim.setEnabled(false);

    this.selector = new LightPoolSelector(this.candidates(), 0);
    this.setPoolSize(poolSize);
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
      const light = new PointLight(`night:pool${i}`, Vector3.Zero(), this.scene);
      light.intensity = 0;
      light.specular = Color3.Black();
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
    this.selector.slots.forEach((slot, i) => {
      const light = this.lights[i];
      if (slot.lamp < 0) {
        light.intensity = 0;
        return;
      }
      const lamp = this.lamps[slot.lamp];
      const profile = LIGHT_PROFILES[lamp.profile];
      light.position.set(...lamp.at);
      light.diffuse.copyFrom(this.colors[slot.lamp]);
      light.range = profile.range;
      light.intensity = profile.intensity * (lamp.strength ?? 1) * slot.weight;
    });
  }

  dispose(): void {
    for (const light of this.lights) light.dispose();
    this.ambient.dispose();
    this.moon.dispose();
    this.carRim.dispose();
  }

  private candidates() {
    return this.lamps.map((l) => ({ x: l.at[0], z: l.at[2], range: LIGHT_PROFILES[l.profile].range }));
  }
}
