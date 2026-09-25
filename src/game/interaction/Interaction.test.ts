import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { describe, expect, it } from "vitest";
import { GameBridge } from "../bridge/GameBridge";
import { HUB_LAYOUT } from "../world/hub/hubLayout";
import { interactablesFromZones, resolveInteraction, type Interactable } from "./Interaction";
import { InteractionSystem } from "./InteractionSystem";

const zone = (id: string, x = 0, priority = 0): Interactable => ({
  id, action: "order_coffee", label: id, priority, area: { kind: "circle", x, z: 0, radius: 3 },
});

describe("world interactions", () => {
  it("resolves priority, distance and ID independently of source order", () => {
    const zones = [zone("z", 1.0004), zone("b", 1.0008), zone("a", 1.0012)];
    for (const order of [zones, [...zones].reverse(), [zones[1], zones[0], zones[2]]]) {
      expect(resolveInteraction(order, 0, 0, "walking")?.id).toBe("z");
    }
    expect(resolveInteraction([zone("b"), zone("a")], 0, 0, "walking")?.id).toBe("a");
    expect(resolveInteraction([zone("near"), zone("priority", 2, 1)], 0, 0, "walking")?.id).toBe("priority");
    expect(resolveInteraction(zones, 0, 0, "driving")).toBeNull();
  });

  it("publishes changed prompts only and revalidates commands after movement", () => {
    const bridge = new GameBridge();
    const player = { position: new Vector3(), mode: "walking" as const };
    const prompts: unknown[] = [];
    const actions: unknown[] = [];
    bridge.ui.events.on("interactionPromptChanged", (p) => prompts.push(p));
    bridge.ui.events.on("interactionTriggered", (p) => actions.push(p));
    const system = new InteractionSystem(bridge.runtime, player, [() => [zone("coffee")]]);
    system.update();
    system.update();
    expect(prompts).toHaveLength(2);
    bridge.ui.commands.interact();
    expect(actions).toHaveLength(1);
    player.position.x = 20;
    bridge.ui.commands.interact();
    expect(actions).toHaveLength(1);
    expect(prompts.at(-1)).toEqual({ prompt: null });
    system.dispose();
    const replacement = new InteractionSystem(bridge.runtime, player, []);
    replacement.dispose();
    bridge.dispose();
  });

  it("authors usable coffee shop and talyer actions", () => {
    const zones = interactablesFromZones(HUB_LAYOUT.chunks.flatMap((c) => c.zones));
    expect(zones.some((z) => z.locationId === "coffee_shop" && z.action === "order_coffee")).toBe(true);
    expect(zones.some((z) => z.locationId === "talyer" && z.action === "talk_mechanic")).toBe(true);
  });
});
