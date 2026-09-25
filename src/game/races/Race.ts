export type Point = { x: number; y: number; z: number };
// Babylon Vector3 exposes x/y/z through accessors. Object spread copies its
// private backing fields instead, so always snapshot coordinates explicitly.
const copyPoint = (p: Point): Point => ({ x: p.x, y: p.y, z: p.z });
export type Gate = { id: string; center: Point; halfSize: Point };
export type Waypoint = Point & { speed: number };
export type RaceDefinition = {
  id: string; name: string; mode: "point-to-point" | "touge" | "drag";
  start: Point; heading: number; checkpoints: readonly Gate[]; finish: Gate;
  waypoints: readonly Waypoint[];
};
export type RacePhase = "READY" | "COUNTDOWN" | "RUNNING" | "FINISHED" | "RESET";
export type RaceProgress = { raceId: string; phase: RacePhase; countdown: number; elapsedMs: number; checkpoint: number; total: number; next: string; invalidFinish: boolean };

/** Swept box entry catches thin gates even at high speed; y bounds support stacked roads. */
export function entry(a: Point, b: Point, gate: Gate): number | null {
  if (![a.x, a.y, a.z, b.x, b.y, b.z].every(Number.isFinite)) return null;
  let near = 0, far = 1;
  for (const axis of ["x", "y", "z"] as const) {
    const min = gate.center[axis] - gate.halfSize[axis], max = gate.center[axis] + gate.halfSize[axis];
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < 1e-9) { if (a[axis] < min || a[axis] > max) return null; }
    else {
      const t1 = (min - a[axis]) / delta, t2 = (max - a[axis]) / delta;
      near = Math.max(near, Math.min(t1, t2)); far = Math.min(far, Math.max(t1, t2));
      if (near > far) return null;
    }
  }
  return near;
}

export class CheckpointProgress {
  next = 0;
  finished = false;
  invalidFinish = false;
  constructor(readonly route: RaceDefinition) {}
  reset() { this.next = 0; this.finished = false; this.invalidFinish = false; }
  advance(a: Point, b: Point): number | null {
    if (this.finished) return null;
    let last = -1;
    while (this.next < this.route.checkpoints.length) {
      const t = entry(a, b, this.route.checkpoints[this.next]);
      if (t === null || t < last) break;
      last = t; this.next++; this.invalidFinish = false;
    }
    const finish = entry(a, b, this.route.finish);
    if (finish === null) return null;
    if (this.next !== this.route.checkpoints.length || finish < last) { this.invalidFinish = true; return null; }
    this.finished = true;
    return finish;
  }
}

export const RIVAL_TUNING = { speedScale: 1, acceleration: 4, braking: 7 };
/** Kinematic route follower. Fixed steps, no randomness or player physics. Brakes before slower segments. */
export class WaypointRival {
  position: Point;
  speed = 0;
  heading = 0;
  segment = 1;
  constructor(readonly points: readonly Waypoint[], readonly tuning = RIVAL_TUNING) {
    if (points.length < 2) throw new Error("Rival requires at least two waypoints");
    this.position = { ...points[0] };
    this.heading = Math.atan2(points[1].x - points[0].x, points[1].z - points[0].z);
  }
  reset() { this.position = { ...this.points[0] }; this.speed = 0; this.segment = 1; this.heading = Math.atan2(this.points[1].x - this.points[0].x, this.points[1].z - this.points[0].z); }
  get departed() { return this.segment >= this.points.length; }
  update(dt: number) {
    const target = this.points[this.segment];
    if (!target) { this.speed = 0; return; }
    const distance = Math.hypot(target.x - this.position.x, target.y - this.position.y, target.z - this.position.z);
    const limit = Math.min(this.points[this.segment - 1].speed * this.tuning.speedScale,
      Math.sqrt((target.speed * this.tuning.speedScale) ** 2 + 2 * this.tuning.braking * distance));
    this.speed += Math.max(-this.tuning.braking * dt, Math.min(this.tuning.acceleration * dt, limit - this.speed));
    let remaining = this.speed * dt;
    while (this.segment < this.points.length) {
      const p = this.points[this.segment];
      const d = Math.hypot(p.x - this.position.x, p.y - this.position.y, p.z - this.position.z);
      this.heading = Math.atan2(p.x - this.position.x, p.z - this.position.z);
      if (remaining < d) {
        for (const axis of ["x", "y", "z"] as const) this.position[axis] += (p[axis] - this.position[axis]) * remaining / d;
        break;
      }
      this.position = { ...p }; remaining -= d; this.segment++;
    }
  }
}

export class Race {
  phase: RacePhase = "READY";
  countdown = 3;
  elapsed = 0;
  player: CheckpointProgress;
  opponent: CheckpointProgress;
  rival: WaypointRival;
  playerTime: number | null = null;
  opponentTime: number | null = null;
  private accumulator = 0;
  private previous: Point;
  constructor(readonly route: RaceDefinition) {
    this.player = new CheckpointProgress(route); this.opponent = new CheckpointProgress(route);
    this.rival = new WaypointRival(route.waypoints); this.previous = copyPoint(route.start);
  }
  reset() {
    this.phase = "RESET"; this.player.reset(); this.opponent.reset(); this.rival.reset();
    this.countdown = 3; this.elapsed = 0; this.accumulator = 0;
    this.playerTime = this.opponentTime = null; this.previous = copyPoint(this.route.start);
  }
  start() { this.reset(); this.phase = "COUNTDOWN"; }
  update(dt: number, position: Point) {
    if (this.phase === "RESET") { this.phase = "READY"; return; }
    if (this.phase === "COUNTDOWN") {
      this.countdown = Math.max(0, this.countdown - dt);
      this.previous = copyPoint(position);
      if (this.countdown <= 1e-9) this.phase = "RUNNING";
      return;
    }
    if ((this.phase !== "RUNNING" && this.phase !== "FINISHED") || dt <= 0) return;
    const before = this.elapsed;
    this.accumulator += dt;
    const step = 1 / 120;
    while (this.accumulator + 1e-9 >= step) {
      const a = { ...this.rival.position };
      this.rival.update(step);
      if (this.phase === "RUNNING") {
        const hit = this.opponent.advance(a, this.rival.position);
        if (hit !== null) this.opponentTime = this.elapsed + hit * step;
        this.elapsed += step;
      }
      this.accumulator -= step;
    }
    // Keep driving after results without changing the race clock or standings.
    if (this.phase === "FINISHED") return;
    const hit = this.player.advance(this.previous, position);
    this.previous = copyPoint(position);
    if (hit !== null) { this.playerTime = before + hit * dt; this.phase = "FINISHED"; }
  }
  get position(): number {
    if (this.playerTime !== null) return this.opponentTime !== null && this.opponentTime < this.playerTime ? 2 : 1;
    if (this.opponentTime !== null) return 2;
    if (this.player.next !== this.opponent.next) return this.player.next > this.opponent.next ? 1 : 2;
    const gate = this.route.checkpoints[this.player.next] ?? this.route.finish;
    const distance = (p: Point) => Math.hypot(p.x - gate.center.x, p.z - gate.center.z);
    return distance(this.previous) <= distance(this.rival.position) ? 1 : 2;
  }
  snapshot(): RaceProgress {
    return { raceId: this.route.id, phase: this.phase, countdown: Math.ceil(this.countdown), elapsedMs: Math.round(this.elapsed * 1000),
      checkpoint: this.player.next, total: this.route.checkpoints.length, next: (this.route.checkpoints[this.player.next] ?? this.route.finish).id, invalidFinish: this.player.invalidFinish };
  }
}
