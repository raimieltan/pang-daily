import type { HandlingConfig } from '../vehicles/handling/HandlingConfig';
import type { Waypoint } from './Race';

const G = 9.81;
const KMH = 1 / 3.6;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/** Limits in metres and seconds, derived from the config used by the vehicle physics. */
export type CarLimits = {
  lateral: number; brake: number; accel: number; topSpeed: number;
  drag: number; rolling: number; engineBraking: number;
  lockAccel: number; minSteer: number; maxSteer: number; wheelbase: number;
};

export function carLimits(config: HandlingConfig, grip = .6): CarLimits {
  const friction = Math.min(config.tires.frontGrip, config.tires.rearGrip) * G;
  return {
    lateral: friction * grip,
    brake: Math.min(config.brakes.decelerationMps2, friction * .95),
    accel: config.drive.accelerationMps2,
    topSpeed: config.drive.topSpeedKmh * KMH,
    drag: config.drive.aeroDrag,
    rolling: config.drive.rollingResistanceMps2,
    engineBraking: config.drive.engineBrakingMps2,
    lockAccel: config.steering.fullLockLateralG * G,
    minSteer: Math.min(config.steering.minAngleDeg, config.steering.maxAngleDeg) * Math.PI / 180,
    maxSteer: config.steering.maxAngleDeg * Math.PI / 180,
    wheelbase: config.chassis.wheelbaseM,
  };
}

export function steeringLock(limits: CarLimits, speed: number) {
  return clamp(Math.atan(limits.wheelbase * limits.lockAccel / Math.max(speed * speed, 1e-3)),
    limits.minSteer, limits.maxSteer);
}

export function driveAccel(limits: CarLimits, speed: number) {
  return limits.accel * Math.max(0, 1 - (speed / limits.topSpeed) ** 2) -
    limits.drag * speed * speed - limits.rolling;
}

export type LineOptions = {
  level?: number;
  /** Minimum distance from the car centre to either pavement edge. */
  margin?: number;
  keepLane?: boolean;
  laneCross?: number;
};

/**
 * Find a minimum-time path within the road. The initial minimum-curvature path is
 * refined at each corner's approach, apex and exit against a speed profile that
 * includes lateral grip, the friction circle, braking, power and road grade.
 */
