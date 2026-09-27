"use client";

import { useEffect, useState } from 'react';
import { useGameEvent } from '@/components/game/useGameEvent';
import { DIALOGUE_ENTRIES } from '@/game-core/social/dialogue';
import { CONVERSATIONS } from '@/game-core/social/conversation';
import type { GameEventMap } from '@/game/bridge/GameEvents';
import { useGameUiStore } from '@/state/gameUiStore';

type View = NonNullable<GameEventMap['dialogueViewChanged']>;

/** Presentation and intents only; the runtime owns conditions, effects, and input capture. */
export function DialogueBox() {
 const [view, setView] = useState<View | null>(null);
 const [subtitle, setSubtitle] = useState<string | null>(null);
 const commands = useGameUiStore((state) => state.commands);
 useGameEvent('dialogueViewChanged', (next) => { setView(next); setSubtitle(null); });
 useGameEvent('dialogueTriggered', ({ dialogueId }) => {
  if (CONVERSATIONS.some((entry) => entry.id === dialogueId)) return;
  setSubtitle(dialogueId);
 });
 useGameEvent('sceneLoading', () => { setView(null); setSubtitle(null); });
 useEffect(() => {
  if (!subtitle) return;
  const timer = setTimeout(() => setSubtitle(null), 4000);
  return () => clearTimeout(timer);
 }, [subtitle]);
 useEffect(() => () => commands?.closeDialogue(), [commands]);

 if (view) return <div className="pointer-events-auto max-w-lg self-center rounded border border-amber-200/40 bg-black/85 px-4 py-3 text-sm text-white" data-testid="dialogue" role="dialog" aria-label={`Conversation with ${view.speaker}`}>
  <p><strong className="text-amber-100">{view.speaker}:</strong> {view.text}</p>
  {view.rival && <div className="mt-2 text-xs text-white/65" data-testid="rival-history">
    <p>{view.rival.wins} wins · {view.rival.losses} losses · {view.rival.dnfs} DNFs</p>
    <p>{view.rival.rematch.eligible ? view.rival.rematch.label : view.rival.rematch.unmetRequirements.join('; ')}</p>
  </div>}
  <div className="mt-3 flex flex-col gap-2">
   {view.choices.map((choice) => <button key={choice.id} type="button" data-choice-id={choice.id} className={`rounded border px-3 py-2 text-left ${choice.id === view.selectedChoiceId ? 'border-amber-200 text-amber-100' : 'border-white/30 text-white/80'}`} onClick={() => commands?.chooseDialogue(choice.id)}>{choice.text}</button>)}
   <button type="button" aria-label="Leave conversation" className="self-end rounded border border-white/30 px-3 py-1 text-white/70" onClick={() => commands?.closeDialogue()}>Leave</button>
  </div>
 </div>;
 if (!subtitle) return null;
 const entry = DIALOGUE_ENTRIES[subtitle];
 if (!entry) return null;
 return <p className="max-w-md self-center border border-white/30 bg-black/60 px-4 py-2 text-sm text-white/90" data-testid="dialogue">{entry.speaker}: {entry.line}</p>;
}
