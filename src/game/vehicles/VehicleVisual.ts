import { ImportMeshAsync } from "@babylonjs/core/Loading/sceneLoader";
import { Quaternion } from "@babylonjs/core/Maths/math.vector";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import { registerBuiltInLoaders } from "@babylonjs/loaders/dynamic";
import type { WheelId } from "./VehicleBody";

registerBuiltInLoaders();

type VisualWheel = { node: TransformNode; front: boolean };

/**
 * The car's GLB, parented to the physics node and otherwise passive: it never feeds
 * back into physics. Expects wheel nodes named `wheel_fl|fr|rl|rr`, pivoted at the
 * wheel centre with the axle along x (see public/model/starter_sedan_README.md).
 */
export class VehicleVisual {
  private spin = 0;

  private constructor(
    readonly root: TransformNode,
    private readonly wheels: readonly VisualWheel[],
    private readonly wheelRadius: number,
  ) {}

  static async load(scene: Scene, url: string, parent: TransformNode, wheelRadius: number): Promise<VehicleVisual> {
    const { meshes } = await ImportMeshAsync(url, scene);
    const root = meshes[0];
    root.parent = parent;
    const ids: WheelId[] = ["fl", "fr", "rl", "rr"];
    const wheels = ids.map((id) => {
      // Multi-material wheels load as a mesh with primitive children, so search all descendants.
      const [node] = root.getDescendants(false, (n) => n.name === `wheel_${id}`) as TransformNode[];
      if (!node) throw new Error(`${url} has no "wheel_${id}" node`);
      node.rotationQuaternion ??= Quaternion.Identity();
      return { node, front: id[0] === "f" };
    });
    for (const mesh of meshes) mesh.isPickable = false;
    return new VehicleVisual(root, wheels, wheelRadius);
  }

  /** `steerAngle` in rad (right +), `forwardSpeed` in m/s along the car. */
  update(dt: number, steerAngle: number, forwardSpeed: number): void {
    this.spin = (this.spin + (forwardSpeed / this.wheelRadius) * dt) % (Math.PI * 2);
    for (const wheel of this.wheels) {
      // The glTF loader mirrors the model into Babylon's left-handed space, which
      // flips the sense of rotations about y (steering) but not about x (rolling).
      const steer = wheel.front ? -steerAngle : 0;
      Quaternion.RotationYawPitchRollToRef(steer, this.spin, 0, wheel.node.rotationQuaternion!);
    }
  }
}
