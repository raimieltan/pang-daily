import { expect, it } from 'vitest';
import { DriftFeedback } from './DriftFeedback';

it('starts a drift once, awards a chain for a sustained slide, and resets after grip returns', () => {
  const drift = new DriftFeedback();
  expect(drift.step(.1, .6)).toBe('DRIFT');
  expect(drift.step(.1, .6)).toBeNull();
  let callout: string | null = null;
  for (let i = 0; i < 12; i++) callout = drift.step(.1, .6) ?? callout;
  expect(callout).toBe('CHAIN x2');
  drift.step(.8, 0);
  expect(drift.step(.1, .6)).toBe('DRIFT');
});

it('shows max angle once per drift and ignores brief grip recovery', () => {
  const drift = new DriftFeedback();
  expect(drift.step(.1, .5)).toBe('DRIFT');
  expect(drift.step(.1, .95)).toBe('MAX ANGLE');
  expect(drift.step(.1, .95)).toBeNull();
  drift.step(.2, 0);
  expect(drift.step(.1, .5)).toBeNull();
});

it('requires meaningful slip before starting and clamps invalid intensity', () => {
  const drift = new DriftFeedback();
  expect(drift.step(.1, .2)).toBeNull();
  expect(drift.step(.1, Number.NaN)).toBeNull();
  expect(drift.step(.1, .4)).toBe('DRIFT');
});
