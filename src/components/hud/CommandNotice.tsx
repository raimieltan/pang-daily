"use client";

import { useEffect, useState } from "react";
import { useGameEvent } from "@/components/game/useGameEvent";

const DISMISS_AFTER_MS = 3000;

/** Surfaces commands the runtime refused ("Already racing", "Unknown spawn point", ...). */
export function CommandNotice() {
  const [reason, setReason] = useState<string | null>(null);

  useGameEvent("commandRejected", ({ reason }) => setReason(reason));

  useEffect(() => {
    if (!reason) return;
    const timer = setTimeout(() => setReason(null), DISMISS_AFTER_MS);
    return () => clearTimeout(timer);
  }, [reason]);

  if (!reason) return null;
  return (
    <p className="self-center text-red-300" data-testid="command-notice">
      {reason}
    </p>
  );
}
