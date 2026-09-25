import { describe, expect, it } from "vitest";
import { GLYPH_COLUMNS, GLYPH_ROWS, hasGlyph, pixelText } from "./pixelFont";

describe("pixelFont", () => {
  it("lays out one line with a blank column between glyphs", () => {
    const { runs, columns } = pixelText("KYO COFFEE");
    expect(columns).toBe(10 * (GLYPH_COLUMNS + 1) - 1);
    for (const run of runs) {
      expect(run.row).toBeGreaterThanOrEqual(0);
      expect(run.row).toBeLessThan(GLYPH_ROWS);
      expect(run.col + run.length).toBeLessThanOrEqual(columns);
      // Runs never bridge the gap column into the next glyph.
      expect(Math.floor(run.col / (GLYPH_COLUMNS + 1))).toBe(Math.floor((run.col + run.length - 1) / (GLYPH_COLUMNS + 1)));
    }
  });

  it("merges each lit row segment into one run", () => {
    // E: full top, middle (4 wide) and bottom bars, a single pixel on the other four rows.
    const { runs } = pixelText("E");
    expect(runs).toHaveLength(7);
    expect(runs.map((r) => r.length)).toEqual([5, 1, 1, 4, 1, 1, 5]);
  });

  it("draws nothing for a space and refuses glyphs it does not have", () => {
    expect(pixelText(" ").runs).toEqual([]);
    for (const char of "KYO COFFEE KLMB BLDG.") expect(hasGlyph(char), char).toBe(true);
    expect(() => pixelText("Kyo")).toThrow(/no glyph/);
  });
});
