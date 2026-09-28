import type { DriverInput } from '../vehicles/handling/ArcadeHandlingModel';
import type { Point, Waypoint } from './Race';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export interface AIDriverInput { throttle: number; brake: number; steering: number; handbrake: number }
export interface AIDriverSkill {
  overall: number; brakingSkill: number; corneringSkill: number; throttleControl: number;
  racecraft: number; trafficAwareness: number; collisionAvoidance: number;
  recoverySkill: number; consistency: number; aggression: number;
  reactionTime: number; riskTolerance: number;
}
export interface DriverPersonality {
  aggression: number; patience: number; overtakingPreference: 'inside' | 'outside' | 'balanced';
  defensiveTendency: number; riskTolerance: number; trafficRiskTolerance: number; mistakeFrequency: number;
}
export type AILookahead = { immediate: number; tactical: number; braking: number; strategic: number };
export type CornerPhase = 'APPROACH' | 'BRAKING' | 'TURN_IN' | 'TRAIL_BRAKING' | 'APEX' | 'EXIT' | 'ACCELERATING';
export type LaneChangeState = 'NONE' | 'PREPARE' | 'MOVING' | 'COMPLETE' | 'ABORT';
export interface CornerMetadata {
  entry: Point; apex: Point; exit: Point; direction: 'left' | 'right';
  radius: number; recommendedEntrySpeed: number; recommendedApexSpeed: number;
  brakingPoint: Point; severity: number; entryS: number; apexS: number; exitS: number;
}
export interface RoadSegment {
  center: Point; forward: Point; width: number; roadOffset: number; leftBoundary: Point[]; rightBoundary: Point[];
  lanes: { offset: number; width: number }[]; curvature: number; grade: number;
  speedLimit?: number; corner?: CornerMetadata;
}
export interface VehicleFeedback {
  position: Point; heading: number; speed: number; yawRate: number; lateralSlip: number;
  frontGripUsage: number; rearGripUsage: number; grip: number;
}
export interface NearbyVehicle {
  position: Point; velocity: Point; kind: 'traffic' | 'opponent'; width: number; length: number;
}

export const DRIVER_SKILLS: readonly AIDriverSkill[] = [
  { overall: .36, brakingSkill: .35, corneringSkill: .35, throttleControl: .4, racecraft: .2, trafficAwareness: .65, collisionAvoidance: .6, recoverySkill: .25, consistency: .5, aggression: .2, reactionTime: .55, riskTolerance: .2 },
  { overall: .58, brakingSkill: .58, corneringSkill: .6, throttleControl: .6, racecraft: .5, trafficAwareness: .75, collisionAvoidance: .7, recoverySkill: .5, consistency: .7, aggression: .45, reactionTime: .35, riskTolerance: .45 },
  { overall: .78, brakingSkill: .8, corneringSkill: .8, throttleControl: .78, racecraft: .8, trafficAwareness: .85, collisionAvoidance: .82, recoverySkill: .75, consistency: .85, aggression: .65, reactionTime: .2, riskTolerance: .65 },
  { overall: .94, brakingSkill: .95, corneringSkill: .94, throttleControl: .93, racecraft: .94, trafficAwareness: .96, collisionAvoidance: .94, recoverySkill: .9, consistency: .94, aggression: .65, reactionTime: .1, riskTolerance: .7 },
];

