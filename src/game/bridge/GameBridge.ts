import { CommandBus, createGameCommands, type GameCommands } from "./GameCommands";
import { GameEvents, type GameEventSource } from "./GameEvents";

/**
 * What runtime systems get: publish events, own commands. No access to React,
 * stores, or other systems' listeners.
 */
export interface RuntimePort {
  emit: GameEvents["emit"];
  handle: CommandBus["handle"];
}

/**
 * The whole boundary in one place. `ui` goes to React, `runtime` goes to the
 * engine; neither side can reach the other's half.
 */
export class GameBridge {
  private readonly events = new GameEvents();
  private readonly bus = new CommandBus();

  readonly ui: { events: GameEventSource; commands: GameCommands } = {
    events: { on: this.events.on.bind(this.events) },
    commands: createGameCommands((command, ...args) => {
      const result = this.bus.dispatch(command, ...args);
      if (!result.ok) this.events.emit("commandRejected", { command, reason: result.reason });
    }),
  };

  readonly runtime: RuntimePort = {
    emit: this.events.emit.bind(this.events),
    handle: this.bus.handle.bind(this.bus),
  };

  dispose(): void {
    this.events.clear();
    this.bus.clear();
  }
}
