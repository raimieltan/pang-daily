import { describe, expect, it } from 'vitest';
import { WaypointRival } from '../races/Race';
import { HUB_LAYOUT } from '../world/hub/hubLayout';
import { TRAFFIC_LANES } from './trafficRoutes';

describe('connected traffic routes', () => {
  it('takes downhill drivers through town and back uphill without stopping at the entrance', () => {
    const points = TRAFFIC_LANES[1];
    const entrance = points.findIndex(p => p.x <= 250 && p.y === 0);
    const driver = new WaypointRival(points);
    driver.position = { ...points[entrance] };
    driver.segment = entrance + 1;
    let visitedTown = false, returned = false;
    for (let t = 0; t < 180; t += .1) {
      driver.update(.1);
      visitedTown ||= driver.position.x < 0 && driver.position.z > 100;
      if (visitedTown && driver.position.x > 300) { returned = true; break; }
    }
    expect(visitedTown).toBe(true);
    expect(returned).toBe(true);
    expect(driver.departed).toBe(false);
  });

  it('keeps town traffic on pavement, including the junction back to the mountains', () => {
    const roads = HUB_LAYOUT.chunks.flatMap(c => c.roads);
    const onRoad = (x: number, z: number) => roads.some(r => r.points.slice(1).some((b, i) => {
      const a = r.points[i], dx = b.x - a.x, dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
      return Math.hypot(x - a.x - dx * t, z - a.z - dz * t) < (a.width + (b.width - a.width) * t) / 2 - 1;
    }));
    for (const lane of TRAFFIC_LANES.slice(1)) for (let i = 1; i < lane.length; i++) {
      const a = lane[i - 1], b = lane[i];
      if (a.x > 240 || b.x > 240) continue;
      for (let t = 0; t <= 1; t += .25) {
        const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
        expect(onRoad(x, z), `traffic pavement at ${x}, ${z}`).toBe(true);
      }
    }
    for (const lane of TRAFFIC_LANES.slice(2)) {
      expect(lane[0]).toEqual(lane[lane.length - 1]);
      expect(Math.max(...lane.map(p => p.z))).toBeGreaterThan(135);
    }
  });
});
