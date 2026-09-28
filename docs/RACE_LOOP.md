# First local race

In the hub, drive east from Home onto the north street. The gold start line is at
(x -65, z 140). Within 12 metres, F / RB or the interaction button challenges the
local rival; walking up also works. Both cars stage automatically. After 3, 2, 1,
follow the gold gates east, brake for the right bend, and finish beside the coffee
shop. The HUD shows the next gate, elapsed time and standing. Results offer Race
again (restages both cars) and Back to hub. Abandon race releases controls and
clears progress. No scene reload is involved.

## Content and tuning

`src/game/races/localRoute.ts` is the debug/playable route: ordered 3D box triggers,
separate finish volume, start pose, and sampled road corridor. Change route data
to author drag, uphill/downhill touge or point-to-point runs; the core imports no
Babylon or React. Waypoint speed is metres/second. `AIDriver` builds corridor and
corner metadata from those samples, then chooses steering, brake and throttle at
the physics step rate. The rival uses `VehicleBody` and `VehicleController`, the
same collision and handling stack as the player. Driver tiers change decisions
and error; installed parts change the car through normal performance handling.

`Race` owns READY → COUNTDOWN → RUNNING → FINISHED, with RESET clearing timers,
gate indices, invalid-finish notices and finish times. Both racers
use the same swept checkpoint validator. A later gate never advances the expected
gate; a swept finish only counts after every required gate in traversal order.
Ranking uses completed gates then distance to the next gate, and finish times at
the result. `RaceSystem` owns staging, rival physics, visuals, interaction and bridge events;
React receives progress at most 10 Hz plus immediate phase/result events.
Persistent results send the measured opponent finish time (or null when the player
finishes first) so the server awards the same on-road result. Older clients still
use the published benchmark time.

## Manual verification route (not an automated test)

- Start at the gold line and hold throttle during countdown: the car stays staged.
- Complete North street → Brake for right → Coffee bend → Coffee shop finish.
- To check an invalid shortcut, turn off the north street before Brake for right,
  join the east street below the bend, and cross the finish. The HUD must refuse
  the finish and still name the missing gate. Returning through all remaining
  gates then the finish completes the run.
- Let the rival lead: it drives through the bend and finishes; completing afterward gives
  P2. Beat it to the validated finish for P1.
- Select Race again repeatedly: countdown, gate colors, timers and rival restart.
- Abandon during countdown/running, then start again at the world marker.
- Recovery/spawn commands are blocked while racing. Automatic out-of-bounds
  relocation abandons the race rather than counting the teleport as progression.
- Pause freezes simulation; switching scenes disposes race handlers and visuals.
