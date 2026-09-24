"use client";

import { useEffect, useEffectEvent } from "react";
import type { GameEventMap, GameEventName } from "@/game";
import { useGameUiStore } from "@/state/gameUiStore";

/**
 * Subscribe a component to a transient game event (dialogue, rejections, ...).
 * Use this for one-shot moments the UI reacts to; persistent derived state
 * belongs in a store instead.
 */
export function useGameEvent<K extends GameEventName>(event: K, listener: (payload: GameEventMap[K]) => void) {
  const events = useGameUiStore((s) => s.events);
  const onEvent = useEffectEvent(listener);

  useEffect(() => events?.on(event, (payload) => onEvent(payload)), [events, event]);
}
