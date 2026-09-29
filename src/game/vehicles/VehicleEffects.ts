import { Material } from '@babylonjs/core/Materials/material';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateIcoSphere } from '@babylonjs/core/Meshes/Builders/icoSphereBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import type { VehicleBody } from './VehicleBody';
import type { VehicleModel } from './VehicleModel';
import type { ArcadeHandlingModel } from './handling/ArcadeHandlingModel';
import { DriftFeedback } from './DriftFeedback';
import { inkStrokeSegments } from './DriftInk';

const SMOKE_LIMIT = 96;
const SKID_LIMIT = 480;
const SLASH_LIMIT = 80;
const ENGINE_SMOKE_BELOW = .25;

type Puff = { position: Vector3; velocity: Vector3; age: number; life: number; radius: number; kind: 'exhaust' | 'engine' | 'tire' | 'tireInk' };
type Skid = { position: Vector3; age: number; yaw: number; length: number; width: number };
type Slash = { position: Vector3; velocity: Vector3; age: number; yaw: number; length: number };

/** Small world-space meshes keep the smoke and tire marks behind the moving car. */
export class VehicleEffects {
  private readonly smoke: Mesh;
  private readonly damageSmoke: Mesh;
  private readonly tireSmoke: Mesh;
  private readonly inkSmoke: Mesh;
  private readonly skids: Mesh;
  private readonly slashes: Mesh;
  private readonly materials: StandardMaterial[] = [];
  private readonly smokeMatrices = Array.from({ length: 4 }, () => new Float32Array(SMOKE_LIMIT * 16));
  private readonly skidMatrices = new Float32Array(SKID_LIMIT * 16);
  private readonly slashMatrices = new Float32Array(SLASH_LIMIT * 16);
  private readonly puffs: Puff[] = [];
  private readonly marks: Skid[] = [];
  private readonly hatch: Slash[] = [];
  private readonly lastTirePoint = new Map<string, Vector3>();
  private readonly feedback = new DriftFeedback();
  private readonly point = new Vector3();
  private readonly scale = new Vector3();
  private readonly rotation = Quaternion.Identity();
  private readonly matrix = new Matrix();
  private exhaustTimer = 0;
  private engineTimer = 0;
  private skidTimer = 0;
  private strokeSeed = 0;

  constructor(scene: Scene, private readonly body: VehicleBody, private readonly model: VehicleModel, private readonly onCallout?: (text: string, intensity: number) => void) {
    const smokeMaterial = (name: string, color: Color3, alpha: number) => {
      const material = new StandardMaterial(name, scene);
      material.diffuseColor = color;
      material.emissiveColor = color.scale(.22);
      material.specularColor = Color3.Black();
      material.alpha = alpha;
      material.transparencyMode = Material.MATERIAL_ALPHABLEND;
      material.backFaceCulling = false;
      this.materials.push(material);
      return material;
    };
    this.smoke = CreateIcoSphere('car:exhaust-smoke', { radius: .5, subdivisions: 1, flat: true }, scene);
    this.damageSmoke = CreateIcoSphere('car:engine-smoke', { radius: .5, subdivisions: 1, flat: true }, scene);
    this.tireSmoke = CreateIcoSphere('car:drift-smoke', { radius: .5, subdivisions: 1, flat: true }, scene);
    this.inkSmoke = CreateIcoSphere('car:drift-ink-clouds', { radius: .5, subdivisions: 1, flat: true }, scene);
    this.skids = CreateBox('car:skid-flecks', { size: 1 }, scene);
    this.slashes = CreateBox('car:drift-hatching', { size: 1 }, scene);
    this.smoke.material = smokeMaterial('car:exhaust-ink', new Color3(.68, .7, .72), .38);
    this.damageSmoke.material = smokeMaterial('car:engine-ink', new Color3(.16, .17, .19), .58);
    this.tireSmoke.material = smokeMaterial('car:tire-ink', new Color3(.81, .79, .73), .42);
    this.inkSmoke.material = smokeMaterial('car:tire-hatch-cloud', new Color3(.035, .034, .037), .7);
    this.skids.material = smokeMaterial('car:skid-ink', new Color3(.045, .044, .045), .75);
    this.slashes.material = smokeMaterial('car:hatch-ink', new Color3(.025, .024, .027), .85);
    [this.smoke, this.damageSmoke, this.tireSmoke, this.inkSmoke, this.skids, this.slashes].forEach(mesh => {
      mesh.isPickable = false;
      mesh.alwaysSelectAsActiveMesh = true;
    });
    [this.smoke, this.damageSmoke, this.tireSmoke, this.inkSmoke].forEach((mesh, i) => mesh.thinInstanceSetBuffer('matrix', this.smokeMatrices[i], 16, false));
    this.skids.thinInstanceSetBuffer('matrix', this.skidMatrices, 16, false);
    this.slashes.thinInstanceSetBuffer('matrix', this.slashMatrices, 16, false);
    this.render();
  }

