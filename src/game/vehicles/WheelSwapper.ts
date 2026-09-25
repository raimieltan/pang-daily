import type { AssetContainer } from "@babylonjs/core/assetContainer";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import { registerBuiltInLoaders } from "@babylonjs/loaders/dynamic";
import type { WheelPart } from "@/game-core/wheels";
import type { VehicleModel, VehicleWheel } from "./VehicleModel";

registerBuiltInLoaders();

/** A loaded wheel GLB, measured once. Instances clone its meshes and share its geometry and materials. */
type WheelAsset = { container: AssetContainer; center: Vector3; diameterM: number; widthM: number };

/** Maps a part's `assetPath` to what the loader reads (a URL, or file bytes in tests). */
export type WheelAssetSource = (assetPath: string) => string | ArrayBufferView | Promise<string | ArrayBufferView>;

/**
 * Puts a wheel part on all four sockets of a `VehicleModel`, or back to stock, without rebuilding
 * the car. Each asset loads once per scene; every socket gets its own clone, scaled to the part's
 * diameter and width, centred on the socket and turned outboard on the left side. Visual only:
 * stats and persistence belong to the caller.
 */
export class WheelSwapper {
  private readonly assets = new Map<string, Promise<WheelAsset>>();
  private serial = 0;
  private disposed = false;
  private current: WheelPart | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly model: VehicleModel,
    private readonly source: WheelAssetSource = (path) => path,
  ) {}

  /** The part on the car right now (null = stock). */
  get equipped(): WheelPart | null {
    return this.current;
  }

  /**
   * Loads `part`'s asset if needed and swaps all four wheels. Resolves `false` when a later call
   * (or dispose) superseded this one; the car is then left to the later call. Rejects if the
   * asset fails to load, leaving the current wheels on.
   */
  async equip(part: WheelPart | null): Promise<boolean> {
    const serial = ++this.serial;
    const asset = part ? await this.asset(part) : null;
    if (serial !== this.serial || this.disposed) return false;
    for (const wheel of this.model.wheels) {
      const node = part && asset ? this.instantiate(asset, part, wheel) : null;
      this.model.mountWheel(wheel.id, node, part?.fit)?.dispose(false, false);
    }
    this.current = part;
    return true;
  }

  /** Disposes swapped wheels and cached assets. The model is left with whatever is detached. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const wheel of this.model.wheels) if (wheel.mounted) this.model.mountWheel(wheel.id, null)?.dispose(false, false);
    for (const asset of this.assets.values()) void asset.then((a) => a.container.dispose(), () => {});
    this.assets.clear();
  }

  private asset(part: WheelPart): Promise<WheelAsset> {
    let asset = this.assets.get(part.id);
    if (!asset) {
      asset = this.load(part);
      this.assets.set(part.id, asset);
      // A failed load may be retried.
      asset.catch(() => { if (this.assets.get(part.id) === asset) this.assets.delete(part.id); });
    }
    return asset;
  }

  private async load(part: WheelPart): Promise<WheelAsset> {
    const source = await this.source(part.assetPath);
    const container = await LoadAssetContainerAsync(source, this.scene, {
      pluginExtension: typeof source === "string" ? undefined : ".glb",
    });
    if (this.disposed) {
      container.dispose();
      throw new Error("WheelSwapper disposed while loading");
    }
    const root = container.meshes.find((m) => m.parent === null);
    if (!root) {
      container.dispose();
      throw new Error(`Wheel model ${part.assetPath} contains no meshes`);
    }
    root.computeWorldMatrix(true);
    for (const node of root.getDescendants(false)) (node as TransformNode).computeWorldMatrix?.(true);
    const { min, max } = root.getHierarchyBoundingVectors(true);
    const size = max.subtract(min);

    const rim = container.materials.find((m) => m.name === "rim");
    const tint = Color3.FromHexString(part.visual.rimColor).toLinearSpace();
    if (rim instanceof PBRMaterial) rim.albedoColor = tint;
    else if (rim instanceof StandardMaterial) rim.diffuseColor = tint;
    for (const material of container.materials) material.freeze();

    return { container, center: min.add(max).scaleInPlace(0.5), diameterM: Math.max(size.y, size.z), widthM: size.x };
  }

  private instantiate(asset: WheelAsset, part: WheelPart, wheel: VehicleWheel): TransformNode {
    const name = `${wheel.socket.name}_${part.id}`;
    const holder = new TransformNode(name, this.scene);
    const { rootNodes } = asset.container.instantiateModelsToScene((n) => `${name}_${n}`, false, { doNotInstantiate: true });
    for (const node of rootNodes as TransformNode[]) {
      node.parent = holder;
      node.position.subtractInPlace(asset.center);
    }
    const radial = part.fit.diameterM / asset.diameterM;
    holder.scaling.set(part.fit.widthM / asset.widthM, radial, radial);
    // Assets are modelled as a right-hand wheel (outboard +x); turn left-side copies around.
    holder.rotationQuaternion = wheel.side < 0 ? Quaternion.RotationAxis(Vector3.Up(), Math.PI) : Quaternion.Identity();
    for (const mesh of holder.getChildMeshes()) mesh.isPickable = false;
    return holder;
  }
}
