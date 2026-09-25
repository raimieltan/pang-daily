# PANG DAILY — HANDLING TUNING

How the arcade handling is built, what every baseline number is for, and how to tune it.
Target feel: Initial D Arcade Stage on a worn 1990s FWD sedan. Understeer you can read,
mild lift-off rotation, speed that matters, braking you can predict, and easy recovery.
No drift assists and no tire/suspension simulation.

---

## 1. Where things live

| Layer | File | Owns |
|---|---|---|
| Config (data) | `src/game/vehicles/handling/HandlingConfig.ts` | Typed, validated parameters (zod). Rejects unknown keys and out-of-range values. |
| Presets (data) | `src/game/vehicles/handling/presets.ts` | Baseline + variants, layered with `extends`/`overrides`. |
| Model (pure TS) | `src/game/vehicles/handling/ArcadeHandlingModel.ts` | Planar two-axle model. No Babylon; deterministic; unit tested. |
| Collision (data) | `src/game/vehicles/VehicleDefinition.ts` | Box + wheel spheres, CG, inertia. Independent of the GLB. |
| Physics body | `src/game/vehicles/VehicleBody.ts` | Havok body, wheel ground rays, spawn/reset. |
| Adapter | `src/game/vehicles/VehicleController.ts` | Each 1/120 s step: body velocity → model → body velocity. |
| Scene | `src/game/scenes/drivingScene.ts` | Debug road, chase camera, input, debug panel wiring. |

Split of responsibility per physics step:

```text
Havok body ──velocity──▶ car frame (vx, vy, yaw rate) ──▶ ArcadeHandlingModel.step
     ▲                                                          │
     └──── planar velocity + yaw written back ◀─────────────────┘
Havok keeps: gravity, velocity along the car's up axis, pitch/roll, collisions.
```

The body's collision shapes have **zero friction**. All grip comes from the model, so tire
behaviour exists in one place only and collisions can't add grip the tuning never asked for.

## 2. Switching presets

Presets change without touching code:

- **Vehicle default**: `handlingPreset` in `VehicleDefinition`.
- **URL**: `/?handling=fwd_worn_sedan_bald_rears`.
- **Live**: the Handling debug panel dropdown (`setHandlingPreset` bridge command). Motion state carries over.

Add a variant as overrides on an existing preset:

```ts
my_variant: {
  name: "…",
  description: "…",
  extends: "fwd_worn_sedan",
  overrides: { tires: { rearGrip: 0.92 }, balance: { liftOffRotation: 0.12 } },
},
```

Parts, tire wear and condition should go through the same path later: produce overrides,
then `applyHandlingOverrides(base, overrides)`, which validates the result.

## 3. Debug panel and telemetry

The driving scene opens with the Handling panel (top left). It updates at about 10 Hz through
the `vehicleTelemetry` bridge event, so React never touches per-frame state.

| Readout | Meaning | What to look for |
|---|---|---|
| steer / lock | Road-wheel angle / lock the speed allows now | Lock should shrink as speed rises (speed-sensitive steering). |
| understeer | `1 − yawRate / kinematicYawRate` | >0 = car turning less than steered (pushing). <0 = rotating more than steered. |
| front / rear grip | Share of each axle's friction circle in use | Front at 1.0 while rear is well below = understeer at the limit. |
| lift-off | 0..1 lift-off envelope | Should build over about a second after lifting, not jump. |
| traction cut | Share of drive force removed by the grip limit or assist | Non-zero when powering out of a tight corner. |
| slip body/F/R | Body slip and per-axle slip angles | Rear above the stability threshold (5°) means the assist is working. |
| stability | Counter-yaw from the stability assist | Should only appear when the rear actually slides. |
| HOLD / REV / n/4 wheels | Auto-hold, reverse gear, ground contact | |

Controls: arrows or WASD, **R** to reset. On a standard gamepad: RT throttle, LT brake/reverse,
left stick steer, Back reset. Hold brake at a standstill for 0.35 s to engage reverse.

## 4. Test road (`src/game/world/debugRoad.ts`)