  clear(): void {
    this.puffs.length = 0;
    this.marks.length = 0;
    this.hatch.length = 0;
    this.lastTirePoint.clear();
    this.feedback.reset();
    this.exhaustTimer = this.engineTimer = this.skidTimer = 0;
    this.render();
  }

  update(dt: number, handling: ArcadeHandlingModel, engineCondition: number): void {
    if (dt <= 0) return;
    dt = Math.min(dt, .1);
    const { state, diagnostics } = handling;
    const forward = this.body.forward, right = this.body.right, up = this.body.up;
    const moving = Math.abs(state.vx) > .7;
    // The tailpipe breathes at idle and puffs faster under throttle.
    this.exhaustTimer += dt;
    const exhaustInterval = moving ? .22 - state.throttle * .1 : .34;
    if (this.exhaustTimer >= exhaustInterval) {
      this.exhaustTimer %= exhaustInterval;
      const pipe = this.model.attachments.get('exhaust')?.anchor;
      if (pipe) {
        this.point.copyFrom(pipe.getAbsolutePosition());
        this.point.addInPlace(forward.scale(-.13));
        this.emit('exhaust', this.point, forward.scale(-.6 - Math.abs(state.vx) * .04).addInPlace(up.scale(.3)), .13, 1.25);
      }
    }
    this.engineTimer += dt;
    if (engineCondition <= ENGINE_SMOKE_BELOW && this.engineTimer >= .13) {
      this.engineTimer %= .13;
      this.body.toWorld(new Vector3(0, .83, 1.15), this.point);
      this.emit('engine', this.point, up.scale(.9).addInPlace(forward.scale(-.22)), .2, 1.65);
    }

    const mechanical = !!handling.config.mechanical;
    const wheelIntensity = handling.mechanics.wheels.map(w => w.isGrounded ? Math.max(0, Math.min(1, (w.slipEnergy - 800) / 14000)) : 0);
    const sliding = mechanical ? wheelIntensity.some(value => value > 0) : moving && Math.abs(state.vx) > 5 && this.body.contact.rear > 0 &&
      (Math.abs(diagnostics.rearSlip) > .15 || Math.abs(diagnostics.bodySlip) > .2 || diagnostics.handbrakeEffect > .35) &&
      (diagnostics.rearGripUse > .65 || diagnostics.handbrakeEffect > .35);
    const intensity = mechanical ? (handling.mechanics.detector.drifting ? Math.max(...wheelIntensity) : 0) : sliding ? Math.min(1, Math.max(
      Math.abs(diagnostics.bodySlip) * 1.4,
      Math.abs(diagnostics.rearSlip) * 1.25,
      diagnostics.handbrakeEffect * .8,
    ) * Math.min(1, .5 + diagnostics.rearGripUse * .6)) : 0;
    const callout = this.feedback.step(dt, intensity);
    if (callout) this.onCallout?.(callout, intensity);
    this.skidTimer = sliding ? this.skidTimer + dt : 0;
    if (sliding) {
      for (const wheel of this.model.wheels) {
        const index = this.model.wheels.indexOf(wheel);
        const tireIntensity = mechanical ? wheelIntensity[index] : intensity;
        if ((!mechanical && wheel.front) || tireIntensity <= 0) { this.lastTirePoint.delete(wheel.id); continue; }
        if (!this.body.wheels.find(w => w.id === wheel.id)?.grounded) {
          this.lastTirePoint.delete(wheel.id);
          continue;
        }
        this.point.copyFrom(wheel.hub.getAbsolutePosition()).subtractInPlace(up.scale(wheel.radius - .025));
        const previous = this.lastTirePoint.get(wheel.id);
        if (previous) {
          const strokes = inkStrokeSegments(previous, this.point, tireIntensity, this.strokeSeed++);
          for (const stroke of strokes) this.mark(new Vector3(stroke.x, this.point.y, stroke.z), stroke.yaw, stroke.length, stroke.width);
        }
        this.lastTirePoint.set(wheel.id, this.point.clone());
        if (this.skidTimer >= .055) {
          const driftVelocity = forward.scale(-Math.abs(state.vx) * .075)
            .addInPlace(right.scale(-state.vy * .09))
            .addInPlace(up.scale(.5 + intensity * .55));
          this.emit('tire', this.point, driftVelocity, .16 + intensity * .16, .55 + intensity * .42);
          if (intensity > .5) {
            this.emit('tireInk', this.point.add(up.scale(.08)), driftVelocity.add(right.scale((Math.random() - .5) * 1.2)), .1 + intensity * .12, .32 + intensity * .25);
            this.spray(this.point, right, forward, intensity);
          }
        }
      }
      if (this.skidTimer >= .055) this.skidTimer %= .055;
    } else this.lastTirePoint.clear();
    for (const puff of this.puffs) {
      puff.age += dt;
      puff.position.addInPlace(puff.velocity.scale(dt));
      puff.velocity.scaleInPlace(Math.exp(-1.8 * dt));
      puff.velocity.y += .17 * dt;
    }
    for (const mark of this.marks) mark.age += dt;
    for (const slash of this.hatch) {
      slash.age += dt;
      slash.position.addInPlace(slash.velocity.scale(dt));
    }
    for (let i = this.puffs.length - 1; i >= 0; i--) if (this.puffs[i].age >= this.puffs[i].life) this.puffs.splice(i, 1);
    for (let i = this.marks.length - 1; i >= 0; i--) if (this.marks[i].age >= 7) this.marks.splice(i, 1);
    for (let i = this.hatch.length - 1; i >= 0; i--) if (this.hatch[i].age >= .42) this.hatch.splice(i, 1);
    this.render();
  }

