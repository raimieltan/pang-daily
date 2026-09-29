import { Quaternion } from "@babylonjs/core/Maths/math.vector";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { VehicleDefinition } from "@/game-core/vehicles";
import { VehicleModel } from "./VehicleModel";

/**
 * The car's GLB, parented to the physics node and otherwise passive: it never feeds back
 * into physics. Loading, validation and the wheel/attachment rig live in `VehicleModel`;
 * this only animates the wheels from the handling state.
 */
export class VehicleVisual {
  private spin = 0;
  private readonly wheelSpins = [0, 0, 0, 0];

  private constructor(readonly model: VehicleModel) {}

  /** `source` overrides the definition's model URL (see `VehicleModel.load`). */
  static async load(
    scene: Scene,
    definition: VehicleDefinition,
    parent: TransformNode,
    source?: string | ArrayBufferView,
  ): Promise<VehicleVisual> {
    const model = await VehicleModel.load(scene, definition, source);
    for (const warning of model.warnings) console.warn(`[vehicle] ${definition.visual.model.url}: ${warning}`);
    model.root.parent = parent;
    return new VehicleVisual(model);
  }

  /** Animates a model that is already placed, e.g. a dressed NPC clone. */
  static wrap(model: VehicleModel): VehicleVisual {
    return new VehicleVisual(model);
  }

  /** `steerAngle` in rad (right +), `forwardSpeed` in m/s along the car. */
  update(dt: number, steerAngle: number, forwardSpeed: number, angularVelocities?: readonly number[]): void {
    const { wheels } = this.model;
    // All wheels share one spin angle; they share a radius on every car so far.
    this.spin = (this.spin + (forwardSpeed / wheels[0].radius) * dt) % (Math.PI * 2);
    wheels.forEach((wheel, i) => {
      this.wheelSpins[i] = angularVelocities ? (this.wheelSpins[i] + angularVelocities[i] * dt) % (Math.PI * 2) : this.spin;
      Quaternion.RotationYawPitchRollToRef(wheel.front ? steerAngle : 0, this.wheelSpins[i], 0, wheel.hub.rotationQuaternion!);
    });
  }

  dispose(): void {
    this.model.dispose();
  }
}
