import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { CommandOutcome, RuntimePort } from "../bridge";
import type { GameSystem } from "../engine/types";
import type { PlayerMode } from "../player/PlayerMode";
import { resolveInteraction, type Interactable, type InteractionAction } from "./Interaction";

/** Something that offers interactables: fixed layout data, or a provider for things that move (the car). */
export type InteractableSource = () => Iterable<Interactable>;

/** Carries out an action in the engine. Return `{ rejected }` to refuse (shown like a refused command). */
export type InteractionHandler = (interactable: Interactable) => CommandOutcome;

export type InteractionFocus = {
  readonly position: Vector3;
  readonly mode: PlayerMode;
};

/**
 * Picks the one interaction on offer where the player stands (see `resolveInteraction`) and
 * tells React when it changes (`interactionPromptChanged`). `trigger` uses it: engine-side
 * handlers run first (getting in the car), then `interactionTriggered` (and the placeholder
 * dialogue line, if any) goes to React.
 *
 * Add after anything that moves the player, so the prompt matches this frame's position.
 */
export class InteractionSystem implements GameSystem {
  readonly name = "interactions";
  private readonly handlers = new Map<InteractionAction, InteractionHandler>();
  private focused: Interactable | null = null;
  private readonly release: () => void;

  constructor(
    private readonly bridge: RuntimePort,
    private readonly player: InteractionFocus,
    private readonly sources: readonly InteractableSource[],
  ) {
    this.release = bridge.handle("interact", () => this.trigger());
    bridge.emit("interactionPromptChanged", { prompt: null });
  }

  /** What `trigger` would use right now. */
  get current(): Interactable | null {
    return this.focused;
  }

  /** One engine handler per action; returns the unregister. */
  handle(action: InteractionAction, handler: InteractionHandler): () => void {
    if (this.handlers.has(action)) throw new Error(`Interaction "${action}" already has a handler`);
    this.handlers.set(action, handler);
    return () => {
      if (this.handlers.get(action) === handler) this.handlers.delete(action);
    };
  }

  update(): void {
    const { position, mode } = this.player;
    this.focus(resolveInteraction(this.all(), position.x, position.z, mode));
  }

  /** Re-resolves immediately (e.g. right after a mode change), so the prompt never lags a frame. */
  refresh(): void {
    this.update();
  }

  trigger(): CommandOutcome {
    this.refresh();
    const target = this.focused;
    if (!target) return { rejected: "Nothing to do here" };
    const outcome = this.handlers.get(target.action)?.(target);
    if (outcome) return outcome;
    this.bridge.emit("interactionTriggered", {
      interactionId: target.id,
      action: target.action,
      locationId: target.locationId ?? null,
    });
    if (target.dialogueId) this.bridge.emit("dialogueTriggered", { dialogueId: target.dialogueId });
    this.refresh();
  }

  dispose(): void {
    this.release();
    this.focus(null);
    this.handlers.clear();
  }

  private *all(): Iterable<Interactable> {
    for (const source of this.sources) yield* source();
  }

  private focus(next: Interactable | null): void {
    // Same id and label means the same prompt; providers may hand out a fresh object every frame.
    if (next?.id === this.focused?.id && next?.label === this.focused?.label && next?.action === this.focused?.action) {
      this.focused = next;
      return;
    }
    this.focused = next;
    this.bridge.emit("interactionPromptChanged", {
      prompt: next && { interactionId: next.id, action: next.action, label: next.label },
    });
  }
}
