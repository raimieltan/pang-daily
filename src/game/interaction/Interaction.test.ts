import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { describe, expect, it } from "vitest";
import { GameBridge } from "../bridge/GameBridge";
import { HUB_LAYOUT } from "../world/hub/hubLayout";
import { interactablesFromZones, resolveInteraction, type Interactable } from "./Interaction";
import { InteractionSystem } from "./InteractionSystem";
import { containsPoint } from "../world/layoutTools";
import { HUB_JOBS } from "../jobs/hubJobs";
import { nearestRoad, OVERLOOK } from "../world/mountain/route";

const zone = (id: string, x = 0, priority = 0): Interactable => ({
  id, action: "order_coffee", label: id, priority, area: { kind: "circle", x, z: 0, radius: 3 },
});

/** Up the mountain there is no parking: the shoulder (a metre past the edge) or the overlook pad. */
const onMountainShoulder = (p: { x: number; z: number }) => {
  const { sample, distance } = nearestRoad(p);
  return distance <= sample.width / 2 + 2 || Math.hypot(p.x - OVERLOOK.x, p.z - OVERLOOK.z) < 10;
};

describe("world interactions", () => {
  it('offers Casey rather than the overlapping job board when standing beside the rival', () => {
    const zones = interactablesFromZones(HUB_LAYOUT.chunks.flatMap(chunk => chunk.zones));
    expect(resolveInteraction(zones, 138.8, 97.5, 'walking')?.id).toBe('casey_corner');
    expect(resolveInteraction(zones, 137.5, 97.5, 'walking')?.id).toBe('casey_corner');
    expect(resolveInteraction(zones, 141.5, 98.4, 'walking')?.id).toBe('kyo_job_board');
  });
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

  it("offers the job board from Kyo's terrace without taking over the counter", () => {
    const all = HUB_LAYOUT.chunks.flatMap((c) => c.zones);
    const zones = interactablesFromZones(all);
    const terrace = all.find((z) => z.id === "kyo_terrace")!.rect;
    // Terrace side of the board, between the potted plants.
    expect(containsPoint(terrace, 139.3, 98.4)).toBe(true);
    expect(resolveInteraction(zones, 139.3, 98.4, "walking")?.action).toBe("browse_jobs");
    expect(resolveInteraction(zones, 139.3, 103, "walking")?.action).toBe("order_coffee");
    expect(resolveInteraction(zones, 137.5, 105.5, "walking")?.action).toBe("hang_out");
  });

  it("offers Mang Boy's errands and hatid requests from their boards", () => {
    const zones = interactablesFromZones(HUB_LAYOUT.chunks.flatMap((c) => c.zones));
    expect(resolveInteraction(zones, 41.6, 154, "walking")?.id).toBe("talyer_job_board");
    expect(resolveInteraction(zones, 45, 158, "walking")?.action).toBe("hang_out");
    expect(resolveInteraction(zones, 54, 33, "walking")?.id).toBe("fuel_job_board");
  });

  it("puts driving stops on parking or the mountain shoulder the car can reach, and every job on a board", () => {
    const all = HUB_LAYOUT.chunks.flatMap((c) => c.zones);
    const parking = all.filter((z) => z.kind === "parking");
    const boards = new Set(interactablesFromZones(all).filter((z) => z.action === "browse_jobs").map((z) => z.id));
    for (const job of HUB_JOBS) {
      expect(job.offeredAt.every((id) => boards.has(id)), job.id).toBe(true);
      for (const { area, id, mode } of job.objectives)
        if (mode === "driving") expect(parking.some((z) => containsPoint(z.rect, area.x, area.z)) || onMountainShoulder(area), `${job.id}:${id}`).toBe(true);
    }
  });
});
