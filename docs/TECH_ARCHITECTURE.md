# PANG DAILY — TECH ARCHITECTURE

## 1. Technical Goal

Pang Daily is a browser-first 3D car-life RPG.

The architecture should support:

- responsive arcade driving
- 3D world exploration
- React-based UI
- persistent player progress
- data-driven cars and parts
- social / NPC systems
- economy
- future 1v1 multiplayer
- modular map expansion
- browser-friendly performance

The project should avoid making React responsible for frame-level game simulation.

---

## 2. Recommended Stack

### Frontend Shell

- Next.js
- React
- TypeScript

### 3D Game Runtime

- Babylon.js

### Physics

- Havok or Rapier integration

Initial preference:
- use the physics option that gives the cleanest Babylon integration and stable browser performance
- vehicle handling should still be largely custom arcade logic

### App State

- Zustand

Use for:
- menus
- HUD
- player meta state
- UI flow
- session state

Do not use Zustand as the frame-by-frame physics state store.

### Backend

- NestJS

### Database

- PostgreSQL

### ORM

- Prisma

### Validation

- Zod

### Realtime / Multiplayer

- Socket.IO

### Assets

- Blender
- glTF / GLB

### Styling

- Tailwind CSS
- component library optional

### Testing

- Vitest or Jest
- Playwright

---

## 3. High-Level Architecture

```text
NEXT.JS / REACT
│
├── UI
├── Phone
├── Marketplace
├── Garage
├── Dialogue
├── HUD
├── Menus
└── Save / Account Screens
        │
        ▼
GAME STATE BRIDGE
        │
        ▼
BABYLON.JS GAME RUNTIME
│
├── Scene Manager
├── Vehicle Controller
├── Character Controller
├── Traffic
├── AI
├── Race Systems
├── Audio
├── Environment
└── Physics
        │
        ▼
BACKEND API
│
├── Player Data
├── Economy
├── Marketplace
├── NPC State
├── Race Results
├── Inventory
└── Multiplayer Sessions
        │
        ▼
POSTGRESQL
```

---

## 4. React vs Game Runtime Responsibility

### React Owns

- phone UI
- marketplace
- inventory UI
- garage UI
- finances
- relationship screens
- dialogue
- race result screens
- map UI
- settings
- loading screens
- menus
- HUD presentation

### Babylon Owns

- driving
- walking
- camera
- transforms
- collision
- physics
- traffic
- NPC world movement
- environment rendering
- car spawning
- race checkpoints
- weather visuals
- world interactions

### Rule

Frame-level state should stay inside the game runtime.

React should receive derived state only.

Example:

```text
speed = 82 km/h
gear = 3
racePosition = 2
engineCondition = 71%
```

React should not receive:

```text
wheelContactPointFL
suspensionCompressionRR
rigidBodyTransformEveryFrame
```

unless specifically required.

---

## 5. Game State Bridge

The bridge connects React and Babylon.

### Game → React Events

Examples:

```ts
gameEvents.emit("raceFinished", result)
gameEvents.emit("vehicleDamaged", damage)
gameEvents.emit("dialogueTriggered", dialogueId)
gameEvents.emit("locationEntered", locationId)
gameEvents.emit("vehicleStateUpdated", summary)
```

### React → Game Commands

Examples:

```ts
gameCommands.spawnAt("coffee_shop")
gameCommands.startRace(raceId)
gameCommands.enterVehicle(vehicleId)
gameCommands.installVisualPart(partId)
gameCommands.setWeather("rain")
```

This keeps engine logic and UI logic separated.

---

## 6. Project Structure

Recommended monorepo:

```text
/apps
  /web
    /app
    /components
    /game
      /engine
      /vehicles
      /physics
      /traffic
      /world
      /ai
      /races
      /audio
      /characters
      /bridge

  /api
    /src
      /players
      /cars
      /economy
      /marketplace
      /races
      /npc
      /multiplayer

/packages
  /game-core
  /shared
  /content
```

---

## 7. Game Core Package

`game-core` should contain pure TypeScript logic.

Examples:

```ts
calculateRepairCost()
calculateVehiclePerformance()
calculateRaceReward()
calculatePartWear()
calculateReliability()
calculateFuelCost()
calculateReputationChange()
```

This package should not depend on Babylon.

Benefits:

- easier testing
- reusable server-side
- easier multiplayer validation
- avoids UI/engine coupling

---

## 8. Vehicle Architecture

A vehicle should contain:

```text
Vehicle
├── Identity
├── Base Stats
├── Condition
├── Installed Parts
├── Visual Configuration
├── Runtime Physics State
└── Ownership Metadata
```

Example data:

