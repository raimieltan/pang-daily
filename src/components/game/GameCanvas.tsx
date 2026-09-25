"use client";

import { useEffect, useRef } from "react";
import { bindGameUiStore, useGameUiStore } from "@/state/gameUiStore";
import { bindGraphicsStore } from "@/state/graphicsStore";
import { bindHudStore } from "@/state/hudStore";
import { bindVehicleDebugStore } from "@/state/vehicleDebugStore";

/**
 * Mounts the Babylon runtime on a canvas and binds the bridge to the UI stores.
 * Lifecycle only — no game logic belongs in this component.
 */
export function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let teardown: (() => void) | undefined;

    import("@/game")
      .then(({ createGame }) => {
        if (cancelled) return;

        const game = createGame(canvas);
        // Bind before start() so no early event is missed.
        const unbinders = [
          bindGameUiStore(game),
          bindHudStore(game.events),
          bindVehicleDebugStore(game.events),
          bindGraphicsStore(game.events),
        ];
        game.start();

        teardown = () => {
          unbinders.forEach((unbind) => unbind());
          game.dispose();
        };
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        useGameUiStore.setState({ status: "error", errorMessage: message });
      });

    return () => {
      cancelled = true;
      teardown?.();
    };
  }, []);

  return <canvas ref={canvasRef} className="block h-full w-full touch-none outline-none" />;
}
