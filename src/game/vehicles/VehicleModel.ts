import type { AssetContainer } from "@babylonjs/core/assetContainer";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { Material } from "@babylonjs/core/Materials/material";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import { registerBuiltInLoaders } from "@babylonjs/loaders/dynamic";
import {
  WHEEL_IDS,
  type ExteriorSlot,
  type VehicleDefinition,
  type WheelFit,
  type WheelId,
} from "@/game-core/vehicles";

registerBuiltInLoaders();

/** Scale/placement mismatches beyond this share of the expected value fail the import. */
const DIMENSION_TOLERANCE = 0.1;
/** Wheel origins further than this from their geometric centre are re-pivoted (and reported). */
const PIVOT_TOLERANCE_M = 0.01;
/** Lowest wheel point further than this from y = 0 is moved onto the ground (and reported). */
const GROUND_TOLERANCE_M = 0.01;

export type VehicleWheel = {
  readonly id: WheelId;
  readonly front: boolean;
  /** +1 on the car's right (+x), −1 on the left. Measured, so mirrored node names still work. */
  readonly side: 1 | -1;
  /**
   * Car-space pivot at the wheel's geometric centre, outside the chassis so ride height never
   * moves it. Rotate this (steer about y, spin about x); the wheel visual hangs under it.
   */
  readonly hub: TransformNode;
  /** Named `definition.wheels.sockets[id]`. Holds the wheel visual; wheel offset slides it along the axle. */
  readonly socket: TransformNode;
  /** The GLB's own wheel. Hidden while a swapped wheel is mounted. */
  readonly mesh: TransformNode;
  /** Swapped-in wheel visual (owned by the caller), or null for stock. */
  mounted: TransformNode | null;
  /** Size and offset currently on this socket: the definition's stock spec while `mounted` is null. */
  fit: WheelFit;
  /** Current rolling radius, in metres: measured stock radius plus the fitted wheel's extra. */
  radius: number;
};

export type VehicleAttachmentPoint = {
  readonly slot: ExteriorSlot;
  /** Mount point in the chassis (follows ride height). Parts parented here sit at its origin. */
  readonly anchor: TransformNode;
  /** Factory part the slot replaces, or null for an empty slot. */
  readonly stock: TransformNode | null;
  mounted: TransformNode | null;
};

/** Per-model render cost, checked against the definition's budget. */
export type VehicleModelStats = { triangles: number; drawCalls: number; materials: number };

