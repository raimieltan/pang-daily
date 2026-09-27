# Browser saves → server saves

## Decision: reset development progression, preserve account saves

The pre-account client persisted tab-scoped development sessions. They include a
₱1,000,000 development top-up, granted customization test parts, client-generated
market listings, and no authenticated proof of vehicle/part ownership. Preserving
these values would create money/items/history the server cannot verify. This
release intentionally imports **zero** progression fields. No import endpoint,
import request, or offline import queue exists. Recognizing a version is diagnostic
only; it does not validate or authorize its contents.

Existing account progression is preserved. A first authenticated bootstrap creates
starter state in the existing database transaction, under the user lock, only when
no player exists. Bootstrap retries cannot grant a second starter balance/car.
An incompatible or incomplete server save is an error, never grounds for resetting
that account. Signed-out users see sign-in/registration; no local cleanup occurs
until a compatible server bootstrap has been mapped and hydrated successfully.

## Persistence inventory and field decisions

Source inventory: `src/game/**/*Storage.ts`, `src/state/*Store.ts`, and domain save
schemas. There is **no IndexedDB database/object store** and no additional monolithic
save blob in the current source. Progression keys were written to sessionStorage;
retirement also checks localStorage for copies of the same exact keys. Unknown keys
are never deleted or imported. The key suffix is not necessarily the payload version.

| Key | Storage / payload version | Persisted fields and disposition |
| --- | --- | --- |
| `pang-daily.vehicle-session.v1` | sessionStorage; JSON v1 or v2 | Reset `walletPhp`; all transaction IDs, kinds, sources, timestamps, descriptions, related entities, amounts, before/after balances, vehicle IDs/components; v2 checkpoint balance/sequence; vehicle map keys, component conditions, revision and v2 fuel. Server money, ownership, condition and fuel win. v1→v2 fuel/history conversion remains fixture-only. |
| `pang-daily.inventory.v1` | sessionStorage; JSON v1 | Reset serial; item IDs/content IDs, condition, reveal method, acquisition time/key, origin/shop/seller/listing/receipt/paid price/advertised grade, finish; installed vehicle/slot→item links; retired keys; appearance paint/ride height; stock spoiler removal. Server inventory and ownership links win. No local ID is converted to a server UUID. |
| `pang-daily.marketplace.v1` | sessionStorage; JSON v1 | Deprecate seed, serial and generated listings: ID, template/seller/location, asking price, advertised grade, blurb, hidden condition, posted/expiry time, photo seed. Fetch server listings instead. |
| `pang-daily.job-session.v1` | sessionStorage; JSON v1 | Reset serial, per-job completed/failed/abandoned counters; current run ID/job ID/status/objective index/elapsed time/cargo-loaded/damage/reason. No local completed job can grant a server payout. |
| `pang-daily.social-session.v1` | sessionStorage; JSON v1–v4 | Reset NPC introduction/trust/respect/relationship flags/favor IDs/event IDs; favor status/run links; applied-event IDs/source keys/fingerprints/context/effects and race/job/service history; reputation points/reward-source counts; crew introduction/points/invitation/membership/joins; unlock flags. Derived rival history and reconstructable dialogue presentation come from server social state. v1–v3 upgrade helpers remain fixture-only. |
| `pang-daily.active-car.v1` | sessionStorage; raw content-ID string, no embedded version | Reset browser selection. Use server active-vehicle ownership mapping; runtime selection cache is isolated memory. |
| `pang-daily.audio.v1` | localStorage; unversioned settings object (v1 in key) | Preserve master/music/ambience/effects/dialogue volume, mute, radio, explicit voice, track. Existing reader clamps finite volumes to 0–1, accepts booleans and valid track indexes, and defaults corrupt fields. Never uploaded as progression. |
| `pang-daily.server-transition.v1` | localStorage; JSON v1 | New global retirement marker: `{version:1, policy:"reset-development-progress", completed:true}`. Policy completion, not an account ID/import receipt/authentication credential. |