```ts
type VehicleDefinition = {
  id: string
  name: string
  drivetrain: "FWD" | "RWD" | "AWD"
  power: number
  weight: number
  grip: number
  braking: number
  reliability: number
}
```

---

## 9. Arcade Driving Model

The game should not rely entirely on default wheel physics.

Use custom handling logic.

Conceptually:

```text
PLAYER INPUT
    ↓
VEHICLE CONTROLLER
    ↓
ARCADE HANDLING MODEL
├── throttle
├── steering
├── braking
├── drivetrain behavior
├── grip
├── understeer
├── lift-off rotation
├── traction assists
└── speed-sensitive steering
    ↓
PHYSICS BODY
    ↓
BABYLON TRANSFORM
```

The goal is:

- responsive
- predictable
- readable
- distinct between cars
- tunable by data

---

## 10. Handling Parameters

Potential runtime parameters:

```ts
type HandlingConfig = {
  steeringRate: number
  maxSteeringAngle: number
  frontGrip: number
  rearGrip: number
  brakeStrength: number
  acceleration: number
  understeerFactor: number
  liftOffRotation: number
  tractionAssist: number
  stabilityAssist: number
}
```

Different drivetrains should modify behavior.

---

## 11. Physics Philosophy

Use physics for:

- collisions
- rigid body response
- grounded car movement
- impacts
- world interaction

Do not attempt full simulation of:

- real suspension geometry
- tire thermodynamics
- detailed drivetrain physics
- deformable bodywork

Initial version should be arcade-focused.

---

## 12. Map Architecture

The world should use connected chunks.

Example:

```text
Hub
├── Home
├── Coffee Shop
├── Talyer
├── Gas Station
├── Convenience Store
└── Main Road

Mountain
├── Lower
├── Mid
└── Upper
```

Chunks may be:

- loaded on demand
- preloaded near the player
- unloaded when distant

This keeps browser memory usage manageable.

---

## 13. World Streaming

Recommended approach:

- partition environment into GLB chunks
- load adjacent chunks asynchronously
- use lower LOD for distant chunks
- keep shared props instanced
- preload route chunks before races

World streaming should prioritize smoothness over perfect continuity.

---

## 14. Traffic System

Traffic should use lightweight simulation.

Use:

- waypoint or spline following
- basic lane rules
- simple avoidance
- pooled vehicles
- reduced update frequency at distance

Traffic cars should not use the same full vehicle controller as the player.

Traffic needs only enough fidelity to:

- move convincingly
- react to player presence
- stop
- turn
- create believable road situations

---

## 15. Pedestrians and Animals

Pedestrians, cats, and dogs should use simple state machines.

Examples:

```text
Idle
Walk
CrossRoad
AvoidVehicle
Flee
Return
```

They should not require complex crowd simulation.

---

## 16. Character Controller

Walking should support:

- basic locomotion
- entering/exiting vehicles
- interaction prompts
- shop/talyer exploration
- social spaces
- parking areas

Do not build:

- combat
- advanced parkour
- large crowds
- complex traversal

---

## 17. Data-Driven Content

Game content should be defined in data where possible.

Examples:

- cars
- parts
- NPCs
- dialogue
- races
- jobs
- crews
- locations
- marketplace item templates

Example:

```json
{
  "id": "used_coilovers_01",
  "name": "Used Coilovers",
  "priceRange": [6500, 9000],
  "conditionRange": [0.35, 0.85],
  "effects": {
    "grip": 0.04,
    "comfort": -0.08
  }
}
```

---

## 18. Marketplace Architecture

Marketplace listings should be generated server-side.

Each listing can contain:

- item
- seller
- advertised condition
- actual hidden condition
- asking price
- location
- expiry time

Example:

```text
Advertised:
"Good condition boss."

Actual:
42%
```

The player may discover true condition through:

- inspection
- mechanic
- installation
- relationship trust

---

## 19. Economy Architecture

Core economy entities:

```text
Player
Wallet
Transactions
Jobs
RaceRewards
Fines
Repairs
Fuel
Parts
Vehicles
MarketplaceListings
```

Every money change should be recorded as a transaction.

This helps debugging and balancing.

---

## 20. Save Architecture

Persistent data should include:

- player profile
- owned cars
- vehicle condition
- installed parts
- money
- jobs
- NPC relationships
- reputation
- crew standing
- race history
- unlocked locations
- owned parts
- legal status / fines

Transient runtime state should not be stored unless needed.

---

## 21. Backend API

NestJS modules may include:

```text
AuthModule
PlayerModule
VehicleModule
InventoryModule
EconomyModule
MarketplaceModule
RaceModule
NpcModule
CrewModule
WorldModule
MultiplayerModule
```

