import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Scene } from '@babylonjs/core/scene';
import type { Waypoint } from './Race';

export type RaceLineZone = 'drive' | 'caution' | 'brake';

/** Braking begins far enough before a slower waypoint to shed speed on ordinary tires. */
export function raceLineZones(points: readonly Waypoint[]): RaceLineZone[] {
  const zones: RaceLineZone[] = [];
  for (let i = 0; i < points.length; i++) {
    let distance = 0;
    let zone: RaceLineZone = 'drive';
    for (let j = i + 1; j < points.length && distance < 100; j++) {
      distance += Math.hypot(points[j].x - points[j - 1].x, points[j].z - points[j - 1].z);
      const start = points[i].speed * 1.3, target = points[j].speed * 1.3;
      if (start - target < 3) continue;
      const brakingDistance = (start * start - target * target) / 12 + start * .4;
      if (distance <= brakingDistance + 6) { zone = 'brake'; break; }
      if (distance <= brakingDistance + 18) zone = 'caution';
    }
    zones.push(zone);
  }
  return zones;
}

/** A single noncolliding, vertex-coloured strip on the authored route. */
export class RaceLineVisual {
  private readonly mesh: Mesh;
  private readonly material: StandardMaterial;

  constructor(scene: Scene, points: readonly Waypoint[]) {
    this.mesh = new Mesh('race-line', scene);
    this.mesh.isPickable = false;
    this.mesh.renderingGroupId = 1;
    this.material = new StandardMaterial('race-line-material', scene);
    this.material.disableLighting = true;
    this.material.emissiveColor = Color3.White();
    this.material.backFaceCulling = false;
    this.material.alpha = .88;
    this.mesh.material = this.material;
    const zones = raceLineZones(points);
    const palette = {
      drive: new Color4(.2, .95, .6, 1),
      caution: new Color4(1, .7, .12, 1),
      brake: new Color4(1, .18, .12, 1),
    };
    const positions: number[] = [], colors: number[] = [], indices: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
      const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz) || 1;
      const sideX = dz / length * .16, sideZ = -dx / length * .16;
      const p = points[i], color = palette[zones[i]];
      positions.push(p.x - sideX, p.y + .12, p.z - sideZ, p.x + sideX, p.y + .12, p.z + sideZ);
      for (let k = 0; k < 2; k++) colors.push(color.r, color.g, color.b, color.a);
      if (i > 0) indices.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i - 1, 2 * i + 1, 2 * i);
    }
    const data = new VertexData();
    data.positions = positions; data.indices = indices; data.colors = colors;
    data.applyToMesh(this.mesh);
  }

  dispose(): void { this.mesh.dispose(); this.material.dispose(); }
}
