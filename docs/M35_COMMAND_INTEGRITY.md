# M3.5 command integrity

## One boundary for progression writes

All progression writes enter `POST /api/player/commands` with
`{ key: <UUID>, action: <strict domain intent> }`. The global SessionGuard resolves
an authenticated principal from the httpOnly session cookie and enforces the CSRF
header/origin policy on unsafe requests. Protected controllers use `@Actor()`;
actor IDs never come from body, query or headers supplied by gameplay.

`runPlayerCommand` is the shared write boundary. It validates shape, numeric ranges,
known catalog references and unknown fields before opening a transaction; locks the
actor's persisted PlayerProfile; then reads current player/version/active-vehicle
state. Locking before the read prevents stale selection/ownership decisions under
concurrent commands. `resolvePlayer` is shared by command, history, marketplace and
bootstrap reads (bootstrap additionally locks User for first-time initialization).
Archived/incomplete/incompatible saves are errors and are never reset implicitly.

Every new command variant must have a strict contracts schema, catalog validation
where applicable, an exhaustive domain handler, owner-scoped reads, and tests.
No handler accepts a desired wallet, inventory, relationship, reputation, crew,
unlock or chapter snapshot. `vehicle_checkpoint` now accepts only nonnegative
`conditionLoss`, `fuelConsumedMilliliters`, and bounded odometer delta plus expected
revision. The server subtracts losses from current saved condition/fuel; values
exceeding current state and negative losses are rejected. Old final-state
`condition`/`fuelMilliliters` bodies are rejected. Deploy matching API/client code.

## Endpoint and field authority audit

| Endpoint / intents | Client supplies | Server authority and ownership |
| --- | --- | --- |
| Auth register/login/logout/session | Credentials; cookie | Credential/session verification, user identity and session rotation/revocation. No progression payload. Logout revokes only the current authenticated session. |
| Bootstrap | No query parameters | Actor-linked save; first initialization derives starter balance/vehicle/social/chapters from pinned content in one user-locked transaction. Repeated reads never grant another starter save. |
| Transactions | Optional numeric history cursor only | Actor's wallet/history, read in a repeatable snapshot. No wallet/player selectors. |
| Marketplace | No parameters | Actor-scoped persisted listings generated from server catalog; owner-locked replenishment is bounded by board size. GET retries do not charge or grant parts. |
| Part/market purchase | Catalog ID or listing ID; optional authored benefit ID | Catalog price/discount eligibility, listing owner/expiry/availability, part provenance, debit and owned item. Client price/condition/grants are rejected. |
| Vehicle purchase/sell/select | Catalog ID or owned vehicle UUID | Actor-linked live vehicles, one live copy per model, catalog sale valuation; active/installed/racing vehicle restrictions. Active selection read occurs after serialization lock. |
| Repair/fuel | Owned vehicle UUID, unique component set, requested fuel quantity, authored benefit ID | Current condition/fuel, catalog prices, repair benefit eligibility, capacity, charge, restored components and revision. No client costs/refills/final condition. |
| Install/remove/refinish/appearance | Owned vehicle/part UUIDs and bounded supported cosmetic choices | Both resources scoped to actor; part installation relations/slot occupancy, catalog compatibility, supported finishes, ride-height bounds, labor cost. Cosmetics are intended player choices, not progression rewards. |
| Wear checkpoint | Expected revision, component loss 0–1, fuel consumption 0–45000 mL, distance delta 0–100000 m | Owned condition parent, revision conflict check, current-state loss limits; cannot improve condition or add fuel. Unknown components and negative losses rejected. |
| Job start/begin/objective/end | Job content ID, actor-scoped run ID, objective ID, bounded elapsed/damage observations, permitted failure outcome/reason | Authored job definition, active job/race exclusion, fuel/cooldown, status/order, monotonic elapsed/damage, wall-clock upper bound, cargo limits, server-computed payout/bonus. No completion/reward amount supplied by the client. |
| Race start/checkpoint/complete | Race content ID, actor-owned vehicle, attempt UUID, ordered checkpoint index, elapsed observation and finish intent | Actor-scoped attempt; server route/gates; sequential checkpoints, monotonic time/wall-clock bound and minimum finish time; rival threshold determines result and catalog reward/repeat limit. Client winner/position/prize/social reward fields rejected. |
| Social introduction/choice | Known dialogue/node/choice IDs only | Actor's NPC/social rows and persisted dialogue cursor; authored effects, eligibility, event fingerprints, repeat caps and one-time choices. No trust/respect/reputation/event-effect arrays accepted. |
| Crew/unlocks/chapter | Authored conversation choices or current chapter beat | Actor-scoped social/crew state, eligibility, one active membership/join limits, server gameplay facts, ordered markers and derived unlocks. No membership/unlock assignment endpoint. |
| Refund | Purchase transaction UUID | Actor-owned purchase, uninstalled/unretired owned part, prior-refund check; original ledger amount is refunded once atomically with retirement. |
| Migration/import | None | Development save reset policy only; browser retirement never submits progression. `import` command is invalid; no import endpoint exists. Any future import must use this transactional boundary and a separately validated contract. |

