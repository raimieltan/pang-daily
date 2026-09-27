# Server economy and garage persistence

The authenticated game uses PostgreSQL as the money and ownership authority. Babylon keeps driving, collision, fuel consumption and wear sampling local. Money and garage commands return a server receipt before showing success; there is no public balance-assignment or arbitrary reward endpoint.

## Currency and transaction boundaries

Money is signed BIGINT **centavos** (100 centavos = PHP 1), sent over HTTP as decimal strings. Wallets cannot go below zero. Catalog PHP prices are checked whole integers before conversion; fuel is requested in integer milliliters and priced with integer arithmetic and centavo rounding. Condition-dependent resale percentages are quantized to an integer basis before currency arithmetic. The browser converts exact amounts to its existing PHP presentation representation, rejecting values outside its supported range.

Every command locks the acting player's wallet row. That lock serializes purchases, rewards, refunds, repairs and no-cost garage changes for the same player. A PostgreSQL transaction contains the wallet update, append-only ledger receipt, progression/ownership changes, save revision and idempotency response. Database ledger triggers independently enforce contiguous sequence numbers, before/after balances and matching wallet revision. An error, including insufficient funds or an ownership insertion failure, rolls back all writes.

Receipts use named categories: `JOB_REWARD`, `RACE_REWARD`, `REPAIR_COST`, `FUEL_PURCHASE`, `PART_PURCHASE`, `VEHICLE_PURCHASE`, `PART_SALE`, `VEHICLE_SALE`, `INSTALL_LABOR`, `PART_INSPECTION`, `REFUND`. The existing initialization receipt is `starting_cash`. Every receipt includes source, source reference, description, request ID and timestamp. `FINE` has no current validated gameplay source and is deliberately not an arbitrary client charge endpoint; introduce a server-derived fine rule when that feature exists.

## API commands

All routes require the authenticated session; the actor never comes from a player ID in the request. Unsafe methods also require `X-Pang-Request: 1`. JSON bodies and every command variant are strict schema-validated.

```http
POST /api/player/commands
Content-Type: application/json
X-Pang-Request: 1

{
  "key": "a UUID generated once for this action and reused on retries",
  "action": {
    "type": "part_install",
    "vehicleId": "owned vehicle instance UUID",
    "partId": "owned physical part UUID"
  }
}
```

The key is unique per player across command types. Reusing it with another payload returns `IDEMPOTENCY_CONFLICT`. A successful retry returns the stored receipt without repeating any writes. Failed transactions consume no key. Completed jobs, race attempts, marketplace listings and refunded receipts also have logical duplicate protection across different request keys.

| Command | Validated inputs and effect |
| --- | --- |
| `part_purchase` | Shop `definitionId`; server stock price; creates one new, known-condition physical part and debit |
| `market_purchase` | Server-owned `listingId`, optional eligible seller offer; persisted price/condition; creates part and marks listing sold atomically |
| `part_inspect` / `part_sell` | Owned `partId`; inspection uses catalog fee; resale uses catalog/condition; installed parts cannot be sold |
| `vehicle_purchase` / `vehicle_sell` | Catalog `definitionId` or owned `vehicleId`; server price/resale; retain retired rows/history; active cars and cars with installed parts cannot be sold |
| `vehicle_repair` | Owned `vehicleId`, selected supported components, optional eligible benefit; reprice server condition, charge and restore selected components |
| `fuel_purchase` | Owned `vehicleId`, positive integer `milliliters`; enforce capacity; charge and fill atomically |
| `part_install` / `part_remove` | Owned vehicle and physical part; validate sockets, body tags, performance build and workshop rules; charge performance labor where applicable |
| `part_refinish` / `vehicle_appearance` | Owned part/car; validate finish, paint and catalog suspension range; spoiler changes return an aftermarket wing to inventory |
| `vehicle_select` | Owned active vehicle UUID; persisted selection used at bootstrap |
| `vehicle_checkpoint` | Owned car, expected condition revision, nonnegative condition-loss/fuel-consumption intents and bounded distance delta; server derives saved values, never repairs or fills |
| `job_start` / `job_begin` / `job_objective` / `job_end` | Trusted job ID, durable run ID, ordered objective ID and bounded monotonic time/cargo evidence; derive completion payout and bonus from shared rules |
| `race_start` / `race_checkpoint` / `race_complete` | Owned car, authored race and durable attempt; ordered checkpoint acknowledgements, bounded time and finish evidence; derive winner and reward from deterministic rival threshold |
| `refund` | Original owned `PART_PURCHASE` transaction; retire the unsold, uninstalled original item and refund its exact charge once |

`GET /api/player/transactions?cursor=<sequence>` returns up to 50 receipts in reverse sequence order, current wallet balance/revision and a next cursor. It exposes only the session owner's ledger. Summing signed amounts from zero explains the current balance; before/after fields explain each intermediate state.

