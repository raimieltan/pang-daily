# PANG DAILY — VEHICLE ASSETS

The contract between a Blender-exported car GLB and the runtime. Covers the scale, pivot and
naming conventions the importer (`VehicleModel`) checks, how ride height and exterior parts are
rigged, and the render budget. Read ART_DIRECTION §6/§14 and TECH_ARCHITECTURE §26/§27 first.

---

## 1. Where things live

| Layer | File | Owns |
|---|---|---|
| Definition (data) | `src/game-core/vehicles/VehicleDefinition.ts` | Renderer-agnostic schema (zod): identity, drivetrain, power, weight, grip, braking, reliability, dimensions, visual contract, condition hooks. |
| Catalog (data) | `src/game-core/vehicles/catalog.ts` | Car entries. First: `banwa_dalagan_1996` (fictional marque). |
| Stats | `src/game-core/vehicles/vehicleStats.ts` | `resolveVehicleStats(definition, condition)`: applies condition hooks. |
| Importer | `src/game/vehicles/VehicleModel.ts` | Loads, validates and re-rigs the GLB. Ride height, paint, part mounting. |
| Wheel animation | `src/game/vehicles/VehicleVisual.ts` | Steers/spins the wheel hubs from the handling state. |
| Runtime binding | `src/game/vehicles/VehicleDefinition.ts` | Definition + handling preset + collision shapes. Collision never comes from the GLB. |

Everything the importer needs to know about a file lives in `definition.visual.model`. A new
car is a new GLB and a new catalog entry, with no importer changes.

---

## 2. Scale, axes and pivot

| Convention | Rule | Importer behaviour |
|---|---|---|
| Units | 1 unit = 1 m. Blender: Metric, Unit Scale 1.0, apply scale before export. | Multiplies the root by `unitScale` (1 for a correct export). Then **fails** if wheel radius, wheelbase, track or body length differ from `dimensions` by more than 10%. A cm export fails; it never spawns a 100× car. |
| Up | +Y (glTF default; Blender's "+Y Up" export option). | — |
| Forward | Car faces +Z. | **Fails** if the front wheels sit behind the rear ones. |
| Right | +X is the driver's right. `_l` = −X, `_r` = +X. | Warns if a `_l`/`_r` node sits on the wrong side (names look mirrored). Not fatal. |
| Ground | Lowest tire point at y = 0. | Lifts/drops the whole model onto y = 0; warns beyond 1 cm. |
| Car origin | x = 0 on the centreline, z = 0 roughly mid-wheelbase. | — The physics body's CG comes from the runtime collision config, not the GLB origin. |
| Wheel origin | Each wheel's origin at its geometric centre (hub). | Re-pivots onto a hub node at the measured centre; warns beyond 1 cm. |
| Transforms | Apply rotation and scale on every mesh. | Bounds are measured in world space, so unapplied transforms work but make the file harder to debug. |

Car space, after import: +x right, +y up, +z forward, y = 0 at the tire contact.

---

## 3. Node naming

Names must be **unique** in the file; duplicates fail the import. Required names come from the
definition, so these are the starter sedan's (see `catalog.ts`):

| Role | Starter sedan | Required | Notes |
|---|---|---|---|
| Body | `body`, `cabin`, `body_trim` | yes (`bodyNodes`) | Moved by ride height. Used to check body length. |
| Wheels | `wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr` | yes (`wheelNodes`) | One separate mesh per wheel (tire + rim). Never joined to the body. |
| Stock parts | `mirrors`, `exhaust`, `headlight_l/_r`, `taillight_l/_r` | yes, if a slot names it (`stockNode`) | Hidden when an aftermarket part is mounted in that slot. |
| Paint material | `paint` | yes (`paintMaterial`) | PBR or Standard. The only material recoloured by customization. |
| Attachment empties | `attach_<slot>`, e.g. `attach_spoiler` | no | Optional Blender empty. Overrides the anchor position from data. |

A missing or duplicated required node fails with a `VehicleModelError` that lists **every**
problem, and nothing is added to the scene.

---

## 4. Runtime rig

```text
<id>_model                   ← parent this to the physics node
├── <id>_chassis             ← ride height offset (y)
│   ├── __root__ (glTF)      ← bodywork, lights, trim
│   └── <id>_attach_<slot>   ← exterior part anchors
└── <id>_hub_<fl|fr|rl|rr>   ← wheel pivots: steer about y, spin about x
    └── wheel_<id> (glTF)
```

**Ride height.** `setRideHeight(m)` moves `<id>_chassis` relative to the wheel hubs, clamped
to `visual.rideHeight` (starter sedan: −0.06 to +0.04 m). Wheels stay on the ground, so a new
stance needs no re-export. It is visual only and does not change the collision shape.

**Attachment points.** Each slot in `visual.model.attachments` gets an anchor under the
chassis, so parts follow ride height. The anchor position comes from the first of these that
exists:

1. an `attach_<slot>` empty in the GLB
2. `anchor` in data
3. the stock part's bounding-box centre

`mountPart(slot, node)` parents a part at the anchor origin and hides the stock mesh.
`mountPart(slot, null)` restores stock. Parts belong to the caller and are detached, not
disposed, on `dispose()`.

**Paint.** `setPaint("#rrggbb")` recolours the `paint` material (sRGB in, linear applied).

---

## 5. Render budget and materials

The budget lives in `visual.model.budget`. Going over it produces a warning, not a failure.

| Metric | Starter sedan today | Budget | Source |
|---|---|---|---|
| Triangles | ~4 100 | 30 000 | ART_DIRECTION §14 (8k–30k per main car) |
| Draw calls | 32 | 40 | one per mesh primitive |
| Materials | 12 | 16 | |

Material rules for browser performance:

- Share materials across meshes by name: all four wheels use one `tire`, `rim` and `rim_dark`,
  and the body panels share `paint`/`trim`. Babylon builds one shader per material, not per mesh.
- Prefer flat-colour PBR factors over textures on placeholder and stock parts. Where textures
  are needed, atlas them (512–2048 px, ART_DIRECTION §14).
- Keep `paint` a dedicated material so recolouring touches nothing else.
- Every sub-material on a mesh is an extra draw call. Merge small same-coloured bits (badges,
  handles) into the neighbouring material in Blender.
- The importer freezes every material after load, and `setPaint` unfreezes only `paint`.

The biggest remaining saving on the starter sedan is the wheels (3 primitives × 4 = 12 draw
calls). A later pass could bake tire/rim into a single atlased material. The current count is
inside budget, so this is not done yet.

---

## 6. Export checklist (Blender → GLB)

1. Metric units, scale 1.0. Apply all transforms.
2. Car faces +Z after export (+Y Up on), wheels touching y = 0.
3. Body and each wheel are separate objects with the names above. Set wheel origins to the
   geometry centre.
4. Stock exterior parts are separate objects named after their slot's `stockNode`.
5. Optional: add `attach_<slot>` empties where aftermarket parts should mount.
6. The paint material is named `paint`. Merge duplicate materials.
7. Export as `.glb` with no cameras, lights or animations, and apply modifiers.
8. Run `yarn vitest run src/game/vehicles/VehicleModel.test.ts`. It loads the real file and
   fails with a list of problems if the contract is broken.
