import type { SceneDefinition } from "../engine/types";
import { debugScene } from "./debugScene";
import { drivingScene } from "./drivingScene";
import { hubScene } from "./hubScene";

/** Every scene the runtime can switch to. Add new scenes here to make them addressable. */
export const scenes = {
  debug: debugScene,
  driving: drivingScene,
  hub: hubScene,
} satisfies Record<string, SceneDefinition>;

export type SceneId = keyof typeof scenes;

export const INITIAL_SCENE: SceneId = "hub";
