import { SpotLight } from "@babylonjs/core/Lights/spotLight";
import type { Material } from "@babylonjs/core/Materials/material";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { GameSystem } from "../engine/types";
import type { PlayerVehicle } from "../vehicles/PlayerVehicle";
import { VEHICLE_LIGHTS } from "./LightingConfig";
import type { SceneLighting } from "./SceneLighting";

const DEG = Math.PI / 180;
/** Car materials see the headlight, rim, sun/moon, ambient and the whole light pool. */
const CAR_MAX_LIGHTS = 14;

/**
 * Car Rule (ART_DIRECTION §2.3): the player's car is always readable at night. One spot light
 * throws the headlight beam; the lamp lenses are emissive so they bloom, and the tail lamps
 * brighten under braking and the reverse lamp comes on in reverse, straight from the handling
 * state. With `lighting`, the beam follows the time of day (off in daylight). Nothing here
 * feeds back into driving.
 */
export class VehicleLights implements GameSystem {
  readonly name = "vehicleLights";
  readonly headlight: SpotLight;
  private readonly tail: Material | undefined;
  private readonly reverse: Material | undefined;
  private braking = -1;
  private reversing: boolean | null = null;

  constructor(
    scene: Scene,
    private readonly player: PlayerVehicle,
    private readonly lighting?: SceneLighting,
  ) {
    const { model } = player.visual;
    const h = VEHICLE_LIGHTS.headlight;
    const pitch = h.pitchDownDeg * DEG;
    this.headlight = new SpotLight(
      "car:headlight",
      new Vector3(...h.position),
      new Vector3(0, -Math.sin(pitch), Math.cos(pitch)),
      h.angle,
      h.exponent,
      scene,
    );
    this.headlight.parent = player.body.node;
    this.headlight.diffuse = Color3.FromHexString(h.color);
    // Black specular keeps the SPECULARTERM define (a per-light, per-pixel cost) out of every
    // world shader; the vertex-coloured world has no specular anyway.
    this.headlight.specular = Color3.Black();
    this.headlight.intensity = h.intensity;
    this.headlight.range = h.range;

    for (const mesh of model.root.getChildMeshes()) {
      const material = mesh.material;
      if (!material) continue;
      material.unfreeze();
      if (material instanceof PBRMaterial || material instanceof StandardMaterial) material.maxSimultaneousLights = CAR_MAX_LIGHTS;
    }
    setEmissive(model.material("headlight"), h.lensEmissive);
    this.tail = model.material("taillight");
    this.reverse = model.material("reverse");
  }

  update(): void {
    // Zero, not disabled: `setEnabled` resyncs every mesh's light list.
    if (this.lighting) this.headlight.intensity = VEHICLE_LIGHTS.headlight.intensity * this.lighting.mood.headlight;
    const { brake, reversing } = this.player.controller.model.state;
    // Brake pedal in reverse is the throttle; only real braking lights the lamps.
    const braking = !reversing && brake > 0.05 ? 1 : 0;
    if (braking !== this.braking) {
      this.braking = braking;
      const t = VEHICLE_LIGHTS.taillight;
      setEmissive(this.tail, braking ? t.brakeEmissive : t.emissive);
    }
    if (reversing !== this.reversing) {
      this.reversing = reversing;
      const r = VEHICLE_LIGHTS.reverse;
      setEmissive(this.reverse, reversing ? r.activeEmissive : r.emissive);
    }
  }

  dispose(): void {
    this.headlight.dispose();
  }
}

function setEmissive(material: Material | undefined, hex: string): void {
  const color = Color3.FromHexString(hex).toLinearSpace();
  if (material instanceof PBRMaterial) material.emissiveColor = color;
  else if (material instanceof StandardMaterial) material.emissiveColor = color;
}
