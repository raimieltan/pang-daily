import type { Material } from "@babylonjs/core/Materials/material";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBoxVertexData } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinderVertexData } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphereVertexData } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

const SKIN = "#b88059";
const SHIRT = "#d0c6ab";
const JEANS = "#344456";
type Part = { data: VertexData; at: [number, number, number]; scale: [number, number, number]; color: string };
const box = (at: Part["at"], scale: Part["scale"], color: string): Part =>
  ({ data: CreateBoxVertexData({ size: 1 }), at, scale, color });
const round = (at: Part["at"], scale: Part["scale"], color: string): Part =>
  ({ data: CreateSphereVertexData({ diameter: 1, segments: 3 }), at, scale, color });
const taper = (at: Part["at"], scale: Part["scale"], color: string, top = 0.85): Part =>
  ({ data: CreateCylinderVertexData({ height: 1, diameterBottom: 1, diameterTop: top, tessellation: 8 }), at, scale, color });

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

  constructor(scene: Scene, material: Material, height: number) {
    this.root = new Mesh("player:walker", scene);
    this.root.isPickable = false;
    this.root.scaling.setAll(height / 1.7);
    const joint = (name: string, parent: TransformNode, at: Part["at"], parts: Part[]): Mesh => {
      const data = parts.map((part) => {
        part.data.transform(Matrix.Compose(new Vector3(...part.scale), Quaternion.Identity(), new Vector3(...part.at)));
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
      taper([0, 0.01, 0], [0.32, 0.19, 0.22], JEANS, 0.95),
      taper([0, 0.1, 0], [0.31, 0.035, 0.22], "#302d2b", 1),
    ]);
    this.torso = joint("shirt", this.hips, [0, 0.12, 0], [
      taper([0, 0.18, 0], [0.33, 0.38, 0.23], SHIRT, 1.25),
      box([-0.09, 0.25, 0.119], [0.075, 0.075, 0.014], "#b3a68c"),
      taper([0, 0.41, 0], [0.12, 0.1, 0.12], SKIN, 1),
    ]);
    joint("head", this.torso, [0, 0.54, 0], [
      round([0, 0, 0], [0.205, 0.26, 0.21], SKIN),
      round([0, 0.075, -0.025], [0.214, 0.145, 0.2], "#252321"),
      round([-0.106, -0.005, 0], [0.04, 0.065, 0.05], SKIN),
      round([0.106, -0.005, 0], [0.04, 0.065, 0.05], SKIN),
      box([0, -0.013, 0.104], [0.034, 0.05, 0.04], SKIN),
      box([-0.046, 0.026, 0.093], [0.021, 0.013, 0.012], "#302820"),
      box([0.046, 0.026, 0.093], [0.021, 0.013, 0.012], "#302820"),
      box([0, -0.063, 0.093], [0.047, 0.009, 0.01], "#785040"),
    ]);
    for (const side of [-1, 1]) {
      const hip = joint(`thigh:${side}`, this.hips, [side * 0.095, -0.025, 0], [
        taper([0, -0.18, 0], [0.15, 0.36, 0.18], JEANS, 1.12),
      ]);
      const knee = joint(`shin:${side}`, hip, [0, -0.36, 0], [
        taper([0, -0.19, 0], [0.115, 0.38, 0.13], JEANS, 1.2),
        round([0, -0.42, 0.045], [0.145, 0.13, 0.28], "#c7c2b5"),
        box([0, -0.463, 0.045], [0.14, 0.03, 0.265], "#484843"),
      ]);
      const shoulder = joint(`upperArm:${side}`, this.torso, [side * 0.215, 0.32, 0], [
        round([0, -0.035, 0], [0.16, 0.17, 0.17], SHIRT),
        taper([0, -0.1, 0], [0.13, 0.19, 0.14], SHIRT, 1.12),
        taper([0, -0.205, 0], [0.095, 0.12, 0.1], SKIN, 1.1),
      ]);
      const elbow = joint(`forearm:${side}`, shoulder, [0, -0.265, 0], [
        taper([0, -0.105, 0], [0.075, 0.21, 0.085], SKIN, 1.2),
        round([0, -0.25, 0.005], [0.085, 0.115, 0.07], SKIN),
      ]);
      this.legs.push({ hip, knee });
      this.arms.push({ shoulder, elbow });
    }
    this.update(0, 0, false);
  }

  reset(): void {
    this.phase = this.time = this.weight = 0;
    this.update(0, 0, false);
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
