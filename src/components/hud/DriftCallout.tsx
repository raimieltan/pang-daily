"use client";

import { useEffect, useState } from 'react';
import { useGameEvent } from '@/components/game/useGameEvent';
import { useGameUiStore } from '@/state/gameUiStore';
import { useHudStore } from '@/state/hudStore';

type Callout = { id: number; text: string; intensity: number };

/** One-shot manga impact feedback, kept outside the per-frame HUD summary. */
export function DriftCallout() {
  const [callout, setCallout] = useState<Callout | null>(null);
  const mode = useHudStore(state => state.playerMode);
  const paused = useGameUiStore(state => state.paused);
  useGameEvent('driftCallout', ({ text, intensity }) => {
    setCallout(previous => ({ id: (previous?.id ?? 0) + 1, text, intensity }));
  });
  useGameEvent('sceneLoading', () => setCallout(null));

  useEffect(() => {
    if (!callout) return;
    const timer = window.setTimeout(() => setCallout(current => current?.id === callout.id ? null : current), 1250);
    return () => window.clearTimeout(timer);
  }, [callout]);

  if (!callout || mode !== 'driving' || paused) return null;
  return <div key={callout.id} className={`drift-impact ${callout.intensity > .8 ? 'drift-impact-heavy' : ''}`} aria-live="polite">
    <div className="drift-impact-lines" aria-hidden="true"><i /><i /><i /><i /></div>
    <div className="drift-impact-burst" aria-hidden="true" />
    <span className="drift-impact-text">{callout.text}</span>
    <span className="drift-impact-under" aria-hidden="true">{'// PANG DAILY'}</span>
  </div>;
}