export function buildRacingLine(route: readonly Waypoint[], limits: CarLimits, options: LineOptions = {}): Waypoint[] {
  const { level = 1, margin = 1.3, keepLane = false, laneCross = .4 } = options;
  const n = route.length;
  if (n < 5) return route.map(point => ({ ...point }));

  const cumulative = [0];
  for (let i = 1; i < n; i++) cumulative[i] = cumulative[i - 1] +
    Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z);
  const normals = route.map((point, i) => {
    const before = route[Math.max(0, i - 1)], after = route[Math.min(n - 1, i + 1)];
    const length = Math.hypot(after.x - before.x, after.z - before.z) || 1;
    return { x: (after.z - before.z) / length, z: -(after.x - before.x) / length };
  });
  const low: number[] = [], high: number[] = [];
  for (const point of route) {
    const width = point.width ?? 7, centre = -(point.roadOffset ?? 0);
    let left = centre - width / 2 + margin;
    let right = centre + width / 2 - margin;
    if (keepLane && (point.roadOffset ?? 0) > 0) left = Math.max(left, centre + laneCross);
    if (left > right) left = right = (left + right) / 2;
    low.push(left);
    high.push(right);
  }

  let offset = route.map((_, i) => clamp(0, low[i], high[i]));
  const x = (i: number) => route[i].x + normals[i].x * offset[i];
  const z = (i: number) => route[i].z + normals[i].z * offset[i];
  for (const scale of [32, 16, 8, 4, 2, 1]) {
    if (4 * scale >= n) continue;
    for (let pass = 0; pass < 60; pass++) {
      for (let i = 2 * scale; i < n - 2 * scale; i++) {
        const targetX = (4 * (x(i - scale) + x(i + scale)) - x(i - 2 * scale) - x(i + 2 * scale)) / 6;
        const targetZ = (4 * (z(i - scale) + z(i + scale)) - z(i - 2 * scale) - z(i + 2 * scale)) / 6;
        const along = (targetX - route[i].x) * normals[i].x + (targetZ - route[i].z) * normals[i].z;
        offset[i] = clamp(along, low[i], high[i]);
      }
    }
  }

  const lateral = limits.lateral * level, braking = limits.brake * level;
  const profile = (candidate: readonly number[]): Waypoint[] => {
    const line = route.map((point, i) => ({
      x: point.x + normals[i].x * candidate[i], y: point.y,
      z: point.z + normals[i].z * candidate[i],
    }));
    const step = line.map((point, i) => i === 0 ? 0 :
      Math.hypot(point.x - line[i - 1].x, point.z - line[i - 1].z));
    const curvature = line.map((point, i) => {
      const before = line[Math.max(0, i - 2)], after = line[Math.min(n - 1, i + 2)];
      const long = Math.hypot(after.x - before.x, after.z - before.z);
      const incoming = Math.hypot(point.x - before.x, point.z - before.z);
      const outgoing = Math.hypot(after.x - point.x, after.z - point.z);
      const cross = Math.abs((point.x - before.x) * (after.z - before.z) -
        (point.z - before.z) * (after.x - before.x));
      return long * incoming * outgoing < 1e-6 ? 0 : 2 * cross / (long * incoming * outgoing);
    });
    const circle = (speed: number, i: number) =>
      Math.sqrt(Math.max(.04, 1 - (speed * speed * curvature[i] / lateral) ** 2));
    const speeds = curvature.map(value => Math.min(limits.topSpeed,
      Math.sqrt(lateral / Math.max(1e-5, value))));
    for (let i = 1; i < n; i++) {
      const speed = speeds[i - 1];
      const grade = (line[i].y - line[i - 1].y) / (step[i] || 1);
      const push = Math.min(driveAccel(limits, speed), lateral) * circle(speed, i - 1) - G * grade;
      speeds[i] = Math.min(speeds[i], Math.sqrt(Math.max(0, speed * speed + 2 * push * step[i])));
    }
    for (let i = n - 2; i >= 0; i--) {
      const speed = speeds[i + 1];
      const grade = (line[i + 1].y - line[i].y) / (step[i + 1] || 1);
      const slow = braking * circle(speed, i + 1) + limits.drag * speed * speed + G * grade;
      speeds[i] = Math.min(speeds[i], Math.sqrt(Math.max(0,
        speed * speed + 2 * Math.max(.5, slow) * step[i + 1])));
    }
    return line.map((point, i) => ({ ...point, speed: speeds[i], width: route[i].width ?? 7,
      roadOffset: (route[i].roadOffset ?? 0) + candidate[i] }));
  };

  // Consecutive signed curvature samples describe a corner. Its weighted centre
  // is the apex; long constant-radius turns place it halfway around the arc.
  const bend = route.map((point, i) => {
    const before = route[Math.max(0, i - 2)], after = route[Math.min(n - 1, i + 2)];
    const incomingX = point.x - before.x, incomingZ = point.z - before.z;
    const outgoingX = after.x - point.x, outgoingZ = after.z - point.z;
    const angle = Math.atan2(incomingX * outgoingZ - incomingZ * outgoingX,
      incomingX * outgoingX + incomingZ * outgoingZ);
    return angle / Math.max(1, (cumulative[Math.min(n - 1, i + 2)] - cumulative[Math.max(0, i - 2)]) / 2);
  });
  const corners: { apexS: number; length: number; inside: number }[] = [];
  for (let i = 2; i < n - 2;) {
    const sign = Math.sign(bend[i]);
    if (Math.abs(bend[i]) < .005) { i++; continue; }
    const start = i;
    let weighted = 0, weight = 0, turn = 0;
    while (i < n - 2 && Math.sign(bend[i]) === sign && Math.abs(bend[i]) >= .005) {
      const arc = cumulative[i] - cumulative[i - 1];
      const localTurn = Math.abs(bend[i]) * arc;
      weighted += cumulative[i] * localTurn;
      weight += localTurn;
      turn += localTurn;
      i++;
    }
    if (turn >= .17) corners.push({ apexS: weighted / weight,
      length: cumulative[i - 1] - cumulative[start], inside: -sign });
  }

  let best = profile(offset);
  let bestTime = lineTime(best);
  const attack = clamp((level - .75) / .2, .25, 1);
  for (const corner of corners) {
    const reach = clamp(corner.length * .75, 28, 55);
    const radius = clamp(corner.length, 35, 65);
    for (const amount of [1.5, 3, 4.5]) {
      const trial = offset.slice();
      for (let i = 1; i < n - 1; i++) {
        const bell = (centre: number) => {
          const distance = Math.abs(cumulative[i] - centre);
          return distance < radius ? (1 + Math.cos(Math.PI * distance / radius)) / 2 : 0;
        };
        const change = corner.inside * amount * attack * (
          .35 * bell(corner.apexS) - bell(corner.apexS - reach) - bell(corner.apexS + reach));
        if (change) trial[i] = clamp(trial[i] + change, low[i], high[i]);
      }
      const candidate = profile(trial);
      const time = lineTime(candidate);
      if (time + .001 < bestTime) { bestTime = time; best = candidate; offset = trial; }
    }
  }
  for (let pass = 0; pass < 2; pass++) {
    for (const corner of corners) {
      const reach = clamp(corner.length * .75, 28, 55);
      const radius = clamp(corner.length * .7, 25, 50);
      for (const centre of [corner.apexS - reach, corner.apexS, corner.apexS + reach]) {
        let choice: number[] | undefined;
        for (const delta of [-3, -1.5, 1.5, 3]) {
          const trial = offset.slice();
          for (let i = 1; i < n - 1; i++) {
            const distance = Math.abs(cumulative[i] - centre);
            if (distance >= radius) continue;
            const shape = (1 + Math.cos(Math.PI * distance / radius)) / 2;
            trial[i] = clamp(trial[i] + delta * attack * shape, low[i], high[i]);
          }
          const candidate = profile(trial);
          const time = lineTime(candidate);
          if (time + .001 < bestTime) { bestTime = time; best = candidate; choice = trial; }
        }
        if (choice) offset = choice;
      }
    }
  }
  return best;
}

/** Seconds to drive the planned line at its target speeds. */
export function lineTime(line: readonly Waypoint[]) {
  let seconds = 0;
  for (let i = 1; i < line.length; i++) {
    seconds += Math.hypot(line[i].x - line[i - 1].x, line[i].z - line[i - 1].z) /
      Math.max(1, (line[i].speed + line[i - 1].speed) / 2);
  }
  return seconds;
}