/** Route samples describe road availability. They are never applied to the vehicle transform. */
export class RoadCorridor {
  readonly segments: RoadSegment[];
  readonly cumulative: number[] = [0];
  constructor(readonly points: readonly Waypoint[], width = 7) {
    if (points.length < 2) throw new Error('Road corridor needs at least two samples');
    for (let i = 1; i < points.length; i++) this.cumulative[i] = this.cumulative[i - 1] + distance(points[i - 1], points[i]);
    this.segments = points.map((p, i) => {
      const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
      const length = distance(a, b) || 1, fx = (b.x - a.x) / length, fz = (b.z - a.z) / length;
      const previous = points[Math.max(0, i - 2)], next = points[Math.min(points.length - 1, i + 2)];
      const angle = Math.atan2((p.x - previous.x) * (next.z - p.z) - (p.z - previous.z) * (next.x - p.x),
        (p.x - previous.x) * (next.x - p.x) + (p.z - previous.z) * (next.z - p.z));
      const curvature = -angle / Math.max(1, distance(previous, next) / 2);
      const roadWidth = 'width' in p && typeof p.width === 'number' ? p.width : width;
      const roadOffset = p.roadOffset ?? 0;
      const edge = (side: number): Point => ({ x: p.x + fz * (side * roadWidth / 2 - roadOffset), y: p.y,
        z: p.z - fx * (side * roadWidth / 2 - roadOffset) });
      return { center: p, forward: { x: fx, y: (b.y - a.y) / length, z: fz }, width: roadWidth, roadOffset,
        leftBoundary: [edge(-1)], rightBoundary: [edge(1)], lanes: [-1, 1].map(s => ({ offset: s * roadWidth / 4, width: roadWidth / 2 })),
        curvature, grade: (b.y - a.y) / length, speedLimit: p.speed };
    });
    // Consecutive curved samples form one corner, with entry/apex/exit shared by all its samples.
    for (let i = 0; i < this.segments.length;) {
      if (Math.abs(this.segments[i].curvature) < .008) { i++; continue; }
      const begin = i, sign = Math.sign(this.segments[i].curvature);
      let apex = i;
      while (i < this.segments.length && Math.sign(this.segments[i].curvature) === sign &&
        Math.abs(this.segments[i].curvature) >= .005) {
        if (Math.abs(this.segments[i].curvature) > Math.abs(this.segments[apex].curvature)) apex = i;
        i++;
      }
      const end = Math.min(this.segments.length - 1, i);
      const radius = 1 / Math.max(.0001, Math.abs(this.segments[apex].curvature));
      const corner: CornerMetadata = { entry: points[begin], apex: points[apex], exit: points[end],
        direction: sign > 0 ? 'right' : 'left', radius,
        recommendedEntrySpeed: points[begin].speed, recommendedApexSpeed: Math.min(points[apex].speed, Math.sqrt(radius * 5)),
        brakingPoint: points[Math.max(0, begin - 3)], severity: clamp(1 / radius * 15, 0, 1),
        entryS: this.cumulative[begin], apexS: this.cumulative[apex], exitS: this.cumulative[end] };
      for (let j = begin; j < i; j++) this.segments[j].corner = corner;
    }
  }
  nearest(p: Point, hint = 0) {
    let best = 0, d = Infinity;
    const scan = (a: number, b: number) => { for (let i = a; i < b; i++) { const q = distance(p, this.points[i]); if (q < d) { d = q; best = i; } } };
    scan(Math.max(0, hint - 20), Math.min(this.points.length, hint + 80));
    if (d > 35) scan(0, this.points.length);
    return best;
  }
  progress(p: Point, nearest: number) {
    let bestS = this.cumulative[nearest], bestDistance = Infinity;
    for (let i = Math.max(0, nearest - 1); i <= Math.min(this.points.length - 2, nearest); i++) {
      const a = this.points[i], b = this.points[i + 1], dx = b.x - a.x, dz = b.z - a.z;
      const t = clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
      const q = (p.x - a.x - t * dx) ** 2 + (p.z - a.z - t * dz) ** 2;
      if (q < bestDistance) { bestDistance = q; bestS = mix(this.cumulative[i], this.cumulative[i + 1], t); }
    }
    return bestS;
  }
  at(s: number) {
    let lo = 0, hi = this.cumulative.length - 1;
    while (hi - lo > 1) { const mid = (hi + lo) >> 1; if (this.cumulative[mid] < s) lo = mid; else hi = mid; }
    const t = clamp((s - this.cumulative[lo]) / (this.cumulative[hi] - this.cumulative[lo] || 1), 0, 1);
    const a = this.points[lo], b = this.points[hi];
    return { point: { x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), z: mix(a.z, b.z, t) }, index: lo,
      forward: this.segments[lo].forward, width: mix(this.segments[lo].width, this.segments[hi].width, t),
      roadOffset: mix(this.segments[lo].roadOffset, this.segments[hi].roadOffset, t) };
  }
}

