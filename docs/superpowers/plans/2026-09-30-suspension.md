# Suspension Implementation Plan

> Implement inline with superpowers:executing-plans.

**Goal:** Physical four-corner suspension, shared tire/visual geometry, garage tuning and component damage.
**Architecture:** Pure suspension state and force solver, Babylon/Havok chassis adapter, existing tire/drivetrain force producers, session-backed garage commands.
**Tech Stack:** TypeScript, Babylon/Havok, React, Zustand, Zod, Vitest, Prisma.
**Spec:** `docs/superpowers/specs/2026-09-30-suspension-design.md`

## Global constraints
- SI units internally, radians for geometry; UI converts to mm/degrees.
- Same suspension mechanics for FWD, RWD and AWD.
- No duplicate chassis integration, fake visual sway or scripted damage pull.
- Persist parts/setup/damage/alignment; preview never damages the owned car.
- Preserve existing parking/reset, tire fitment and inventory flows.

## Review focus
- Missing/raised wheel must have zero normal load and tire force (tasks 1/2).
- Setup edits must preserve damage and reject nonfinite/out-of-range values (tasks 1/4).
- Repair must not silently perform alignment (tasks 1/4).
- Wheel spin must not rotate alignment axes; left/right signs must mirror (task 3).
- Account persistence must retain suspension across unrelated inventory changes (task 4).

## Task 1: Domain and independent force solver
Files: create `src/game-core/suspension/{schema,parts,service,solver}.ts` and `suspension.test.ts`.
Interfaces: `createSuspension(baseline): SavedSuspension`, `SuspensionSolver.step(dt,input)`, `corners`, `preview(dt,acceleration)`; service returns validated saved states.
- [ ] Write acceptance tests for rest balance, softer/stiffer response, height/travel, alignment, damping, airborne wheels and damage/service.
- [ ] Run Vitest and confirm failures before implementing.
- [ ] Implement validated per-corner setup, part limits, geometry curves, unsprung motion and contact/spring/damper/ARB forces.
- [ ] Run the new tests and inspect convergence/force balance.

## Task 2: Tire and Havok integration
Files: modify `FourWheelDynamics.ts`, `ArcadeHandlingModel.ts`, `VehicleBody.ts`, `VehicleController.ts`, `PlayerVehicle.ts`; add integration tests.
Interfaces: optional suspension outputs on `AxleContact`; mechanics expose accumulated body-frame forces for Havok.
- [ ] Test actual contact/heading/load consumption and force-only stepping.
- [ ] Remove wheel supports for suspension-enabled vehicles; sample road, step solver, apply forces once.
- [ ] Preserve legacy model as fallback for non-mechanical fixtures; mechanical runtime uses one chassis integrator.
- [ ] Verify flat-ground settling, launch, braking, steering and resets in Havok.

## Task 3: Visible suspension and diagnostics
Files: modify `VehicleVisual.ts`, `VehicleModel.ts`, `PlayerVehicle.ts`, bridge telemetry; create debug visual adapter.
Interfaces: visual update consumes solver corners, distinct alignment/spin nodes, snapshot-safe telemetry.
- [ ] Test mirrored camber/toe and independent compression with Babylon NullEngine.
- [ ] Implement chassis/wheel state rendering, debug force/travel lines and telemetry labels.
- [ ] Verify wheel swaps and body fitment continue to work.

## Task 4: Garage, preview, parts and persistence
Files: create `SuspensionPanel.tsx`; extend `CustomizationSystem.ts`, bridge commands, inventory schema, contracts and backend persistence; add component/service tests.
Interfaces: `setSuspensionSetup`, `installSuspensionPart`, `serviceSuspension`, `previewSuspension`, `saveSuspensionPreset` commands.
- [ ] Test basic/per-corner edits, incompatible ranges, damaged alignment, preview isolation and round-trip saves.
- [ ] Implement tabs, controls, presets, part installation, damage/service and live solver preview.
- [ ] Add versioned domain persistence and server actions/migration; retain legacy height migration.
- [ ] Verify UI and account/local save behavior.

## Task 5: Acceptance and review
- [ ] Run all fourteen scenarios, targeted regression tests, typecheck and lint.
- [ ] Exercise browser visuals with real assets and record screenshots.
- [ ] Obtain a fresh code review; fix material findings and rerun affected verification.
- [ ] Record remaining limitations honestly; leave implementation reviewable in the user's checkout.

## Execution ledger

Ruling: execute in the existing feature checkout (`feat/m2-jobs`) and leave changes uncommitted for review; user explicitly requested implementation in this session. No deployment or merge is needed.
Ruling: implementation begins after this plan without another approval round because the user explicitly said “implement now”.
