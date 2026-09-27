import type { Scene } from '@babylonjs/core/scene';
import { bodyPart, resolveBodyPartLook } from '@/game-core/exterior';
import type { NpcCarBuild } from '@/game-core/exterior/npcBuilds';
import { wheelPart } from '@/game-core/wheels';
import { BodyPartSwapper } from './BodyPartSwapper';
import type { VehicleModel } from './VehicleModel';
import { WheelSwapper } from './WheelSwapper';

/** Loaded models by vehicle spec id: NPC cars clone whichever owned car matches their build. */
export type NpcCarModels = () => Readonly<Record<string, VehicleModel>>;

export type NpcCar = { model: VehicleModel; parts: BodyPartSwapper; wheels: WheelSwapper; dispose(): void };

/**
 * An independent clone of `source` in the build's paint, stance, panels and wheels. Parts load in
 * the background; failures only warn, leaving that socket stock.
 */
export function dressNpcCar(scene: Scene, source: VehicleModel, name: string, paint: string, build?: NpcCarBuild): NpcCar {
  const model = source.clone(name);
  model.setPaint(paint);
  model.setRideHeight(build?.rideHeightM ?? 0);
  const parts = new BodyPartSwapper(scene, model);
  const wheels = new WheelSwapper(scene, model);
  let disposed = false;
  if (build) {
    const pending: Promise<unknown>[] = [];
    for (const entry of build.parts) {
      const part = bodyPart(entry.id);
      if (!part) { console.warn(`[${name}] unknown body part ${entry.id}`); continue; }
      pending.push(parts.equip(part.socket, { part, look: resolveBodyPartLook(part, {
        condition: entry.condition, finish: entry.finish, bodyColor: paint, vehicleTags: source.definition.tags,
      }) }));
    }
    const set = build.wheels ? wheelPart(build.wheels) : undefined;
    if (set) pending.push(wheels.equip(set));
    void Promise.allSettled(pending).then(results => {
      if (disposed) return;
      for (const result of results) if (result.status === 'rejected') console.warn(`[${name}]`, result.reason);
    });
  }
  return { model, parts, wheels, dispose() { disposed = true; parts.dispose(); wheels.dispose(); model.dispose(); } };
}
