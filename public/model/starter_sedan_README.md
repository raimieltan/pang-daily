# starter_sedan.glb

Placeholder low-poly model for the Banwa Dalagan 1996 (`banwa_dalagan_1996` in
`src/game-core/vehicles/catalog.ts`). Conventions, naming and export checklist:
`docs/VEHICLE_ASSETS.md`.

- Dimensions: 4.33 m long, 1.69 m wide, 1.40 m tall. Wheelbase 2.50 m, track 1.456 m, wheel radius 0.30 m.
- Axes: Y up, Z forward, metres, tires on y = 0.
- Body: `body`, `cabin`, `body_trim`
- Wheels (separate meshes): `wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr`
- Stock exterior parts: `mirrors`, `exhaust`, `headlight_l`, `headlight_r`, `taillight_l`, `taillight_r`
- Materials (12): `paint` (recolourable), `glass`, `trim`, `tire`, `rim`, `rim_dark`, `headlight`,
  `amber`, `taillight`, `reverse`, `plate`, `chrome`
- Cost: ~4.1k triangles, 32 draw calls. No textures.

Known issue: the `_l`/`_r` wheel names are mirrored relative to +X = right. The importer warns but
still works. Fix it on the next Blender export.
