import type { Material } from "@babylonjs/core/Materials/material";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBoxVertexData } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinderVertexData } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphereVertexData } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateTorusVertexData } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

const SKIN = "#b88059";
const SHIRT = "#d0c6ab";
const JEANS = "#344456";
export type CharacterAppearance = {
  shirt?: string; skin?: string; hair?: string; coffee?: boolean; vape?: boolean;
  pants?: string; shoes?: string;
  /** Long sleeves run to the wrist; shorts stop above the knee. */
  sleeves?: "short" | "long"; shorts?: boolean;
  /** Oversized tops widen the torso and sleeves and drop the hem over the belt. */
  oversized?: boolean; pocket?: boolean;
  /** Replaces the default hair cap; head-local, face toward +z. */
  head?: Part[];
  /** Added to the shirt; torso-local, neck at y ≈ 0.4. */
  torso?: Part[];
};
type Vec = [number, number, number];
export type Part = { data: VertexData; at: Vec; scale: Vec; color: string; rot?: Vec };
export const box = (at: Vec, scale: Vec, color: string, rot?: Vec): Part =>
  ({ data: CreateBoxVertexData({ size: 1 }), at, scale, color, rot });
export const round = (at: Vec, scale: Vec, color: string, rot?: Vec): Part =>
  ({ data: CreateSphereVertexData({ diameter: 1, segments: 3 }), at, scale, color, rot });
export const taper = (at: Vec, scale: Vec, color: string, top = 0.85, rot?: Vec): Part =>
  ({ data: CreateCylinderVertexData({ height: 1, diameterBottom: 1, diameterTop: top, tessellation: 8 }), at, scale, color, rot });
/** Thin ring facing +z, for glasses frames. */
export const ring = (at: Vec, diameter: number, color: string): Part =>
  ({ data: CreateTorusVertexData({ diameter: 1, thickness: 0.14, tessellation: 10 }), at, scale: [diameter, diameter, diameter], color, rot: [Math.PI / 2, 0, 0] });

/** Small articulated lo-fi person. Shared world material, no textures or animation assets. */
export class CharacterVisual {
  readonly root: Mesh;
  private readonly hips: TransformNode;
  private readonly torso: Mesh;
  private readonly legs: { hip: Mesh; knee: Mesh }[] = [];
  private readonly arms: { shoulder: Mesh; elbow: Mesh }[] = [];
  private phase = 0;
  private time = 0;
  private weight = 0;
  private readonly head: Mesh;
  private readonly cup: Mesh | null;
  private readonly vape: Mesh | null;

