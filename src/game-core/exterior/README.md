# Exterior body parts

Data-driven exterior kits: bolt on a cheap lip, a primer bumper, a donor-car fender or a huge
marketplace wing and see it on the car, with light effects. No livery editor, no deformation.

- **Parts (`BodyPart.ts`, `catalog.ts`).** A body part has a `category` and the car `socket` it
  mounts on, an `assetPath` (GLB, origin at the socket), an optional `transform` against the
  socket, `compatibleTags` (vehicle `tags`; `universal` fits anything), `construction`, `rarity`,
  `fitment` (how well the mould lines up, 0–1), `paint` (`paintable`, the `finish` it arrives in,
  `mismatchColor` for donor paint), `market` (`priceRangePhp`, `conditionRange`) and `effects`
  (`weightKg`, `drag`, `downforce`, `cooling`, `reputation`, all small). Examples: universal
  rubber lip, ACP chin splitter, fiberglass side skirts, ducktail, marketplace GT wing, primer
  bumper, mismatched red fender, fake carbon hood. Each also gets a `PART_TEMPLATES` entry
  (`category: 'body'`), so the marketplace sells it and the inventory stores it.
- **Categories and sockets (`CATEGORY_SOCKETS`).**

  | Category | Socket(s) |
  |---|---|
  | `front_lip` | `front_lip` |
  | `chin` | `chin` |
  | `front_bumper` / `rear_bumper` | `bumper_front` / `bumper_rear` |
  | `side_skirt` | `side_skirts` (both sides, one part) |
  | `spoiler` | `spoiler` |
  | `hood` | `hood` |
  | `fender` | `fender_fl`, `fender_fr` |
  | `mirror` | `side_mirrors` |
  | `roof_accessory` | `roof` |
  | `accessory` | `accessory_front`, `accessory_rear` |

  The car's scene node is `<socket>_socket` (`attachments[].socket` in `VehicleDefinition`). One
  part per socket: fitting a new one displaces the old one to the trunk.
- **Finishes.** `body_color`, `primer`, `mismatched`, `bare_plastic`, `fake_carbon`, `damaged`.
  `canRefinish` says what an owned copy can be resprayed to: paintable parts take any finish
  their material allows (only ABS/polyurethane strip to bare plastic; donor paint needs a donor
  colour); unpainted ones only keep their finish or get beaten up.
- **Look (`resolveBodyPartLook`).** Pure: finish colour/roughness/metalness/clear coat, then wear
  from condition (below 65% scratched; below 35% cracked on fiberglass and ABS, scratched
  otherwise) and fit from `fitment × condition × match` (a universal part fits 15% worse).
  `flush` from 0.75, `gappy` from 0.5, else `zip_tied`; misfit hangs the part up to 2.5 cm low
  and tilts it up to 4°.
- **Effects (`exteriorEffects`).** Sums fitted parts into `StatModifiers` (weight; half the drag
  change comes off acceleration; downforce adds grip), plus `drag`, `cooling` (clamped ±0.3),
  `reputation` (primer/donor/beaten finishes halve it, scratches −1, cracks −2, zip ties −1) and
  `repairCostPhp` (wear, refit and respray against the part's mid price).

Runtime: `BodyPartSwapper` loads and clones each GLB onto its socket with its own `panel`
material, `ExteriorSystem` routes `equipBodyPart` / `removeBodyPart` / `refinishBodyPart` through
the inventory (installs and finish persist with the inventory save) and `PlayerVehicle` folds the
modifiers into handling next to the wheels'. The `exteriorState` event carries each part's
finish, wear and fit bucket and the kit's effects, never the hidden condition. In game: Phone ·
Baligya → Your parts → Fit it / Take off and a finish picker on each body part.

Not yet: reputation and cooling have no consumer (they are shown, not applied), rear bumpers,
mirrors, roof and small accessories have no example parts, cracks are tints rather than decals,
and swaps aren't gated to the talyer.
