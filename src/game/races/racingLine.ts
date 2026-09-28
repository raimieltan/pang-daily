import type { HandlingConfig } from '../vehicles/handling/HandlingConfig';
import type { Waypoint } from './Race';

const G = 9.81;
const KMH = 1 / 3.6;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1), 0, 1);
  return t * t * (3 - 2 * t);
};

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

/** Shape of every generated line. All values are tunable; distances in metres. */
export const LINE_TUNING = {
  /**
   * Curvature treated as a full hairpin (severity 1): a 25 m radius. The mountain road's
   * tightest fillet is 48 m, which a car arriving at 100 km/h meets as a sharp corner.
   */
  referenceHairpinCurvature: 1 / 25,
  /** Severity scale for a corner turning through little (first) and a lot (second) of angle. */
  turnWeight: [.75, 1.2] as readonly [number, number],
  /** Severity band over which the apex goes from a soft tendency to a hard target. */
  minimumMeaningfulCorner: .05,
  strongCornerThreshold: .7,
  /** Share of the arc the apex moves later by, at severity 0 / .45 / 1. */
  lateApexBias: [0, .04, .09] as readonly [number, number, number],
  /** Body gap to the pavement edge at the apex and on the outside. */
  apexBodyClearance: .15,
  outsideBodyClearance: .3,
  /** Opposite corners closer than this (exit to next entry) share a compromised track-out. */
  linkedGap: 30,
};

export type LineOptions = {
  level?: number;
  /** Minimum distance from the car centre to either pavement edge when the car size is unknown. */
  margin?: number;
  /** Half the car's body width. With it, margins become body clearances instead of `margin`. */
  halfWidth?: number;
  apexClearance?: number;
  outsideClearance?: number;
  keepLane?: boolean;
  laneCross?: number;
};

/** One meaningful corner of the planned line. Offsets are lateral, + right, from the route sample. */
export interface RacingCorner {
  entryS: number; apexS: number; exitS: number;
  entryIndex: number; apexIndex: number; exitIndex: number;
  direction: 'left' | 'right';
  /** 0 kink … 1 hairpin. */
  severity: number;
  totalTurn: number; maxCurvature: number;
  entryOffset: number; apexOffset: number; exitOffset: number;
  /** How hard the apex is held against the inside limit (0 soft … ~.95 hairpin). */
  apexStrength: number;
}

export type RacingLinePlan = {
  points: Waypoint[];
  corners: RacingCorner[];
  /** Safe corridor for the car centre at each route sample, as lateral offsets (+ right). */
  low: number[]; high: number[];
  /** Route distance of each sample. */
  cumulative: number[];
};

/** Speed-weighted shape severity → how strongly the apex is pinned. */
export function apexStrength(severity: number, totalTurn = Math.PI) {
  const shape = mix(.15, .95, smoothstep(LINE_TUNING.minimumMeaningfulCorner, LINE_TUNING.strongCornerThreshold, severity));
  // A short sharp kink barely changes direction; it does not need the inside kerb.
  return shape * mix(.55, 1, smoothstep(.17, .8, totalTurn));
}

export function lateApexBias(severity: number) {
  const [gentle, medium, hairpin] = LINE_TUNING.lateApexBias;
  if (severity < .2) return gentle;
  return severity < .45 ? mix(gentle, medium, (severity - .2) / .25) : mix(medium, hairpin, (severity - .45) / .55);
}

/** Planned racing line for the car; see `planRacingLine`. */
export function buildRacingLine(route: readonly Waypoint[], limits: CarLimits, options: LineOptions = {}): Waypoint[] {
  return planRacingLine(route, limits, options).points;
}

/**
 * Plans an outside → apex → outside line with a speed profile:
 *
 *   bounds → minimum-curvature path → corners → apex limits → constrained minimum-curvature path
 *   → speed profile → local time optimisation → apex constraints reapplied → final speed profile
 *
 * The profile includes lateral grip, the friction circle, braking, power and road grade.
 */