  constructor(scene: Scene, material: Material, height: number, appearance: CharacterAppearance = {}) {
    const shirt = appearance.shirt ?? SHIRT;
    const skin = appearance.skin ?? SKIN;
    const pants = appearance.pants ?? JEANS;
    const shoes = appearance.shoes ?? "#c7c2b5";
    const sleeve = appearance.sleeves === "long" ? shirt : skin;
    const w = appearance.oversized ? 1.1 : 1;
    this.root = new Mesh("player:walker", scene);
    this.root.isPickable = false;
    this.root.scaling.setAll(height / 1.7);
    const joint = (name: string, parent: TransformNode, at: Part["at"], parts: Part[]): Mesh => {
      const data = parts.map((part) => {
        const rot = part.rot ? Quaternion.FromEulerAngles(...part.rot) : Quaternion.Identity();
        part.data.transform(Matrix.Compose(new Vector3(...part.scale), rot, new Vector3(...part.at)));
        const c = Color3.FromHexString(part.color);
        part.data.colors = Array.from({ length: part.data.positions!.length / 3 * 4 }, (_, i) => [c.r, c.g, c.b, 1][i % 4]);
        return part.data;
      });
      const mesh = new Mesh(`player:${name}`, scene);
      data[0].merge(data.slice(1)).applyToMesh(mesh);
      mesh.parent = parent;
      mesh.position.set(...at);
      mesh.material = material;
      mesh.isPickable = false;
      return mesh;
    };
    this.hips = new TransformNode("player:hips", scene);
    this.hips.parent = this.root;
    this.hips.position.y = 0.88;
    joint("pelvis", this.hips, [0, 0, 0], [
      taper([0, 0.01, 0], [0.32, 0.19, 0.22], pants, 0.95),
      taper([0, 0.1, 0], [0.31, 0.035, 0.22], "#302d2b", 1),
    ]);
    this.torso = joint("shirt", this.hips, [0, 0.12, 0], [
      appearance.oversized
        ? taper([0, 0.16, 0], [0.36, 0.42, 0.25], shirt, 1.22)
        : taper([0, 0.18, 0], [0.33, 0.38, 0.23], shirt, 1.25),
      ...(appearance.pocket ?? !appearance.torso ? [box([-0.09, 0.25, 0.119], [0.075, 0.075, 0.014], "#b3a68c")] : []),
      taper([0, 0.41, 0], [0.12, 0.1, 0.12], skin, 1),
      ...(appearance.torso ?? []),
    ]);
    this.head = joint("head", this.torso, [0, 0.54, 0], [
      round([0, 0, 0], [0.205, 0.26, 0.21], skin),
      ...(appearance.head ?? [round([0, 0.075, -0.025], [0.214, 0.145, 0.2], appearance.hair ?? "#252321")]),
      round([-0.106, -0.005, 0], [0.04, 0.065, 0.05], skin),
      round([0.106, -0.005, 0], [0.04, 0.065, 0.05], skin),
      box([0, -0.013, 0.104], [0.034, 0.05, 0.04], skin),
      box([-0.046, 0.026, 0.093], [0.021, 0.013, 0.012], "#302820"),
      box([0.046, 0.026, 0.093], [0.021, 0.013, 0.012], "#302820"),
      box([0, -0.063, 0.093], [0.047, 0.009, 0.01], "#785040"),
    ]);
    for (const side of [-1, 1]) {
      const hip = joint(`thigh:${side}`, this.hips, [side * 0.095, -0.025, 0], appearance.shorts ? [
        taper([0, -0.13, 0], [0.165, 0.27, 0.195], pants, 1.08),
        taper([0, -0.3, 0], [0.11, 0.13, 0.125], skin, 1.1),
      ] : [
        taper([0, -0.18, 0], [0.15, 0.36, 0.18], pants, 1.12),
      ]);
      const knee = joint(`shin:${side}`, hip, [0, -0.36, 0], [
        taper([0, -0.19, 0], [0.115, 0.38, 0.13], appearance.shorts ? skin : pants, 1.2),
        round([0, -0.42, 0.045], [0.145, 0.13, 0.28], shoes),
        box([0, -0.463, 0.045], [0.14, 0.03, 0.265], "#484843"),
      ]);
      const shoulder = joint(`upperArm:${side}`, this.torso, [side * 0.215 * w, 0.32, 0], [
        round([0, -0.035, 0], [0.16 * w, 0.17 * w, 0.17 * w], shirt),
        taper([0, -0.1, 0], [0.13 * w, 0.19, 0.14 * w], shirt, 1.12),
        taper([0, -0.205, 0], [0.095 * w, 0.12, 0.1 * w], sleeve, 1.1),
      ]);
      const elbow = joint(`forearm:${side}`, shoulder, [0, -0.265, 0], [
        taper([0, -0.105, 0], [0.075 * w, 0.21, 0.085 * w], sleeve, 1.2),
        ...(appearance.sleeves === "long" ? [taper([0, -0.2, 0], [0.085, 0.04, 0.09], shirt, 1)] : []),
        round([0, -0.25, 0.005], [0.085, 0.115, 0.07], skin),
      ]);
      this.legs.push({ hip, knee });
      this.arms.push({ shoulder, elbow });
    }
    this.cup = appearance.coffee ? joint('coffee-cup', this.arms[1].elbow, [0, -.25, .06], [
      taper([0, 0, 0], [.10, .14, .10], '#ead9b8', 1.15),
      taper([0, .073, 0], [.12, .018, .12], '#302a25', 1),
      taper([0, -.01, 0], [.105, .04, .105], '#98734c', 1),
    ]) : null;
    this.vape = appearance.vape ? joint('vape', this.arms[1].elbow, [0, -.25, .055], [
      box([0, .01, 0], [.034, .085, .02], '#2b2e36'),
      box([0, .062, 0], [.02, .022, .014], '#141518'),
      box([0, -.01, .011], [.012, .012, .003], '#6fc3e8'),
    ]) : null;
    this.update(0, 0, false);
  }

