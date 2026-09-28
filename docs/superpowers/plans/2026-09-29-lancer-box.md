# Lancer inspired modular RWD vehicle

> Execute in the current session; preserve existing unrelated working changes.

**Goal:** Deliver a styled modular car package and a drivable RWD runtime definition.

**Reference brief:** The three supplied Lancer photographs define the silhouette and retro details. The Civic contact sheet and Dalagan README define visual quality, removable assemblies, mounting contracts and validation. Use the existing Dalagan geometry where it preserves the project's panel style; author a distinct rectangular lamp/grille treatment, black tail panel, ducktail, slim bumpers and longitudinal rear drive hardware. White paint, opaque dark glass, flat shading, metres, +Y up, +Z forward, +X left. Preserve source assets.

## Work

- [x] Build repeatable `scripts/build-lancer-box-model.mjs` and `public/model/lancer/` package: GLB, mounting interfaces, validation, self-contained viewer, assembled/removal/exploded previews, README.
- [x] Validate exported geometry, required nodes, wheel pivots, finite normals, triangle budget, modular mounts and engine clearance. Render the actual exported file and inspect front, rear, side and removal views.
- [x] Add fictional Banwa Silak 1983 identity, matching RWD handling and collision dimensions to the vehicle catalogs. Cover drivetrain binding and GLB load/customization with runtime tests.
- [x] Make the third car reachable in standalone garage fixtures without changing account ownership. Verify home garage behavior for three vehicles and retain NPC template bindings.
- [x] Run focused tests and typecheck, inspect final diff, document deliverables and limits. Import into connected Blender if its bounded asset tools permit the generated asset path.

## Review focus

Wheel labels and rolling axes must survive import; hiding a panel must remove its own trim; engine must remain below a closed hood; rear power must go to rear tires; adding a third model must not lose the existing second parked vehicle or NPC templates. Save new assets independently of the reference GLBs.

## Completion evidence

- Rebuilt the GLB and self-contained viewer, validated 19,856 triangles / 96 draw calls / 14 materials, and rendered and inspected all 14 preview views.
- Added the missing parked-car selector, two garage bays, one shared switch handler, and explicit model-ID binding for NPCs and traffic.
- Vehicle and population checks: 140 tests passed, including real GLB imports, multi-car garage switching and rear-contact-only acceleration. TypeScript and focused ESLint passed.
- Asset README documents rebuild commands, contract, runtime selection and known limits.
- Blender bridge is connected, but its inspected bounded import tool takes a completed external-asset cache job/manifest rather than a local GLB path. No Blender scene import was performed. Actual export/reimport was verified in Babylon and the Three.js viewer instead.
- Full interactive driving in the browser was not exercised in this continuation.
- Full repository suite: 117 test files, 735 tests passed.
