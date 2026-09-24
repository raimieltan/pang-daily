"use client";

import { useEffect, useRef } from "react";
import { useGameUiStore } from "@/state/gameUiStore";

/**
 * Mounts the Babylon runtime on a canvas and pipes bridge events into the UI store.
 * Lifecycle only — no game logic belongs in this component.
 */
export function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let teardown: (() => void) | undefined;
    const setUi = useGameUiStore.setState;

    import("@/game")
      .then(({ createGame }) => {
        if (cancelled) return;

        const game = createGame(canvas);
        const unsubscribers = [
          game.events.on("ready", () => setUi({ status: "ready" })),
          game.events.on("paused", ({ paused }) => setUi({ paused })),
          game.events.on("statsUpdated", ({ fps }) => setUi({ fps })),
          game.events.on("error", ({ message }) => setUi({ status: "error", errorMessage: message })),
        ];

        setUi({ commands: game.commands });
        game.start();

        teardown = () => {
          unsubscribers.forEach((off) => off());
          game.dispose();
          setUi({ status: "loading", commands: null, paused: false, fps: 0 });
        };
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        setUi({ status: "error", errorMessage: message });
      });

    return () => {
      cancelled = true;
      teardown?.();
    };
  }, []);

  return <canvas ref={canvasRef} className="block h-full w-full touch-none outline-none" />;
}
