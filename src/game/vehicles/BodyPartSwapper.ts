import type { AssetContainer } from "@babylonjs/core/assetContainer";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { Material } from "@babylonjs/core/Materials/material";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Quaternion } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import { registerBuiltInLoaders } from "@babylonjs/loaders/dynamic";
import { canRefinish, fitsVehicle, type BodyPart, type BodyPartLook, type FittedBodyPart } from "@/game-core/exterior";
import type { ExteriorSlot } from "@/game-core/vehicles";
import type { VehicleModel } from "./VehicleModel";
import { bodyPartTexture } from './bodyPartTexture';
import type { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';

registerBuiltInLoaders();

/** The material in a body part GLB that takes the finish and wear. Everything else (brackets, zip ties) is left alone. */
export const PANEL_MATERIAL = "panel";

/** Maps a part's `assetPath` to what the loader reads (a URL, or file bytes in tests). */
export type BodyPartAssetSource = (assetPath: string) => string | ArrayBufferView | Promise<string | ArrayBufferView>;

const DEG = Math.PI / 180;

/**
 * Puts body parts on a `VehicleModel`'s exterior sockets, one part per socket. Each asset loads
 * once per scene; a mounted part is a clone with its own `panel` material, so a primer bumper and
 * a body-colour ducktail can share a car. The part sits at its socket's origin with its own
 * `transform`. Wear changes the finish, while mounting seams remain seated. Visual only: stats and persistence
 * belong to the caller.
 */
export class BodyPartSwapper {
  private readonly assets = new Map<string, Promise<AssetContainer>>();
  private readonly serials = new Map<ExteriorSlot, number>();
  private readonly mounted = new Map<ExteriorSlot, FittedBodyPart & { node: TransformNode; materials: Material[] }>();
  private disposed = false;
  private readonly textures = new Map<string, RawTexture>();

  constructor(
    private readonly scene: Scene,
    private readonly model: VehicleModel,
    private readonly source: BodyPartAssetSource = (path) => path,
  ) {}

  /** What is on each socket right now. */
  get equipped(): FittedBodyPart[] {
    return [...this.mounted.values()].map(({ part, look }) => ({ part, look }));
  }

  /**
   * Replaces whatever is on `socket` with `part` in `look` (loading its asset if needed), or
   * clears the socket with `null`, restoring any stock part. Resolves `false` when a later call on
   * the same socket (or dispose) superseded this one. The part already on the socket is restyled
   * in place rather than reloaded. Rejects if the asset fails to load, leaving
   * the current part on.
   */
  async equip(socket: ExteriorSlot, fitted: FittedBodyPart | null): Promise<boolean> {
    if (this.disposed) return false;
    if (fitted && fitted.part.socket !== socket) throw new Error(`${fitted.part.id} mounts on ${fitted.part.socket}, not ${socket}`);
    if (!this.model.attachments.has(socket)) throw new Error(`This car has no ${socket} socket`);
    if (fitted && !fitsVehicle(fitted.part, this.model.definition.tags)) throw new Error(`${fitted.part.id} is incompatible with this vehicle`);
    if (fitted && !canRefinish(fitted.part, fitted.look.finish)) throw new Error(`${fitted.part.id} cannot use ${fitted.look.finish}`);
    const serial = (this.serials.get(socket) ?? 0) + 1;
    this.serials.set(socket, serial);
    // Same part, new finish or wear: restyle in place.
    if (fitted && this.mounted.get(socket)?.part.id === fitted.part.id) return this.restyle(socket, fitted.look);
    const asset = fitted ? await this.asset(fitted.part) : null;
    if (serial !== this.serials.get(socket) || this.disposed) return false;
    const node = fitted && asset ? this.instantiate(asset, fitted.part, socket) : null;
    this.model.mountPart(socket, node?.node ?? null);
    this.unmount(socket);
    if (fitted && node) {
      this.applyLook(node.materials, fitted.look);
      place(node.node, fitted.part);
      this.mounted.set(socket, { ...fitted, ...node });
    }
    return true;
  }

  /** Re-applies a new look (refinish, wear, car repaint) to the part already on `socket`, without reloading. */
  restyle(socket: ExteriorSlot, look: BodyPartLook): boolean {
    if (this.disposed) return false;
    const current = this.mounted.get(socket);
    if (!current) return false;
    if (!canRefinish(current.part, look.finish)) throw new Error(`${current.part.id} cannot use ${look.finish}`);
    this.applyLook(current.materials, look);
    place(current.node, current.part);
    current.look = look;
    return true;
  }

  /** Disposes mounted parts and cached assets. The model gets its stock parts back. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const socket of [...this.mounted.keys()]) {
      this.model.mountPart(socket, null);
      this.unmount(socket);
    }
    for (const asset of this.assets.values()) void asset.then((a) => a.dispose(), () => {});
    this.assets.clear();
    for (const texture of this.textures.values()) texture.dispose();
    this.textures.clear();
  }

  private applyLook(materials: readonly Material[], look: BodyPartLook) {
    const textured = look.wear !== 'clean' || look.finish === 'fake_carbon';
    const key = `${look.finish === 'fake_carbon'}:${look.wear}`;
    let texture = this.textures.get(key) ?? null;
    if (textured && !texture) { texture = bodyPartTexture(this.scene, look); this.textures.set(key, texture); }
    applyLook(materials, look, textured ? texture : null);
  }

  private unmount(socket: ExteriorSlot) {
    const current = this.mounted.get(socket);
    if (!current) return;
    this.mounted.delete(socket);
    current.node.dispose(false, false);
    for (const material of current.materials) material.dispose();
  }

  private asset(part: BodyPart): Promise<AssetContainer> {
    let asset = this.assets.get(part.id);
    if (!asset) {
      asset = this.load(part);
      this.assets.set(part.id, asset);
      // A failed load may be retried.
      asset.catch(() => { if (this.assets.get(part.id) === asset) this.assets.delete(part.id); });
    }
    return asset;
  }

  private async load(part: BodyPart): Promise<AssetContainer> {
    const source = await this.source(part.assetPath);
    const container = await LoadAssetContainerAsync(source, this.scene, {
      pluginExtension: typeof source === "string" ? undefined : ".glb",
    });
    if (this.disposed) {
      container.dispose();
      throw new Error("BodyPartSwapper disposed while loading");
    }
    if (!container.meshes.some((m) => m.getTotalVertices() > 0)) {
      container.dispose();
      throw new Error(`Body part model ${part.assetPath} contains no meshes`);
    }
    // Shared by every copy; the panel is cloned per copy instead.
    for (const material of container.materials) if (material.name !== PANEL_MATERIAL) material.freeze();
    return container;
  }

  private instantiate(asset: AssetContainer, part: BodyPart, socket: ExteriorSlot) {
    const name = `${socket}_${part.id}`;
    const holder = new TransformNode(name, this.scene);
    const { rootNodes } = asset.instantiateModelsToScene((n) => `${name}_${n}`, false, { doNotInstantiate: true });
    for (const node of rootNodes as TransformNode[]) node.parent = holder;
    const panels = new Map<Material, Material>();
    for (const mesh of holder.getChildMeshes()) {
      mesh.isPickable = false;
      const material = mesh.material;
      if (material?.name !== PANEL_MATERIAL) continue;
      let copy = panels.get(material);
      if (!copy) {
        copy = material.clone(`${name}_${PANEL_MATERIAL}`)!;
        panels.set(material, copy);
      }
      mesh.material = copy;
    }
    return { node: holder, materials: [...panels.values()] };
  }
}

/** Preserve the authored mounting boundary; finish wear must not detach a panel from its mounts. */
function place(node: TransformNode, part: BodyPart) {
  const { positionM: p, rotationDeg: r, scale } = part.transform;
  node.position.set(p.x, p.y, p.z);
  node.rotationQuaternion = Quaternion.RotationYawPitchRoll(r.y * DEG, r.x * DEG, r.z * DEG);
  node.scaling.setAll(scale);
}

function applyLook(materials: readonly Material[], look: BodyPartLook, texture: RawTexture | null) {
  const color = Color3.FromHexString(look.color).toLinearSpace();
  for (const material of materials) {
    material.unfreeze();
    if (material instanceof PBRMaterial) {
      material.albedoColor = color;
      material.albedoTexture = texture;
      material.metallic = look.metallic;
      material.roughness = look.roughness;
      material.clearCoat.isEnabled = look.clearCoat > 0;
      material.clearCoat.intensity = look.clearCoat;
    } else if (material instanceof StandardMaterial) {
      material.diffuseColor = color;
      material.diffuseTexture = texture;
      material.specularPower = 8 + (1 - look.roughness) * 120;
    }
    material.freeze();
  }
}
