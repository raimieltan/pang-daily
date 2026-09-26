# Banwa Dalagan 1996 — modular low-poly sedan

A rebuilt, intentionally faceted four-door sedan based on the supplied Lancer-era references and low-poly screenshot. No badges or logos. Created directly as mesh geometry and exported as glTF 2.0 binary; Blender is not required and no `.blend` file is included.

## Deliverables

- `banwa_dalagan_1996_modular.glb`: assembled car, with independently removable parts.
- `mounting_interfaces.json`: versioned attachment frames and ordered panel edge loops in vehicle/world coordinates.
- `validation.json`: geometry and re-import checks.
- `previews/`: nine views rendered from the exported and re-imported GLB, plus a contact sheet.
- `tools/vehicles/rebuild_banwa_dalagan_1996.py` in the package root: repeatable geometry builder, GLB exporter, validation, and software preview renderer.

The original uploaded GLB is unchanged. Its axle positions, wheelbase, track, and wheel radius were retained; the exterior, wheels, and internal structure were rebuilt.

## Dimensions and axes

| Property | Value |
|---|---|
| Units | metres |
| Up | +Y |
| Forward | +Z |
| Vehicle's left, looking forward from inside | +X |
| Stock bumper-to-bumper length | 4.33 m |
| Body width, excluding mirrors | 1.69 m |
| Overall dimensions with mirrors, lip and exhaust | 1.826 m X × 1.395 m Y × 4.389 m Z |
| Wheelbase | 2.500 m |
| Track, wheel centre to wheel centre | 1.456 m |
| Tire radius | 0.300 m |
| Tire contact plane | Y = 0 |
| Front axle | Z = 1.280 m |
| Rear axle | Z = −1.220 m |
| Full assembled triangle count | 19,732 |

Left/right naming is deliberate: FL and RL are on +X. The uploaded asset used the opposite labels. Match vehicle-controller wheel bindings to the convention above.

## Meshes and customization slots

Every listed part is one mesh node; a mesh can contain several material primitives. Hiding a bumper node also hides its grille detail, trim and plate. The engine node contains the engine block, valve cover and intake runners. Ancillary battery, airbox, intake hose and strut towers stay in the bay.

| Slot | Removable mesh | Attachment parent |
|---|---|---|
| hood | `hood_stock` | `attach_hood` |
| fender_fl | `fender_fl_stock` | `attach_fender_fl` |
| fender_fr | `fender_fr_stock` | `attach_fender_fr` |
| bumper_front | `bumper_front_stock` | `attach_bumper_front` |
| bumper_rear | `bumper_rear_stock` | `attach_bumper_rear` |
| sideskirt_l | `sideskirt_l_stock` | `attach_sideskirt_l` |
| sideskirt_r | `sideskirt_r_stock` | `attach_sideskirt_r` |
| chin_front | `chin_front_stock` | `attach_chin_front` |
| lip_front | `lip_front_stock` | `attach_lip_front` |
| spoiler_rear | `spoiler_rear_stock` | `attach_spoiler_rear` |
| engine | `engine_stock` | `attach_engine` |
| trunk | `trunk_stock` | `attach_trunk` |

Required permanent node: `shell_base`. It contains the floor, firewall, rockers, doors, rear quarter panels, roof, cabin framing, wheel housings, engine-bay aprons and bumper reinforcement. It is a collection of closed mesh components, not a Boolean-unioned single solid.

Separate fixed details: `door_seams`, `door_handles`, `body_moulding`, `pillar_trim`, `windshield`, `rear_glass`, side windows, mirrors, `nose_carrier`, `nose_top`, `grille`, `grille_slats`, `headlight_l`, `headlight_r`, corner indicators, `headlight_ridges`, `rear_panel`, `taillight_l`, `taillight_r`, `rear_plate_recess`, `rear_plate`, `radiator_fins`, `battery`, `airbox`, `intake`, `strut_towers`, `strut_caps`, `exhaust`, `exhaust_tip`.