export function planRacingLine(route: readonly Waypoint[], limits: CarLimits, options: LineOptions = {}): RacingLinePlan {
  const { level = 1, margin = 1.3, keepLane = false, laneCross = .4 } = options;
  const apexMargin = options.halfWidth !== undefined ?
    options.halfWidth + (options.apexClearance ?? LINE_TUNING.apexBodyClearance) : margin;
  const outsideMargin = options.halfWidth !== undefined ?
    options.halfWidth + (options.outsideClearance ?? LINE_TUNING.outsideBodyClearance) : margin;
  const n = route.length;
  const cumulative = [0];
  for (let i = 1; i < n; i++) cumulative[i] = cumulative[i - 1] +
    Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z);
  if (n < 5) return { points: route.map(point => ({ ...point })), corners: [], cumulative,
    low: route.map(() => 0), high: route.map(() => 0) };

  const normals = route.map((_, i) => {
    const before = route[Math.max(0, i - 1)], after = route[Math.min(n - 1, i + 1)];
    const length = Math.hypot(after.x - before.x, after.z - before.z) || 1;
    return { x: (after.z - before.z) / length, z: -(after.x - before.x) / length };
  });
  // `low`/`high` bound the whole line; the inside of a corner may go closer, down to the apex margin.
  const bounds = (edgeMargin: number) => {
    const low: number[] = [], high: number[] = [];
    for (const point of route) {
      const width = point.width ?? 7, centre = -(point.roadOffset ?? 0);
      let left = centre - width / 2 + edgeMargin;
      let right = centre + width / 2 - edgeMargin;
      if (keepLane && (point.roadOffset ?? 0) > 0) left = Math.max(left, centre + laneCross);
      if (left > right) left = right = (left + right) / 2;
      low.push(left);
      high.push(right);
    }
    return { low, high };
  };
  const { low, high } = bounds(outsideMargin);
  const tight = bounds(apexMargin);

  let offset = route.map((_, i) => clamp(0, low[i], high[i]));
  const x = (i: number) => route[i].x + normals[i].x * offset[i];
  const z = (i: number) => route[i].z + normals[i].z * offset[i];
  // Minimum-curvature relaxation of `offset` inside per-point bounds, coarse to fine.
  const relax = (lo: readonly number[], hi: readonly number[], scales: readonly number[]) => {
    for (const scale of scales) {
      if (4 * scale >= n) continue;
      for (let pass = 0; pass < 60; pass++) {
        for (let i = 2 * scale; i < n - 2 * scale; i++) {
          const targetX = (4 * (x(i - scale) + x(i + scale)) - x(i - 2 * scale) - x(i + 2 * scale)) / 6;
          const targetZ = (4 * (z(i - scale) + z(i + scale)) - z(i - 2 * scale) - z(i + 2 * scale)) / 6;
          const along = (targetX - route[i].x) * normals[i].x + (targetZ - route[i].z) * normals[i].z;
          offset[i] = clamp(along, lo[i], hi[i]);
        }
      }
    }
  };
  relax(low, high, [32, 16, 8, 4, 2, 1]);
  const smooth = offset.slice();

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

  const corners = detectCorners(route, cumulative, smooth, low, high, tight);
  const indexAt = (s: number) => {
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (hi + lo) >> 1; if (cumulative[mid] < s) lo = mid; else hi = mid; }
    return s - cumulative[lo] < cumulative[hi] - s ? lo : hi;
  };
  // A corner's inside may use the tighter apex margin between its entry and exit.
  const lowLimit = low.slice(), highLimit = high.slice();
  for (const corner of corners) {
    for (let i = corner.entryIndex; i <= corner.exitIndex; i++) {
      if (corner.direction === 'right') highLimit[i] = Math.max(high[i], tight.high[i]);
      else lowLimit[i] = Math.min(low[i], tight.low[i]);
    }
  }

  const apexReach = (corner: RacingCorner) => clamp((corner.exitS - corner.entryS) * .3, 8, 30);
  // Each apex becomes a one-sided limit ("at least this far in") and the minimum-curvature
  // relaxation finds the smoothest line through them, which swings out for entry and exit on its own.
  // Holding entry/exit out as well measured slower and less stable, so they stay metadata.
  const shapeLow = lowLimit.slice(), shapeHigh = highLimit.slice();
  const atLeast = (i: number, inside: 'low' | 'high', value: number) => {
    if (inside === 'high') shapeLow[i] = Math.max(shapeLow[i], Math.min(value, highLimit[i]));
    else shapeHigh[i] = Math.min(shapeHigh[i], Math.max(value, lowLimit[i]));
  };
  corners.forEach(corner => {
    const inside = corner.direction === 'right' ? 'high' : 'low';
    // The apex, plus a short parabolic window so the car is on the inside for more than a sample.
    const window = clamp((corner.exitS - corner.entryS) * .08, 3, 8);
    for (let i = indexAt(corner.apexS - window); i <= indexAt(corner.apexS + window); i++) {
      const slack = 1.5 * ((cumulative[i] - corner.apexS) / window) ** 2;
      atLeast(i, inside, inside === 'high' ? corner.apexOffset - slack : corner.apexOffset + slack);
    }
  });
  for (let i = 0; i < n; i++) if (shapeLow[i] > shapeHigh[i]) shapeLow[i] = shapeHigh[i] = (shapeLow[i] + shapeHigh[i]) / 2;
  relax(shapeLow, shapeHigh, [8, 4, 2, 1]);
  // What each apex must stay near once the time search has had its go.
  const requiredApex = corners.map(corner => offset[corner.apexIndex]);
  const pinned = route.map(() => 0);
  for (const corner of corners) {
    const reach = apexReach(corner);
    for (let i = indexAt(corner.apexS - reach); i <= indexAt(corner.apexS + reach); i++) {
      const distance = Math.abs(cumulative[i] - corner.apexS);
      if (distance < reach) pinned[i] = Math.max(pinned[i],
        corner.apexStrength * (1 + Math.cos(Math.PI * distance / reach)) / 2);
    }
  }
  const roughness = (candidate: readonly number[], from: number, to: number) => {
    let worst = 0;
    for (let i = Math.max(1, from); i < Math.min(n - 1, to); i++)
      worst = Math.max(worst, Math.abs(candidate[i + 1] - 2 * candidate[i] + candidate[i - 1]));
    return worst;
  };
  let best = profile(offset);
  let bestTime = lineTime(best);
  // Local time search. It may move turn-in, track-out and width use, but not a strong apex (below),
  // and never adds a wiggle sharper than the line already has there.
  const attack = clamp((level - .75) / .2, .25, 1);
  for (let pass = 0; pass < 2; pass++) {
    for (const corner of corners) {
      const radius = clamp((corner.exitS - corner.entryS) * .35, 18, 40);
      const centres = [corner.entryS, (corner.entryS + corner.apexS) / 2, (corner.apexS + corner.exitS) / 2, corner.exitS];
      for (const centre of centres) {
        let choice: number[] | undefined;
        const from = indexAt(centre - radius), to = indexAt(centre + radius);
        const rough = roughness(offset, from, to);
        for (const delta of [-1.5, -.75, .75, 1.5]) {
          const trial = offset.slice();
          for (let i = from; i <= to; i++) {
            const distance = Math.abs(cumulative[i] - centre);
            if (distance >= radius) continue;
            const shape = (1 - pinned[i]) * (1 + Math.cos(Math.PI * distance / radius)) / 2;
            trial[i] = clamp(trial[i] + delta * attack * shape, lowLimit[i], highLimit[i]);
          }
          if (roughness(trial, from, to) > rough * 1.1 + .01) continue;
          const candidate = profile(trial);
          const time = lineTime(candidate);
          if (time + .001 < bestTime) { bestTime = time; best = candidate; choice = trial; }
        }
        if (choice) offset = choice;
      }
    }
  }

  // Reapply apex constraints: a strong corner's apex can only drift by (1 - strength) of its miss.
  corners.forEach((corner, k) => {
    const miss = requiredApex[k] - offset[corner.apexIndex];
    if (Math.abs(miss) < .01) return;
    const reach = apexReach(corner);
    for (let i = indexAt(corner.apexS - reach); i <= indexAt(corner.apexS + reach); i++) {
      const distance = Math.abs(cumulative[i] - corner.apexS);
      if (distance >= reach) continue;
      const bell = (1 + Math.cos(Math.PI * distance / reach)) / 2;
      offset[i] = clamp(offset[i] + miss * corner.apexStrength * bell, lowLimit[i], highLimit[i]);
    }
  });
  const points = profile(offset);
  for (const corner of corners) {
    corner.entryOffset = offset[corner.entryIndex];
    corner.apexOffset = offset[corner.apexIndex];
    corner.exitOffset = offset[corner.exitIndex];
  }
  return { points, corners, low: lowLimit, high: highLimit, cumulative };
}

