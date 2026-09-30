# Suspension implementation design

Status: proposed for review; implementation has not started.

## Intended outcome

Implement the user's full suspension specification in the existing driving game. Four independent corners determine contact, geometry and normal load; the tire model consumes those outputs, and the renderer displays the same state. FWD/RWD/AWD differ in torque distribution, not suspension handling bonuses. Include tuning, physical parts, component damage, repair/alignment, persistence and diagnostics. Replay, networking, wear and sound receive explicit integration hooks where complete consumers do not yet exist.

## Existing integration points

- `VehicleBody.ts` currently supports the chassis on fixed frictionless wheel spheres and probes ground within a fixed travel distance.
- `VehicleController.ts` currently writes planar velocity and yaw while Havok handles vertical motion, pitch, roll and collisions.
- `FourWheelDynamics.ts` already supplies four-wheel tire forces, but approximates suspension with aggregate load-transfer states and shared alignment.
- `PlayerVehicle.ts` adds visual attitude separately; `VehicleVisual.ts` combines steering and spin on wheel hubs.
- `VehicleModel.ts` has individual hubs, cosmetic ride height and wheel fitment. Physical tire dimensions and collision/contact geometry must agree after swaps.
- `MechanicalConfig.ts`, the Talyer panels, bridge types and `InventorySession.ts` provide configuration, UI and persistence entry points.

## Approach and alternatives

Recommended: a pure TypeScript four-corner force model with Havok as the sole chassis integrator, using per-wheel road sampling and unsprung vertical states. Reuse the existing tire and drivetrain calculations as force producers. This requires migrating the current controller's velocity writes so two systems cannot integrate the same forces.

An extension of the current aggregate transfer model would be cheaper but cannot faithfully produce independent contact and damage. Full rigid-body linkages would support richer kinematics but add solver complexity; data-driven geometry curves meet the requested initial scope.

## Physics contract

Use metres, seconds, kilograms, newtons and radians internally; convert degrees/mm only at UI and authored-data boundaries. Keep existing lowercase wheel IDs and publish an explicit ordered FL/FR/RL/RR mapping. Vehicle coordinates remain right +X, up +Y, forward +Z. Positive steering turns right; positive toe is inward on either side; negative camber tilts the wheel top inward. Mirror these semantic signs at the wheel transform boundary.

Separate authored definitions, validated setup, installed parts, component damage, service alignment and transient runtime state. Each corner includes compression, velocity, remaining travel, spring/damper/bump-stop/ARB force, normal load, contact, wheel position/velocity, camber/toe/caster, steering and damage.

At each fixed physics step, sample contact height and normal for each wheel over its full travel, advance unsprung motion with deterministic substeps, evaluate spring/preload/motion ratio, piecewise damper curves, bump and droop stops, and axle ARB coupling. Tire compliance determines road reaction; suspension force and unsprung acceleration connect that reaction to chassis support. Unilateral contact never generates tensile road force. Airborne wheels contribute zero tire force. Include chassis ground collision for bottoming; remove fixed wheel spheres as competing chassis supports.

Apply suspension forces at chassis mounts and tire forces at contact patches, with equal/opposite forces represented consistently in the wheel model. Havok integrates chassis translation and rotation exactly once. Do not add the current analytical load transfer or visual sway on top. Preserve collision response, parking on slopes, reset, pushing, fuel failure, assists and wheel rotation behavior through the controller migration.

Soft springs increase deflection and alter transient response. Steady-state longitudinal transfer follows mass, acceleration, CG height and wheelbase; softness alone must not multiply it. ARB stiffness changes axle transfer distribution through coupled forces. Ride-height adjustment changes physical mount/rest geometry and CG; distinguish spring-seat adjustment from independent body-length adjustment in part definitions.

## Geometry, steering and tires

Evaluate camber, toe, caster, track and fore/aft curves at actual travel, including deformation and wheel offset. Steering rack response uses ratio, maximum lock, self-aligning return and Ackermann interpolation, with per-side damage limits. Wheel heading includes toe exactly once. Caster changes steering-induced camber and return torque.

Existing tire force generation receives individual normal load, contact normal, contact-point velocity and actual orientation. Preserve combined longitudinal/lateral limits and load sensitivity. Camber changes longitudinal contact and lateral force response; scrub feeds existing heat/wear hooks. Drivetrain torque reaches its driven corners without additional FWD/RWD behavior rules.