Wheel nodes: `wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr`. Each wheel contains its tire, rim barrel, rim rings, spokes and hubs, with a local origin at its axle centre. Rotate about local X for rolling; use a parent steering pivot for front-wheel steering.

## Mounting contract

- All nodes have identity rotation and unit scale. Attachment nodes carry translations; replaceable mesh vertices are expressed relative to their attachment parent.
- Load a replacement under the corresponding attachment node with local position `(0,0,0)`, identity rotation and scale one.
- Preserve the ordered mating boundaries of the stock part. `mounting_interfaces.json` records skin perimeters and bumper upper seam loops in world coordinates. Subtract the attachment translation to convert these to slot-local coordinates.
- For multi-component parts such as spoilers, use the stock GLB feet and its mounting frame as the precise template. A perimeter loop alone does not describe every mount surface.
- Hood pivot is at its rear edge. Rotation around local X can be used for opening, with clearance checked in your animation system.
- Keep the permanent shell in place when removing cosmetics. Rockers, inner wheel housings and bumper supports remain visible.
- Chin and lip are independent add-ons at distinct heights. Hide these too for an unobstructed bumper-support view. A future bumper variant must retain their interface or supply compatible variants.

## Materials

Shared glTF PBR materials: `paint`, `glass`, `trim`, `tire`, `rim`, `rim_dark`, `headlight`, `amber`, `taillight`, `reverse`, `plate`, `chrome`, `engine_metal`, `engine_dark`.

The exterior color is entirely in the `paint` material's base color; no baked color texture. Change every material named `paint` at runtime, cloning it per vehicle if cars need independent colors. Glass is intentionally opaque tinted glazing; there is no cabin interior. All surfaces use flat normals for the requested faceted appearance. No external textures are required.

## Validation and visual review

The builder checks every closed component for zero-area triangles, duplicate indexed triangles and non-manifold edges. GLB is then read back from disk; required nodes and wheel bounds are checked. `validation.json` records measured dimensions and the conservative engine-to-hood clearance. The complete engine mesh is below even the lowest point of the hood skin; ancillary bay components also remain under the hood.

Previews include front-left, rear-left, left side, hood removed, both front fenders removed, front bumper removed, rear bumper removed, spoiler removed, and exploded. The exported GLB, rather than separate presentation geometry, supplies the car triangles in every preview. Camera, lighting, background and floor are not exported in the asset.

The assembled and removal renders were inspected, and visible lamp clipping in the first iteration was corrected. Component-level manifold checks are not a proof that all independent solids are globally intersection-free; structural contacts and overlapping mount surfaces are intentional. This is a visual asset, with no collision mesh, LODs, UV atlas, rig, suspension model or in-game integration. Bumper vents are dark inset-style faces with grille detail, not through-openings. Check appearance under the game's own lighting and renderer before replacing the production vehicle.

## Rebuild

From the package root, with Python 3, NumPy and Pillow installed:

```sh
python tools/vehicles/rebuild_banwa_dalagan_1996.py
```

The script writes GLB, interface metadata, validation and previews under `assets/vehicles/banwa_dalagan_1996/`. It does not read or overwrite the uploaded source model. Adjust the dimensions and panel definitions in the source, then rerun to produce consistent replacements.

## Game integration

The game now loads `banwa_dalagan_1996_modular.glb`. Babylon converts the
asset's +X-left coordinates to the game's +X-right coordinates; the supplied
wheel and panel names are retained.

The rear spoiler and `attach_spoiler_rear` have been moved 0.18 m rearward.
Its mount is now `[0, 0.845, -1.88]`; `mounting_interfaces.json` and the
embedded asset in `banwa_dalagan_viewer.html` use this corrected position.
The supplied preview images show the original position.

Stock panels are hidden when their aftermarket replacements are installed.
Paired skirts and mirrors are handled together. Replacement hood, fender,
bumper, skirts and lip geometry is generated from the modular stock seams by
`node scripts/build-body-part-models.mjs`.

A talyer inspection opens the stock or fitted hood 60 degrees at its cowl
hinge; dismissing the inspection or leaving closes it. The engine and bay
accessories retain their independent authored nodes below the hood.