/** Stateful driver decisions are held across many physics steps; only inputs reach the car. */
export class AIDriver {
  readonly road: RoadCorridor;
  phase: CornerPhase = 'APPROACH';
  laneChange: LaneChangeState = 'NONE';
  lookahead: AILookahead = { immediate: 5, tactical: 20, braking: 50, strategic: 100 };
  private index = 0;
  private clock = 0;
  private decisionAt = 0;
  private errorAt = 0;
  private cornerKey: CornerMetadata | undefined;
  private defendedCorner: CornerMetadata | undefined;
  private error = 0;
  private laneOffset = 0;
  private targetOffset = 0;
  private lastPosition?: Point;
  private stuckSeconds = 0;
  private reverseUntil = 0;
  private avoidUntilS = 0;
  private recoveryOffset = 0;
  private recoveryAttempts = 0;
  private held: AIDriverInput = { throttle: 0, brake: 0, steering: 0, handbrake: 0 };
  constructor(points: readonly Waypoint[], readonly skill: AIDriverSkill, readonly personality: DriverPersonality,
    readonly brakeDeceleration: number, readonly wheelbase: number, seed = 1) {
    this.road = new RoadCorridor(points);
    this.seed = seed >>> 0;
  }
  private seed: number;
  private random() { this.seed = (1664525 * this.seed + 1013904223) >>> 0; return this.seed / 4294967296; }
  reset() { this.index = 0; this.clock = this.decisionAt = this.errorAt = 0; this.cornerKey = this.defendedCorner = undefined;
    this.error = this.laneOffset = this.targetOffset = 0; this.phase = 'APPROACH'; this.laneChange = 'NONE';
    this.lastPosition = undefined; this.stuckSeconds = this.reverseUntil = this.avoidUntilS = this.recoveryOffset = this.recoveryAttempts = 0; }
  update(dt: number, car: VehicleFeedback, nearby: readonly NearbyVehicle[]): DriverInput {
    this.clock += dt;
    this.index = this.road.nearest(car.position, this.index);
    const speed = Math.max(0, car.speed), s = this.road.progress(car.position, this.index);
    this.lookahead = { immediate: 4 + speed * .35, tactical: 9 + speed * .8,
      braking: 18 + speed * 2.2, strategic: 35 + speed * 4 };
    const corner = this.road.segments[this.index].corner ??
      this.road.segments[this.road.at(s + this.lookahead.tactical).index].corner;
    if (corner !== this.cornerKey || (!corner && this.clock >= this.errorAt)) {
      this.cornerKey = corner; this.errorAt = this.clock + 3;
      this.error = (this.random() * 2 - 1) * (1 - this.skill.consistency) *
        (1 + this.personality.mistakeFrequency) * 1.5;
    }
    if (this.clock >= this.decisionAt) {
      this.decisionAt = this.clock + Math.max(.2, this.skill.reactionTime + .2);
      this.chooseLane(car, nearby, s);
    }
    const here = this.road.at(s), steerTarget = this.road.at(s + (corner ? 3 + speed * .18 : this.lookahead.immediate));
    const future = this.road.at(s + this.lookahead.tactical);
    const bend = this.road.segments[future.index].curvature;
    // Waypoints may follow a lane rather than the centre of the paved road.
    const leftEdge = Math.max(-here.width / 2 - here.roadOffset, -steerTarget.width / 2 - steerTarget.roadOffset) + 1.25;
    const rightEdge = Math.min(here.width / 2 - here.roadOffset, steerTarget.width / 2 - steerTarget.roadOffset) - 1.25;
    let cornerOffset = 0;
    if (corner) {
      const side = corner.direction === 'right' ? 1 : -1;
      const outside = (side > 0 ? leftEdge : rightEdge) * (.25 + .1 * this.skill.corneringSkill);
      const apex = (side > 0 ? rightEdge : leftEdge) * .12;
      if (s < corner.entryS) cornerOffset = outside;
      else if (s < corner.apexS) cornerOffset = mix(outside, apex,
        clamp((s - corner.entryS) / Math.max(4, corner.apexS - corner.entryS), 0, 1));
      else cornerOffset = mix(apex, outside * .75,
        clamp((s - corner.apexS) / Math.max(5, corner.exitS - corner.apexS), 0, 1));
      // A quick opposite bend rewards staying on the side needed for its entry.
      const next = this.road.segments[this.road.at(corner.exitS + 10).index].corner;
      if (next && next !== corner && next.direction !== corner.direction && s >= corner.apexS)
        cornerOffset = mix(cornerOffset, (side > 0 ? rightEdge : leftEdge) * .3, .6 * this.skill.racecraft);
    }
    if (s >= this.avoidUntilS) this.recoveryOffset = 0;
    this.targetOffset = clamp(this.recoveryOffset || (this.laneChange === 'MOVING' ? this.laneOffset : cornerOffset + this.error), leftEdge, rightEdge);
    const lateral = (car.position.x - here.point.x) * here.forward.z -
      (car.position.z - here.point.z) * here.forward.x;
    if (lateral > rightEdge - .2) this.targetOffset = Math.min(this.targetOffset, rightEdge - .8);
    if (lateral < leftEdge + .2) this.targetOffset = Math.max(this.targetOffset, leftEdge + .8);
    this.targetOffset = clamp(this.targetOffset, leftEdge, rightEdge);
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading), rx = fz, rz = -fx;
    const target = { x: steerTarget.point.x + steerTarget.forward.z * this.targetOffset,
      z: steerTarget.point.z - steerTarget.forward.x * this.targetOffset };
    const dx = target.x - car.position.x, dz = target.z - car.position.z;
    const localX = dx * Math.cos(car.heading) - dz * Math.sin(car.heading);
    const localZ = dx * Math.sin(car.heading) + dz * Math.cos(car.heading);
    const headingError = Math.atan2(localX, Math.max(1, localZ));
    const desiredYaw = clamp(headingError * 2.1 - car.lateralSlip * (1 + this.skill.recoverySkill), -1.5, 1.5);
    const maxAngle = Math.atan(this.wheelbase * 9.81 / Math.max(9, speed * speed));
    let steering = clamp(Math.atan(desiredYaw * this.wheelbase / Math.max(3, speed)) / maxAngle, -1, 1);
    if (car.rearGripUsage > .93 && Math.abs(car.lateralSlip) > .1) steering = clamp(steering - car.lateralSlip * this.skill.recoverySkill * 2, -1, 1);
    if (car.frontGripUsage > .94) steering *= .82;