  /** Patio idle: independent breathing, hand gestures and a slow lift/sip/lower cycle. */
  cafeIdle(dt: number, phase: number, seated: boolean): void {
    this.update(dt, 0, true);
    if (seated) {
      this.hips.position.y = .5;
      this.legs.forEach(({ hip, knee }) => { hip.rotation.x = -Math.PI / 2; knee.rotation.x = Math.PI / 2; });
    }
    const cycle = (this.time + phase) % 12;
    const sip = Math.max(0, Math.min(1, (cycle - 6) / 1.2, (10 - cycle) / 1.2));
    const right = this.arms[1];
    right.shoulder.rotation.x = -.35 - sip * .75;
    right.shoulder.rotation.z = -.3;
    right.elbow.rotation.x = -1.3 - sip * .5;
    if (!this.cup) {
      right.shoulder.rotation.x = seated ? -.45 : -.1;
      right.elbow.rotation.x = seated ? -.85 : -.35;
    }
    this.arms[0].shoulder.rotation.x = -.15 - Math.max(0, Math.sin((this.time + phase) * .9)) * .25;
    this.arms[0].elbow.rotation.x = -.45;
    this.torso.rotation.y = Math.sin((this.time + phase) * .5) * .07;
    if (this.cup) this.cup.rotation.x = -(right.shoulder.rotation.x + right.elbow.rotation.x + this.torso.rotation.x);
  }

  /**
   * Seated/standing hit-and-exhale loop on the café rig; returns exhale strength 0..1 so the
   * caller can emit vapour at `mouth()`. Hand to mouth, hold, lower, tip the head back and blow.
   */
  vapeIdle(dt: number, phase: number, seated: boolean): number {
    this.cafeIdle(dt, phase, seated);
    const cycle = (this.time + phase) % 11;
    const lift = Math.max(0, Math.min(1, cycle / .7, (3 - cycle) / .6));
    const exhale = cycle > 3.1 && cycle < 5.6 ? Math.sin((cycle - 3.1) / 2.5 * Math.PI) : 0;
    const right = this.arms[1];
    right.shoulder.rotation.x = -.35 - lift * .75;
    right.shoulder.rotation.z = -.3;
    right.elbow.rotation.x = -.95 - lift * .85;
    this.head.rotation.x = -exhale * .28;
    if (this.vape) this.vape.rotation.x = -(right.shoulder.rotation.x + right.elbow.rotation.x + this.torso.rotation.x);
    return exhale;
  }

  /** World-space mouth, a touch in front of the lips. */
  mouth(out = new Vector3()): Vector3 {
    this.root.computeWorldMatrix(true);
    this.hips.computeWorldMatrix(true);
    this.torso.computeWorldMatrix(true);
    return Vector3.TransformCoordinatesFromFloatsToRef(0, -0.06, 0.14, this.head.computeWorldMatrix(true), out);
  }

  reset(): void {
    this.phase = this.time = this.weight = 0;
    this.update(0, 0, false);
  }