| Spawn | Section | Use it for |
|---|---|---|
| `start` | 80 m wide flat apron | Launches, braking distances, lane-mark speed sense |
| `skidpad` | Apron, off-centre | Constant-radius circles: understeer vs. speed, lift-off |
| `hill` | 8° uphill | Hill hold, hill start, cresting at speed |
| `hill_down` | 6° downhill | Braking downhill, lift-off while nose-heavy |
| `camber` | 10° side-tilted pad | Parking across a slope (no sideways creep) |
| `steep` | 15° ramp | Hold on the steepest road we expect |

The runout past the downhill has a concrete wall on the right for collision checks.

## 5. Baseline: `fwd_worn_sedan`

Measured from the model alone at 1/120 s on flat ground (full contact):

| Measure | Value |
|---|---|
| 0–60 km/h | 4.9 s |
| 0–100 km/h | 9.0 s |
| Top speed (sustained) | ~159 km/h (drag-limited under the 180 km/h engine limit) |
| 100–0 km/h braking | 43 m |
| Full lock at 100 km/h | understeer 0.44, 0.70 g lateral: stable push, no spin |
| Lift-off at 70 km/h, half lock | yaw rate +54%, peaking ~2.0 s after the lift |

Variants, same method:

| Preset | 100–0 | Full lock @100 (understeer / lat g) | Lift-off yaw gain / time to peak |
|---|---|---|---|
| `fwd_worn_sedan` | 43 m | 0.44 / 0.70 g | +54% / 2.0 s |
| `…_fresh_tires` | 42 m | 0.38 / 0.77 g | +49% / 2.0 s |
| `…_bald_rears` | 44 m | 0.33 / 0.84 g | +110% / 1.1 s |
| `…_no_assists` | 43 m | 0.44 / 0.70 g | +54% / 2.0 s |

Note on the lift-off numbers: part of the yaw gain comes from the car slowing down, since the
speed-limited lock opens up. Compare presets against each other rather than reading the
percentage as the pure effect of `liftOffRotation`.

`…_no_assists` matches the baseline in these straight-line and steady-state tests. That is
expected: traction assist only acts while powering through a corner, and stability assist only
acts once the rear slides past 5°. Try both on the skidpad with `…_bald_rears`-style inputs.

### Why each number

**Chassis**

| Param | Value | Why |
|---|---|---|
| `massKg` | 1080 | Light 1.5 L early-90s sedan. |
| `wheelbaseM` | 2.50 | Matches `starter_sedan.glb` (axles at z +1.28 / −1.22), so the model's pivot matches the wheels you see. |
| `frontWeight` | 0.62 | Transverse engine over the front axle; the root of the FWD push. Set `collision.centerOfMass.z` to match (0.33 m ahead of the wheelbase centre). |
| `cgHeightM` | 0.52 | Normal sedan. Only scales load transfer. |
| `yawInertiaScale` | 1.1 | Slightly lazy rotation, so the car feels heavy and every rotation is telegraphed. |

**Steering**

| Param | Value | Why |
|---|---|---|
| `maxAngleDeg` | 32 | Parking-lot lock. Enough to U-turn on a two-lane road. |
| `minAngleDeg` | 2 | Floor at very high speed so the car can still change lanes. |
| `fullLockLateralG` | 1.25 | The key understeer knob. Lock shrinks with speed so full lock asks for 1.25 g, above what the tires give (~0.95). Full lock at speed therefore overdrives the front and the car visibly pushes, but lock can never be so large that the car snaps. Lower toward 1.0 for a car that barely pushes. |
| `turnInSeconds` | 0.2 | Keyboard tap to full lock. Timed against the current lock, so it feels the same at every speed. |
| `unwindSeconds` | 0.12 | Faster than turn-in, so recovery (letting go) is always quicker than committing. This is the "forgiving" part. |

**Drive**

| Param | Value | Why |
|---|---|---|
| `accelerationMps2` | 3.8 | About 9 s to 100. Slow enough that carrying speed through corners matters more than straight-line power. |
| `topSpeedKmh` | 180 | Engine limit; drag caps real top speed around 159. |
| `reverse*` | 2.5 m/s², 25 km/h | Enough to back out of a wall, not enough to race in reverse. |
| `engineBrakingMps2` | 1.2 | Lifting noticeably slows the car, which also drives the forward weight shift behind lift-off rotation. |
| `rollingResistanceMps2`, `aeroDrag` | 0.15, 0.00035 | Coasting feel and top speed; not tuned for realism. |