    const grip = clamp(car.grip, .3, 1.3);
    const decel = Math.max(1, this.brakeDeceleration * grip *
      (.65 + .27 * this.skill.brakingSkill + .06 * this.personality.riskTolerance));
    // Waypoint speeds describe a cautious baseline for the road, not a car's top speed.
    // Grip and curvature below still set the actual corner limit for each driver.
    const pace = 1 + .55 * this.skill.overall;
    let desiredSpeed = Infinity, dangerDistance = Infinity;
    for (let i = this.index; i < this.road.points.length && this.road.cumulative[i] - s < this.lookahead.strategic; i++) {
      const q = this.road.segments[i], ahead = Math.max(0, this.road.cumulative[i] - s);
      const lateral = Math.sqrt(Math.max(1, grip * 9.81 * Math.min(1, this.skill.corneringSkill * .72 + .34)) / Math.max(.0001, Math.abs(q.curvature)));
      const cornerSpeed = Math.min((q.speedLimit ?? Infinity) * pace, lateral);
      const reachable = Math.sqrt(cornerSpeed ** 2 + 2 * decel * Math.max(0, ahead - speed * this.skill.reactionTime));
      if (reachable < desiredSpeed) { desiredSpeed = reachable; dangerDistance = ahead; }
    }
    if (!Number.isFinite(desiredSpeed)) desiredSpeed = this.road.points[this.index].speed * pace;
    // Only crawl when the wheels are about to leave the pavement. The steering corridor above keeps
    // a wide margin, and on a 6 m mountain lane its edge sits almost on the lane centre.
    const pavedRight = here.width / 2 - here.roadOffset - 1, pavedLeft = -here.width / 2 - here.roadOffset + 1;
    if (lateral > pavedRight || lateral < pavedLeft)
      desiredSpeed = Math.min(desiredSpeed, 12);
    const remaining = this.road.cumulative[this.road.cumulative.length - 1] - s;
    desiredSpeed = Math.min(desiredSpeed, Math.sqrt(2 * decel * Math.max(0, remaining - 2)));
    let alongside = false, trafficLimited = false;
    for (const other of nearby) {
      if (Math.abs(other.position.y - car.position.y) > 3) continue;
      const px = other.position.x - car.position.x, pz = other.position.z - car.position.z;
      const ahead = px * fx + pz * fz, side = px * rx + pz * rz;
      const closing = speed - other.velocity.x * fx - other.velocity.z * fz;
      const clearance = (other.width + 1.8) / 2 + .3 + .3 * this.skill.collisionAvoidance;
      alongside ||= ahead > -other.length / 2 - 1 && ahead < other.length / 2 + 1 &&
        Math.abs(side) < clearance + 2;
      if (ahead > -3 && ahead < this.lookahead.braking && Math.abs(side) < clearance) {
        const gap = Math.max(0, ahead - other.length / 2 - 3 - speed * this.skill.reactionTime);
        const ttc = closing > 0 ? gap / closing : Infinity;
        const caution = other.kind === 'traffic' ?
          5.2 - this.personality.trafficRiskTolerance - this.skill.trafficAwareness * .4 :
          3.8 - this.personality.riskTolerance * .6;
        // Match the lead vehicle's speed before the remaining gap is used up.
        // Adding its speed after the square root permits much too high an approach speed.
        if (ttc < caution) {
          const safeSpeed = Math.sqrt(Math.max(0, speed - closing) ** 2 + 2 * decel * gap);
          if (safeSpeed < desiredSpeed) { desiredSpeed = safeSpeed; trafficLimited = true; }
        }
        if (ttc < 1.5) {
          const emergencySpeed = Math.max(0, speed - decel * dt * 10);
          if (emergencySpeed < desiredSpeed) { desiredSpeed = emergencySpeed; trafficLimited = true; }
        }
      }
    }
    if (alongside && corner) desiredSpeed = Math.min(desiredSpeed,
      corner.recommendedApexSpeed * (.8 + .1 * this.skill.racecraft));
    const excess = speed - desiredSpeed;
    let brake = clamp(excess / Math.max(1, decel * (.45 + this.skill.reactionTime)), 0, 1);
    let throttle = clamp((desiredSpeed - speed) * .45, 0, 1);
    if (brake > .05) throttle = 0;
    if (!trafficLimited && corner && s >= corner.entryS && Math.abs(steering) > .2 && brake > 0 && brake < .5)
      brake = this.skill.brakingSkill > .55 ? Math.min(brake, .1 + .18 * this.skill.brakingSkill) : 0;
    if (corner && s >= corner.apexS && Math.abs(steering) > .35)
      throttle *= .4 + .55 * this.skill.throttleControl;
    if (car.rearGripUsage > .9 || Math.abs(car.lateralSlip) > .16) throttle *= this.skill.throttleControl * .7;
    if (car.frontGripUsage > .95) throttle *= .7;
    const movement = this.lastPosition && dt > 0 ? distance(car.position, this.lastPosition) / dt : Infinity;
    this.lastPosition = { x: car.position.x, y: car.position.y, z: car.position.z };
    const vehicleAhead = nearby.some(other => {
      if (Math.abs(other.position.y - car.position.y) > 3) return false;
      const dx = other.position.x - car.position.x, dz = other.position.z - car.position.z;
      return dx * fx + dz * fz > -1 && dx * fx + dz * fz < 8 &&
        Math.abs(dx * rx + dz * rz) < (other.width + 1.8) / 2 + .5;
    });
    if (this.clock < this.reverseUntil) {
      this.held = { throttle: 0, brake: 1, steering: 0, handbrake: 0 };
      return { throttle: 0, brake: 1, steer: 0, handbrake: false };
    }
    if (remaining > 8 && !vehicleAhead && throttle > .6 && Math.abs(car.speed) < 1 && movement < .4)
      this.stuckSeconds += dt;
    else this.stuckSeconds = 0;
    if (this.stuckSeconds > 1.2 + (1 - this.skill.recoverySkill) * .8) {
      const side = Math.abs(lateral) > .3 ? -Math.sign(lateral) : this.recoveryAttempts % 2 ? -1 : 1;
      this.recoveryOffset = (side > 0 ? rightEdge : leftEdge) * .75;
      this.recoveryAttempts++;
      this.avoidUntilS = s + 16;
      this.reverseUntil = this.clock + 2;
      this.stuckSeconds = 0;
      this.laneChange = 'NONE'; this.laneOffset = 0;
      this.held = { throttle: 0, brake: 1, steering: 0, handbrake: 0 };
      return { throttle: 0, brake: 1, steer: 0, handbrake: false };
    }
    if (remaining < 3 && speed < .5) {
      this.phase = 'APPROACH';
      this.held = { throttle: 0, brake: 0, steering: 0, handbrake: 0 };
      return { throttle: 0, brake: 0, steer: 0, handbrake: false };
    }
    this.phase = brake > .45 ? 'BRAKING' : brake > .05 && Math.abs(bend) > .008 ? 'TRAIL_BRAKING' :
      Math.abs(bend) > .015 ? (dangerDistance < this.lookahead.immediate ? 'APEX' : 'TURN_IN') :
      Math.abs(steering) > .15 ? 'EXIT' : throttle > .5 ? 'ACCELERATING' : 'APPROACH';
    this.held = { throttle, brake, steering, handbrake: 0 };
    return { throttle, brake, steer: steering, handbrake: false };
  }
  private chooseLane(car: VehicleFeedback, nearby: readonly NearbyVehicle[], s: number) {
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading), rx = fz, rz = -fx;
    const road = this.road.at(s), width = road.width;
    const leftEdge = -width / 2 - road.roadOffset + 1.4;
    const rightEdge = width / 2 - road.roadOffset - 1.4;
    const upcoming = this.road.segments[this.road.at(s + this.lookahead.tactical).index];
    const cornerSoon = upcoming.curvature;
    const behind = nearby.some(v => {
      if (v.kind !== 'opponent') return false;
      const dx = v.position.x - car.position.x, dz = v.position.z - car.position.z;
      const along = dx * fx + dz * fz;
      return Math.abs(v.position.y - car.position.y) < 3 && along < -2 && along > -18 &&
        Math.abs(dx * rx + dz * rz) < 3;
    });
    if (behind && upcoming.corner && this.defendedCorner !== upcoming.corner &&
      s < upcoming.corner.entryS && this.skill.racecraft * this.personality.defensiveTendency > .25) {
      this.laneOffset = (upcoming.corner.direction === 'right' ? rightEdge : leftEdge) * .7;
      this.laneChange = 'MOVING'; this.defendedCorner = upcoming.corner;
      return;
    }
    if (this.defendedCorner && s < this.defendedCorner.apexS) return;
    const blocked = nearby.filter(v => {
      const dx = v.position.x - car.position.x, dz = v.position.z - car.position.z;
      return Math.abs(v.position.y - car.position.y) < 3 && dx * fx + dz * fz > 0 &&
        dx * fx + dz * fz < (v.kind === 'traffic' ? this.lookahead.braking : this.lookahead.tactical) &&
        Math.abs(dx * rx + dz * rz) < (v.width + 1.8) / 2 + .5;
    });
    const traffic = blocked.find(v => v.kind === 'traffic');
    if (blocked.length && Math.abs(cornerSoon) < .025 && width >= 6 && this.laneChange === 'NONE' &&
      (traffic || this.personality.aggression + this.skill.racecraft > .55 + this.personality.patience * .25)) {
      const trafficSide = traffic ? (traffic.position.x - car.position.x) * rx + (traffic.position.z - car.position.z) * rz : 0;
      const preferred = traffic && Math.abs(trafficSide) > .3 ? -Math.sign(trafficSide) :
        this.personality.overtakingPreference === 'inside' ? Math.sign(cornerSoon) || -1 :
        this.personality.overtakingPreference === 'outside' ? -(Math.sign(cornerSoon) || -1) : 1;
      for (const sign of [preferred, -preferred]) {
        const offset = (sign > 0 ? rightEdge : leftEdge) * .9;
        const free = nearby.every(v => {
          const dx = v.position.x - car.position.x, dz = v.position.z - car.position.z;
          if (Math.abs(v.position.y - car.position.y) > 3) return true;
          const along = dx * fx + dz * fz;
          const closing = car.speed - v.velocity.x * fx - v.velocity.z * fz;
          const encounter = closing > 0 ? clamp(along / closing, 0, 3) : 0;
          const side = dx * rx + dz * rz + (v.velocity.x * rx + v.velocity.z * rz) * encounter;
          const clearance = (v.width + 1.8) / 2 + .55;
          return Math.abs(side - offset) > clearance ||
            Math.abs(along - closing * encounter) > v.length / 2 + 6 + car.speed * .3;
        });
        if (free) { this.laneOffset = offset; this.laneChange = 'MOVING'; break; }
      }
    } else if (!blocked.length && this.laneChange === 'MOVING') this.laneChange = 'COMPLETE';
    else if (this.laneChange === 'COMPLETE') { this.laneOffset = 0; this.laneChange = 'NONE'; }
  }
}