/**
 * Consecutive signed curvature samples describe a corner. Its turn-weighted centre is the
 * geometric apex; long constant-radius turns place it halfway around the arc. Anchors come out
 * as targets; the apex is pulled from the road middle toward the inside by `apexStrength`.
 */
function detectCorners(route: readonly Waypoint[], cumulative: readonly number[], smooth: readonly number[],
  low: readonly number[], high: readonly number[], tight: { low: readonly number[]; high: readonly number[] }) {
  const n = route.length;
  const bend = route.map((point, i) => {
    const before = route[Math.max(0, i - 2)], after = route[Math.min(n - 1, i + 2)];
    const incomingX = point.x - before.x, incomingZ = point.z - before.z;
    const outgoingX = after.x - point.x, outgoingZ = after.z - point.z;
    const angle = Math.atan2(incomingX * outgoingZ - incomingZ * outgoingX,
      incomingX * outgoingX + incomingZ * outgoingZ);
    return angle / Math.max(1, (cumulative[Math.min(n - 1, i + 2)] - cumulative[Math.max(0, i - 2)]) / 2);
  });
  const indexAt = (s: number) => {
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (hi + lo) >> 1; if (cumulative[mid] < s) lo = mid; else hi = mid; }
    return s - cumulative[lo] < cumulative[hi] - s ? lo : hi;
  };
  const end = cumulative[n - 1];
  const corners: RacingCorner[] = [];
  for (let i = 2; i < n - 2;) {
    const sign = Math.sign(bend[i]);
    if (Math.abs(bend[i]) < .005) { i++; continue; }
    const start = i;
    let weighted = 0, turn = 0, peak = 0;
    while (i < n - 2 && Math.sign(bend[i]) === sign && Math.abs(bend[i]) >= .005) {
      const arc = cumulative[i] - cumulative[i - 1];
      const localTurn = Math.abs(bend[i]) * arc;
      weighted += cumulative[i] * localTurn;
      turn += localTurn;
      peak = Math.max(peak, Math.abs(bend[i]));
      i++;
    }
    if (turn < .17) continue;
    const startS = cumulative[start], endS = cumulative[i - 1], length = endS - startS;
    // A long bend at a given radius asks more of the car than a brief kink at the same radius.
    const severity = clamp(peak / LINE_TUNING.referenceHairpinCurvature *
      mix(LINE_TUNING.turnWeight[0], LINE_TUNING.turnWeight[1], smoothstep(.4, 2.2, turn)), 0, 1);
    const apexS = clamp(weighted / turn + length * lateApexBias(severity), startS, endS);
    const lead = clamp(6 + 18 * severity + length * .15, 6, 30);
    const trail = clamp(8 + 22 * severity + length * .2, 8, 35);
    const direction = sign < 0 ? 'right' as const : 'left' as const;
    corners.push({ entryS: Math.max(0, startS - lead), apexS, exitS: Math.min(end, endS + trail),
      entryIndex: 0, apexIndex: 0, exitIndex: 0, direction, severity, totalTurn: turn, maxCurvature: peak,
      entryOffset: 0, apexOffset: 0, exitOffset: 0, apexStrength: apexStrength(severity, turn) });
  }

  corners.forEach((corner, k) => {
    const previous = corners[k - 1], next = corners[k + 1];
    // Neighbouring anchors may not cross the other corner's apex.
    if (previous) corner.entryS = Math.max(corner.entryS, (previous.apexS + corner.apexS) / 2 - 1e-3);
    if (next) corner.exitS = Math.min(corner.exitS, (corner.apexS + next.apexS) / 2);
    corner.entryS = Math.min(corner.entryS, corner.apexS - 4);
    corner.exitS = Math.max(corner.exitS, corner.apexS + 4);
    corner.entryIndex = indexAt(corner.entryS);
    corner.apexIndex = indexAt(corner.apexS);
    corner.exitIndex = indexAt(corner.exitS);
    const right = corner.direction === 'right';
    // Outside use grows with severity; a kink does not need the whole road.
    const usage = mix(.5, .95, corner.severity);
    const outside = (i: number) => mix((low[i] + high[i]) / 2, right ? low[i] : high[i], usage);
    corner.entryOffset = outside(corner.entryIndex);
    // Apex: from the road's middle toward the inside safe limit, as far as the corner deserves.
    const a = corner.apexIndex;
    corner.apexOffset = mix((tight.low[a] + tight.high[a]) / 2, right ? tight.high[a] : tight.low[a],
      corner.apexStrength);
    corner.exitOffset = outside(corner.exitIndex);
    if (next && next.direction !== corner.direction) {
      // An opposite bend straight after: track out only part way, setting up its entry.
      const gap = next.entryS - corner.exitS;
      if (gap < LINE_TUNING.linkedGap) corner.exitOffset = mix(corner.exitOffset,
        smooth[corner.exitIndex], mix(.6, .2, clamp(gap / LINE_TUNING.linkedGap, 0, 1)));
    }
  });
  return corners;
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
