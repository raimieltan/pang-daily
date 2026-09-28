import { expect, it } from 'vitest';
import { inkStrokeSegments } from './DriftInk';

it('connects a moving tire path with tapered irregular ink segments', () => {
  const strokes = inkStrokeSegments({ x: 0, z: 0 }, { x: 0, z: 1 }, .9, 4);
  expect(strokes.length).toBeGreaterThan(2);
  expect(strokes.some(stroke => stroke.width > .12)).toBe(true);
  expect(strokes.some(stroke => stroke.width < .12)).toBe(true);
  expect(strokes.every(stroke => stroke.length > 0 && stroke.length < .4)).toBe(true);
});

it('does not bridge a teleport or paint while the tire is stationary', () => {
  expect(inkStrokeSegments({ x: 0, z: 0 }, { x: 0, z: 0 }, .8, 1)).toEqual([]);
  expect(inkStrokeSegments({ x: 0, z: 0 }, { x: 0, z: 5 }, .8, 1)).toEqual([]);
});

it('stronger slip makes a wider stroke', () => {
  const gentle = inkStrokeSegments({ x: 0, z: 0 }, { x: 0, z: .5 }, .4, 2);
  const hard = inkStrokeSegments({ x: 0, z: 0 }, { x: 0, z: .5 }, 1, 2);
  expect(Math.max(...hard.map(s => s.width))).toBeGreaterThan(Math.max(...gentle.map(s => s.width)));
});
