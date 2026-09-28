import type { TireSurface } from '@/game-core/tires';
import { nearestRoad } from './mountain/route';
import type { RoadPoint, WorldLayout } from './WorldLayout';

const DEG = Math.PI / 180;
/** Loose gravel runs this far past the mountain pavement edge before the verge turns to grass. */
const MOUNTAIN_SHOULDER_M = 2.6;
/** Beyond this from the mountain centreline we are somewhere else (hub, overlook apron). */
const MOUNTAIN_REACH_M = 30;

/**
 * Ground under a point, for tires. Authored pads win (lots, yards, verges), then any paved road,
 * then the mountain road with its gravel shoulders and grass verges; everywhere else is asphalt.
 */
export function surfaceResolver(layout: Pick<WorldLayout, 'chunks'>, mountain = true) {
  const pads = layout.chunks.flatMap(chunk => chunk.surfaces).map(s => ({
    kind: s.kind, cx: s.center[0], cz: s.center[1], hw: s.size[0] / 2, hd: s.size[1] / 2,
    c: Math.cos((s.rotDeg ?? 0) * DEG), s: Math.sin((s.rotDeg ?? 0) * DEG),
  }));
  const roads = layout.chunks.flatMap(chunk => chunk.roads).map(r => r.points);
  return (x: number, z: number): TireSurface => {
    // Later pads draw over earlier ones, so the last hit wins.
    for (let i = pads.length - 1; i >= 0; i--) {
      const p = pads[i], dx = x - p.cx, dz = z - p.cz;
      if (Math.abs(dx * p.c - dz * p.s) <= p.hw && Math.abs(dx * p.s + dz * p.c) <= p.hd) return p.kind;
    }
    if (roads.some(points => onRoad(points, x, z))) return 'asphalt';
    if (mountain) {
      const { sample, distance } = nearestRoad({ x, z });
      if (distance < MOUNTAIN_REACH_M) {
        const lateral = Math.abs((x - sample.x) * Math.cos(sample.heading) - (z - sample.z) * Math.sin(sample.heading));
        if (lateral <= sample.width / 2) return 'asphalt';
        return lateral <= sample.width / 2 + MOUNTAIN_SHOULDER_M ? 'gravel' : 'grass';
      }
    }
    return 'asphalt';
  };
}

function onRoad(points: readonly RoadPoint[], x: number, z: number) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const ex = b.x - a.x, ez = b.z - a.z, len2 = ex * ex + ez * ez;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / len2)) : 0;
    const half = (a.width + (b.width - a.width) * t) / 2;
    if ((x - a.x - ex * t) ** 2 + (z - a.z - ez * t) ** 2 <= half * half) return true;
  }
  return false;
}
