"use client";

import { useEffect, useState } from "react";
import { useGameEvent } from "@/components/game/useGameEvent";

const DISMISS_AFTER_MS = 2500;

/** Names the place the car just pulled into ("Tambay Coffee"), or where it was put back. */
export function LocationToast() {
  const [text, setText] = useState<string | null>(null);

  useGameEvent("locationEntered", ({ name }) => setText(name));
  useGameEvent("playerReturned", ({ name }) => setText(`Back on the road · ${name}`));

  useEffect(() => {
    if (!text) return;
    const timer = setTimeout(() => setText(null), DISMISS_AFTER_MS);
    return () => clearTimeout(timer);
  }, [text]);

  if (!text) return null;
  return (
    <p className="self-center text-sm tracking-widest text-amber-100 uppercase" data-testid="location-toast">
      {text}
    </p>
  );
}
