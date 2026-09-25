import { describe, expect, it } from "vitest";
import type { PropDefinition } from "./PropDefinition";
import { PROP_KIT, type PropId } from "./propKit";
import { propVertexData } from "./PropLibrary";

const entries = Object.entries(PROP_KIT) as [PropId, PropDefinition][];
/** Placeholders stay cheap: a prop is a silhouette, not a hero asset. */
const MAX_TRIANGLES = 1200;

describe("prop kit", () => {
  it("covers every category the slice asks for", () => {
    const categories = new Set(entries.map(([, p]) => p.category));
    for (const c of ["utility", "wall", "drainage", "signage", "clutter", "vehicle", "lighting"]) expect(categories).toContain(c);
    for (const id of ["utility_pole", "concrete_wall_3m", "canal_4m", "sign_roadside", "plastic_chair", "motorcycle_parked", "tricycle_parked"]) {
      expect(PROP_KIT).toHaveProperty(id);
    }
  });

  it.each(entries)("%s builds into per-layer meshes within budget, standing on the ground", (id, prop) => {
    expect(prop.description.length).toBeGreaterThan(10);
    const layers = propVertexData(id);
    expect(Object.keys(layers).length).toBeGreaterThan(0);
    let triangles = 0;
    let minY = Infinity;
    for (const data of Object.values(layers)) {
      triangles += data.indices!.length / 3;
      expect(data.colors!.length / 4).toBe(data.positions!.length / 3);
      for (let i = 1; i < data.positions!.length; i += 3) minY = Math.min(minY, data.positions![i]);
    }
    expect(triangles).toBeLessThan(MAX_TRIANGLES);
    // Mounted props hang below their mount point (placed with `y`); everything else sits on the
    // ground, sinking at most a few centimetres (bushes, bases).
    if (!/set y|mount/i.test(prop.description)) expect(minY).toBeGreaterThan(-0.06);
    if (prop.collider) {
      expect(prop.collider.size.every((s) => s > 0)).toBe(true);
      expect(prop.collider.at[1] - prop.collider.size[1] / 2).toBeGreaterThanOrEqual(-0.01);
    }
    for (const part of prop.parts) expect(part.color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("gives every light fixture a glow layer for bloom", () => {
    for (const [id, prop] of entries) {
      if (prop.category === "lighting") expect(propVertexData(id).glow, id).toBeDefined();
    }
  });
});