**Brakes**

| Param | Value | Why |
|---|---|---|
| `decelerationMps2` | 8 | About 0.8 g, 43 m from 100. Old pads, but predictable. |
| `frontBias` | 0.68 | Front-heavy bias keeps straight-line braking stable. Braking while turning still rotates a little through load transfer. Lower it for a car that is livelier on trail-braking. |

Built-in arcade ABS (`ABS_LIMIT` = 0.95 of axle grip in the model) means brakes never lock and
never take all the steering away.

**Tires**

| Param | Value | Why |
|---|---|---|
| `frontGrip` / `rearGrip` | 0.95 / 1.00 | Front below rear: the car is stable and leans toward understeer, like mismatched tires with the worn pair on the driven axle. |
| `frontPeakSlipDeg` / `rearPeakSlipDeg` | 7 / 6 | Soft, progressive tires. Grip builds and fades gradually, so the limit can be felt before it arrives. |

**Balance**

| Param | Value | Why |
|---|---|---|
| `understeer` | 0.45 | Front grip lost once overdriven (0.45 → up to 22% less). Turns "too much lock at too much speed" into a visible plough instead of a car that simply turns less. Lifting or braking restores it: the lesson is slow in, fast out. |
| `rearSlideFalloff` | 0.1 | Rear barely loses grip once sliding, so slides build and are catchable instead of snapping. |
| `weightTransfer` / `weightTransferRate` | 0.6 / 5 s⁻¹ | Real but softened pitch that settles in ~0.2 s, so the grip shift after braking or lifting is felt a moment later instead of instantly. |
| `liftOffRotation` | 0.08 | Mild. Lifting mid-corner takes up to 8% rear grip (front gains 4%) and tucks the nose in. Enough to reward the technique, not enough to spin a car that is only coasting. |
| `liftOffMinSpeedKmh` | 35 | No rotation when coasting in traffic or parking. |
| `liftOffBuildRate` / `ReleaseRate` | 3 / 6 s⁻¹ | Builds over ~0.33 s, releases twice as fast. Getting back on the throttle always calms the car sooner than lifting unsettled it. |

**Assists**

| Param | Value | Why |
|---|---|---|
| `traction` | 0.35 | Cuts some drive when the front is busy cornering, so flooring it mid-corner doesn't wash the nose out completely. Low enough that power-on understeer still shows. |
| `stability` / `stabilityThresholdDeg` | 0.5 / 5° | Counter-yaw only once the **rear** slides past 5°. It catches lift-off overshoot and never touches tight low-speed turns, where body slip is high but nothing slides. This is a recovery aid, not a drift assist. |

**Handbrake** (Space / pad B)

An arcade rotation tool for hairpins, U-turns and tight town corners, not a parking brake or a
drift button. Tap and steer to rotate; release and throttle so the front wheels pull the car
straight. Measured on the baseline (0.5 s tap at 45 km/h, full lock, then throttle 0.6 at 0.3 lock):
the car rotates ~28° during the tap and travels 11° further round the corner than the same inputs
without it. Rear slip peaks at ~23° and settles within 0.5 s of release.

| Param | Value | Why |
|---|---|---|
| `minEffectiveSpeedKmh` / `fullEffectSpeedKmh` | 18 / 45 | Linear ramp from 18 to 45: nothing when parked or crawling, full effect at hairpin-entry speed. Above 45 it fades as 45 / speed (≈ 0.4 at 110), so a highway tap nudges the car rather than spinning it. |
| `rearGripMultiplier` / `frontGripMultiplier` | 0.55 / 0.95 | The rear lets go; the driven front barely changes, so FWD recovery still comes from the front, not a RWD-style slide. |
| `yawAssistStrength` / `maxYawRateBonus` | 0.85 / 1.6 rad/s | Feeds yaw toward the steered yaw rate plus up to 1.6 rad/s × effect, and never beyond. Adds rotation only in the steered direction, so with no steering it does nothing. |
| `speedBleedPerSecond` | 0.18 | Loses 18% of speed per second as body drag, not rear brake force. Braking through the loosened rear would use up its friction circle and lock the car into a spin. Holding too long scrubs the car below 18 km/h, where the handbrake switches itself off, so it can't slide forever. |
| `engageSmoothing` / `releaseSmoothing` | 12 / 8 s⁻¹ | Exponential fade: ~0.08 s in, ~0.12 s out. A tap is a clean flick; release restores grip progressively instead of snapping. |

