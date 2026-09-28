# Banwa Silak 1983 — Lancer-inspired RWD sedan

Fictional 1.8 Turbo rear-wheel-drive sedan, derived from the project's Dalagan modular geometry with a boxier cabin, rectangular lamps and grille, black tail panel, slim bumpers, ducktail, and longitudinal drivetrain. The source GLB is preserved; its SHA-256 is recorded in `mounting_interfaces.json`.

## Files

- `lancer_box_1983_modular.glb`: runtime asset, flat-shaded white paint and opaque dark glass.
- `lancer_box_1983_viewer.html`: self-contained workshop viewer; open locally to toggle assemblies and explode the model.
- `mounting_interfaces.json`: `silak83-v1` mounting positions and panel boundary loops.
- `validation.json`: geometry, bounds, budget, wheel-pivot and engine-clearance checks.
- `previews/contact_sheet.png`: 14 assembled, removal, underside and exploded views rendered from the exported model.
- `preview-validation.json`: removal checks and browser errors for those renders.

## Rebuild and inspect

From the repository root:

```sh
node scripts/build-lancer-box-model.mjs
node scripts/validate-lancer-box-model.mjs
node scripts/render-lancer-box-model.mjs
```

Rendering uses Playwright Chromium, or Google Chrome at its standard macOS application path. The generator reuses the bundled viewer from `banwa_dalagan_viewer.html`.

## Asset contract

Metres, +Y up, +Z forward, +X left in the asset. Runtime import handles the engine coordinate convention. Wheel pivots sit at y=0.30 m, x=±0.728 m, z=1.28/-1.22 m; wheelbase is 2.50 m. Wheels rotate about their local X axis. Preserve `vehicle_root`, `shell_base`, wheel names, and `attach_*` nodes when editing.

Hood, trunk, front fenders, bumpers, skirts, chin, front lip, spoiler and engine are separately removable. Fender indicators follow their fender; grille slats follow the grille. Engine removal does not remove the body. The engine sits 0.112 m below the closed hood under the conservative bounding-box check.

The rebuilt model contains 19,856 triangles, 96 draw calls and 14 materials, within the 30,000 / 100 / 16 runtime budgets. Geometry validation reports no zero-area triangles or invalid normals.

## Game integration

Vehicle ID: `banwa_silak_1983`; handling preset: `rwd_box_turbo`. The runtime uses 1,090 kg, 53% front weight and rear-only drive force. Standalone fixtures expose all three cars: one driven, two parked at home with working Drive prompts. Account sessions retain their owned-vehicle filter. NPC and traffic templates remain bound to their actual vehicle IDs.

Use `?car=banwa_silak_1983` in a standalone game session to select the car directly. Account ownership is not granted by this parameter.

Validation covers actual Babylon GLB import, attachment slots, paint, wheel centers, removable trim, runtime/spec agreement, rear-only traction and multiple parked-car switching.

## Limits

The assembled components are not globally boolean-unioned. The open exhaust outlet is intentional. There are no embedded collision meshes, suspension rig, LODs or texture atlas; runtime supplies collision and handling. Browser previews verify the exported model, not a full interactive driving session.
