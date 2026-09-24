import { GameCanvas } from "@/components/game/GameCanvas";
import { HudOverlay } from "@/components/hud/HudOverlay";

export default function Home() {
  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background">
      <GameCanvas />
      <HudOverlay />
    </main>
  );
}
