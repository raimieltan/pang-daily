import { describe, expect, it } from "vitest";
import { STARTER_SEDAN } from "../../vehicles/VehicleDefinition";
import { containsPoint, containsRect, footprint, minTurnRadius, pointAlong, polylineLength, rectsOverlap } from "../layoutTools";
import { PROP_KIT } from "../props/propKit";
import type { ChunkData, Pose, Rect, RoadPoint, Vec2 } from "../WorldLayout";
import { HUB_LAYOUT, LOOP_CORNER_RADIUS } from "./hubLayout";

const { chunks, locations, bounds, loop } = HUB_LAYOUT;
const DEG = Math.PI / 180;
const area = (r: Rect) => (r.maxX - r.minX) * (r.maxZ - r.minZ);
const roads = chunks.flatMap((c) => c.roads);
const PAVED = new Set(["asphalt", "concrete", "tile", "gravel"]);

/** Every static collider footprint in the hub (blocks and prop colliders). */
function colliderFootprints(): { what: string; rect: Rect }[] {
  const out: { what: string; rect: Rect }[] = [];
  for (const chunk of chunks) {
    for (const b of chunk.blocks) {
      if (b.collide) out.push({ what: `block@${chunk.id}`, rect: footprint([b.center[0], b.center[2]], [b.size[0], b.size[2]], b.rotDeg) });
    }
    for (const p of chunk.props) {
      const collider = (PROP_KIT[p.prop] as { collider?: { size: readonly number[]; at: readonly number[] } }).collider;
      if (!collider) continue;
      const s = p.scale ?? 1;
      const yaw = (p.rotDeg ?? 0) * DEG;
      const [lx, lz] = [collider.at[0] * s, collider.at[2] * s];
      const center: Vec2 = [p.at[0] + lx * Math.cos(yaw) + lz * Math.sin(yaw), p.at[1] - lx * Math.sin(yaw) + lz * Math.cos(yaw)];
      out.push({ what: `${p.prop}@${chunk.id}`, rect: footprint(center, [collider.size[0] * s, collider.size[2] * s], p.rotDeg) });
    }
  }
  return out;
}

function distanceToSegment(x: number, z: number, a: RoadPoint, b: RoadPoint) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return { d: Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)), width: a.width + (b.width - a.width) * t };
}

/** Inside the paved width of some road (with `margin` metres to spare on each side). */
function onRoad(x: number, z: number, margin = 0): boolean {
  return roads.some((road) =>
    road.points.slice(1).some((b, i) => {
      const { d, width } = distanceToSegment(x, z, road.points[i], b);
      return d <= width / 2 - margin;
    }),
  );
}

function onPavedSurface(x: number, z: number): boolean {
  return chunks.some((c) =>
    c.surfaces.some((s) => PAVED.has(s.kind) && containsPoint(footprint(s.center, s.size, s.rotDeg), x, z)),
  );
}

function carFootprint(pose: Pose): Rect {
  const { widthM, lengthM } = STARTER_SEDAN.spec.dimensions;
  return footprint([pose.x, pose.z], [widthM + 0.4, lengthM + 0.4], pose.headingDeg);
}

describe("hub chunks", () => {
  it("tile the layout bounds exactly, without overlapping", () => {
    expect(chunks.reduce((sum, c) => sum + area(c.rect), 0)).toBeCloseTo(area(bounds), 6);
    for (const [i, a] of chunks.entries()) {
      expect(containsRect(bounds, a.rect)).toBe(true);
      for (const b of chunks.slice(i + 1)) expect(rectsOverlap(a.rect, b.rect), `${a.id} × ${b.id}`).toBe(false);
    }
  });

  it("keep every surface, block, zone and prop inside their own chunk (streamable on its own)", () => {
    const escapes = (chunk: ChunkData) => [
      ...chunk.surfaces.filter((s) => !containsRect(chunk.rect, footprint(s.center, s.size, s.rotDeg))).map((s) => `surface ${s.kind} ${s.center}`),
      ...chunk.blocks
        .filter((b) => !containsRect(chunk.rect, footprint([b.center[0], b.center[2]], [b.size[0], b.size[2]], b.rotDeg)))
        .map((b) => `block ${b.center}`),
      ...chunk.zones.filter((z) => !containsRect(chunk.rect, z.rect)).map((z) => `zone ${z.id}`),
      ...chunk.props.filter((p) => !containsPoint(chunk.rect, p.at[0], p.at[1])).map((p) => `prop ${p.prop} ${p.at}`),
      ...chunk.lamps.filter((l) => !containsPoint(chunk.rect, l.at[0], l.at[2])).map((l) => `lamp ${l.id}`),
      ...chunk.roads.flatMap((r) => r.points.filter((p) => !containsPoint(chunk.rect, p.x, p.z, 1e-6)).map(() => `road ${r.id}`)),
    ];
    for (const chunk of chunks) expect(escapes(chunk), chunk.id).toEqual([]);
  });

  it("split roads exactly at the seams: every cut end meets a piece in the neighbouring chunk", () => {
    const ends = chunks.flatMap((chunk) =>
      chunk.roads.flatMap((road) => [road.points[0], road.points[road.points.length - 1]].map((p) => ({ chunk, road, p }))),
    );
    const onSeam = (r: Rect, p: RoadPoint) =>
      [r.minX, r.maxX].some((x) => Math.abs(p.x - x) < 1e-6) || [r.minZ, r.maxZ].some((z) => Math.abs(p.z - z) < 1e-6);
    for (const end of ends) {
      if (!onSeam(end.chunk.rect, end.p) || !containsPoint(bounds, end.p.x, end.p.z, -1e-6)) continue;
      const partner = ends.find(
        (o) => o.chunk !== end.chunk && Math.hypot(o.p.x - end.p.x, o.p.z - end.p.z) < 1e-6 && Math.abs(o.p.width - end.p.width) < 1e-6,
      );
      expect(partner, `${end.road.id} at (${end.p.x}, ${end.p.z})`).toBeDefined();
    }
  });

  it("give every chunk content, and ids that are unique across the hub", () => {
    for (const chunk of chunks) expect(chunk.props.length + chunk.blocks.length, chunk.id).toBeGreaterThan(10);
    const lampIds = chunks.flatMap((c) => c.lamps.map((l) => l.id));
    const zoneIds = chunks.flatMap((c) => c.zones.map((z) => z.id));
    expect(new Set(lampIds).size).toBe(lampIds.length);
    expect(new Set(zoneIds).size).toBe(zoneIds.length);
  });
});

