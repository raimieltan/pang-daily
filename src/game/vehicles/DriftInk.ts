export type InkPoint = { x: number; z: number };
export type InkStroke = { x: number; z: number; yaw: number; width: number; length: number };

const noise = (seed: number) => {
  const value = Math.sin(seed * 127.1 + 78.233) * 43758.5453;
  return value - Math.floor(value);
};

/** A short connected tire path, split into uneven marks with a scratched edge. */
export function inkStrokeSegments(from: InkPoint, to: InkPoint, intensity: number, seed: number): InkStroke[] {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const distance = Math.hypot(dx, dz);
  if (distance < .025 || distance > 3 || !Number.isFinite(distance)) return [];
  const power = Math.max(0, Math.min(1, intensity));
  const count = Math.ceil(distance / .22);
  const nx = dz / distance;
  const nz = -dx / distance;
  const yaw = Math.atan2(dx, dz);
  const strokes: InkStroke[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i + .5) / count;
    const jitter = (noise(seed * 17 + i * 3) - .5) * (.025 + power * .035);
    const x = from.x + dx * t + nx * jitter;
    const z = from.z + dz * t + nz * jitter;
    const width = (.075 + power * .14) * (.62 + noise(seed * 31 + i) * .55);
    const length = distance / count * (.7 + noise(seed * 41 + i) * .34);
    if (noise(seed * 53 + i * 7) > .12 || power > .75) strokes.push({ x, z, yaw, width, length });
    if (power > .55 && noise(seed * 67 + i * 5) > .38) {
      const offset = width * (.38 + noise(seed * 73 + i) * .35);
      strokes.push({ x: x + nx * offset, z: z + nz * offset, yaw, width: width * .16, length: length * .65 });
    }
  }
  return strokes;
}
