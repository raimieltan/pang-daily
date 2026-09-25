"use client";

import { useEffect, useState } from "react";
import { useGameEvent } from "@/components/game/useGameEvent";

const DISMISS_AFTER_MS = 4000;

/**
 * Placeholder lines until dialogue becomes data-driven content.
 * The game only says *which* dialogue fired; wording lives on the UI side.
 */
const LINES: Record<string, { speaker: string; line: string }> = {
  kyo_order: { speaker: "Barista", line: "Kape muna? Park ka lang, boss." },
  kyo_tambay: { speaker: "Regular", line: "Tambay muna. May bagong project ka?" },
  talyer_mang_boy: { speaker: "Mang Boy", line: "Tingnan natin, boss. Piliin mo muna ang kaya ng budget." },
  talyer_tambay: { speaker: "Friend", line: "Dito muna tayo habang nasa lift ang kotse." },
  debug_sprint_start: { speaker: "Friend", line: "Easy on the first corner, boss." },
  debug_sprint_finish: { speaker: "Friend", line: "Not bad for a daily." },
};

export function DialogueBox() {
  const [dialogueId, setDialogueId] = useState<string | null>(null);

  useGameEvent("dialogueTriggered", ({ dialogueId }) => setDialogueId(dialogueId));

  useEffect(() => {
    if (!dialogueId) return;
    const timer = setTimeout(() => setDialogueId(null), DISMISS_AFTER_MS);
    return () => clearTimeout(timer);
  }, [dialogueId]);

  if (!dialogueId) return null;
  const entry = LINES[dialogueId] ?? { speaker: "???", line: dialogueId };

  return (
    <div
      className="max-w-md self-center rounded border border-white/30 bg-black/60 px-4 py-2 text-sm"
      data-testid="dialogue"
    >
      <span className="text-white/90">{entry.speaker}:</span> {entry.line}
    </div>
  );
}
