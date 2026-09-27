# Persistent first rival (PAN-58 / PAN-13 M3)

Barangay sprint and Pahuway descent share Casey (`casey`) and Casey’s white Kidlat RS (`casey_daily`, build `casey_kidlat_rs`). The original waypoint AI and tuning remain unchanged. Casey stays at the authored Kyo corner interaction (`casey_corner`) after any outcome and after reload.

## History and validation

The existing social event ledger stores one validated start and one terminal result per attempt UUID. History derives attempts, wins, losses, DNFs, latest outcome, meetings, and shared-event flags from that ledger. Repeated delivery is idempotent; conflicting outcomes are rejected. Only the race state machine’s complete checkpoint and finish validation can award a win. Withdrawing, leaving the scene, or reloading an unfinished attempt records one DNF. DNF earns no money, reputation, or race respect.

Casey has distinct authored win, loss, and DNF reactions. First loss gives a return-to-start continuation. A repeatable rematch dialogue points to North street. The respectful choice adds three trust without race respect and can establish friendship; a subsequent win keeps that relationship and hub interaction.

## Rematches and rewards

The authored rematch rule has minimum trust zero and no cooldown. The conversation displays these terms and current history. Actual acceptance still checks the existing race availability, location, vehicle, and social opportunity paths. Poor standing does not block Barangay sprint or basic repair.

Shared limits allow three monetary wins per route and three completed finishes per route for social rewards. Subsequent attempts still update history. Money uses the existing `VehicleSession.earn` API and `race_prize` receipts, counting previous receipts toward the cap. Reopening or reloading cannot grant another receipt for an already rewarded attempt. Reputation and race respect retain their existing shared anti-farming limits.

## Verification

`rivalHistory.test.ts` covers stable identity and unchanged tuning, meeting/start/result deduplication, reload, distinct reactions, friendship, interrupted attempt recovery, rejected checkpoint/identity evidence, and reward caps including pre-existing prize receipts.

`node tests/rival.browser.mjs` drives the real `RaceSystem` and waypoint opponent through win/loss/DNF, the authored hub interaction, actual dialogue UI, reload, and rematch. It checks skipped finish rejection, interrupted reload recovery, friendship, and economy caps. The fixture uses Babylon NullEngine and samples player positions; it does not verify manual driving physics or full-world visuals. Full-world manual driving remains a review check.