## Visuals and garage

Render the Havok chassis pose and local wheel transforms from suspension state. Use separate travel, steering/alignment and spin nodes so spin cannot rotate the camber axis. Convert solved wheel centres into chassis-local coordinates; avoid applying body motion twice. Accommodate stock and swapped wheel meshes.

Add suspension sections to the existing Talyer workflow: height, springs, dampers, alignment, ARBs, steering and damage. Basic controls operate per axle; advanced controls operate per corner. Installed parts bound adjustments. Show units, contextual tradeoffs, targets versus actual alignment, and explicit reasons unreachable targets require component replacement.

Garage preview runs the same solver with an isolated preview state, including cornering/braking/acceleration probes and maximum-lock demonstration. Preview damage and runtime motion never mutate the owned vehicle. Commit validated tuning through the existing session boundary. Save named presets including the requested stock/street/touge/track/wet/drift/rally/drag/custom options.

## Parts, damage and service

Define stock baselines per vehicle and compatible data-driven springs, dampers, coilovers, arms, ARBs and steering kits. Parts supply strength, mass, geometry and adjustment ranges. Tire radius/profile/width and wheel offset influence contact, unsprung mass, track, scrub and clearance.

Accumulate damage from corner-specific stress/impact energy with deterministic deformation direction, event thresholds and repeated-abuse accumulation. Cover spring, damper, arms, tie rod, knuckle, hub, mounts and bushings. Failures change physical force coefficients, geometry, travel and stance; never add steering input to simulate pull. Detect rubbing and chassis bottoming and expose sound/wear events.

Repair replaces selected components and clears only their attributable deformation. Alignment is a separate service bounded by installed-part adjustment and remaining deformation. Preserve limpable configurations where contact and structure permit.

## Storage and observability

Persist versioned per-vehicle installed parts, setup, damage and alignment through existing inventory/save contracts, including corresponding backend contracts where applicable. Migrate old cosmetic height and mechanical settings once with sensible vehicle defaults. Validate imports, finite numeric values, IDs and compatibility; reject invalid adjustments with actionable errors.

Publish immutable, throttled corner telemetry: travel, forces, load, actual geometry, health and text status. Draw contact normals, force/load vectors, heading/alignment axes and travel limits in debug mode. Provide serializable snapshots containing chassis/wheel transforms, configuration and damage for future replay/network consumers. Transient solver state is reset on teleport and vehicle replacement; ordinary setup updates must not erase damage.

## Implementation sequence and verification

1. Definitions, units, migration contracts and deterministic four-corner solver; baseline/travel/contact tests.
2. Havok/controller/tire integration and shared chassis/wheel visuals; remove duplicate load transfer and sway.
3. Alignment, steering and geometry curves; tire-force and transform tests.
4. Garage controls, preview, compatible physical parts and named presets.
5. Component stress, deformation, repair/alignment and persistence.
6. Diagnostics, snapshot/event hooks and regression validation.

Automate all 14 requested scenarios: flat baseline, soft/stiff comparisons, lowering, extreme camber, toe, asymmetric spring, failed damper, bent tie rod/control arm, FWD/RWD launches, wheel lift and curb strike. Assert force balance, contact non-negativity, travel bounds, geometry signs, finite state and timestep convergence. Compare damping decay after identical disturbances; compare steady/transient transfer without claiming stiffness creates extra total weight transfer.

Use existing Vitest suites for pure mechanics, component tests for UI/save boundaries, and Babylon integration/browser checks for actual chassis response and wheel transforms. Verify repair cannot bypass alignment and alignment cannot erase bent-part constraints. Run typecheck, lint and relevant existing driving/inventory/persistence regressions. Visually inspect roll, dive, squat, rake, wheel travel/lift and damaged stance before claiming visual acceptance. Read installed Next.js documentation before changing framework-facing code.

## Principal risks

The controller migration is the largest integration risk: old velocity writes can erase applied forces. Contact stiffness and unsprung mass require stable substeps rather than arbitrary force clamps. Model pivots and mirrored wheel assets need transform tests. Baselines require calibration, so qualitative acceptance alone is insufficient; record masses, static loads, travel and response measurements per vehicle.
