import type { SuspensionSolver } from "@/game-core/suspension/solver";
import { Quaternion } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
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

  private readonly spinNodes: TransformNode[] = [];
  private readonly bases: { x: number; y: number; z: number }[];
  private constructor(readonly model: VehicleModel) { this.bases = model.wheels.map(w => ({ x: w.hub.position.x, y: w.hub.position.y, z: w.hub.position.z })); }

  updateSuspension(dt: number, solver: SuspensionSolver, angularVelocities: readonly number[], preview = false): void {
    const model = this.model;
    model.setPhysicalSuspension(true);
    model.setBodySway(preview ? solver.pose.pitch : 0, preview ? solver.pose.roll : 0);
    model.setSuspensionPreviewHeight(preview ? solver.pose.heave : 0);
    model.wheels.forEach((wheel, i) => {
      const c = solver.corners[i], side = i % 2 ? 1 : -1;
      if (!this.spinNodes[i]) {
        const spin = new TransformNode(`${wheel.id}_suspension_spin`, model.root.getScene());
        spin.rotationQuaternion = Quaternion.Identity(); spin.parent = wheel.hub; wheel.socket.parent = spin; this.spinNodes[i] = spin;
      }
      const stockZ = i < 2 ? solver.baseline.wheelbase * (1 - solver.baseline.frontWeight) : -solver.baseline.wheelbase * solver.baseline.frontWeight;
      wheel.hub.position.set(this.bases[i].x + c.wheelPosition.x - side * solver.baseline.track / 2 - side * solver.offsets[i],
        c.wheelPosition.y, this.bases[i].z + c.wheelPosition.z - stockZ);
      if (preview) {
        // Preview pose is relative to the parked car; rotate the entire solved wheel position too.
        const q = Quaternion.RotationYawPitchRoll(0, solver.pose.pitch, solver.pose.roll);
        wheel.hub.position.rotateByQuaternionToRef(q, wheel.hub.position); wheel.hub.position.y += solver.pose.heave;
      }
      Quaternion.RotationYawPitchRollToRef(c.heading, 0, -side * c.camber, wheel.hub.rotationQuaternion!);
      if (preview) wheel.hub.rotationQuaternion = Quaternion.RotationYawPitchRoll(0, solver.pose.pitch, solver.pose.roll).multiply(wheel.hub.rotationQuaternion!);
      this.wheelSpins[i] = (this.wheelSpins[i] + (angularVelocities[i] ?? 0) * dt) % (2 * Math.PI);
      Quaternion.RotationYawPitchRollToRef(0, this.wheelSpins[i], 0, this.spinNodes[i].rotationQuaternion!);
    });
  }

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

  /** `steerAngle` in rad (right +), `forwardSpeed` in m/s along the car, `attitude` from the suspension. */
  update(dt: number, steerAngle: number, forwardSpeed: number, angularVelocities?: readonly number[],
    attitude?: { pitch: number; roll: number }): void {
    if (attitude) this.model.setBodySway(attitude.pitch, attitude.roll);
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
