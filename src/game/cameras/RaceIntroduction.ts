import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { GameSystem } from "../engine/types";
import type { RaceSystem } from "../races/RaceSystem";
import type { PlayerVehicle } from "../vehicles/PlayerVehicle";
import type { ChaseCamera } from "./ChaseCamera";

/** A roadside establishing shot. RaceSystem holds the grid/countdown until the tape settles. */
export class RaceIntroduction implements GameSystem {
  readonly name = "raceIntroduction";
  private wasIntro = false;
  private readonly aim = new Vector3();
  constructor(private readonly race: RaceSystem, private readonly player: PlayerVehicle, private readonly chase: ChaseCamera) {}
  update(): void {
    if (this.race.introRemaining <= 0) {
      if (this.wasIntro) this.chase.snap();
      this.wasIntro = false;
      return;
    }
    this.wasIntro = true;
    const p = this.player.position, f = this.player.forward;
    const drift = this.chase.reducedMotion ? 0 : (3.2 - this.race.introRemaining) * 0.12;
    this.chase.camera.position.set(p.x - f.x * 10 + f.z * 3.8, p.y + 1.25 + drift, p.z - f.z * 10 - f.x * 3.8);
    this.aim.set(p.x + f.x * 7, p.y + 0.85, p.z + f.z * 7);
    this.chase.camera.setTarget(this.aim);
    this.chase.camera.fov = 0.8;
  }
}
