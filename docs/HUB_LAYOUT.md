# Hub layout (vertical slice greybox)

The first open-world space: a small, fictionalised neighbourhood on the Iloilo city edge. It holds
home, the tambay coffee shop, the talyer, the gas station and the convenience store, all on one
driveable loop. The main road runs through the south side and leaves east toward the future
mountain route. Everything here is placeholder primitives. The layout exists for driving flow
and recognisability, not final art.

Source: `src/game/world/hub/hubLayout.ts` (data), `src/game/scenes/hubScene.ts` (scene).

```text
  z 200 ┌──────── perimeter wall / backyards ───────────────────────────┐
        │  HOME (NW)          TALYER (N)             COFFEE SHOP (NE)   │
  z 140 │  ╭───────────── barangay street (9 m) ─────────────╮          │
        │  │ houses            basketball court              │ café     │
   z 70 ├──┼──────────────────────┼──────────────────────────┼──────────┤ ← chunk seam
        │  │ CONVENIENCE STORE    │ GAS STATION              │          │
    z 0 ═══╯══════════════ main road (12 m) ═════════════════╧══════ ══ exit → mountain
        │  canal · poles · houses across the road                       │
  z −60 └───────────────────────────────────────────────────────────────┘
       x −160       −20                   70                        250
```

## Locations

| Id | In-game name | Chunk | Walk-safe area | Spawn |
|---|---|---|---|---|
| `home` | Home | home | yard and gate | driveway, facing the street |
| `talyer` | Talyer ni Mang Boy | talyer | waiting bench beside the bays | in the bay apron |
| `coffee_shop` | Kyo Coffee | coffee_shop | terrace in front of the glass | concrete apron in front |
| `gas_station` | Bahandi Fuels | gas_station | kiosk front | forecourt, between the pump islands |
| `convenience_store` | Suki 24 | convenience_store | store front | store parking |
| `main_road` | Main Road, to the mountain | main_road | none (road only) | eastbound lane near the exit |

All brands are fictional except Kyo Coffee, which is modelled on the real café (ground floor of the KLMB Bldg.) so local players recognise it. Colours suggest the category (green fuel canopy, blue and yellow
24-hour store) without copying a real chain.

Every location has:

- an **area**: entering it fires `locationEntered`, leaving it fires `locationExited`, and a toast shows the name
- a **spawn** point: `?spawn=<id>`, or the handling panel's spawn buttons
- a **return point** on the road, facing traffic flow. If the car leaves the map or falls below y = −5, `HubLocations` puts it back at the nearest one and fires `playerReturned`.

Zones (`walk`, `interact`, `parking`) are data only for now. They mark where on-foot play,
prompts and parked cars will go.

## Driving

- The loop is about 702 m: the main road (12 m) on the south, 10 m connectors on the west and east, and a 9 m barangay street on the north.
- Every loop corner has a 22 m centreline radius. That is about 50 km/h at 0.9 g, and far inside the sedan's roughly 4 m full-lock radius.
- Traffic keeps right. Return points sit in the right-hand lane.
- The main road continues east past the loop, narrowing to 9 m, to a gravel turnaround and a road-closed barrier at x ≈ 244. That is the hook for the mountain route. The west end is closed the same way.
- `hubDrive.test.ts` drives the real Havok body and handling controller round the whole loop with a pure-pursuit autopilot. The lap takes about 57 s at 35 to 55 km/h. The car stays within 2 m of the centreline, never stalls, and touches no collider.

## Chunks

The bounds are tiled by six chunks, one per location, each 90 to 180 m on a side. `LayoutAuthor.partition`:

- clips roads exactly at the seams, so neighbouring pieces meet with matching width
- gives every other item to the chunk that holds its anchor point
- throws if content falls outside every chunk

`buildChunk` makes each chunk self-contained:

| Part | How it's built |
|---|---|
| Ground, surfaces, roads, markings and blocks | merged into one lit mesh and one glow mesh |
| Props | thin instances, one draw call per prop and layer |
| Wires | one line system |
| Light pools | one thin-instanced additive disc |
| Physics | one static body: a 1 m ground slab with its top at y = 0, plus every block and prop collider |

Everything hangs off the chunk's root node and goes with `dispose()`. The hub builds all six chunks up front today. Streaming later only changes *when* `buildChunk` and `dispose` run.

Visual layers sit a few centimetres below the collider top, in this order from the bottom: ground, lots, roads, markings, light pools. They never z-fight and never poke through the tyres.

## Rules the tests enforce (`hubLayout.test.ts`)

- Chunks tile the bounds without overlap, and all content stays inside its own chunk.
- Road ends on a seam always meet a matching piece in the next chunk.
- The loop is closed and passes within 30 m of every location. It never turns tighter than the design radius, and it is at least 9 m wide everywhere.
- No collider sits on or overhangs a road. Road-closure barriers are exempt.
- Spawn and return points are paved and clear of colliders for the whole car. Return points are on the road.
- Walk zones exist at all five social locations and never overlap roads or parking.

## Editing

Add content with `LayoutAuthor` helpers:

- `road`, `surface`, `block`, `prop`, `lamp`, `zone`
- `wallRun` (tiles 3 m wall modules)
- `poleLine` (poles plus sagging wires)
- `streetLamp` (post plus sodium lamp)

Then run `yarn test src/game/world`. The tests catch most layout mistakes, such as a pole in the road, a house across a seam, or a spawn inside a wall, before you ever load the scene. Prop definitions live in `src/game/world/props/propKit.ts` (see its header comment for the GLB swap path).
