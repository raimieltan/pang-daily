# Tires

Simulated wheel and tire assemblies for the player car. The cosmetic wheel sets in `game-core/wheels` stay
separate. That module picks the look and small stat modifiers; this one decides what each corner's rubber can do.

- **Assemblies (`assembly.ts`).** An assembly is one wheel + tire with an id, `spec` (`standard` or `donut`),
  `pressureKpa`, `health`, `failure`, `leakKpaPerMin`, `rimDamage` and `flatDistanceM`. The same object
  moves between a hub, the spare well, the trunk and the player's hands. It is never recreated.
- **Failure states.** `HEALTHY → SLOW_LEAK | RAPID_LEAK | BLOWOUT`. A leak reaches `FLAT` at `FLAT_KPA`.
  Driving flat wears `health` down (faster is much worse). At 0 health the tire is `DESTROYED`, and from
  there `rimDamage` grows. `puncture()` never lets a milder failure replace a worse one. `impactPuncture()`
  and road hazards take a random roll from the caller, so runs are deterministic.
- **Response (`tireResponse`).** Turns pressure, health, spec and surface (`SURFACE_TIRE`) into the handling
  model's per-corner `grip`, `slipScale` and `rollingResistance`. A standard tire at nominal pressure on
  asphalt gives exactly 1 / 1 / 0.
- **Donut.** Less grip, softer response, more drag. `recommendedMaxKph` is advisory only: above it the tire
  wears fast, but nothing caps the car.
- **Session (`TireSession`, save key `pang-daily.tires.v1`).** Per vehicle it stores the corners, spare,
  jack, wrench, trunk, and any wheel change in progress (`jacked`, `loosened`, `held`). The first use
  creates a stock set. Loading restores damage exactly as it was saved.
- **Wheel change (`wheelChange.ts`).** `performStep` runs one step: `loosen`, `raise`, `remove`,
  `take_spare`, `stow`, `install`, `lower` or `tighten`. Each step returns a readable `{ rejected }` when a
  precondition fails. `nextCornerStep` picks the one prompt to show at a wheel. `driveBlock` explains why
  the car can't leave yet.

Runtime: `TireSystem` resolves the ground under each wheel (`world/surfaceAt.ts`). It steps the assemblies,
feeds `ArcadeHandlingModel.tires`, turns hard impacts near a wheel into punctures, and offers the roadside
prompts. It also blocks the driver's seat through `PlayerModes.canEnter` and drives the flat, donut, missing
wheel and jack visuals. Events: `tireStatus`, `tireEvent` (audio and toasts), `tireInspection` and
`tireTelemetry` (Pause → Development → Tires). Tire effects reach the car only through per-corner grip,
slip and drag. No path writes yaw or the global `surfaceGrip`.

Not yet: AI cars on simulated tires, buying or repairing tires and rims, and a real jack lift pose (the
body stays level and the jacked corner is simply ungrounded).
