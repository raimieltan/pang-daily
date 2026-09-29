# Banwa Dalagan 1996 — modular low-poly sedan

A faceted Lancer “pizza” reference remake authored and exported in Blender. Rounded bumper profiles, a crowned roof, swept lamps, triangular rear clusters, five-spoke wheels and a raised factory-style wing retain the low-poly design. No badges or logos.

## Deliverables

- `banwa_dalagan_1996_modular.glb`: assembled car, with independently removable parts.
- `mounting_interfaces.json`: versioned attachment frames and ordered panel edge loops in vehicle/world coordinates.
- `validation.json`: geometry and re-import checks.
- `previews/`: eleven views rendered from the exported and re-imported GLB, plus a contact sheet.
- `banwa_dalagan_1996_modular.blend`: editable Blender scene, with separate named parts and attachment parents.
- `scripts/vehicles/remake-lancer-pizza.py`: repeatable Blender builder, GLB export, validation and render setup.

The production GLB has been replaced. The baseline in `scripts/vehicles/source/dalagan_modular_baseline.glb` supplies the retained structural shell and engine. Axle positions, wheelbase, track, wheel radius, attachment frames and panel mating boundaries are retained. Aftermarket body assets are regenerated against the remake.

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
| Full assembled triangle count | 17,808 |

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
- For multi-component parts such as spoilers, use the stock GLB feet and its mounting frame as the precise template. The interface file records the remake's raised wing outline. A perimeter loop alone does not describe every mount surface.
- Hood pivot is at its rear edge. Rotation around local X can be used for opening, with clearance checked in your animation system.
- Keep the permanent shell in place when removing cosmetics. Rockers, inner wheel housings and bumper supports remain visible.
- Chin and lip are independent add-ons at distinct heights. Hide these too for an unobstructed bumper-support view. A future bumper variant must retain their interface or supply compatible variants.

## Materials

Shared glTF PBR materials: `paint`, `glass`, `trim`, `tire`, `rim`, `rim_dark`, `headlight`, `amber`, `taillight`, `reverse`, `plate`, `chrome`, `engine_metal`, `engine_dark`.

The exterior color is entirely in the `paint` material's base color; no baked color texture. Change every material named `paint` at runtime, cloning it per vehicle if cars need independent colors. Glass is intentionally opaque tinted glazing; there is no cabin interior. All surfaces use flat normals for the requested faceted appearance. No external textures are required.

## Validation and visual review

The builder re-imports the delivered GLB and checks zero-area triangles, welded non-manifold edges, attachment parentage, attachment translations, wheel radii and triangle budget. `validation.json` records these results and measured dimensions. The engine and its accessories retain their original positions below the bonnet.

Previews include front-left, rear-left, left side, hood removed, both front fenders removed, front bumper removed, rear bumper removed, spoiler removed, exploded, front and rear. The exported GLB supplies the car triangles in every preview. Camera, lighting, background and floor are not exported in the asset.

The assembled and removal renders were inspected, and visible lamp clipping in the first iteration was corrected. Component-level manifold checks are not a proof that all independent solids are globally intersection-free; structural contacts and overlapping mount surfaces are intentional. This is a visual asset, with no collision mesh, LODs, UV atlas, rig, suspension model or in-game integration. Bumper vents are dark inset-style faces with grille detail, not through-openings. Check appearance under the game's own lighting and renderer before replacing the production vehicle.

## Rebuild

From the package root, with Blender installed:

```sh
blender --background --factory-startup --python scripts/vehicles/remake-lancer-pizza.py
node scripts/build-body-part-models.mjs
python3 scripts/vehicles/pizza-contact-sheet.py
```

The Blender script writes the GLB, `.blend`, validation and previews under `public/model/`. It reads the baseline, preserves attachment frames and panel mating loops, and updates the spoiler outline in `mounting_interfaces.json`. The contact-sheet script requires Pillow. Run the body-part builder after geometry changes to keep replacement panels synchronized.

## Game integration

The game now loads `banwa_dalagan_1996_modular.glb`. Babylon converts the
asset's +X-left coordinates to the game's +X-right coordinates; the supplied
wheel and panel names are retained.

The rear spoiler and `attach_spoiler_rear` have been moved 0.18 m rearward.
Its mount remains `[0, 0.845, -1.88]`; the Blender remake and previews use this position.

Stock panels are hidden when their aftermarket replacements are installed.
Paired skirts and mirrors are handled together. Replacement hood, fender,
bumper, skirts and lip geometry is generated from the modular stock seams by
`node scripts/build-body-part-models.mjs`.

A talyer inspection opens the stock or fitted hood 60 degrees at its cowl
hinge; dismissing the inspection or leaving closes it. The engine and bay
accessories retain their independent authored nodes below the hood.

At the talyer, Exterior parts → Spoiler offers **No spoiler** and **Stock
spoiler**. This choice is saved per vehicle. Either option returns any fitted
aftermarket wing to inventory; fitting and later removing a wing preserves
the saved stock-versus-bare-trunk preference.