describe("hub driving loop", () => {
  const points = loop.map(([x, z]) => ({ x, z }));
  /** Loop sampled every 2 m, so straight legs count as passing things too. */
  const samples = Array.from({ length: Math.ceil(polylineLength(points) / 2) }, (_, i) => pointAlong(points, i * 2));

  it("is closed and passes every location", () => {
    expect(loop[0]).toEqual(loop[loop.length - 1]);
    const near = (r: Rect, reach: number) => samples.some((p) => containsPoint(r, p.x, p.z, reach));
    for (const location of locations.filter((l) => l.id !== "main_road")) {
      expect(near(location.area, 30), location.id).toBe(true);
    }
  });

  it("has corners the starter sedan takes at speed, and lanes wide enough for it", () => {
    // Sedan full lock (32°) on a 2.5 m wheelbase turns ~4 m; loop corners are 5× that.
    expect(minTurnRadius(points)).toBeGreaterThan(LOOP_CORNER_RADIUS * 0.95);
    const loopRoad = roads.filter((r) => r.id.startsWith("loop@"));
    for (const road of loopRoad) for (const p of road.points) expect(p.width).toBeGreaterThanOrEqual(9);
    // Every centreline point is on paved road with room for the car on either side of it.
    for (const p of points) expect(onRoad(p.x, p.z, STARTER_SEDAN.spec.dimensions.widthM), `${p.x},${p.z}`).toBe(true);
  });

  it("has no collider on or overhanging the road", () => {
    const colliders = colliderFootprints();
    for (const { what, rect } of colliders) {
      const corners: Vec2[] = [
        [rect.minX, rect.minZ],
        [rect.maxX, rect.minZ],
        [rect.minX, rect.maxZ],
        [rect.maxX, rect.maxZ],
        [(rect.minX + rect.maxX) / 2, (rect.minZ + rect.maxZ) / 2],
      ];
      // Road closures are meant to block their stubs.
      if (what.startsWith("block") && corners.some(([x]) => x < -150 || x > 240)) continue;
      expect(corners.some(([x, z]) => onRoad(x, z, 0.3)), what).toBe(false);
    }
  });
});

describe("hub locations", () => {
  it("cover every slice location, each inside its chunk", () => {
    expect(locations.map((l) => l.id).sort()).toEqual(
      ["coffee_shop", "convenience_store", "gas_station", "home", "main_road", "talyer"].sort(),
    );
    for (const l of locations) {
      const chunk = chunks.find((c) => c.id === l.chunk)!;
      expect(containsRect(chunk.rect, l.area), l.id).toBe(true);
    }
  });

  it("spawn on pavement with the whole car clear of every collider", () => {
    const colliders = colliderFootprints();
    for (const l of locations) {
      for (const [kind, pose] of [
        ["spawn", l.spawn],
        ["return", l.returnPoint],
      ] as const) {
        expect(onRoad(pose.x, pose.z) || onPavedSurface(pose.x, pose.z), `${l.id} ${kind} paved`).toBe(true);
        const car = carFootprint(pose);
        const hits = colliders.filter((c) => rectsOverlap(c.rect, car)).map((c) => c.what);
        expect(hits, `${l.id} ${kind}`).toEqual([]);
      }
      expect(containsPoint(l.area, l.spawn.x, l.spawn.z), `${l.id} spawn in area`).toBe(true);
    }
  });

  it("return the car to the road itself, pointing along the right-hand lane", () => {
    for (const l of locations) expect(onRoad(l.returnPoint.x, l.returnPoint.z, 1), l.id).toBe(true);
  });

  it("have a walk-safe area at every social location, clear of roads and parking", () => {
    const zones = chunks.flatMap((c) => c.zones);
    for (const id of ["coffee_shop", "talyer", "gas_station", "convenience_store", "home"]) {
      expect(zones.some((z) => z.kind === "walk" && z.locationId === id), id).toBe(true);
    }
    const walks = zones.filter((z) => z.kind === "walk");
    const parking = zones.filter((z) => z.kind === "parking");
    for (const w of walks) {
      for (const p of parking) expect(rectsOverlap(w.rect, p.rect), `${w.id} × ${p.id}`).toBe(false);
      for (let x = w.rect.minX; x <= w.rect.maxX; x += 0.5) {
        for (let z = w.rect.minZ; z <= w.rect.maxZ; z += 0.5) expect(onRoad(x, z), `${w.id} at ${x},${z}`).toBe(false);
      }
    }
  });
});
