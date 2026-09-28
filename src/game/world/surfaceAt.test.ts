import { describe, expect, it } from 'vitest';
import { surfaceResolver } from './surfaceAt';
import { ROAD, MOUNTAIN_ROAD_WIDTH } from './mountain/route';
import type { WorldLayout } from './WorldLayout';

const chunk = (surfaces: WorldLayout['chunks'][number]['surfaces'], roads: WorldLayout['chunks'][number]['roads'] = []) =>
  ({ chunks: [{ surfaces, roads } as unknown as WorldLayout['chunks'][number]] });

describe('surfaceAt', () => {
  it('resolves rotated pads, roads and the default per point', () => {
    const at = surfaceResolver(chunk([{ kind: 'grass', center: [0, 0], size: [10, 2], rotDeg: 90 }],
      [{ id: 'r', kind: 'street', markings: 'none', points: [{ x: 20, z: 0, width: 6 }, { x: 20, z: 50, width: 6 }] } as never]), false);
    expect(at(0, 4)).toBe('grass');
    expect(at(4, 0)).toBe('asphalt');
    expect(at(22, 10)).toBe('asphalt');
  });

  it('gives the mountain road gravel shoulders and grass verges, so two wheels can straddle the edge', () => {
    const at = surfaceResolver({ chunks: [] });
    const p = ROAD[Math.floor(ROAD.length / 2)];
    const right = (d: number) => [p.x + Math.cos(p.heading) * d, p.z - Math.sin(p.heading) * d] as const;
    expect(at(...right(0))).toBe('asphalt');
    expect(at(...right(MOUNTAIN_ROAD_WIDTH / 2 + 1))).toBe('gravel');
    expect(at(...right(MOUNTAIN_ROAD_WIDTH / 2 + 5))).toBe('grass');
  });
});
