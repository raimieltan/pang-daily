/** Same order as the handling model's `CORNERS` and the body's wheel list. */
export const CORNER_IDS = ['FL', 'FR', 'RL', 'RR'] as const;
export type CornerId = (typeof CORNER_IDS)[number];
