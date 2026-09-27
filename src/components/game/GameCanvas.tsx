"use client";

import { bindPersistenceStore } from '@/state/persistenceStore';
import { playerService } from '@/lib/player/playerService';

import { useEffect, useRef } from "react";
import { bindGameUiStore, useGameUiStore } from "@/state/gameUiStore";
import { bindGraphicsStore } from "@/state/graphicsStore";
import { bindHudStore } from "@/state/hudStore";
import { bindVehicleDebugStore } from "@/state/vehicleDebugStore";
import { bindMaintenanceStore } from "@/state/maintenanceStore";
import { bindPerformanceStore } from '@/state/performanceStore';
import { bindAutoPartsStore } from '@/state/autoPartsStore';
import { bindJobStore } from "@/state/jobStore";
import { bindMarketStore } from "@/state/marketStore";
import { bindSocialStore } from "@/state/socialStore";
import type { RuntimeBootstrap } from '@/game-core/persistence/RuntimeBootstrap';

/**
 * Mounts the Babylon runtime on a canvas and binds the bridge to the UI stores.
 * Lifecycle only — no game logic belongs in this component.
 */
export function GameCanvas({ bootstrap }: { bootstrap: RuntimeBootstrap }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let teardown: (() => void) | undefined;

    import("@/game")
      .then(({ createGame }) => {
        if (cancelled) return;

        const game = createGame(canvas, { bootstrap, persistence: playerService.persistence });
        // Bind before start() so no early event is missed.
        const unbinders = [
          bindGameUiStore(game),
          bindHudStore(game.events),
          bindVehicleDebugStore(game.events),
          bindGraphicsStore(game.events),
          bindMaintenanceStore(game.events),
          bindPerformanceStore(game.events),
          bindAutoPartsStore(game.events),
          bindJobStore(game.events),
          bindMarketStore(game.events),
          bindPersistenceStore(game.events),
          bindSocialStore(game.events, undefined, bootstrap?.social),
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
  }, [bootstrap]);

  return <canvas ref={canvasRef} className="block h-full w-full touch-none outline-none" />;
}