  /** Ambient roles reuse the articulated rig without changing the player's gait. */
  ambientIdle(dt: number, phase: number, activity: 'chat' | 'work' | 'fuel' | 'basketball' | 'watch'): void {
    this.update(dt, 0, true);
    const t = this.time + phase;
    this.torso.rotation.y = Math.sin(t * .65) * .09;
    if (activity === 'work') {
      this.hips.position.y = .75;
      this.torso.rotation.x = .48;
      this.legs.forEach(({ hip, knee }) => { hip.rotation.x = -.35; knee.rotation.x = .4; });
      this.arms.forEach(({ shoulder, elbow }, i) => {
        shoulder.rotation.x = -.8 + Math.sin(t * 4 + i) * .08;
        elbow.rotation.x = -.6 + Math.sin(t * 4 + i) * .2;
      });
    } else if (activity === 'basketball') {
      this.torso.rotation.x = .12;
      this.arms[1].shoulder.rotation.x = -.55 - Math.cos(t * Math.PI * 2 / .8) * .22;
      this.arms[1].elbow.rotation.x = -.6;
      this.arms[0].shoulder.rotation.z = -.35;
    } else if (activity === 'fuel') {
      this.arms[1].shoulder.rotation.x = -.8;
      this.arms[1].elbow.rotation.x = -.65;
    } else {
      const gesture = Math.max(0, Math.sin(t * 1.1));
      this.arms[0].shoulder.rotation.x = -.15 - gesture * (activity === 'watch' ? .7 : .35);
      this.arms[0].elbow.rotation.x = -.3 - gesture * .4;
    }
  }

  /** Static riding pose in the parked underbone's local coordinates (+z forward). */
  sitOnMotorcycle(): void {
    this.hips.position.set(0, .91, -.1);
    this.torso.rotation.x = .35;
    this.legs.forEach(({ hip, knee }, i) => {
      hip.rotation.x = -1.15;
      hip.rotation.z = i === 0 ? -.28 : .28;
      knee.rotation.x = 1.35;
    });
    this.arms.forEach(({ shoulder, elbow }, i) => {
      shoulder.rotation.x = -1.05;
      shoulder.rotation.z = i === 0 ? -.12 : .12;
      elbow.rotation.x = -.45;
    });
  }

  /** Gait follows actual travel so pushing against a wall doesn't run in place. */
  update(dt: number, speed: number, grounded: boolean): void {
    this.time += dt;
    const moving = grounded && speed > 0.08;
    this.weight += ((moving ? Math.min(1, speed / 1.4) : 0) - this.weight) * (1 - Math.exp(-16 * dt));
    if (moving) this.phase += speed * dt * Math.PI * 2 / 1.65;
    const swing = Math.sin(this.phase) * this.weight;
    this.hips.position.y = 0.88 + Math.cos(this.phase * 2) * 0.015 * this.weight;
    this.hips.rotation.y = swing * 0.055;
    this.torso.rotation.y = -swing * 0.09;
    this.torso.rotation.z = swing * 0.02;
    this.torso.rotation.x = this.weight * 0.045;
    this.torso.scaling.y = 1 + Math.sin(this.time * 2.2) * 0.004 * (1 - this.weight);
    this.legs.forEach(({ hip, knee }, i) => {
      const cycle = this.phase + i * Math.PI;
      hip.rotation.x = Math.sin(cycle) * 0.62 * this.weight;
      knee.rotation.x = -Math.max(0, Math.cos(cycle)) * 0.85 * this.weight;
    });
    this.arms.forEach(({ shoulder, elbow }, i) => {
      shoulder.rotation.x = -Math.sin(this.phase + i * Math.PI) * 0.42 * this.weight;
      shoulder.rotation.z = (i === 0 ? -1 : 1) * 0.08;
      elbow.rotation.x = -0.13 - (0.12 + 0.08 * Math.cos(this.phase + i * Math.PI)) * this.weight;
    });
  }
}