Race bests, separate chapter state, physics transforms, input, camera, active scene,
modals, graphics settings, and runtime UI state have no separate browser save keys
in this source. Server race/chapter state is reconstructed from bootstrap; transient
state starts fresh. Any historical race evidence inside the social event ledger is
reset with that ledger. All browser fields not specifically preserved above are
ineligible for import, including unknown extension fields.

## Deterministic cases

| Local progression | Server save | Result |
| --- | --- | --- |
| None | None | Authenticate/create account; first bootstrap transaction initializes starter progress. Mark transition complete after hydration. |
| Local only | None | Same starter initialization. Show explicit development reset notice; mark and retire browser progression. No import/payout/ownership reconstruction. |
| None | Existing | Hydrate existing account. Mark transition complete; no reset notice when cleanup is complete. |
| Existing and apparently matching | Existing | Server wins. Do not compare hashes or import; retire local keys. Matching client amounts do not prove ownership/history. |
| Existing and conflicting | Existing | Server wins, regardless of local timestamp, amount, revision or claimed ownership. Retire local keys. |
| Unsupported old/future version | Either | Diagnose unsupported envelope; never restore it; continue with server/starter state. Retire only after hydration. |
| Malformed/corrupt save | Either | Diagnose invalid JSON/envelope; never pass it to domain constructors. Continue server bootstrap without crashing. Retire after hydration. Known envelopes with corrupt/forged contents are equally ineligible for import. |
| Server bootstrap/hydration fails | Any | Preserve all browser data and existing account data. No completion marker/cleanup. Retry bootstrap/sign-in after fixing the connection/version. |
| Transition marker write fails | Hydrated | Preserve every legacy key. Continue using server; show storage warning and Retry browser cleanup. |
| Marker succeeds, cleanup fails | Hydrated | Keep completion marker and server state. Show cleanup warning. Retry removes only remaining known keys, without any server mutation. |
| Request/transition retried | Any | There is no migration request. Bootstrap initialization is transactional/idempotent; client retirement reuses its exact policy marker and never imports/rewards. |

## Sequencing, integrity and recovery

`playerService.bootstrap` fetches and validates the server aggregate, maps it to
domain state, rejects aborted/stale/ended-session responses, hydrates meta, then
calls retirement. Browser values are never included in HTTP bodies. Thus arbitrary
content IDs, numeric ranges, relationships, duplicate items and ownership claims
have no route into canonical state: every proposed local field is rejected by the
reset policy. Import validation is intentionally inapplicable; adding a future
preservation path requires a new server-validated, transactional import contract.

Retirement detects each known envelope in both stores. It persists and reads back
the exact policy marker **before** deleting anything. It removes only inventoried
progression keys, keeps audio/unrelated data, catches per-key failures, and preserves
values concurrently changed since inspection. If storage is blocked, bootstrap
still succeeds. Enable storage and use Retry browser cleanup, or reload: the next
successful bootstrap retries cleanup. No need to delete/reset the account.

The marker survives reload, sign-out and account changes because this retirement
policy applies to the browser, not to one account. A missing/forged marker cannot
cause imports; server saves never read it. A leftover/regenerated development blob
is cleaned on a later bootstrap without replaying progression changes. Other open
tabs have their own sessionStorage; each is retired on its next bootstrap. Clearing
all browser storage may remove the marker, but rerunning retirement is harmless.

## Development workflow and compatibility retirement

The sign-in and registration UI communicates the intentional reset. After loading,
a notice reports discarded development progress or failed cleanup; dismissal is
presentation-only. Standalone browser test fixtures and unauthenticated `next dev`
runtime retain the old loaders explicitly marked compatibility-only. These are
not an import source. Test fixtures should use their own tab/origin when retention
is desired; signing into that tab retires its legacy progression keys.

Production runtime requires server bootstrap and an injected persistence factory.
Authenticated runtime uses isolated in-memory presentation storage; it never falls
back to sessionStorage progression. Audio preferences remain local. Server state
is canonical even if retirement is blocked, interrupted, retried or its marker is
manually removed.

Tests cover known older envelopes, malformed and unsupported versions, fresh users,
matching/conflicting/forged values, retry idempotency, marker and cleanup failures,
concurrent replacement, storage denial, and failed bootstrap followed by recovery.
