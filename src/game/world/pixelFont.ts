/**
 * 5×7 block-letter font for sign text built out of boxes: the world pipeline is vertex colour
 * only (no textures), so readable signage is geometry. Each lit row of a glyph becomes one run,
 * so a word costs a few dozen boxes merged into the chunk mesh. Only the glyphs the hub's signs
 * use are drawn; add more as signs need them.
 */

export const GLYPH_COLUMNS = 5;
export const GLYPH_ROWS = 7;

const GLYPHS: Record<string, readonly string[]> = {
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
  ".": [".....", ".....", ".....", ".....", ".....", ".....", "..#.."],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".###."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
};

/** A horizontal run of lit pixels. Columns count from the text's left edge, rows from its top. */
export type PixelRun = { readonly col: number; readonly row: number; readonly length: number };

export function hasGlyph(char: string): boolean {
  return char in GLYPHS;
}

/** Lit runs for `text` on one line (one blank column between glyphs) and its width in columns. */
export function pixelText(text: string): { runs: PixelRun[]; columns: number } {
  const runs: PixelRun[] = [];
  [...text].forEach((char, i) => {
    const glyph = GLYPHS[char];
    if (!glyph) throw new Error(`pixelFont has no glyph for "${char}"`);
    const left = i * (GLYPH_COLUMNS + 1);
    glyph.forEach((line, row) => {
      for (let c = 0; c < line.length; c++) {
        if (line[c] !== "#") continue;
        const start = c;
        while (line[c + 1] === "#") c++;
        runs.push({ col: left + start, row, length: c - start + 1 });
      }
    });
  });
  return { runs, columns: Math.max(0, text.length * (GLYPH_COLUMNS + 1) - 1) };
}