---

## 22. Database Model Direction

Likely entities:

```text
User
PlayerProfile
Vehicle
VehicleCondition
Part
OwnedPart
InstalledPart
Transaction
Job
Race
RaceResult
Npc
NpcRelationship
Crew
PlayerCrewStanding
MarketplaceListing
LocationUnlock
Fine
```

Use PostgreSQL relational structure.

---

## 23. Multiplayer Architecture

Multiplayer is future scope.

Initial mode:

**1v1 race**

Sync:

- transform
- velocity
- race state
- checkpoint state
- countdown
- finish time

Use:

- Socket.IO
- interpolation
- moderate tick rate
- server validation for race state

Do not build full shared open world networking initially.

---

## 24. Multiplayer Rule

Single-player systems should be authoritative first.

Multiplayer should be added only after:

- driving feels good
- race state is stable
- map loading works
- core car state is deterministic enough

---

## 25. Audio Architecture

Use layered audio.

Vehicle layers:

```text
Engine
├── idle
├── low RPM
├── mid RPM
├── high RPM
└── limiter
```

Environment layers:

```text
Rain
Traffic
Dogs
Insects
Distant videoke
Talyer ambience
Motorcycles
Tricycles
Wind
```

Audio should support location-based ambience.

---

## 26. Asset Pipeline

Recommended:

```text
AI / Reference
    ↓
Blender Cleanup
    ↓
Optimization
    ↓
LOD Creation
    ↓
Material Cleanup
    ↓
GLB Export
    ↓
Babylon Import
```

All assets should be checked for:

- scale
- pivot
- materials
- texture size
- draw calls
- triangle count
- collision setup

---

## 27. Vehicle GLB Structure

Recommended:

```text
vehicle.glb
├── body
├── hood
├── bumper_front
├── bumper_rear
├── spoiler
├── wheel_fl
├── wheel_fr
├── wheel_rl
├── wheel_rr
└── lights
```

This allows exterior customization. The enforced contract (scale, pivots, naming, ride height, attachment points, budget) is in `docs/VEHICLE_ASSETS.md`.

---

## 28. Performance Targets

Initial browser target:

- 60 FPS on mid-range desktop where practical
- acceptable fallback to 30 FPS
- stable frame pacing
- no major stutter during chunk loading

Optimize for:

- draw calls
- asset size
- physics count
- active NPC count
- particle count
- shadow count

---

## 29. Performance Rules

### Cars

Player car gets highest detail.

Nearby rival cars medium/high detail.

Traffic cars use lower LOD.

### Shadows

Limit dynamic shadow casters.

### Props

Use instancing.

### Lighting

Use selective dynamic lights.

### NPCs

Lower update rate at distance.

### World

Chunk loading is mandatory for expansion.

---

## 30. Testing Strategy

### Unit Tests

For:

- economy
- race rewards
- wear
- repair cost
- reputation
- marketplace generation

### Integration Tests

For:

- vehicle ownership
- part installation
- race results
- transaction recording

### Playwright

For:

- menu flows
- marketplace
- garage
- save/load
- job acceptance
- race result flow

### Manual Gameplay Tests

Required for:

- driving feel
- traffic behavior
- chunk loading
- NPC interactions
- race flow

---

## 31. MVP Technical Milestones

### M0 — Driving Prototype

- Babylon scene
- one car
- one simple road
- arcade controller
- camera
- collision

### M1 — Vertical Slice

- one starter car
- one local hub
- enter/exit car
- coffee shop
- talyer
- one race
- one repair

### M2 — Economy

- wallet
- jobs
- repair costs
- fuel
- marketplace
- transactions

### M3 — Social Layer

- NPC relationships
- dialogue
- reputation
- first crew

### M4 — Mountain Route

- full first road
- traffic
- point-to-point
- uphill/downhill

### M5 — Chapter 1

- story flow
- save/load
- polished local environments
- stable performance

### M6 — Multiplayer Prototype

- 1v1 session
- race synchronization
- result validation

---

## 32. Architecture Guardrails

Do not:

- put physics state in React
- build multiplayer first
- build a huge open world first
- couple car logic to rendering
- hardcode all cars into components
- use one giant global state store for everything
- simulate traffic with full player physics
- rely on AI-generated assets without cleanup
- chase full realism before the arcade loop is fun

---

## 33. Technical Success Criteria

The architecture succeeds if:

- driving can be tuned without rewriting physics
- new cars can be added mainly through data + assets
- UI can change without touching core vehicle logic
- new locations can be added as chunks
- economy can be tested independently
- multiplayer can reuse race logic later
- browser performance remains manageable
- content expansion does not require large refactors

