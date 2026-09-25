import { describe, expect, it } from 'vitest';
import { RESIDENTS, NEIGHBORHOOD_CARS } from './population';
import { CONNECTED_LAYOUT } from './mountain/layout';
import { HUB_LAYOUT } from './hub/hubLayout';
import { footprint, rectsOverlap, containsPoint } from './layoutTools';
import { MOUNTAIN_HOMES } from './mountain/environment';
import { OVERLOOK } from './mountain/route';
import { PROP_KIT } from './props/propKit';

const cars = NEIGHBORHOOD_CARS.map(c => ({ car: c, rect: footprint([c.x, c.z], [1.8, 4.5], c.heading) }));
describe('neighborhood staging', () => {
  it('populates every requested area and the actual mountain house aprons', () => {
    for (const area of ['gas_station', 'talyer', 'streets', 'basketball_court', 'overlook', 'mountain_homes'])
      expect(RESIDENTS.filter(p => p.area === area).length).toBeGreaterThan(2);
    expect(new Set(RESIDENTS.map(p => p.id)).size).toBe(RESIDENTS.length);
    for (const p of RESIDENTS.filter(p => p.area === 'mountain_homes')) {
      expect(MOUNTAIN_HOMES.some(h => Math.hypot(p.x - h.x, p.z - h.z) < 2 && p.y === h.y)).toBe(true);
    }
    for (const p of RESIDENTS.filter(p => p.area === 'overlook')) expect(p.y).toBe(OVERLOOK.y);
  });
  it('keeps parked cars separated, away from spawn/return points and solid hub structures', () => {
    const blocks = HUB_LAYOUT.chunks.flatMap(c => c.blocks).filter(b => b.collide);
    const props = HUB_LAYOUT.chunks.flatMap(c => c.props).flatMap(p => {
      const collider = (PROP_KIT[p.prop] as { collider?: { size: readonly number[]; at: readonly number[] } }).collider;
      if (!collider) return [];
      const yaw = (p.rotDeg ?? 0) * Math.PI / 180, scale = p.scale ?? 1;
      const x = p.at[0] + (collider.at[0] * Math.cos(yaw) + collider.at[2] * Math.sin(yaw)) * scale;
      const z = p.at[1] + (-collider.at[0] * Math.sin(yaw) + collider.at[2] * Math.cos(yaw)) * scale;
      return [{ prop: p.prop, rect: footprint([x, z], [collider.size[0] * scale, collider.size[2] * scale], p.rotDeg) }];
    });
    for (const [i, { car, rect }] of cars.entries()) {
      for (const other of cars.slice(i + 1)) expect(rectsOverlap(rect, other.rect)).toBe(false);
      for (const location of CONNECTED_LAYOUT.locations) for (const pose of [location.spawn, location.returnPoint]) {
        expect(rectsOverlap(rect, footprint([pose.x, pose.z], [2.6, 5.3], pose.headingDeg)), `car ${i} vs ${location.id}`).toBe(false);
      }
      if (car.y) continue;
      for (const block of blocks) expect(rectsOverlap(rect, footprint([block.center[0], block.center[2]], [block.size[0], block.size[2]], block.rotDeg)), `car ${i} vs block ${block.center}`).toBe(false);
      for (const prop of props) expect(rectsOverlap(rect, prop.rect), `car ${i} vs ${prop.prop}`).toBe(false);
    }
  });
  it('keeps pedestrians and their complete walks out of parked cars', () => {
    for (const p of RESIDENTS) for (let i = 0; i <= 10; i++) {
      const x = p.x + ((p.to?.x ?? p.x) - p.x) * i / 10;
      const z = p.z + ((p.to?.z ?? p.z) - p.z) * i / 10;
      for (const { rect } of cars) expect(containsPoint(rect, x, z, .3), p.id).toBe(false);
    }
  });
  it('keeps hub residents and walks outside walls and traffic lanes', () => {
    const roads = HUB_LAYOUT.chunks.flatMap(c => c.roads).filter(r => r.kind !== 'driveway');
    const walls = HUB_LAYOUT.chunks.flatMap(c => c.blocks).filter(b => b.collide && b.center[1] - b.size[1] / 2 < 1.7 && b.center[1] + b.size[1] / 2 > .2);
    for (const p of RESIDENTS.filter(p => !p.y)) for (let i = 0; i <= 10; i++) {
      const x = p.x + ((p.to?.x ?? p.x) - p.x) * i / 10;
      const z = p.z + ((p.to?.z ?? p.z) - p.z) * i / 10;
      for (const b of walls) expect(containsPoint(footprint([b.center[0], b.center[2]], [b.size[0], b.size[2]], b.rotDeg), x, z, .25), `${p.id} vs wall ${b.center}`).toBe(false);
      for (const road of roads) for (let j = 1; j < road.points.length; j++) {
        const a = road.points[j - 1], b = road.points[j], dx = b.x - a.x, dz = b.z - a.z;
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
        expect(Math.hypot(x - a.x - dx * t, z - a.z - dz * t), `${p.id} vs ${road.id}`).toBeGreaterThan((a.width + (b.width - a.width) * t) / 2 + .25);
      }
    }
  });
});
