'use client';

import { useGameEvent } from '@/components/game/useGameEvent';
import type { ChapterDirection } from '@/game/progression/ChapterGuide';
import { useEffect, useRef, useState } from 'react';
import { CHAPTER_ONE } from '@/game-core/progression/chapter';
import { chapterScene, CHAPTER_SCENES } from '@/game-core/progression/presentation';
import { usePlayerMetaStore } from '@/state/playerMetaStore';
import { useGraphicsStore } from '@/state/graphicsStore';
import { useMaintenanceStore } from '@/state/maintenanceStore';
import { useGameUiStore } from '@/state/gameUiStore';

/** Authoritative beats are read from the server snapshot. This is only a presentation layer. */
export function ChapterExperience() {
 const chapter = usePlayerMetaStore(s => s.player?.runtime.chapters?.find(c => c.id === CHAPTER_ONE.id));
 const playerId = usePlayerMetaStore(s => s.player?.playerId);
 const condition = useMaintenanceStore(s => s.summary);
 const reducedMotion = useGraphicsStore(s => s.settings?.reducedMotion);
 const paused = useGameUiStore(s => s.paused);
 const [direction, setDirection] = useState<ChapterDirection | null>(null);
 useGameEvent('chapterDirection', setDirection);
 const [expanded, setExpanded] = useState(false);
 const [moment, setMoment] = useState<string | null>(null);
 const previous = useRef<{ playerId: string | undefined; beat: string | null } | null>(null);
 const current = chapter?.currentBeatId ?? null;
 const completed = chapter?.markers ?? [];
 const scene = chapterScene(current);
 useEffect(() => {
  if (!chapter || !playerId) return;
  const old = previous.current;
  previous.current = { playerId, beat: current };
  if (old?.playerId === playerId && old.beat !== current) setMoment(current ?? 'complete');
 }, [chapter, playerId, current]);
 useEffect(() => {
  if (!moment) return;
  const timeout = window.setTimeout(() => setMoment(null), moment === 'complete' ? 9000 : 6500);
  return () => window.clearTimeout(timeout);
 }, [moment]);
 if (!chapter) return null;
 const reveal = moment ? chapterScene(moment === 'complete' ? null : moment) : null;
 return <>
  <section className="chapter-card pointer-events-auto mt-3 w-[min(21rem,calc(100vw-2rem))] rounded border border-amber-100/25 bg-[#111711]/90 p-3 text-xs text-[#eee8d8] shadow-xl" aria-label="Chapter 1" data-testid="chapter-note">
   <button type="button" className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setExpanded(value => !value)} aria-expanded={expanded} aria-controls="chapter-beats">
    <span><span className="block text-[9px] tracking-[.25em] text-[#e6bb76]">CHAPTER 1 / {chapter.completedAt ? 'COMPLETE' : `TAPE ${scene.number}`}</span><strong className="mt-1 block text-base font-medium">{scene.title}</strong></span>
    <span aria-hidden="true" className="text-[#e6bb76]">{expanded ? '−' : '+'}</span>
   </button>
   <p className="mt-2 leading-5 text-white/70">{scene.next}</p>
   {direction?.beatId === current && <p className="mt-2 inline-block rounded border border-amber-100/20 bg-amber-100/5 px-2 py-1 font-medium text-amber-100">↗ {direction.destination} · {direction.meters} m {direction.compass}</p>}
   {current === 'repair_daily' && condition && <p className="mt-2 border-t border-white/15 pt-2 text-amber-100">Brakes {Math.floor(condition.condition.brakes * 100)}% · ₱{condition.walletPhp.toLocaleString('en-PH')} on hand. The talyer’s Brakes line is the urgent repair; the oil errand needs no fuel.</p>}
   {expanded && <div id="chapter-beats" className="mt-3 border-t border-white/15 pt-3">
    <p className="mb-2 text-[9px] tracking-[.2em] text-white/45">ROAD SO FAR · {completed.length}/{CHAPTER_ONE.beats.length}</p>
    <ol className="space-y-2">{CHAPTER_ONE.beats.map(id => {
     const item = CHAPTER_SCENES[id];
     const status = chapter.beats?.find(beat => beat.id === id)?.status ?? (completed.includes(id) ? 'completed' : current === id ? 'available' : 'locked');
     return <li key={id} className={`flex items-start gap-3 ${status === 'locked' ? 'text-white/35' : status === 'completed' ? 'text-emerald-200/80' : 'text-amber-100'}`}>
      <span className="w-5 shrink-0">{status === 'completed' ? '✓' : status === 'locked' ? '·' : item.number}</span>
      <span><strong className="font-medium">{item.title}</strong>{status !== 'locked' && <span className="block text-[11px] text-white/55">{item.place}{status === 'recoverable' ? ' · RETRY / RECOVER' : ''}</span>}</span>
     </li>;
    })}</ol>
   </div>}
  </section>
  {reveal && !paused && <div role="status" data-testid="chapter-moment" className={`chapter-moment pointer-events-none absolute inset-x-0 top-[15%] z-30 mx-auto w-[min(36rem,calc(100vw-2rem))] border-y border-amber-100/40 bg-[#111611]/90 px-5 py-6 text-[#f2eddf] shadow-2xl ${reducedMotion ? '' : 'chapter-moment-enter'}`}>
   <p className="text-[10px] tracking-[.3em] text-[#e6bb76]">PANG DAILY / CHAPTER 1 / {reveal.place}</p>
   <h2 className="mt-3 text-3xl font-light tracking-[.08em]">{reveal.title}</h2>
   <p className="mt-3 text-sm leading-6 text-white/75">{reveal.line}</p>
   <p className="mt-5 border-t border-white/15 pt-3 text-xs text-[#e6bb76]">{reveal.next}</p>
  </div>}
 </>;
}
