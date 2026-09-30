import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { LinesMesh } from '@babylonjs/core/Meshes/linesMesh';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { VehicleModel } from './VehicleModel';
import type { SuspensionSolver } from '@/game-core/suspension/solver';
/** Geometry diagnostics share the rendered hub frames; never modify simulation. */
export class SuspensionDebugVisual {
  enabled = false;
  private lines: LinesMesh | null = null;
  constructor(private readonly model: VehicleModel) {}
  update(solver: SuspensionSolver): void {
    if (!this.enabled) { this.lines?.setEnabled(false); return; }
    const lines: Vector3[][] = [];
    solver.corners.forEach((c, i) => {
      const wheel = this.model.wheels[i], p = wheel.hub.position.clone(), s = solver.saved.setup.corners[i];
      const road = p.subtract(new Vector3(0, solver.radii[i], 0));
      lines.push([p.add(new Vector3(0, -s.droopTravel, 0)), p.add(new Vector3(0, s.compressionTravel, 0))]);
      lines.push([road, road.add(new Vector3(0, .15, 0))]); // contact normal in suspension frame
      lines.push([road, road.add(new Vector3(0, c.wheelLoad / 15000, 0))]);
      lines.push([p, p.add(new Vector3(Math.sin(c.heading) * .6, 0, Math.cos(c.heading) * .6))]);
      lines.push([p, p.add(new Vector3(Math.sin(c.camber) * (i % 2 ? 1 : -1) * .4, Math.cos(c.camber) * .4, 0))]);
      lines.push([p, p.add(new Vector3(0, c.suspensionForce / 15000, 0))]);
      lines.push([p, p.add(new Vector3(0, Math.cos(c.caster) * .4, -Math.sin(c.caster) * .4))]);
    });
    this.lines = MeshBuilder.CreateLineSystem('suspension-vectors', { lines, updatable: true, instance: this.lines ?? undefined }, this.model.root.getScene());
    this.lines.parent = this.model.root; this.lines.isPickable = false; this.lines.setEnabled(true);
  }
  dispose() { this.lines?.dispose(); }
}
