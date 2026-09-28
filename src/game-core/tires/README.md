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

- **Talyer service (`tireShop.ts`).** `tireServiceLines` prices what the car's assemblies need: air, a
  plug for a leak on a tire with enough life left, new rubber (which keeps the rim damage), straightening or
  replacing the rim, a road tire over a fitted donut (the donut goes back in the well), and a spare, jack or
  wrench when one is missing. `applyTireService` validates the line and charges through `pay` before it
  changes anything. It refuses while a roadside change is in progress. It lives in the talyer's Tires tab
  and uses the wallet in `VehicleSession`. It is off on server-synced saves until there is a server action
  for it.

Jack: the saved jack state animates the visual. The chassis pivots about the opposite wheel (`jackPose`),
the jacked wheel hangs clear and the jack grows under the sill. The physics body stays level, and the
handling model already treats that corner as ungrounded.

Not yet: AI cars on simulated tires, and tire service on server-synced saves.
