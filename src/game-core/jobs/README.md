# M2 jobs

Jobs are data (`defineJob`): id, type, title, description, peso payout, the interaction ids that
offer them, start requirements, ordered objectives, and optional time limit, cargo and bonus rules.
Each objective sets its own mode (in the car and stopped, or on foot) and area.
`jobs.ts` holds the pure transitions (`available → accepted → active → completed | failed`,
or `abandoned`); `JobSession` owns the single run in progress, per-job outcome counts and saving.

Only `JobSession.completeObjective` pays, via `VehicleSession.earn` (PAN-11) with kind
`job_payout`, source `job:<type>` and the run id as `relatedEntityId`. The amount is `jobPayout`:
the base payout, plus the `bonus` when the run finished within its time and/or damage limits. Both
go in one ledger entry. Failed and abandoned runs
never pay. On load, a run whose payout is already in the ledger is settled as completed, so a lost
job save cannot pay twice. The run in progress (objective, elapsed time, cargo damage) persists in
the tab's session storage under `pang-daily.job-session.v1`; timers are flushed about once a second.

Scenes use `game/jobs/JobSystem`: `browse_jobs` zones open a board, the current objective is
offered as a `job_objective` interaction (a circle, in the objective's mode, with a speed cap in the
car), impacts feed cargo damage, and joining a race fails the run. React receives `jobBoard`,
`jobState` and `jobEnded`, and sends `acceptJob`, `abandonJob` and `dismissJobBoard`. Every
command is rechecked against the player's position.

A hatid passenger is cargo with `kind: 'passenger'`: aboard between the `load` and `unload`
stops, no NPC needed. Impacts wear their patience the same way they damage goods, and an `unload`
stop is refused unless the passenger is aboard.

Hub jobs live in `game/jobs/hubJobs.ts`, one board each:

| Board | Job | Type | Shape |
| --- | --- | --- | --- |
| Kyo Coffee terrace | `KYO_ICE_RUN` | delivery | Suki 24 → Kyo in the car, 4:00, fragile |
| Talyer waiting area | `TALYER_OIL_ERRAND` | errand | on foot at both ends (Bahandi kiosk → bay), no clock |
| Talyer waiting area | `TALYER_BATTERY_DROP` | errand | load at the apron, 5:00, needs 6 L of fuel, hand over on foot on the main road shoulder |
| Bahandi kiosk | `HATID_SUKI_HOME` | passenger | Suki 24 → Home, ₱100 tip under 2:00 with ≤15% bumps |
