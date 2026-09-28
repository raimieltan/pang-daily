export function minimapView(
  position: { x: number; z: number },
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  size: number,
) {
  return {
    x: Math.max(0, Math.min(bounds.maxX - bounds.minX - size, position.x - bounds.minX - size / 2)),
    y: Math.max(0, Math.min(bounds.maxZ - bounds.minZ - size, bounds.maxZ - position.z - size / 2)),
    size,
  };
}
