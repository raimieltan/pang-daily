# Wheels

Data-driven wheel swapping: bolt on a set, see the stance, and feel a small difference. There is no tire
physics here. Physics collision stays sized for the stock wheels.

- **Parts (`WheelPart.ts`, `catalog.ts`).** A wheel part is one wheel + tire set, fitted to all four
  sockets. It has an `assetPath` (one-wheel GLB), `fit` (`diameterM` overall, `widthM` tread,
  `offsetMm` ET), `massKg` per wheel, `market` (`priceRangePhp`, `conditionRange`), `modifiers`
  (`grip` / `braking` / `acceleration` as fractional changes, ±0.3 max) and `visual` (`style`,
  `rimColor`). Examples: `steelies_14` (cheap, sunken), `mags_15_4x100` (used, flush),
  `oversized_17_deep_dish` (sketchy, pokes). Each part also has a `PART_TEMPLATES` listing entry
  derived from it (`game-core/parts`), so the marketplace sells it and the inventory stores it.
  Owned copies carry their own condition.
- **Sockets.** `VehicleDefinition.wheels.sockets` names the four sockets. The convention is
  `wheel_fl_socket`, `wheel_fr_socket`, `wheel_rl_socket`, `wheel_rr_socket` (`wheelSocketName(id)`).
  The importer creates them inside the steer/spin hubs (docs/VEHICLE_ASSETS.md §4). Names must be unique.
- **Vehicle wheel data.** `wheels.stock` is the GLB's own wheel (`fit` + `massKg`). `wheels.arch`
  holds `gapM` (tire top to arch at default ride height), `lipM` (fender lip, from the centreline)
  and `innerM` (strut/liner, from the centreline).
- **Fitment (`calculateFitment`).** Inputs are the definition, a fit and a ride height. A taller
  tire lifts the car by half its extra diameter and fills the arch by the other half. Lower ET
  moves the wheel outboard. The result has `state`, the worst issue in this order: `rubbing` >
  `poke` > `excessive_gap` (monster-truck gap) > `sunken`, or `clean` when there are none. It also
  has all `issues` and the raw `archGapM` / `lipM` / `innerM` numbers for a garage preview.
  Thresholds are exported constants.
- **Stats (`wheelModifiers`).** Returns `StatModifiers` for `resolveVehicleStats`: part modifiers,
  up to 8% grip loss for a battered set, and `4 × (massKg − stock)` added weight.
  `conditionHandling` turns these into acceleration (power-to-weight × `acceleration`), grip and
  braking. Stock wheels are `NO_MODIFIERS`.

Runtime: `WheelSwapper` loads each wheel GLB once, clones it per socket and scales and mirrors it.
`WheelSystem` treats the inventory's `wheels` install on the car as the saved equipped set, and
handles the `equipWheels({ itemId | null })` command. `PlayerVehicle.equipWheels` swaps the visuals
and re-derives handling. The `wheelsState` event carries fitment and the set's listed effects
(never the hidden condition). In the game, Phone · Baligya → Your parts has a Bolt on / Take off
button on each wheel set, with the fitment and effects shown under the mounted set.

Not yet: ride-height control (fitment is computed at the current visual height), separate
front/rear sets, tire wear per set, fitment affecting stats, and gating swaps to the talyer or garage.
