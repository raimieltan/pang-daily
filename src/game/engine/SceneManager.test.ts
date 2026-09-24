import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SceneManager } from "./SceneManager";
import type { SceneContext, SceneDefinition } from "./types";

function withCamera(scene: Scene) {
  new FreeCamera("camera", Vector3.Zero(), scene);
}

const empty: SceneDefinition = { setup: ({ scene }) => withCamera(scene) };

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe("SceneManager", () => {
  let engine: NullEngine;
  afterEach(() => engine.dispose());

  function create<Id extends string>(definitions: Record<Id, SceneDefinition>) {
    engine = new NullEngine();
    const hooks = { onLoading: vi.fn(), onReady: vi.fn(), onError: vi.fn() };
    return { manager: new SceneManager(engine, definitions, hooks), hooks };
  }

  it("loads a scene and reports loading then ready", async () => {
    const { manager, hooks } = create({ a: empty });

    const pending = manager.switchTo("a");
    expect(manager.activeId).toBeNull();
    expect(hooks.onLoading).toHaveBeenCalledWith("a");

    await pending;
    expect(manager.activeId).toBe("a");
    expect(hooks.onReady).toHaveBeenCalledWith("a");
  });

  it("updates systems in order and only once ready", async () => {
    const calls: string[] = [];
    const { manager } = create({
      a: {
        setup: (ctx) => {
          withCamera(ctx.scene);
          ctx.addSystem({ name: "first", update: (dt) => calls.push(`first:${dt}`) });
          ctx.addSystem({ name: "second", update: (dt) => calls.push(`second:${dt}`) });
        },
      },
    });

    const pending = manager.switchTo("a");
    manager.update(0.016);
    expect(calls).toEqual([]);

    await pending;
    manager.update(0.016);
    expect(calls).toEqual(["first:0.016", "second:0.016"]);
  });

  it("disposes the previous scene and its systems in reverse order on switch", async () => {
    const disposed: string[] = [];
    let firstScene: Scene | undefined;
    const { manager } = create({
      a: {
        setup: (ctx) => {
          firstScene = ctx.scene;
          withCamera(ctx.scene);
          ctx.addSystem({ name: "x", dispose: () => disposed.push("x") });
          ctx.addSystem({ name: "y", dispose: () => disposed.push("y") });
        },
      },
      b: empty,
    });

    await manager.switchTo("a");
    await manager.switchTo("b");

    expect(disposed).toEqual(["y", "x"]);
    expect(firstScene?.isDisposed).toBe(true);
    expect(manager.activeId).toBe("b");
    expect(engine.scenes).toHaveLength(1);
  });

  it("aborts and discards a scene superseded while loading", async () => {
    const gate = deferred();
    let slowCtx: SceneContext | undefined;
    const { manager, hooks } = create({
      slow: {
        setup: async (ctx) => {
          slowCtx = ctx;
          withCamera(ctx.scene);
          await gate.promise;
        },
      },
      fast: empty,
    });

    const slow = manager.switchTo("slow");
    await manager.switchTo("fast");
    gate.resolve();
    await slow;

    expect(slowCtx?.signal.aborted).toBe(true);
    expect(slowCtx?.scene.isDisposed).toBe(true);
    expect(manager.activeId).toBe("fast");
    expect(hooks.onReady).toHaveBeenCalledTimes(1);
    expect(hooks.onReady).toHaveBeenCalledWith("fast");
  });

  it("reports setup failures and leaves no scene alive", async () => {
    const { manager, hooks } = create({
      broken: {
        setup: () => {
          throw new Error("boom");
        },
      },
    });

    await manager.switchTo("broken");

    expect(hooks.onError).toHaveBeenCalledWith("broken", expect.objectContaining({ message: "boom" }));
    expect(manager.activeId).toBeNull();
    expect(engine.scenes).toHaveLength(0);
  });

  it("tears down on dispose and ignores later switches", async () => {
    const onDispose = vi.fn();
    const { manager } = create({
      a: {
        setup: (ctx) => {
          withCamera(ctx.scene);
          ctx.addSystem({ name: "s", dispose: onDispose });
        },
      },
    });

    await manager.switchTo("a");
    manager.dispose();
    manager.dispose();
    await manager.switchTo("a");

    expect(onDispose).toHaveBeenCalledTimes(1);
    expect(manager.activeId).toBeNull();
    expect(engine.scenes).toHaveLength(0);
  });
});
