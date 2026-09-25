import { POLE_WIRE_HEIGHT, POLE_WIRE_OFFSETS, type PropId } from "./props/propKit";
import type {
  BlockData,
  ChunkData,
  LampData,
  PropPlacement,
  Rect,
  RoadData,
  RoadPoint,
  SurfaceData,
  Vec2,
  WireSpan,
  ZoneData,
} from "./WorldLayout";

/**
 * Authoring helpers for `WorldLayout`s. Content is written once in world space with a
 * `LayoutAuthor`, then `partition` cuts it into chunks: roads are clipped at chunk edges
 * (so neighbouring pieces meet exactly) and everything else goes to the chunk holding its
 * anchor point. Pure functions only; no Babylon.
 */

const DEG = Math.PI / 180;

export function rect(minX: number, minZ: number, maxX: number, maxZ: number): Rect {
  return { minX, minZ, maxX, maxZ };
}

/** Rectangle from a centre and full size. */
export function rectAround([x, z]: Vec2, [w, d]: Vec2): Rect {
  return rect(x - w / 2, z - d / 2, x + w / 2, z + d / 2);
}

export function containsPoint(r: Rect, x: number, z: number, epsilon = 0): boolean {
  return x >= r.minX - epsilon && x <= r.maxX + epsilon && z >= r.minZ - epsilon && z <= r.maxZ + epsilon;
}

export function containsRect(outer: Rect, inner: Rect, epsilon = 1e-6): boolean {
  return (
    inner.minX >= outer.minX - epsilon &&
    inner.maxX <= outer.maxX + epsilon &&
    inner.minZ >= outer.minZ - epsilon &&
    inner.maxZ <= outer.maxZ + epsilon
  );
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ;
}

/** Ground footprint of a (possibly rotated) box centred at `center`. */
export function footprint([x, z]: Vec2, [w, d]: Vec2, rotDeg = 0): Rect {
  const c = Math.abs(Math.cos(rotDeg * DEG));
  const s = Math.abs(Math.sin(rotDeg * DEG));
  return rectAround([x, z], [w * c + d * s, w * s + d * c]);
}

/**
 * Rounds every interior corner of a centreline into a circular arc of `radius`
 * (shrunk where the neighbouring segments are too short). Width is carried through.
 */
export function filletPolyline(points: readonly RoadPoint[], radius: number, segmentsPer90 = 8): RoadPoint[] {
  if (points.length < 3) return [...points];
  const out: RoadPoint[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = out[out.length - 1];
    const p = points[i];
    const next = points[i + 1];
    const inLen = Math.hypot(p.x - prev.x, p.z - prev.z);
    const outLen = Math.hypot(next.x - p.x, next.z - p.z);
    const ax = (p.x - prev.x) / inLen;
    const az = (p.z - prev.z) / inLen;
    const bx = (next.x - p.x) / outLen;
    const bz = (next.z - p.z) / outLen;
    const cross = ax * bz - az * bx;
    const deflection = Math.acos(Math.max(-1, Math.min(1, ax * bx + az * bz)));
    if (deflection < 1e-3) {
      out.push(p);
      continue;
    }
    // Leave room for the next corner's fillet by using at most half of the outgoing segment.
    const tangent = Math.min(radius * Math.tan(deflection / 2), inLen, outLen / 2);
    const r = tangent / Math.tan(deflection / 2);
    const side = Math.sign(cross);
    const t1x = p.x - ax * tangent;
    const t1z = p.z - az * tangent;
    // Left normal of (ax, az) in x/z is (-az, ax); a left turn (cross > 0) curves that way.
    const cx = t1x - az * r * side;
    const cz = t1z + ax * r * side;
    const start = Math.atan2(t1z - cz, t1x - cx);
    const steps = Math.max(2, Math.ceil((segmentsPer90 * deflection) / (Math.PI / 2)));
    for (let s = 0; s <= steps; s++) {
      const angle = start + (side * deflection * s) / steps;
      out.push({ x: cx + Math.cos(angle) * r, z: cz + Math.sin(angle) * r, width: p.width });
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

/** Smallest turning radius along a centreline (∞ for a straight line). Three-point circumradius. */
export function minTurnRadius(points: readonly { x: number; z: number }[]): number {
  let min = Infinity;
  for (let i = 1; i < points.length - 1; i++) {
    const [a, b, c] = [points[i - 1], points[i], points[i + 1]];
    const ab = Math.hypot(b.x - a.x, b.z - a.z);
    const bc = Math.hypot(c.x - b.x, c.z - b.z);
    const ca = Math.hypot(a.x - c.x, a.z - c.z);
    const area2 = Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x));
    if (area2 < 1e-9) continue;
    min = Math.min(min, (ab * bc * ca) / (2 * area2));
  }
  return min;
}

/** Cuts a polyline into the pieces inside `r`, splitting segments exactly on its edges. */
export function clipPolyline(points: readonly RoadPoint[], r: Rect): RoadPoint[][] {
  const pieces: RoadPoint[][] = [];
  let current: RoadPoint[] = [];
  const flush = () => {
    if (current.length >= 2) pieces.push(current);
    current = [];
  };
  for (let i = 0; i < points.length - 1; i++) {
    const clipped = clipSegment(points[i], points[i + 1], r);
    if (!clipped) {
      flush();
      continue;
    }
    const [a, b] = clipped;
    const last = current[current.length - 1];
    if (!last || Math.hypot(last.x - a.x, last.z - a.z) > 1e-6) {
      flush();
      current.push(a);
    }
    current.push(b);
  }
  flush();
  return pieces;
}

/** Liang–Barsky against an axis-aligned rect, interpolating width. */
function clipSegment(a: RoadPoint, b: RoadPoint, r: Rect): [RoadPoint, RoadPoint] | null {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, a.x - r.minX],
    [dx, r.maxX - a.x],
    [-dz, a.z - r.minZ],
    [dz, r.maxZ - a.z],
  ];
  for (const [p, q] of edges) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  if (t1 - t0 < 1e-9) return null;
  const at = (t: number): RoadPoint => ({ x: a.x + dx * t, z: a.z + dz * t, width: a.width + (b.width - a.width) * t });
  return [at(t0), at(t1)];
}

