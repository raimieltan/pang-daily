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

const SMOKE_LIMIT = 96;
const SKID_LIMIT = 96;
const ENGINE_SMOKE_BELOW = .25;

type Puff = { position: Vector3; velocity: Vector3; age: number; life: number; radius: number; kind: 'exhaust' | 'engine' | 'tire' };
type Skid = { position: Vector3; age: number; yaw: number; length: number };

/** Small world-space meshes keep the smoke and tire marks behind the moving car. */
export class VehicleEffects {
  private readonly smoke: Mesh;
  private readonly damageSmoke: Mesh;
  private readonly tireSmoke: Mesh;
  private readonly skids: Mesh;
  private readonly materials: StandardMaterial[] = [];
  private readonly smokeMatrices = [new Float32Array(SMOKE_LIMIT * 16), new Float32Array(SMOKE_LIMIT * 16), new Float32Array(SMOKE_LIMIT * 16)];
  private readonly skidMatrices = new Float32Array(SKID_LIMIT * 16);
  private readonly puffs: Puff[] = [];
  private readonly marks: Skid[] = [];
  private readonly point = new Vector3();
  private readonly scale = new Vector3();
  private readonly rotation = Quaternion.Identity();
  private readonly matrix = new Matrix();
  private exhaustTimer = 0;
  private engineTimer = 0;
  private skidTimer = 0;

  constructor(scene: Scene, private readonly body: VehicleBody, private readonly model: VehicleModel) {
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
    this.skids = CreateBox('car:skid-flecks', { size: 1 }, scene);
    this.smoke.material = smokeMaterial('car:exhaust-ink', new Color3(.68, .7, .72), .38);
    this.damageSmoke.material = smokeMaterial('car:engine-ink', new Color3(.16, .17, .19), .58);
    this.tireSmoke.material = smokeMaterial('car:tire-ink', new Color3(.81, .79, .73), .42);
    this.skids.material = smokeMaterial('car:skid-ink', new Color3(.045, .044, .045), .75);
    [this.smoke, this.damageSmoke, this.tireSmoke, this.skids].forEach(mesh => {
      mesh.isPickable = false;
      mesh.alwaysSelectAsActiveMesh = true;
    });
    [this.smoke, this.damageSmoke, this.tireSmoke].forEach((mesh, i) => mesh.thinInstanceSetBuffer('matrix', this.smokeMatrices[i], 16, false));
    this.skids.thinInstanceSetBuffer('matrix', this.skidMatrices, 16, false);
    this.render();
  }

  clear(): void {
    this.puffs.length = 0;
    this.marks.length = 0;
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

    const sliding = moving && Math.abs(state.vx) > 5 && this.body.contact.rear > 0 &&
      (Math.abs(diagnostics.rearSlip) > .15 || Math.abs(diagnostics.bodySlip) > .2 || diagnostics.handbrakeEffect > .35) &&
      (diagnostics.rearGripUse > .65 || diagnostics.handbrakeEffect > .35);
    this.skidTimer = sliding ? this.skidTimer + dt : 0;
    if (sliding && this.skidTimer >= .055) {
      this.skidTimer %= .055;
      const yaw = Math.atan2(forward.x, forward.z);
      for (const wheel of this.model.wheels) {
        if (wheel.front || !this.body.wheels.find(w => w.id === wheel.id)?.grounded) continue;
        this.point.copyFrom(wheel.hub.getAbsolutePosition()).subtractInPlace(up.scale(wheel.radius - .025));
        this.mark(this.point, yaw, Math.min(.65, .23 + Math.abs(state.vx) * .015));
        this.emit('tire', this.point, up.scale(.48).addInPlace(right.scale((Math.random() - .5) * .7)), .18, .95);
      }
    }
    for (const puff of this.puffs) {
      puff.age += dt;
      puff.position.addInPlace(puff.velocity.scale(dt));
      puff.velocity.scaleInPlace(Math.exp(-1.8 * dt));
      puff.velocity.y += .17 * dt;
    }
    for (const mark of this.marks) mark.age += dt;
    for (let i = this.puffs.length - 1; i >= 0; i--) if (this.puffs[i].age >= this.puffs[i].life) this.puffs.splice(i, 1);
    for (let i = this.marks.length - 1; i >= 0; i--) if (this.marks[i].age >= 5) this.marks.splice(i, 1);
    this.render();
  }

  private emit(kind: Puff['kind'], position: Vector3, velocity: Vector3, radius: number, life: number): void {
    if (this.puffs.length >= SMOKE_LIMIT) this.puffs.shift();
    this.puffs.push({ kind, position: position.clone(), velocity: velocity.clone(), age: 0, life, radius });
  }

  private mark(position: Vector3, yaw: number, length: number): void {
    if (this.marks.length >= SKID_LIMIT) this.marks.shift();
    this.marks.push({ position: position.clone(), yaw, length, age: 0 });
  }

  private render(): void {
    const meshes = [this.smoke, this.damageSmoke, this.tireSmoke];
    for (let kind = 0; kind < 3; kind++) {
      const buffer = this.smokeMatrices[kind];
      let index = 0;
      for (const puff of this.puffs) {
        if ((kind === 0 ? 'exhaust' : kind === 1 ? 'engine' : 'tire') !== puff.kind) continue;
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
      const fade = Math.min(1, (5 - mark.age) * 2);
      this.scale.set(.09 * fade, .008, mark.length * fade);
      Quaternion.RotationYawPitchRollToRef(mark.yaw, 0, 0, this.rotation);
      Matrix.ComposeToRef(this.scale, this.rotation, mark.position, this.matrix);
      this.matrix.copyToArray(this.skidMatrices, index++ * 16);
    }
    this.hideRemainder(this.skidMatrices, index, SKID_LIMIT);
    this.skids.thinInstanceBufferUpdated('matrix');
  }

  private hideRemainder(buffer: Float32Array, from: number, limit: number): void {
    Matrix.ScalingToRef(0, 0, 0, this.matrix);
    for (let i = from; i < limit; i++) this.matrix.copyToArray(buffer, i * 16);
  }

  dispose(): void {
    [this.smoke, this.damageSmoke, this.tireSmoke, this.skids].forEach(mesh => mesh.dispose());
    this.materials.forEach(material => material.dispose());
  }
}
