import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import type { Scene } from "@babylonjs/core/scene";
import { CollisionGroup } from "../physics/PhysicsWorld";
import type { VehiclePose } from "../vehicles/VehicleBody";

const DEG = Math.PI / 180;
/** Thick slabs: a fast car can't step through a metre of solid box in one 1/120 s step. */
const SLAB_THICKNESS = 1;
const ROAD_WIDTH = 12;
const MARK_SPACING = 8;

export type DebugRoad = {
  spawnPoints: Readonly<Record<string, VehiclePose>>;
  /** Top of the road surface at the start of each section, for tests and telemetry checks. */
  sections: Readonly<Record<string, { from: Vector3; to: Vector3 }>>;
};

/**
 * Handling test track. Static boxes only (no mesh colliders), each with its top face
 * exactly on the road surface so neighbouring sections meet without steps.
 *
 *   z −60 … 120   flat apron, 80 m wide: launches, braking, skidpad circles
 *   z 120 … 180   8° uphill      → plateau (z 180 … 220)
 *   z 220 … 300   6° downhill    → flat runout (z 300 … 420) with a wall on the right
 *   x −70         10° camber pad (parked sideways) and a 15° ramp (hill hold)
 */
export function buildDebugRoad(scene: Scene): DebugRoad {
  const asphalt = material(scene, "debugAsphalt", new Color3(0.22, 0.22, 0.23));
  const slope = material(scene, "debugSlope", new Color3(0.27, 0.25, 0.23));
  const concrete = material(scene, "debugConcrete", new Color3(0.5, 0.48, 0.45));
  const paint = material(scene, "debugPaint", new Color3(0.85, 0.8, 0.6));
  paint.emissiveColor = new Color3(0.25, 0.22, 0.15);

  const upTop = new Vector3(0, 60 * Math.tan(8 * DEG), 180);
  const plateauEnd = new Vector3(0, upTop.y, 220);
  const downEnd = new Vector3(0, 0, plateauEnd.z + upTop.y / Math.tan(6 * DEG));

  const sections = {
    apron: { from: new Vector3(0, 0, -60), to: new Vector3(0, 0, 120) },
    uphill: { from: new Vector3(0, 0, 120), to: upTop },
    plateau: { from: upTop, to: plateauEnd },
    downhill: { from: plateauEnd, to: downEnd },
    runout: { from: downEnd, to: new Vector3(0, 0, downEnd.z + 120) },
    camber: { from: new Vector3(-70, 0, 0), to: new Vector3(-70, 0, 30) },
    steep: { from: new Vector3(-70, 0, 50), to: new Vector3(-70, 40 * Math.tan(15 * DEG), 90) },
  };

  slab(scene, "apron", sections.apron.from, sections.apron.to, 80, asphalt);
  slab(scene, "uphill", sections.uphill.from, sections.uphill.to, ROAD_WIDTH, slope);
  slab(scene, "plateau", sections.plateau.from, sections.plateau.to, ROAD_WIDTH, asphalt);
  slab(scene, "downhill", sections.downhill.from, sections.downhill.to, ROAD_WIDTH, slope);
  slab(scene, "runout", sections.runout.from, sections.runout.to, ROAD_WIDTH * 2, asphalt);
  // The camber pad is raised by its own tilt so its low edge sits on the ground.
  const camberLift = 7 * Math.sin(10 * DEG);
  sections.camber.from.y = sections.camber.to.y = camberLift;
  slab(scene, "camber", sections.camber.from, sections.camber.to, 14, slope, 10 * DEG);
  slab(scene, "steep", sections.steep.from, sections.steep.to, 8, slope);

  const wallFrom = new Vector3(ROAD_WIDTH + 0.5, 0, downEnd.z + 20);
  const wall = CreateBox("wall", { width: 1, height: 1.2, depth: 80 }, scene);
  wall.position.set(wallFrom.x, 0.6, wallFrom.z + 40);
  wall.material = concrete;
  collider(wall);

  laneMarks(scene, paint, sections);

  const onRoad = (at: Vector3, headingDeg: number): VehiclePose => ({ position: at, headingRad: headingDeg * DEG });
  return {
    sections,
    spawnPoints: {
      start: onRoad(new Vector3(0, 0, 0), 0),
      skidpad: onRoad(new Vector3(25, 0, 40), 0),
      hill: onRoad(lerpPoint(sections.uphill, 0.5), 0),
      hill_down: onRoad(lerpPoint(sections.downhill, 0.4), 0),
      camber: onRoad(lerpPoint(sections.camber, 0.5), 0),
      steep: onRoad(lerpPoint(sections.steep, 0.5), 0),
    },
  };
}

/**
 * A box whose top face runs along the centreline `from` → `to`, `width` wide,
 * optionally banked about its own length.
 */
function slab(scene: Scene, name: string, from: Vector3, to: Vector3, width: number, mat: StandardMaterial, bank = 0) {
  const forward = to.subtract(from).normalize();
  const right = Vector3.Cross(Vector3.Up(), forward).normalize();
  const up = Vector3.Cross(forward, right);
  const banking = Quaternion.RotationAxis(forward, bank);
  right.rotateByQuaternionToRef(banking, right);
  up.rotateByQuaternionToRef(banking, up);

  const box = CreateBox(name, { width, height: SLAB_THICKNESS, depth: Vector3.Distance(from, to) }, scene);
  box.rotationQuaternion = Quaternion.RotationQuaternionFromAxis(right, up, forward);
  box.position = Vector3.Center(from, to).subtract(up.scale(SLAB_THICKNESS / 2));
  box.material = mat;
  collider(box);
  return box;
}

function collider(mesh: Mesh): void {
  mesh.computeWorldMatrix(true);
  const aggregate = new PhysicsAggregate(mesh, PhysicsShapeType.BOX, { mass: 0, friction: 0.9, restitution: 0 });
  aggregate.shape.filterMembershipMask = CollisionGroup.STATIC;
}

/** Centreline dashes: without them a flat grey road gives no sense of speed. */
function laneMarks(scene: Scene, mat: StandardMaterial, sections: DebugRoad["sections"]) {
  const dash = CreateBox("laneMark", { width: 0.15, height: 0.02, depth: 2.5 }, scene);
  dash.material = mat;
  dash.isPickable = false;
  const lanes = [-24, -12, 0, 12, 24];
  for (const [name, { from, to }] of Object.entries(sections)) {
    if (name === "camber" || name === "steep") continue;
    const length = Vector3.Distance(from, to);
    const forward = to.subtract(from).normalize();
    const rotation = Quaternion.FromLookDirectionLH(forward, Vector3.Up());
    const offsets = name === "apron" ? lanes : [0];
    for (let d = MARK_SPACING / 2; d < length; d += MARK_SPACING) {
      for (const x of offsets) {
        const at = from.add(forward.scale(d)).addInPlaceFromFloats(x, 0.011, 0);
        dash.thinInstanceAdd(Matrix.Compose(Vector3.One(), rotation, at), false);
      }
    }
  }
  dash.thinInstanceBufferUpdated("matrix");
}

function material(scene: Scene, name: string, color: Color3): StandardMaterial {
  const mat = new StandardMaterial(name, scene);
  mat.diffuseColor = color;
  mat.specularColor = Color3.Black();
  return mat;
}

function lerpPoint({ from, to }: { from: Vector3; to: Vector3 }, t: number): Vector3 {
  return Vector3.Lerp(from, to, t);
}