/** Point `distance` metres along a polyline (clamped), with its unit direction. */
export function pointAlong(points: readonly { x: number; z: number }[], distance: number) {
  let remaining = distance;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (remaining <= len || i === points.length - 2) {
      const t = len > 0 ? Math.min(1, remaining / len) : 0;
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, dirX: (b.x - a.x) / len, dirZ: (b.z - a.z) / len };
    }
    remaining -= len;
  }
  const p = points[0];
  return { x: p.x, z: p.z, dirX: 0, dirZ: 1 };
}

export function polylineLength(points: readonly { x: number; z: number }[]): number {
  let length = 0;
  for (let i = 0; i < points.length - 1; i++) length += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].z - points[i].z);
  return length;
}

/** Heading (degrees, 0 = +z, 90 = +x) of a direction on the ground. */
export function headingOf(dx: number, dz: number): number {
  return Math.atan2(dx, dz) / DEG;
}

type ChunkContent = Omit<ChunkData, "id" | "rect">;

/**
 * Collects world-space content, then `partition` distributes it into chunks.
 * Methods return `this` where chaining helps.
 */
export class LayoutAuthor {
  readonly roads: RoadData[] = [];
  readonly surfaces: SurfaceData[] = [];
  readonly blocks: BlockData[] = [];
  readonly props: PropPlacement[] = [];
  readonly lamps: LampData[] = [];
  readonly wires: WireSpan[] = [];
  readonly zones: ZoneData[] = [];

  road(road: RoadData): this {
    this.roads.push(road);
    return this;
  }

  surface(surface: SurfaceData): this {
    this.surfaces.push(surface);
    return this;
  }

  block(block: BlockData): this {
    this.blocks.push(block);
    return this;
  }

  prop(prop: PropId, at: Vec2, options: Omit<PropPlacement, "prop" | "at"> = {}): this {
    this.props.push({ prop, at, ...options });
    return this;
  }

  lamp(lamp: LampData): this {
    this.lamps.push(lamp);
    return this;
  }

  zone(zone: ZoneData): this {
    this.zones.push(zone);
    return this;
  }

