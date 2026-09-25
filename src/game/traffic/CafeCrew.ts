import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Material } from '@babylonjs/core/Materials/material';
import { CreateIcoSphere } from '@babylonjs/core/Meshes/Builders/icoSphereBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { PhysicsBody } from '@babylonjs/core/Physics/v2/physicsBody';
import { PhysicsShapeBox } from '@babylonjs/core/Physics/v2/physicsShape';
import { PhysicsMotionType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import type { Scene } from '@babylonjs/core/scene';
import { CharacterVisual } from '../characters/CharacterVisual';
import { CREW } from '../characters/crew';
import type { GameSystem } from '../engine/types';
import { CollisionGroup } from '../physics/PhysicsWorld';
import { buildCrewCar } from '../vehicles/crewCars';
import type { WorldKit } from '../world/WorldChunk';
import { CAFE_CREW, CREW_CARS } from '../world/hub/cafePopulation';
import type { NpcSound } from './RoadsidePeople';

/** Vapour puffs per smoker; one thin-instanced ico mesh draws all of them. */
const PUFFS = 14;
const LIFE = 2.8;
type Puff = { x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; size: number };

/**
 * Sean, Michael "Kent" Handumon and Casey at the south terrace table, vaping, with their cars
 * nose-in by the wall. Puffs swell, drift and shrink away (thin instances can't fade alpha).
 */
export class CafeCrew implements GameSystem {
  readonly name = 'cafeCrew';
  private readonly crew: { visual: CharacterVisual; chatter: number; puffs: Puff[]; next: number }[];
  private readonly cars: { mesh: Mesh; body: PhysicsBody; shape: PhysicsShapeBox }[];
  private readonly smoke: Mesh;
  private readonly smokeMaterial: StandardMaterial;
  private readonly matrices = new Float32Array(CAFE_CREW.length * PUFFS * 16);
  private readonly mouth = new Vector3();
  private readonly scratch = { scale: new Vector3(), rot: Quaternion.Identity(), at: new Vector3(), m: new Matrix() };

  constructor(scene: Scene, kit: WorldKit, private readonly focus: () => { x: number; z: number },
    private readonly sound: (sound: NpcSound) => void) {
    this.crew = CAFE_CREW.map((seat, i) => {
      const member = CREW.find(m => m.id === seat.id)!;
      const visual = new CharacterVisual(scene, kit.lit, 1.7, { ...member.appearance(), vape: true });
      visual.root.name = `crew-${member.id}`;
      visual.root.position.set(seat.x, 0, seat.z);
      visual.root.rotation.y = seat.heading * Math.PI / 180;
      visual.vapeIdle(0, i * 3.6, true);
      return { visual, chatter: 4 + i * 2.3, puffs: [], next: 0 };
    });

    this.smokeMaterial = new StandardMaterial('crew:vape-smoke', scene);
    this.smokeMaterial.diffuseColor = new Color3(.8, .82, .84);
    this.smokeMaterial.emissiveColor = new Color3(.22, .23, .25);
    this.smokeMaterial.specularColor = Color3.Black();
    this.smokeMaterial.alpha = .28;
    this.smokeMaterial.transparencyMode = Material.MATERIAL_ALPHABLEND;
    this.smoke = CreateIcoSphere('crew:vape-puffs', { radius: .5, subdivisions: 1, flat: true }, scene);
    this.smoke.material = this.smokeMaterial;
    this.smoke.isPickable = false;
    this.smoke.thinInstanceSetBuffer('matrix', this.matrices, 16, false);
    this.smoke.alwaysSelectAsActiveMesh = true;

    this.cars = CREW_CARS.map((car) => {
      const mesh = buildCrewCar(scene, kit.lit, car.model, car.paint, `crew-car-${car.owner}`);
      mesh.position.set(car.x, 0, car.z);
      mesh.rotationQuaternion = Quaternion.RotationYawPitchRoll(car.heading * Math.PI / 180, 0, 0);
      const body = new PhysicsBody(mesh, PhysicsMotionType.STATIC, false, scene);
      const shape = new PhysicsShapeBox(new Vector3(0, .75, 0), Quaternion.Identity(), new Vector3(1.8, 1.4, 4.6), scene);
      shape.filterMembershipMask = CollisionGroup.STATIC;
      shape.filterCollideMask = CollisionGroup.VEHICLE | CollisionGroup.CHARACTER;
      shape.material = { friction: .5, restitution: .05 };
      body.shape = shape;
      return { mesh, body, shape };
    });
  }

  update(dt: number) {
    const at = this.focus();
    const seat = CAFE_CREW[0];
    const distance = Math.hypot(seat.x - at.x, seat.z - at.z);
    const near = distance < 160;
    this.crew.forEach(c => c.visual.root.setEnabled(near));
    this.smoke.setEnabled(near);
    this.cars.forEach(({ mesh }) => mesh.setEnabled(Math.hypot(mesh.position.x - at.x, mesh.position.z - at.z) < 220));
    if (!near) return;

    const { scale, rot, at: pos, m } = this.scratch;
    this.crew.forEach((member, i) => {
      const exhale = member.visual.vapeIdle(dt, i * 3.6, true);
      member.next -= dt;
      if (exhale > .15 && member.next <= 0) {
        member.visual.mouth(this.mouth);
        const yaw = CAFE_CREW[i].heading * Math.PI / 180;
        const push = .5 + exhale * .6;
        member.puffs.push({
          x: this.mouth.x, y: this.mouth.y, z: this.mouth.z,
          vx: Math.sin(yaw) * push + (Math.random() - .5) * .2,
          vy: .25 + Math.random() * .2,
          vz: Math.cos(yaw) * push + (Math.random() - .5) * .2,
          age: 0, size: .07 + exhale * .08,
        });
        if (member.puffs.length > PUFFS) member.puffs.shift();
        member.next = .15;
      }
      for (let p = 0; p < PUFFS; p++) {
        const puff = member.puffs[p];
        const offset = (i * PUFFS + p) * 16;
        if (!puff || puff.age >= LIFE) { Matrix.ScalingToRef(0, 0, 0, m); m.copyToArray(this.matrices, offset); continue; }
        puff.age += dt;
        const drag = Math.exp(-2.2 * dt);
        puff.vx *= drag; puff.vz *= drag; puff.vy = puff.vy * drag + .12 * dt;
        puff.x += puff.vx * dt; puff.y += puff.vy * dt; puff.z += puff.vz * dt;
        const t = puff.age / LIFE;
        const s = puff.size * (1 + t * 5) * Math.min(1, (1 - t) * 3);
        Quaternion.RotationYawPitchRollToRef(p * 1.3 + puff.age * .4, p * .7, 0, rot);
        Matrix.ComposeToRef(scale.set(s, s * .8, s), rot, pos.set(puff.x, puff.y, puff.z), m);
        m.copyToArray(this.matrices, offset);
      }
      member.chatter -= dt;
      if (member.chatter <= 0) {
        member.chatter = 11 + i * 1.9;
        if (distance < 18) this.sound({ kind: 'chatter', voice: CAFE_CREW[i].voice, distance });
      }
    });
    this.smoke.thinInstanceBufferUpdated('matrix');
  }

  dispose() {
    this.crew.forEach(c => c.visual.root.dispose());
    this.cars.forEach(({ mesh, body, shape }) => { body.dispose(); shape.dispose(); mesh.dispose(); });
    this.smoke.dispose();
    this.smokeMaterial.dispose();
  }
}