  private emit(kind: Puff['kind'], position: Vector3, velocity: Vector3, radius: number, life: number): void {
    if (this.puffs.length >= SMOKE_LIMIT) this.puffs.shift();
    this.puffs.push({ kind, position: position.clone(), velocity: velocity.clone(), age: 0, life, radius });
  }

  private mark(position: Vector3, yaw: number, length: number, width: number): void {
    if (this.marks.length >= SKID_LIMIT) this.marks.shift();
    this.marks.push({ position, yaw, length, width, age: 0 });
  }

  private spray(position: Vector3, right: Vector3, forward: Vector3, intensity: number): void {
    for (let i = 0; i < (intensity > .8 ? 3 : 2); i++) {
      if (this.hatch.length >= SLASH_LIMIT) this.hatch.shift();
      const side = (Math.random() - .5) * 2;
      this.hatch.push({
        position: position.add(right.scale(side * .18)).add(new Vector3(0, .12, 0)),
        velocity: right.scale(side * (1.5 + intensity * 2)).addInPlace(forward.scale(-1.5)).addInPlace(new Vector3(0, 1 + Math.random(), 0)),
        yaw: Math.atan2(forward.x + right.x * side, forward.z + right.z * side),
        length: .25 + Math.random() * .55 * intensity,
        age: 0,
      });
    }
  }

  private render(): void {
    const meshes = [this.smoke, this.damageSmoke, this.tireSmoke, this.inkSmoke];
    const kinds: Puff['kind'][] = ['exhaust', 'engine', 'tire', 'tireInk'];
    for (let kind = 0; kind < meshes.length; kind++) {
      const buffer = this.smokeMatrices[kind];
      let index = 0;
      for (const puff of this.puffs) {
        if (kinds[kind] !== puff.kind) continue;
        const t = puff.age / puff.life;
        const size = puff.radius * (1 + t * 3) * Math.min(1, (1 - t) * 4);
        this.scale.set(size, size * .72, size);
        Quaternion.RotationYawPitchRollToRef(puff.age * 1.7 + index, puff.age * .6, 0, this.rotation);
        Matrix.ComposeToRef(this.scale, this.rotation, puff.position, this.matrix);
        this.matrix.copyToArray(buffer, index++ * 16);
      }
      this.hideRemainder(buffer, index, SMOKE_LIMIT);
      meshes[kind].thinInstanceBufferUpdated('matrix');
    }
    let index = 0;
    for (const mark of this.marks) {
      const fade = Math.min(1, (7 - mark.age) * 2);
      this.scale.set(mark.width * fade, .008, mark.length * fade);
      Quaternion.RotationYawPitchRollToRef(mark.yaw, 0, 0, this.rotation);
      Matrix.ComposeToRef(this.scale, this.rotation, mark.position, this.matrix);
      this.matrix.copyToArray(this.skidMatrices, index++ * 16);
    }
    this.hideRemainder(this.skidMatrices, index, SKID_LIMIT);
    this.skids.thinInstanceBufferUpdated('matrix');
    index = 0;
    for (const slash of this.hatch) {
      const fade = Math.min(1, (1 - slash.age / .42) * 2);
      this.scale.set(.025 * fade, .018, slash.length * fade);
      Quaternion.RotationYawPitchRollToRef(slash.yaw, 0, -.28, this.rotation);
      Matrix.ComposeToRef(this.scale, this.rotation, slash.position, this.matrix);
      this.matrix.copyToArray(this.slashMatrices, index++ * 16);
    }
    this.hideRemainder(this.slashMatrices, index, SLASH_LIMIT);
    this.slashes.thinInstanceBufferUpdated('matrix');
  }

  private hideRemainder(buffer: Float32Array, from: number, limit: number): void {
    Matrix.ScalingToRef(0, 0, 0, this.matrix);
    for (let i = from; i < limit; i++) this.matrix.copyToArray(buffer, i * 16);
  }

  dispose(): void {
    [this.smoke, this.damageSmoke, this.tireSmoke, this.inkSmoke, this.skids, this.slashes].forEach(mesh => mesh.dispose());
    this.materials.forEach(material => material.dispose());
  }
}