/** The GLB does not satisfy the definition's model contract. Lists every problem, not just the first. */
export class VehicleModelError extends Error {
  constructor(
    readonly source: string,
    readonly problems: readonly string[],
  ) {
    super(`Vehicle model ${source} is invalid:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "VehicleModelError";
  }
}

type Bounds = { min: Vector3; max: Vector3; center: Vector3; size: Vector3 };

/**
 * A validated, re-rigged vehicle GLB, in car space (+x right, +y up, +z forward, y = 0 at the
 * tire contact):
 *
 * ```text
 * <id>_model                   ← parent this to the physics node
 * ├── <id>_chassis             ← ride height offset + tire lift
 * │   ├── __root__ (glTF)      ← bodywork, lights, trim
 * │   └── <id>_attach_<slot>   ← exterior part anchors
 * └── <id>_hub_<fl|fr|rl|rr>   ← wheel pivots (steer/spin), raised by taller tires
 *     └── wheel_<id>_socket    ← wheel offset along the axle
 *         └── wheel_<id> (glTF) or a swapped wheel
 * ```
 *
 * Purely visual: nothing here feeds back into physics. Ride height moves the body relative to
 * the wheels, and a taller tire lifts hubs and body together; neither changes the collision shape.
 */
export class VehicleModel {
  private rideHeightM: number;
  /** Mean hub rise over stock across the four sockets; the body sits on it. */
  private tireLiftM = 0;
  private readonly stockHubY: ReadonlyMap<WheelId, number>;
  private readonly stockRadius: ReadonlyMap<WheelId, number>;

  private constructor(
    private readonly definition: VehicleDefinition,
    private readonly container: AssetContainer,
    readonly root: TransformNode,
    readonly chassis: TransformNode,
    readonly wheels: readonly VehicleWheel[],
    readonly attachments: ReadonlyMap<ExteriorSlot, VehicleAttachmentPoint>,
    private readonly paint: Material,
    readonly stats: VehicleModelStats,
    /** Non-fatal findings (re-pivots, budget overruns, mirrored names). Log them; fix them in Blender. */
    readonly warnings: readonly string[],
  ) {
    this.stockHubY = new Map(wheels.map((w) => [w.id, w.hub.position.y]));
    this.stockRadius = new Map(wheels.map((w) => [w.id, w.radius]));
    this.rideHeightM = 0;
    this.setRideHeight(definition.visual.rideHeight.defaultM);
    this.setPaint(definition.visual.defaultPaint);
  }

  /**
   * Loads and validates `definition.visual.model`. `source` overrides the URL (e.g. file bytes in
   * tests). Throws `VehicleModelError` listing every missing node or scale problem; nothing is
   * added to the scene in that case.
   */
  static async load(
    scene: Scene,
    definition: VehicleDefinition,
    source: string | ArrayBufferView = definition.visual.model.url,
  ): Promise<VehicleModel> {
    const label = typeof source === "string" ? source : definition.visual.model.url;
    const container = await LoadAssetContainerAsync(source, scene, {
      pluginExtension: typeof source === "string" ? undefined : ".glb",
    });
    try {
      return VehicleModel.build(scene, definition, container, label);
    } catch (error) {
      container.dispose();
      throw error;
    }
  }

  get rideHeight(): number {
    return this.rideHeightM;
  }

  /** Visual ride-height offset in metres (negative = lowered), clamped to the definition's range. Returns the applied value. */
  setRideHeight(offsetM: number): number {
    const { minM, maxM } = this.definition.visual.rideHeight;
    this.rideHeightM = Math.min(maxM, Math.max(minM, offsetM));
    this.chassis.position.y = this.rideHeightM + this.tireLiftM;
    return this.rideHeightM;
  }

  /**
   * Swaps the visual wheel on one socket for `node`, sized per `fit`, or restores the stock wheel
   * with `null`. `node` must already be scaled and facing outboard for `wheel.side` (see
   * `WheelSwapper`). A taller `fit.diameterM` raises the hub (and, averaged over the four, the
   * body) so the tire stays on y = 0; `fit.offsetMm` slides the socket along the axle.
   * Returns the previously mounted wheel, detached, for the caller to dispose or reuse.
   */
  mountWheel(id: WheelId, node: TransformNode | null, fit: WheelFit = this.definition.wheels.stock): TransformNode | null {
    const wheel = this.wheels.find((w) => w.id === id);
    if (!wheel) throw new Error(`${this.definition.id} has no "${id}" wheel`);
    const { stock } = this.definition.wheels;
    const previous = wheel.mounted;
    if (previous) previous.parent = null;
    wheel.mounted = node;
    wheel.fit = node ? { diameterM: fit.diameterM, widthM: fit.widthM, offsetMm: fit.offsetMm } : { ...stock };
    if (node) node.parent = wheel.socket;
    wheel.mesh.setEnabled(node === null);

    const lift = (wheel.fit.diameterM - stock.diameterM) / 2;
    wheel.hub.position.y = this.stockHubY.get(id)! + lift;
    wheel.radius = this.stockRadius.get(id)! + lift;
    wheel.socket.position.x = (wheel.side * (stock.offsetMm - wheel.fit.offsetMm)) / 1000;
    this.tireLiftM = this.wheels.reduce((sum, w) => sum + (w.fit.diameterM - stock.diameterM) / 2, 0) / this.wheels.length;
    this.setRideHeight(this.rideHeightM);
    return previous;
  }

  /** A material of the loaded model by its GLB name (e.g. `taillight`). Frozen: unfreeze before editing. */
  material(name: string): Material | undefined {
    return this.container.materials.find((m) => m.name === name);
  }

  /** Recolours the paint material. `hex` is sRGB `#rrggbb`. */
  setPaint(hex: string): void {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`Invalid paint colour "${hex}", expected #rrggbb`);
    const color = Color3.FromHexString(hex).toLinearSpace();
    this.paint.unfreeze();
    if (this.paint instanceof PBRMaterial) this.paint.albedoColor = color;
    else if (this.paint instanceof StandardMaterial) this.paint.diffuseColor = color;
    this.paint.freeze();
  }

  /**
   * Mounts an aftermarket part at `slot` (hiding the stock part), or restores stock with `null`.
   * Returns the previously mounted part, now detached, for the caller to dispose or reuse.
   */
  mountPart(slot: ExteriorSlot, part: TransformNode | null): TransformNode | null {
    const point = this.attachments.get(slot);
    if (!point) throw new Error(`${this.definition.id} has no "${slot}" attachment slot`);
    const previous = point.mounted;
    if (previous) previous.parent = null;
    point.mounted = part;
    if (part) part.parent = point.anchor;
    point.stock?.setEnabled(part === null);
    return previous;
  }

  /** Mounted parts and wheels are detached, not disposed: they belong to the caller. */
  dispose(): void {
    for (const point of this.attachments.values()) if (point.mounted) point.mounted.parent = null;
    for (const wheel of this.wheels) if (wheel.mounted) wheel.mounted.parent = null;
    this.root.dispose();
    this.container.dispose();
  }

  private static build(
    scene: Scene,
    definition: VehicleDefinition,
    container: AssetContainer,
    label: string,
  ): VehicleModel {
    const spec = definition.visual.model;
    const { dimensions } = definition;
    const problems: string[] = [];
    const warnings: string[] = [];

    const gltfRoot = container.meshes.find((m) => m.parent === null);
    if (!gltfRoot) throw new VehicleModelError(label, ["file contains no meshes"]);

    const nodes = new Map<string, TransformNode[]>();
    for (const node of [...container.meshes, ...container.transformNodes]) {
      nodes.set(node.name, [...(nodes.get(node.name) ?? []), node]);
    }
    const required = (name: string, role: string): TransformNode | null => {
      const found = nodes.get(name) ?? [];
      if (found.length === 1) return found[0];
      problems.push(found.length ? `${found.length} nodes named "${name}" (${role}); names must be unique` : `missing node "${name}" (${role})`);
      return null;
    };

    const bodyNodes = spec.bodyNodes.map((name) => required(name, "body"));
    const wheelNodes = WHEEL_IDS.map((id) => required(spec.wheelNodes[id], `wheel ${id}`));
    const stockNodes = spec.attachments.map((a) => (a.stockNode ? required(a.stockNode, `stock ${a.slot}`) : null));
    const paint = container.materials.find((m) => m.name === spec.paintMaterial);
    if (!paint) problems.push(`missing material "${spec.paintMaterial}" (paint)`);
    else if (!(paint instanceof PBRMaterial || paint instanceof StandardMaterial)) {
      problems.push(`paint material "${spec.paintMaterial}" is a ${paint.getClassName()}, expected PBR or Standard`);
    }
    if (problems.length) throw new VehicleModelError(label, problems);

    // Units: everything below is measured in metres, car space.
    gltfRoot.scaling.scaleInPlace(spec.unitScale);
    refreshWorldMatrices(gltfRoot);

    // Pivot: the tire contact patch sits at y = 0.
    const wheelBounds = wheelNodes.map((n) => boundsOf(n!));
    const groundY = Math.min(...wheelBounds.map((b) => b.min.y));
    if (Math.abs(groundY) > GROUND_TOLERANCE_M) {
      warnings.push(`wheels touch down at y=${fmt(groundY)} m; moved the model onto y=0`);
    }
    if (groundY !== 0) {
      gltfRoot.position.y -= groundY;
      refreshWorldMatrices(gltfRoot);
      for (const b of wheelBounds) for (const v of [b.min, b.max, b.center]) v.y -= groundY;
    }

    WHEEL_IDS.forEach((id, i) => {
      const { center, size } = wheelBounds[i];
      const name = spec.wheelNodes[id];
      const radius = Math.max(size.y, size.z) / 2;
      if (!near(radius, dimensions.wheelRadiusM)) {
        problems.push(
          `"${name}" radius is ${fmt(radius)} m, expected ~${fmt(dimensions.wheelRadiusM)} m (check unitScale / export units)`,
        );
      }
      const left = id[1] === "l";
      if (left !== center.x < 0) {
        warnings.push(`"${name}" sits on the car's ${center.x < 0 ? "left" : "right"} (x=${fmt(center.x)}); left/right names look mirrored`);
      }
    });
    const [fl, fr, rl, rr] = wheelBounds.map((b) => b.center);
    const wheelbase = (fl.z + fr.z) / 2 - (rl.z + rr.z) / 2;
    const track = (Math.abs(fl.x - fr.x) + Math.abs(rl.x - rr.x)) / 2;
    if (wheelbase <= 0) problems.push("front wheels are behind the rear wheels; the model must face +z");
    else if (!near(wheelbase, dimensions.wheelbaseM)) {
      problems.push(`wheelbase is ${fmt(wheelbase)} m, expected ~${fmt(dimensions.wheelbaseM)} m`);
    }
    if (!near(track, dimensions.trackM)) problems.push(`track is ${fmt(track)} m, expected ~${fmt(dimensions.trackM)} m`);
    const body = unionBounds(bodyNodes.map((n) => boundsOf(n!)));
    if (!near(body.size.z, dimensions.lengthM)) {
      problems.push(`body is ${fmt(body.size.z)} m long, expected ~${fmt(dimensions.lengthM)} m (check unitScale / forward axis)`);
    }
    if (problems.length) throw new VehicleModelError(label, problems);

    const stats = measure(container);
    const { budget } = spec;
    if (stats.triangles > budget.maxTriangles) warnings.push(`${stats.triangles} triangles, budget ${budget.maxTriangles}`);
    if (stats.drawCalls > budget.maxDrawCalls) warnings.push(`${stats.drawCalls} draw calls, budget ${budget.maxDrawCalls}`);
    if (stats.materials > budget.maxMaterials) warnings.push(`${stats.materials} materials, budget ${budget.maxMaterials}`);

    // Valid: build the rig. Everything is created at the world origin, so car space == world space here.
    container.addAllToScene();
    const root = new TransformNode(`${definition.id}_model`, scene);
    const chassis = new TransformNode(`${definition.id}_chassis`, scene);
    chassis.parent = root;
    gltfRoot.parent = chassis;

    const wheels = WHEEL_IDS.map((id, i): VehicleWheel => {
      const mesh = wheelNodes[i]!;
      const { center, size } = wheelBounds[i];
      const hub = new TransformNode(`${definition.id}_hub_${id}`, scene);
      hub.parent = root;
      hub.position.copyFrom(center);
      hub.rotationQuaternion = Quaternion.Identity();
      const socket = new TransformNode(definition.wheels.sockets[id], scene);
      socket.parent = hub;
      const offset = Vector3.Distance(mesh.getAbsolutePosition(), center);
      if (offset > PIVOT_TOLERANCE_M) warnings.push(`"${mesh.name}" origin is ${fmt(offset)} m off its centre; re-pivoted`);
      mesh.setParent(socket);
      return {
        id, front: id[0] === "f", side: center.x < 0 ? -1 : 1, hub, socket, mesh,
        mounted: null, fit: { ...definition.wheels.stock }, radius: Math.max(size.y, size.z) / 2,
      };
    });

    const attachments = new Map<ExteriorSlot, VehicleAttachmentPoint>();
    spec.attachments.forEach((a, i) => {
      const stock = stockNodes[i];
      const empty = nodes.get(`attach_${a.slot}`)?.[0];
      const anchor = new TransformNode(`${definition.id}_attach_${a.slot}`, scene);
      anchor.parent = chassis;
      if (empty) anchor.position.copyFrom(empty.getAbsolutePosition());
      else if (a.anchor) anchor.position.set(a.anchor.x, a.anchor.y, a.anchor.z);
      else anchor.position.copyFrom(boundsOf(stock!).center);
      attachments.set(a.slot, { slot: a.slot, anchor, stock, mounted: null });
    });

    for (const mesh of container.meshes) mesh.isPickable = false;
    for (const material of container.materials) material.freeze();

    return new VehicleModel(definition, container, root, chassis, wheels, attachments, paint!, stats, warnings);
  }
}

function refreshWorldMatrices(root: TransformNode): void {
  root.computeWorldMatrix(true);
  // Pre-order: parents before children.
  for (const node of root.getDescendants(false)) (node as TransformNode).computeWorldMatrix?.(true);
}

function boundsOf(node: TransformNode): Bounds {
  const { min, max } = node.getHierarchyBoundingVectors(true);
  return { min, max, center: min.add(max).scaleInPlace(0.5), size: max.subtract(min) };
}

function unionBounds(all: readonly Bounds[]): Bounds {
  const min = all.reduce((acc, b) => Vector3.Minimize(acc, b.min), all[0].min);
  const max = all.reduce((acc, b) => Vector3.Maximize(acc, b.max), all[0].max);
  return { min, max, center: min.add(max).scaleInPlace(0.5), size: max.subtract(min) };
}

function measure(container: AssetContainer): VehicleModelStats {
  let triangles = 0;
  let drawCalls = 0;
  for (const mesh of container.meshes) {
    const vertices = mesh.getTotalVertices();
    if (vertices === 0) continue;
    const indices = mesh.getTotalIndices();
    triangles += (indices > 0 ? indices : vertices) / 3;
    drawCalls += mesh.subMeshes?.length ?? 1;
  }
  return { triangles: Math.round(triangles), drawCalls, materials: container.materials.length };
}

function near(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) <= expected * DIMENSION_TOLERANCE;
}

function fmt(x: number): string {
  return (x + 0).toFixed(3);
}
