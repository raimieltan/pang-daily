# Performance parts

Pure TypeScript/Zod rules for used, physical parts. Definitions live in `catalog.ts`; the same IDs
are registered in `parts/parts.ts` so seeded Marketplace listings and saved inventory work without
a second ownership model. Prices are PHP. Instance condition is actual health in 0–1, never the
seller's advertised grade. `null` or invalid performance condition is rejected, not assumed healthy.

## Composition

`calculateVehiclePerformance(vehicle, installedItems, condition, options)` returns `{ stats,
compatibility }`. It never mutates inputs. Stock engines have displacement, layout, aspiration,
carb/EFI state, power (hp), torque (Nm), mass (kg), reliability and relative heat output. The starter
has an explicit carb engine; definitions without engine metadata use a conservative legacy fallback.
An engine swap replaces engine output and adds only the difference in engine mass.

All categories are represented: engine, fuel system, intake, exhaust, turbo, cooling, ECU, clutch,
transmission, differential, supporting mod. Each part has a slot, price/condition ranges, rarity,
compatible chassis tags (any match, or `universal`), required IDs, incompatible IDs, typed install
requirements, effects and sketchiness. Distinct supports have named slots. Effects are additive
deltas; power/torque deltas are fractions of engine output. Benefits scale with condition, while
mass and liabilities remain. Turbo boost is an arcade scalar, not a pressure/engine simulation.

The calculator applies compatibility first, then condition and existing wheel/body modifiers once,
engine replacement, part effects, boost, and stress penalties. It returns power, torque, weight,
throttle response, lag in seconds, relative heat/cooling rates, reliability, fuel consumption as a
multiplier of stock liters/km, fuel state, tuneability and drivetrain torque capacities. Composition
is deterministic and independent of array order. Constants are in `PERFORMANCE_TUNING`.

Carb has less tuning headroom. The example small turbo requires EFI plus oil lines; a future
blow-through kit can explicitly support carb. EFI does not imply a mandatory ECU upgrade; the
unknown rechipped ECU improves tuning headroom but carries its own reliability risk. Cooling and
stronger clutch/gearbox capacities reduce stress. Worn items retain their weight and become less
effective. An invalid part grants no performance benefit and produces a structured compatibility issue.

## Installation and persistence

`checkPerformanceCompatibility` evaluates the complete proposed build. It rejects duplicate slots,
incompatible parts, unsupported fueling and unmet dependencies; rejection cascades to dependent
parts. An external compatibility state may block item IDs but cannot override these checks.
Mechanic level and reputation are checked when install context is supplied, not while driving.

Existing `InventorySession.install(vehicleId, itemId, { vehicle, mechanicLevel, reputation })` checks
performance installs before committing slot changes. Rejections are atomic. Fit required supports
first, then the dependent part. Low-level removal is reflected in calculated build compatibility;
the dependent part stops contributing until the support is restored.

Factory-new equivalents are always available at Banwa Auto Supply beside the talyer. They cost
5× their used template's midpoint price, arrive inspected at 100% condition, and satisfy the same
supporting-part requirements via `satisfiesParts`. See `../shops/README.md`.

The hub's existing inspection panel now includes **Performance**. Buy a used part in Marketplace,
park in Tito Jun's service bay, get out and interact. Unknown condition requires the existing ₱150
inspection before previewing work. The panel lists owned parts and missing supports, previews all
final stats and full-throttle risk warnings, then quotes labor separately from the owned part.
Previewed wheel/body modifiers are recalculated from each proposed inventory, including displaced
parts. Removals return the item to inventory and are blocked while another fitted part depends on it.

`TalyerPerformanceSystem` owns transient quote IDs and rechecks access, ownership, build condition,
inventory, mechanic requirements and cash before payment. Inventory validates before its payment
callback; failed installs do not charge, and successful work records one `performance_labor` ledger
entry. Quotes clear on inventory/condition changes, leaving the bay, tab dismissal and scene disposal.
Installed parts and the wallet use their existing save adapters. As with other current session actions,
there is no backend database transaction across those separate storage snapshots.

Labor rates live in `PERFORMANCE_LABOR_PHP`. Tito Jun currently uses mechanic level 2 and reputation
0 from `TALYER_PERFORMANCE`; reputation progression is not implemented here, so rare parts requiring
higher reputation remain gated with a visible reason. The inspection and quote are previews, not
guarantees that a worn build will be reliable.

`PerformanceSystem` restores/synchronizes installed inventory in both driving scenes. `PlayerVehicle`
caches final stats when condition, parts or visual modifiers change. `VehicleController.setPerformance`
accepts only calculated stock/final stats and base handling. Power-to-weight changes pull; throttle
response and turbo lag change pedal buildup. `MaintenanceSystem` uses final fuel consumption.

## Consequences

Vehicle condition now includes clutch and cooling alongside engine, transmission, tires and brakes.
Existing vehicle/session saves default the two new fields to healthy, retaining old cash and wear.
The existing five-component repair UI is unchanged.

`performanceFailureRisks` provides warning severity and elapsed-time event probability for overheating,
clutch slip, boost leak, misfire, rough idle and transmission wear. `FAILURE_RULES` tunes thresholds,
rates and messages. `samplePerformanceFailures` takes caller-owned seeded randomness. The runtime
exposes `PlayerVehicle.performanceWarnings`; no random failures are applied automatically. These are
advisory hooks: no instant destruction, hidden condition mutation, thermal simulator or repair UI.
Future consumers own cooldowns, presentation and any gradual wear/event response.

Run `yarn test` and `yarn typecheck`. Tests cover compatibility cascades, used condition, stock
parity, swaps, EFI, boost/support tradeoffs, deterministic composition, warning hazards, atomic
installation, old saves, scene synchronization, handling and fuel consumption.