Every player resource lookup includes the authenticated player's ID, including
parts, vehicles, marketplace listings, purchase transactions, jobs and races.
Inventory/wallet/NPC/crew/unlock identifiers are never independently selected by
clients. Composite FKs link installations, slots, purchases/payouts, favors and
social effects to resources owned by the same player. Owner-scoped misses return
the same 404 whether an ID is absent or belongs to another account.

Client elapsed/damage/wear/distance observations remain observations: this backend
does not attest Babylon positions, checkpoint traversal, collisions or physical
movement. Server state machines bound and interpret them; the model prevents
arbitrary final-state assignment and duplicate rewards, but is not server-authority
over the physics simulation. A competitive anti-cheat system would need an
independent movement/route verification design.

## Idempotency and retry semantics

Keys are UUIDs scoped by `(playerId, 'player_command', key)`. The same key and
normalized action return the saved successful CommandReceipt verbatim, without
running domain code, updating revisions, charging or granting anything again.
A key reused for different content/action/resource is `409 IDEMPOTENCY_CONFLICT`.
Canonical hashing sorts object keys and treats a repair component list as a set;
strict validation rejects duplicate components. Previously stored hashes using
parsed DTO insertion order remain accepted for matching legacy requests.

The player lock serializes concurrent requests, including no-cost social/garage
commands. Domain writes, social effects, chapter advancement, inventory/save
revisions and success receipt insertion commit together. Receipt persistence failure
rolls everything back. There is no success receipt without a committed action and
no committed action without its receipt. A lost HTTP response is recovered by
resending the same key. Idempotency records have no automatic expiry/deletion in
this release. Callers must retain the key while a request outcome is uncertain.
The web client currently keeps retry keys in memory; reload reads committed server
state and does not automatically replay unfinished intents.

Validation, authorization and domain conflicts have no side effects and do not
reserve a key. A failed transaction leaves no success receipt; retry may execute
against current state. Do not automatically retry a definitive 4xx refusal as a
new purchase. Transient 503/network failures should reuse the original key.

Additional natural-resource guards protect reconstructed requests with a fresh key:
job objectives cannot pay a completed run twice; repeated final objectives return
the original payout receipt and conflicting terminal time/damage is rejected;
race attempts settle once and repeated completion returns its original payout,
while conflicting results fail; sold marketplace listings resolve through their
unique acquisition key; social events/source keys and authored one-time decisions
apply once; chapter markers are unique. General part purchases/repairs require the
stable UUID key: a new key is a new intent (buying a second part may be legitimate).

## Transaction review and database backstops

Purchases commit debit + ledger + ownership creation together. Repairs commit debit
+ repair transaction components + condition revision + related social effects.
Job settlement commits run status/objective/cargo + payout + social/reputation/favor
+ chapter progress. Race settlement commits result + payout + social/rival/reputation
+ chapter/unlocks. Refunds commit original part retirement + original-price credit.
Every case includes the command receipt and save revision in the same transaction.

Existing constraints enforce exact append-only ledger arithmetic, wallet/ledger
consistency at commit, nonnegative balances/revisions, composite ownership FKs,
unique payout transaction links, unique part acquisition keys, one active job/crew,
slot uniqueness, social event/source/reputation uniqueness and numeric bounds.
Migration `20260927060000_command_integrity` adds:

- one active race per player and one live vehicle model per player;
- unique domain credit source for job/race rewards and refunds across command keys;
- reputation cap 160, crew join cap 2 and race checkpoint index cap 100;
- successful idempotency records must have an object response and 2xx status;
- player command keys must have UUID shape;
- deferred job/race activity checks, allowing atomic job abandonment before a race
  while forbidding both activities at commit.

Database schema readiness is now version 5. Apply committed migrations before
running updated API code. Application save/content versions are unchanged; the wear
command transport shape is intentionally tightened. Existing invalid rows cause
migration failure for investigation, not silent deletion/reset.

## Errors and verification

Every response error includes `code`, `message`, `kind`, `statusCode`, `requestId`,
and optional validation `fields` / save `recovery`. Kinds distinguish 400 validation,
401 authentication, 403 authorization, 404 owner-scoped not-found, 409 domain or
idempotency/integrity conflict, 429/503 unavailable, and 500 internal failures.
Known database uniqueness/FK/check conflicts are sanitized; known connection,
transaction timeout/serialization errors are retryable 503. Unexpected failures
return 500 without SQL, internal exception messages or payloads. Parser-level bad
JSON gets the same envelope. Logs retain request correlation and error type/code.

API tests attempt cross-player access to vehicles/condition/fuel/appearance, owned
parts/installations, listings/refunds, jobs and race attempts; reject actor/final-state
injection; verify actor isolation for social progression; send concurrent duplicate
keys and same keys across accounts; settle jobs/races with fresh keys; verify the
selection/active-car race under a held player lock; and inject receipt failures after
purchase/repair/job/race writes to assert full snapshot/ledger rollback and safe
same-key retry. Schema tests exercise new and existing constraints. Unit tests cover
validation, actor sourcing, canonical hashes and error normalization.