While it acts, the stability assist runs at half strength so it doesn't cancel the rotation.
It comes back with rear grip on release and helps the catch. The yaw feed gain (`HANDBRAKE_YAW_GAIN`)
is a constant in the model; tune `yawAssistStrength` instead. Reversing or airborne: no effect.

**Low speed**

| Param | Value | Why |
|---|---|---|
| `kinematicBelowKmh` / `dynamicAboveKmh` | 5 / 12 | Below 5 km/h the car follows its wheels exactly, blending to the tire model by 12. Parking, launches and reversing are calm and never jitter. |
| `holdBelowKmh` | 1.5 | With no throttle the car is held still, on slopes too. The adapter also cancels gravity along the road and pins the held position against solver drift. |
| `reverseEngageBelowKmh` / `reverseDelaySeconds` | 3 / 0.35 s | Holding brake at a stop selects reverse after a pause, so a hard stop never rolls straight into reverse. |

**Pedals**

| Param | Value | Why |
|---|---|---|
| `throttleRise/Fall`, `brakeRise/Fall` | 6/8, 7/10 s⁻¹ | Keyboard input becomes a ~0.15 s ramp: gradual transitions with digital keys. Release is faster than press, for the same reason as steering unwind. |

## 6. Collision body (`STARTER_SEDAN.collision`)

| Param | Value | Why |
|---|---|---|
| `body` | 1.66 × 1.1 × 4.3 m box, bottom at 0.25 m | Covers the GLB's body and most of the cabin. Its bottom sits above the wheel spheres' base, so only the wheels touch the road. |
| `wheels` | r 0.30, half track 0.728, z +1.28 / −1.22 | Same as the GLB wheel nodes. Spheres roll over slope changes and seams where box corners would catch. |
| `centerOfMass` | y 0.35, z 0.33 | Low, so kerbs and landings don't tip the car. `z` matches `frontWeight`. |
| `tipInertiaScale` | 3 | Pitch/roll inertia ×3: heavy rocking on bumps and hits, no flipping. |
| `angularDamping` | 0.5 | Settles pitch/roll after landings. Yaw is overwritten by the model each step, so this doesn't affect handling. |
| `suspensionTravel` | 0.2 m | A wheel still counts as grounded with the road up to 20 cm below it, so small crests and bumps don't flicker contact (and grip) off. |

Spawn/reset raycasts down from 5 m above the requested point, aligns the car to the road
normal, and places it 3 cm above the surface at rest. It never starts intersecting the road,
so it can't be launched or pushed through. The body only uses thick static boxes (1 m slabs)
and a fixed 1/120 s step; at 180 km/h the car moves 0.42 m per step, well within one slab.

## 7. Tuning recipes

| Symptom | Try |
|---|---|
| Pushes wide too easily | Lower `fullLockLateralG` (1.25 → 1.1) or `understeer`, or raise `frontGrip`. |
| Can't feel the limit coming | Raise `frontPeakSlipDeg` (softer front), lower `understeer`. |
| Lift-off does nothing | Raise `liftOffRotation` (0.08 → 0.12), lower `liftOffMinSpeedKmh`. |
| Lift-off snaps or spins | Lower `liftOffBuildRate`, `rearSlideFalloff`, or raise `stability`. |
| Feels twitchy on keyboard | Raise `turnInSeconds`; don't touch `unwindSeconds`. |
| Sluggish off the line | `accelerationMps2`, then `throttleRise`. |
| Handbrake barely rotates | Raise `yawAssistStrength` or lower `rearGripMultiplier` (0.55 → 0.45). For slow hairpins, lower `fullEffectSpeedKmh`. |
| Handbrake spins or snaps back on release | Lower `maxYawRateBonus`, raise `rearGripMultiplier`, or lower `releaseSmoothing`. |
| Brakes feel wooden | Raise `brakeRise`, lower `frontBias` a little. |

Change one parameter at a time, check it on the skidpad and the hill, then write the new
baseline number and its reason in §5.
