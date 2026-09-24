import HavokPhysics, { type HavokPhysicsWithBindings } from "@babylonjs/havok";

export type HavokOptions = {
  /** Pre-fetched wasm (tests, Node). The browser resolves the wasm next to the module instead. */
  wasmBinary?: ArrayBuffer;
};

let instance: Promise<HavokPhysicsWithBindings> | null = null;

/**
 * Loads the Havok wasm once per page. Scenes share the module; each scene
 * gets its own physics world via `PhysicsWorld`.
 */
export function loadHavok(options: HavokOptions = {}): Promise<HavokPhysicsWithBindings> {
  instance ??= HavokPhysics(options).catch((error: unknown) => {
    instance = null;
    throw error;
  });
  return instance;
}
