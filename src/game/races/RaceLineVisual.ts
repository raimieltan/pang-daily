import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Scene } from '@babylonjs/core/scene';
import type { Waypoint } from './Race';

export type RaceLineZone = 'drive' | 'caution' | 'brake';

/** Colors the speed plan at the point where the car must change pedals. */
export function raceLineZones(points: readonly Waypoint[], brakeLimit = 8): RaceLineZone[] {
  const zones: RaceLineZone[] = points.map(() => 'drive');
  for (let i = 0; i < points.length - 1; i++) {
    const length = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].z - points[i].z);
    const deceleration = (points[i].speed ** 2 - points[i + 1].speed ** 2) / (2 * Math.max(.1, length));
    if (deceleration > brakeLimit * .3) zones[i] = 'brake';
    else if (deceleration > brakeLimit * .07) zones[i] = 'caution';
  }
  for (let i = 1; i < points.length; i++) {
    if (zones[i] !== 'brake' || zones[i - 1] === 'brake') continue;
    let distance = 0;
    for (let j = i - 1; j >= 0 && zones[j] !== 'brake'; j--) {
      distance += Math.hypot(points[j + 1].x - points[j].x, points[j + 1].z - points[j].z);
      if (distance > Math.max(12, points[j].speed * .5)) break;
      zones[j] = 'caution';
    }
  }
  return zones;
}

/** A single noncolliding, vertex-coloured strip on the planned line. */
export class RaceLineVisual {
  private readonly mesh: Mesh;
  private readonly material: StandardMaterial;

  constructor(scene: Scene, points: readonly Waypoint[], brakeLimit = 8) {
    this.mesh = new Mesh('race-line', scene);
    this.mesh.isPickable = false;
    this.mesh.renderingGroupId = 1;
    this.material = new StandardMaterial('race-line-material', scene);
    this.material.disableLighting = true;
    this.material.emissiveColor = Color3.White();
    this.material.backFaceCulling = false;
    this.material.alpha = .88;
    this.mesh.material = this.material;
    const zones = raceLineZones(points, brakeLimit);
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
