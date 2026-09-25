/**
 * What the player is doing right now. Exactly one controller, camera rig and input context is
 * live per mode (see `PlayerModes`). New modes (seated at a table, in a garage menu) slot in here.
 */
export type PlayerMode = "driving" | "walking";
