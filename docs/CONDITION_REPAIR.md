# Vehicle condition and talyer repairs

The vertical slice tracks engine, transmission, brakes, suspension and tires on the existing 0–1 vehicle-condition schema. The starter uses its authored, already-worn condition. Body/electrical remain in the schema for compatibility, but this loop does not wear or service them.

Drive or race, park on the talyer apron or in a service bay, get out with F, then use **Inspect car · Mang Boy** inside a bay. Inspection is free. Select repairs in the itemized panel and pay; selected systems return to 100%, money is deducted once, and a receipt appears. The remaining systems retain their condition. Leaving the workshop closes the quote. The HUD shows all five condition values and cash.

The first-session wallet is ₱5,000. This is a starting allowance, not a race reward system. An all-components starter repair costs more than the starting balance, so players choose what to fix. Costs are whole pesos, rounded up to ₱10, with parts and labor included. There is no real money or backend transaction.

## Runtime ownership

- `game-core/maintenance/condition.ts`: service definitions, wear rates, impact weights and repair pricing. Tuning lives here instead of in UI components.
- `game-core/maintenance/VehicleSession.ts`: owned-car condition, wallet, revisions and a transaction ledger. All money changes, including starting cash, are recorded. It validates funds and condition revisions and reprices repairs from authoritative state.
- `game/maintenance/MaintenanceSystem.ts`: scene adapter. Accumulates driving wear, commits summaries at 1 Hz (immediate for impacts/inspection), and flushes remaining wear during scene disposal. No frame-level state is sent to React.
- `game/maintenance/conditionHandling.ts`: the existing vehicle definition's condition effects scale acceleration, braking and grip from the base handling preset. Switching presets cannot clear damage or compound its multipliers.
- `game/maintenance/talyerAccess.ts`: the player must be on foot in a service bay, the car must be stopped nearby on the premises, and a race cannot be active. This is checked again when paying.
- `maintenanceState`, `repairQuote`, `repairCompleted`: runtime → UI snapshots. `inspectVehicle`, `repairVehicle`, `dismissRepair`: UI → runtime intents. React never edits the wallet or condition.

## Wear and persistence

Wear depends on distance, throttle, braking, sliding and handbrake use. Active racing multiplies wear by 1.5. Ordinary idling, walking and airborne travel incur no distance wear. Existing collision impulses produce discrete damage, weighted most heavily toward suspension and tires. Component values clamp at zero; even a severely worn car retains some performance. This is an arcade consequence loop, not a breakdown, thermal or realistic component simulator.

The runtime owns one `VehicleSession` shared by scenes. Car resets, recovery, race resets and scene switches retain condition and cash. Versioned `sessionStorage` snapshots also retain state through refreshes in the same tab, with at most one second of uncommitted driving wear. Closing the tab ends this session; there is no account or cross-device save. Invalid/unavailable storage falls back to a fresh/in-memory session. Quotes are transient and must be inspected again after a scene reload.

Tests cover wear rates, impacts, handling changes, exact payment, insufficient funds, stale/repeated requests, workshop access, scene replacement, storage recovery, and the React quote/payment flow. Manual gameplay checks: drive hard, collide, return to the talyer, repair only tires, compare grip/cash, reload and confirm condition persists.