`GET /api/player/marketplace` returns eight persisted player-specific generated listings, without their hidden condition. Expired listings are replaced. The browser cannot generate the authoritative asking price, seller identity or condition. This is a single-player listing foundation, not a global marketplace.

## Garage and runtime boundary

Vehicle DTOs separate instance UUID/owner-specific state from stable immutable definition IDs. Physical part UUIDs remain distinct from part definitions. A part has at most one installation row, and each occupied slot belongs to that installation. Replacing a multi-slot part removes every old slot atomically; removal returns the part to loose inventory. Owner-composite foreign keys and service lookups reject guessed IDs with `OWNED_RESOURCE_NOT_FOUND`.

`ServerPersistence` translates domain vehicle IDs to owned instance IDs, serializes requests, reuses keys after lost responses and rehydrates the existing `VehicleSession`, `InventorySession` and `JobSession` projections. Concurrent clicks on one quote share an in-flight command and stable key. A successful command whose bootstrap refresh fails retries hydration without issuing another purchase. Local money/ownership mutation APIs reject attempts in authenticated sessions; synchronous local behavior remains only for standalone legacy fixtures/tests.

Repair, pump, parts counter, phone marketplace, performance workshop, wheels/body fitting, paint/stance, active garage selection, jobs and races use this adapter. Additional simulation loss during a request is preserved when the server snapshot arrives. Durable wear is batched every 20 simulation seconds and before commands; the frame loop never awaits the API. Wear checkpoints use optimistic vehicle revisions so a stale tab cannot undo a repair, refill or newer save. This is an honest single-player simulation checkpoint, not authoritative server physics; M6 must replace untrusted activity evidence with its validation protocol. No live transforms, RPM, steering, wheel/suspension samples, traffic, camera or animations are stored.

Save errors appear in a separate HUD alert with a retry action, without changing the game's startup status or claiming success. Network-failed commands retain their keys and can be retried; rejected domain actions are not automatically repeated later when funds become available. Explicit revision conflicts require loading the newest save. Browser shutdown can interrupt a pending save; wait for a command's confirmation before leaving. Browser storage is not a fallback money source.

One live owned instance per vehicle definition is currently allowed by the purchase service to match the existing two-model runtime. Multiple copies require a runtime instance-selection adapter; the relational ownership model already supports them. Acquisition/sale history is retained rather than cascade-deleted. Cosmetic changes currently have no priced respray content rule; do not invent a fee in UI code.

## Shared content and migrations

`src/game-core/jobs/catalog.ts` is the canonical current job catalog, re-exported by the scene adapter. Authored coordinates are content geometry, not persisted live player position. `src/game-core/economy/raceRules.ts` contains current race rewards/checkpoint counts and deterministic rival finish thresholds. A content consistency test simulates the current routes and fails if these thresholds, checkpoints or prizes drift; update the shared rules alongside race tuning.

Migration `20260927040000_economy_garage` adds race checkpoint metadata, durable marketplace listings and a reserved bounded mileage counter. Database compatibility becomes **4**; player save version remains **2** because existing player records retain their meaning. Defaulted fields make the migration compatible with existing saves. Driving mileage reporting is reserved for a later telemetry adapter; the current runtime sends zero distance while retaining actual condition/fuel checkpoints.

```bash
yarn install --frozen-lockfile
yarn db:up
yarn db:deploy
yarn dev:stack
# Separate test database; never reset the development database to run tests:
yarn db:test:up
yarn test:api
yarn test:api:integration
yarn test
yarn typecheck
yarn lint
yarn build
# With dev stack running and Playwright Chromium installed:
yarn test:auth:browser
yarn test:economy:browser
```

Integration coverage includes concurrent/retried purchases, insufficient funds, logical duplicate job/race completion, ownership guessing, installation/removal, incompatible bodies, multi-slot replacement, repairs/fuel, vehicle purchase/sale, marketplace inspection, refunds, rollback after injected ownership failure and ledger reconstruction. Adapter tests cover lost responses, failed hydration after commit, blocked local balance changes, duplicate clicks and additional wear during API calls. Browser verification earns money through commands, purchases through the actual phone UI and verifies money/garage state after a full reload.

Social persistence beyond the money/garage effects remains a separate ticket; client-only social interactions cannot grant a server discount or race unlock until their corresponding validated social rows exist. Legacy local saves still follow the documented fresh-server-save policy in `AUTH_BOOTSTRAP.md`.

Jobs are first accepted and only begin when the local start requirements are met (for example, getting into the car). Active simulation time is monotonic and bounded by server session elapsed time; menu pauses and time spent entering the car do not reduce a job bonus. The server derives rewards from this validated activity evidence and shared content, not a requested payout.

The shared command integrity model and tightened checkpoint contract are documented
in [M3.5 command integrity](M35_COMMAND_INTEGRITY.md).
