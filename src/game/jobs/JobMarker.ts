import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

export type JobMarkerPort = { show(x: number, z: number, radius: number): void; hide(): void; dispose(): void };

/** The current stop: a ground ring the size of the stop area and a beacon visible over rooftops. */
export class JobMarker implements JobMarkerPort {
  private readonly root: TransformNode;
  private readonly ring;
  private readonly material: StandardMaterial;

  constructor(scene: Scene) {
    this.root = new TransformNode("job-marker", scene);
    this.material = new StandardMaterial("job-marker", scene);
    this.material.emissiveColor = Color3.FromHexString("#ffb347");
    this.material.disableLighting = true;
    this.material.alpha = 0.45;
    this.ring = MeshBuilder.CreateTorus("job-marker-ring", { diameter: 2, thickness: 0.12, tessellation: 48 }, scene);
    this.ring.position.y = 0.08;
    const beacon = MeshBuilder.CreateCylinder("job-marker-beacon", { height: 30, diameterTop: 0.6, diameterBottom: 1.4, tessellation: 12 }, scene);
    beacon.position.y = 15;
    for (const mesh of [this.ring, beacon]) {
      mesh.material = this.material; mesh.isPickable = false; mesh.parent = this.root;
    }
    this.root.setEnabled(false);
  }

  show(x: number, z: number, radius: number): void {
    this.root.position.set(x, 0, z);
    this.ring.scaling.set(radius, 1, radius);
    this.root.setEnabled(true);
  }

  hide(): void { this.root.setEnabled(false); }

  dispose(): void { this.root.dispose(false, true); this.material.dispose(); }
}
