# EK Hatch 1997 — modular vehicle asset

A newly generated, stylized Civic EK-inspired three-door hatchback. The supplied sedan was used only to establish coordinate and naming conventions. Geometry was generated directly in Python and exported to GLB. No Blender or `.blend` file is involved.

## Files

- `ek_hatch_1997_modular.glb`: main model, no external textures.
- `ek_hatch_1997_viewer.html`: embedded model with orbit, camera presets, part toggles, paint, wireframe, attachment axes, and explode controls. Open in a WebGL2 browser; no network dependencies.
- `mounting_interfaces.json`: ordered panel boundary loops in vehicle-root meters and attachment origins, contract `ek97-v1`.
- `validation.json`: measured exported-model checks and limitations.
- `qa/`: 16 renders of the exported GLB, including individual removal tests.
- `ek_hatch_1997_contact_sheet.jpg`: all QA views.
- `tools/vehicles/`: repeatable generation and rendering code plus the viewer template.

## Dimensions and axes

| Property | Value |
|---|---|
| Units | meters |
| Up / forward / left | +Y / +Z / +X |
| Wheelbase | 2.620 m |
| Track | 1.480 m |
| Tire radius | 0.295 m |
| Body width | approximately 1.695 m |
| Overall width including mirrors | 1.998 m |
| Overall length including trim/exhaust | 4.239 m |
| Height including spoiler | 1.384 m |
| Ground contact | Y = 0 |
| Triangle count | 48,736 |
| Attachment nodes | 25 |
| Minimum sampled engine-to-hood underside clearance | 0.084 m |

This exceeds the preferred 15k–40k triangle range. No LODs, collision hull, suspension rig, steering animation, or game integration is included.

## Scene organization

Named part nodes are groups containing material-specific mesh children such as `hood_stock__paint`. Use the named parent group when toggling a complete part. Do not rely on a named group itself being a Mesh.

### Permanent structure

`shell_base`: doors, quarters, roof, pillars, floor, rocker structure, firewall, engine-bay apron, strut towers, wheel tubs, radiator carrier, front reinforcement, rear support and hatch aperture. Cabin glass, trim, seats and dash are separately named fixed groups.

### Replaceable groups and mounting nodes

| Group | Attachment |
|---|---|
| `hood_stock` | `attach_hood` |
| `fender_fl_stock`, `fender_fr_stock` | `attach_fender_fl`, `attach_fender_fr` |
| `bumper_front_stock`, `bumper_rear_stock` | `attach_bumper_front`, `attach_bumper_rear` |
| `sideskirt_l_stock`, `sideskirt_r_stock` | `attach_sideskirt_l`, `attach_sideskirt_r` |
| `chin_front_stock`, `lip_front_stock` | `attach_chin_front`, `attach_lip_front` |
| `spoiler_rear_stock` | `attach_spoiler_rear` |
| `hatch_stock`, `hatch_glass` | `attach_hatch` |
| `engine_stock` | `attach_engine` |
| `headlight_l`, `headlight_r` | `attach_headlight_l`, `attach_headlight_r` |
| `taillight_l`, `taillight_r` | `attach_taillight_l`, `attach_taillight_r` |
| `grille_stock` | `attach_grille` |
| `exhaust_stock` | `attach_exhaust` |
| `wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr` | matching `attach_wheel_*` |

Empty future slots: `attach_lip_rear`, `attach_overfender_rl`, `attach_overfender_rr`.

Hatch accessories and glass are children of `attach_hatch`; the spoiler attachment is also parented there. Hide or rotate `attach_hatch` to operate the full hatch assembly. Hiding only `hatch_stock` hides only its metal. Opening clearance is not collision-tested. Hood pivot is at its rear edge. Wheel origins are their centers; the local X axis is the axle.

Front fender indicators and their molding segments belong to the corresponding fender group. The front license plate belongs to the front bumper. Chin/lip are independent slots: hide those along with the bumper when inspecting a bare front end.

## Replacement interfaces

Keep the `ek97-v1` boundaries unchanged. JSON coordinates are in vehicle-root space; subtract the attachment's world translation to obtain coordinates local to that attachment. All attachment rotations are identity and scale is one. JSON `translation` values are world-space positions; `parent` describes hierarchy. The nested spoiler's GLB local translation is relative to the hatch origin.

Each exported boundary is an ordered loop, not a set of arbitrary cut triangles. Hood and fender mounting edges, bumper wraps, skirts, spoiler and lips are recorded. Hatch metal consists of a lower panel and perimeter rails; `hatch_lower` and `hatch_glass` describe its patches. For a full hatch variant, retain the aperture fit and the `attach_hatch` transform. This is a geometric interface package, not a tested collection of aftermarket variants.

## Materials

`paint` is shared and runtime-recolorable. Other PBR materials: `glass`, `trim`, `tire`, `rim`, `chrome`, `headlight`, `amber`, `taillight`, `reverse`, `plate`, `engine_metal`, `engine_dark`, `interior_dark`.

Glass is opaque dark material for stable game rendering; it does not use physical transmission. Front intake uses a dark surface treatment over a closed bumper skin, not a through-cut duct. Seats, engine and underbody are simplified game geometry. No logos or baked paint textures.

## Validation and practical limits

The exported GLB was reloaded and rendered, and the 16 QA views were inspected. Required part groups and attachment transforms survived export. Wheelbase is 2.62 m; normals are finite; there are no zero-area triangles or welded open boundary edges.

Closed patches are assembled into groups. Welding all touching solids together can create edges shared by more than two faces (shell, hatch, segmented taillights); the report records these. The asset is not a boolean-unioned watertight solid suitable for manufacturing. Keep the intended mesh/group structure.

The viewer JavaScript passed a syntax check. Its interactive browser test could not run because the browser executable download was unavailable. The supplied QA renders came from the exported GLB through an independent Python OpenGL renderer, not viewer screenshots. Physics, dynamic wheel clearance and target-game performance still require integration testing.

## Rebuild

From the extracted bundle root, install Python packages `numpy`, `trimesh`, `pyrender`, `Pillow`, and a recent `PyOpenGL` compatible with your Python. The working rendering environment used PyOpenGL 3.1.10; pyrender's old pinned version had compatibility problems. EGL is used for headless rendering.

```sh
python tools/vehicles/rebuild_ek_hatch_1997.py
python tools/vehicles/validate_ek_hatch_1997.py
python tools/vehicles/package_viewer.py
```

The generator rewrites the EK output only. The input sedan is neither required nor overwritten. The renderer uses a deterministic studio shader to expose surface shape and seams; final appearance depends on the game's lighting.

## Game integration

In game this is the **Hiraya Kidlat 1.6 SR (1997)**, `HIRAYA_KIDLAT_1997` in
`src/game-core/vehicles/catalog.ts`, driven with the `fwd_hatch` handling preset
(`STARTER_HATCH` in `src/game/vehicles/VehicleDefinition.ts`). It uses the same
`attach_*` and `*_stock` names as the Dalagan, so exterior slots, paint, ride height
and wheel swaps work unchanged. Body parts tagged `banwa_dalagan` don't fit it.

Both cars are owned. Whichever one you aren't driving is parked at home next to the
carport (`HOME_SECOND_BAY`). Walk up to its door and choose **Drive the …** to swap:
the scene is rebuilt around that car, and the choice is kept for the tab session.
`?car=banwa_dalagan_1996` or `?car=hiraya_kidlat_1997` forces a car for testing.

The runtime budget is raised to 50k triangles and 110 draw calls for this asset.
