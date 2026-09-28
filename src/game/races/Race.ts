import type { RaceRival } from "./rivals";

export type Point = { x: number; y: number; z: number };
// Babylon Vector3 exposes x/y/z through accessors. Object spread copies its
// private backing fields instead, so always snapshot coordinates explicitly.
const copyPoint = (p: Point): Point => ({ x: p.x, y: p.y, z: p.z });
export type Gate = { id: string; center: Point; halfSize: Point };
export type Waypoint = Point & { speed: number; width?: number; roadOffset?: number };
export type RaceDefinition = {
  id: string; name: string; mode: "point-to-point" | "touge" | "drag";
  start: Point; heading: number; checkpoints: readonly Gate[]; finish: Gate;
  waypoints: readonly Waypoint[];
  /** Named opponent in a built car; without one it's an anonymous stock Dalagan at the base pace. */
  rival?: RaceRival;
};
export type RacePhase = "READY" | "COUNTDOWN" | "RUNNING" | "FINISHED" | "DNF" | "RESET";
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

export class Race {
  phase: RacePhase = "READY";
  countdown = 3;
  elapsed = 0;
  player: CheckpointProgress;
  opponent: CheckpointProgress;
  /** Measured rigid-body pose, updated by RaceSystem after each physics frame. */
  rival: { position: Point; speed: number; heading: number; departed: boolean };
  playerTime: number | null = null;
  opponentTime: number | null = null;
  private previous: Point;
  private previousOpponent: Point;
  constructor(readonly route: RaceDefinition) {
    this.player = new CheckpointProgress(route); this.opponent = new CheckpointProgress(route);
    const first = route.waypoints[0], second = route.waypoints[1];
    this.rival = { position: copyPoint(first), speed: 0, heading: Math.atan2(second.x-first.x, second.z-first.z), departed: false };
    this.previous = copyPoint(route.start); this.previousOpponent = copyPoint(first);
  }
  reset() {
    this.phase = "RESET"; this.player.reset(); this.opponent.reset();
    const first = this.route.waypoints[0], second = this.route.waypoints[1];
    this.rival.position = copyPoint(first); this.rival.speed = 0;
    this.rival.heading = Math.atan2(second.x-first.x, second.z-first.z); this.rival.departed = false;
    this.countdown = 3; this.elapsed = 0;
    this.playerTime = this.opponentTime = null; this.previous = copyPoint(this.route.start); this.previousOpponent = copyPoint(first);
  }
  start() { this.reset(); this.phase = "COUNTDOWN"; }
  update(dt: number, position: Point, opponentPosition: Point = this.rival.position) {
    if (this.phase === "RESET") { this.phase = "READY"; return; }
    if (this.phase === "COUNTDOWN") {
      this.countdown = Math.max(0, this.countdown - dt);
      this.previous = copyPoint(position);
      this.previousOpponent = copyPoint(opponentPosition);
      if (this.countdown <= 1e-9) this.phase = "RUNNING";
      return;
    }
    if ((this.phase !== "RUNNING" && this.phase !== "FINISHED") || dt <= 0) return;
    const before = this.elapsed;
    this.rival.position = copyPoint(opponentPosition);
    if (this.phase === "RUNNING") {
      const opponentHit = this.opponent.advance(this.previousOpponent, opponentPosition);
      if (opponentHit !== null) this.opponentTime = this.elapsed + opponentHit * dt;
      this.elapsed += dt;
    }
    this.previousOpponent = copyPoint(opponentPosition);
    // Keep driving after results without changing the race clock or standings.
    if (this.phase === "FINISHED") return;
    const hit = this.player.advance(this.previous, position);
    this.previous = copyPoint(position);
    if (hit !== null) { this.playerTime = before + hit * dt; this.phase = "FINISHED"; }
  }
  abort(): boolean {
    if (this.phase !== 'COUNTDOWN' && this.phase !== 'RUNNING') return false;
    this.phase = 'DNF';
    return true;
  }
  validation() {
    return { completedCheckpoints: this.player.next, totalCheckpoints: this.route.checkpoints.length,
      finishValidated: this.phase === 'FINISHED' && this.player.finished, invalidFinish: this.player.invalidFinish };
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
