import { SpotLight } from '@babylonjs/core/Lights/spotLight';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';

type LitVehicle = { root: TransformNode; motorcycle: boolean };

/** Visible lenses on every vehicle; only the two nearest vehicles cast real beams. */
export class TrafficLights {
  private readonly beams: SpotLight[];
  private readonly lenses: Mesh[] = [];
  private readonly head: StandardMaterial;
  private readonly tail: StandardMaterial;

  constructor(scene: Scene, private readonly vehicles: readonly LitVehicle[],
    private readonly focus: () => { x: number; y: number; z: number },
    private readonly night: () => number) {
    this.head = new StandardMaterial('traffic:headlamp', scene);
    this.head.diffuseColor = Color3.FromHexString('#fff0c9');
    this.tail = new StandardMaterial('traffic:taillamp', scene);
    this.tail.diffuseColor = Color3.FromHexString('#a5160d');
    for (const { root, motorcycle } of vehicles) {
      for (const x of motorcycle ? [0] : [-.62, .62]) {
        for (const front of [true, false]) {
          const lens = CreateSphere(`traffic:${front ? 'headlamp' : 'taillamp'}`, { diameter: 1, segments: 4 }, scene);
          lens.parent = root;
          lens.position.set(x, motorcycle ? .88 : .65, (front ? 1 : -1) * (motorcycle ? .7 : 2.12));
          lens.scaling.set(motorcycle ? .17 : .32, .13, .08);
          lens.material = front ? this.head : this.tail;
          lens.isPickable = false;
          this.lenses.push(lens);
        }
      }
    }
    this.beams = Array.from({ length: 2 }, (_, i) => {
      const light = new SpotLight(`traffic:beam-${i}`, Vector3.Zero(), new Vector3(0, -.12, 1).normalize(), Math.PI / 2.7, 2, scene);
      light.diffuse = Color3.FromHexString('#ffe7bd');
      light.specular = Color3.Black();
      light.range = 42;
      light.intensity = 0;
      return light;
    });
  }

  update(): void {
    const level = this.night(), focus = this.focus();
    this.head.emissiveColor = Color3.FromHexString('#fff0c9').scale(level * 1.5);
    this.tail.emissiveColor = Color3.FromHexString('#ff2010').scale(level * .8);
    const distance = (v: LitVehicle) => Vector3.DistanceSquared(v.root.position, new Vector3(focus.x, focus.y, focus.z));
    const nearby = this.vehicles.filter(v => v.root.isEnabled() && distance(v) < 140 * 140)
      .sort((a, b) => distance(a) - distance(b));
    this.beams.forEach((light, i) => {
      const vehicle = nearby[i];
      light.parent = vehicle?.root ?? null;
      light.position.set(0, vehicle?.motorcycle ? .9 : .68, vehicle?.motorcycle ? .78 : 2.2);
      light.intensity = vehicle ? level * (vehicle.motorcycle ? 2.2 : 3) : 0;
    });
  }

  dispose(): void {
    this.beams.forEach(light => light.dispose());
    this.lenses.forEach(mesh => mesh.dispose());
    this.head.dispose(); this.tail.dispose();
  }
}