  /**
   * Tiles a wall prop (3 m module) from `from` to `to`, stretching the modules slightly so
   * the run ends exactly at `to`. The wall's front (+z) faces left of the direction of travel.
   */
  wallRun(from: Vec2, to: Vec2, prop: "concrete_wall_3m" | "concrete_wall_low_3m" = "concrete_wall_3m"): this {
    const dx = to[0] - from[0];
    const dz = to[1] - from[1];
    const length = Math.hypot(dx, dz);
    const count = Math.max(1, Math.round(length / 3));
    // Prop +x runs along the wall; a yaw of heading-90 turns +x onto the run direction.
    const rotDeg = headingOf(dx, dz) - 90;
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      this.prop(prop, [from[0] + dx * t, from[1] + dz * t], { rotDeg, scale: length / count / 3 });
    }
    return this;
  }

  /**
   * Utility poles along a path with three sagging wires between neighbours.
   * Every `transformerEvery`-th pole carries a transformer.
   */
  poleLine(path: readonly Vec2[], transformerEvery = 3, sag = 0.9): this {
    let previous: { x: number; z: number; rot: number } | null = null;
    path.forEach(([x, z], i) => {
      const next = path[Math.min(i + 1, path.length - 1)];
      const prev = path[Math.max(i - 1, 0)];
      // Yaw = line heading puts the crossarm (prop x) across the line, so the wires run along it.
      const rot = headingOf(next[0] - prev[0], next[1] - prev[1]);
      this.prop(i % transformerEvery === 1 ? "utility_pole_transformer" : "utility_pole", [x, z], { rotDeg: rot });
      if (previous) {
        for (const offset of POLE_WIRE_OFFSETS) {
          this.wires.push({
            from: attachPoint(previous.x, previous.z, previous.rot, offset),
            to: attachPoint(x, z, rot, offset),
            sag,
          });
        }
      }
      previous = { x, z, rot };
    });
    return this;
  }

  /** Sodium street lamp at `at` whose head reaches toward `headingDeg`, plus its light. */
  streetLamp(id: string, at: Vec2, headingDeg: number): this {
    this.prop("street_lamp", at, { rotDeg: headingDeg });
    const reach = 2.2;
    this.lamp({
      id,
      at: [at[0] + Math.sin(headingDeg * DEG) * reach, 6.6, at[1] + Math.cos(headingDeg * DEG) * reach],
      profile: "sodium",
    });
    return this;
  }

  /** Splits everything into chunks. Throws if some content falls outside every chunk. */
  partition(chunks: readonly { id: string; rect: Rect }[]): ChunkData[] {
    const content = new Map<string, ChunkContent & { [K in keyof ChunkContent]: ChunkContent[K][number][] }>(
      chunks.map(({ id }) => [id, { roads: [], surfaces: [], blocks: [], props: [], lamps: [], wires: [], zones: [] }]),
    );
    const owner = (x: number, z: number, what: string) => {
      // Half-open ownership so a point on a shared edge belongs to exactly one chunk.
      const chunk =
        chunks.find(({ rect: r }) => x >= r.minX && x < r.maxX && z >= r.minZ && z < r.maxZ) ??
        chunks.find(({ rect: r }) => containsPoint(r, x, z));
      if (!chunk) throw new Error(`${what} at (${x.toFixed(1)}, ${z.toFixed(1)}) is outside every chunk`);
      return content.get(chunk.id)!;
    };

    for (const road of this.roads) {
      for (const { id, rect: r } of chunks) {
        clipPolyline(road.points, r).forEach((points, i) =>
          content.get(id)!.roads.push({ ...road, id: `${road.id}@${id}${i ? `#${i}` : ""}`, points }),
        );
      }
    }
    for (const s of this.surfaces) owner(s.center[0], s.center[1], "surface").surfaces.push(s);
    for (const b of this.blocks) owner(b.center[0], b.center[2], "block").blocks.push(b);
    for (const p of this.props) owner(p.at[0], p.at[1], `prop ${p.prop}`).props.push(p);
    for (const l of this.lamps) owner(l.at[0], l.at[2], `lamp ${l.id}`).lamps.push(l);
    for (const w of this.wires) owner(w.from[0], w.from[2], "wire").wires.push(w);
    for (const z of this.zones) {
      owner((z.rect.minX + z.rect.maxX) / 2, (z.rect.minZ + z.rect.maxZ) / 2, `zone ${z.id}`).zones.push(z);
    }
    return chunks.map(({ id, rect: r }) => ({ id, rect: r, ...content.get(id)! }));
  }
}

function attachPoint(x: number, z: number, rotDeg: number, offset: number): [number, number, number] {
  // Prop +x rotated by the pole's yaw.
  const c = Math.cos(rotDeg * DEG);
  const s = Math.sin(rotDeg * DEG);
  return [x + offset * c, POLE_WIRE_HEIGHT + 0.08, z - offset * s];
}
