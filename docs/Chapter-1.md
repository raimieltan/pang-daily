# Chapter 1: Just keep it running

This slice follows `Complete-story-so-far.md`. Tickets 3 and 4 describe the same middle sequence. Stable legacy content IDs (`mang_boy`, `talyer_oil_errand`) remain in saves; the mechanic is presented as Tito Jun.

## Authored flow

| Beat ID | Required shared evidence / effect |
| --- | --- |
| `choose_origin` | One server command chooses Family (₱1,200, 65% brakes), Marketplace (₱900, 72%), or Project (₱600, 55%). The origin marker records the choice. |
| `meet_mang_boy` | Talk at the talyer bay. Tito Jun explains the brakes, the repair quote, and the paying errand. |
| `complete_first_job` | Complete the existing oil-and-coolant errand; other jobs cannot impersonate this beat. |
| `meet_casey` | Talk at the KYO counter, meet Sean and Michael, make a social choice, then talk to Casey outside. Listening gives Michael +4 respect; talking builds gives Sean +3 trust. |
| `finish_first_race` | Finish the existing Barangay sprint against persistent Casey. Win and loss both qualify; DNF requires retry. |
| `brake_setback` | Atomically cap the starter car's brakes at 30% when the validated race beat commits. Earlier repairs do not prevent this worn-system failure. |
| `repair_daily` | A paid shared repair of the starter car's brakes after the setback, with current brake condition at least 95%. Switching cars or repairing another car does not qualify. The starter cannot be sold until the chapter is complete. |
| `kyo_recognition` | Return to the KYO counter and take the saved parking spot. Persist scene recognition, a parking relationship flag and `chapter_2_access`. |

The origin screen shows the car, starting cash, and brake condition. The HUD presents an expandable chapter timeline, contextual objective copy, world-space distance/compass guidance, a live recovery reminder, and transient beat captions. A scene camera frames the starter car, talyer, KYO conversations, and the parked-car setback. Dialogue opens before the talyer inspection, and closing it reveals the shared repair panel. Reduced-motion settings suppress camera swings and caption animation. World dialogue, boards, race interactions and the existing repair panel perform the work. These presentation layers do not navigate pages or run their own versions of gameplay systems.

## Recovery and persistence

The walking oil errand needs no cash or fuel and remains repeatable after its social favor is completed. Each new run earns ordinary wages; favor rewards stay consumed. Abandoned/failed jobs and DNF races leave their required beat recoverable. Existing interrupted-race recovery converts interrupted attempts to DNF. All paid repairs use the same wallet, quote, ledger, and vehicle condition system.

Tito Jun's setback dialogue offers a reserve-versus-time decision: work before spending, or pay for brakes alone and leave the other wear for later. Completing the original favor also earns the existing service discount when trust permits. There is no free vehicle reset. Jobs, Marketplace, social visits, repairs and unlocked races remain usable after completion.

Markers and one-time condition/social effects commit in the existing player command transaction, guarded by the player lock and unique marker keys. Commands cannot jump the required prefix or choose another origin. Bootstrap includes explicit beat statuses (`locked`, `available`, `active`, `completed`, `recoverable`) projected from durable evidence; statuses are not a parallel save. Reputation uses the shared social ledger, adding a single authored 12-point recognition award at the ending.

The migration gives established profiles a `legacy` origin marker without changing money or vehicle condition. Old preview completions resume at the setback and earn the final unlock after recovery/recognition. Apply it through the normal API migration workflow before running the new client/server.

## Validation

- `yarn test`: chapter prefix/status and shared-system tests.
- `yarn typecheck` and `yarn workspace @pang-daily/api typecheck`.
- `yarn workspace @pang-daily/api test:integration`: full database integration suite.
- From `apps/api`, after the API build: `node scripts/integration.mjs dist/test/chapter.test.js` runs the chapter acceptance path in a uniquely named disposable local test database.

The acceptance path registers a fresh profile, checks all origins, abandons and retries a job, makes a KYO social choice, abandons and loses races, reloads between major beats and objectives, spends down its money, empties its tank, earns repeat walking wages, repairs, and completes recognition. It verifies duplicate job, race, origin, chapter and recognition commands cannot replay one-time effects.
