# M2 jobs

Jobs are data (`defineJob`): id, type, title, description, peso payout, the interaction ids that
offer them, start requirements, ordered objectives, and optional time limit and cargo rules.
`jobs.ts` holds the pure transitions (`available → accepted → active → completed | failed`,
or `abandoned`); `JobSession` owns the single run in progress, per-job outcome counts and saving.

Only `JobSession.completeObjective` pays, via `VehicleSession.earn` (PAN-11) with kind
`job_payout`, source `job:<type>` and the run id as `relatedEntityId`. Failed and abandoned runs
never pay. On load, a run whose payout is already in the ledger is settled as completed, so a lost
job save cannot pay twice. The run in progress (objective, elapsed time, cargo damage) persists in
the tab's session storage under `pang-daily.job-session.v1`; timers are flushed about once a second.

Scenes use `game/jobs/JobSystem`: `browse_jobs` zones open a board, the current objective is
offered as a `job_objective` interaction (a circle, in the objective's mode, with a speed cap in the
car), impacts feed cargo damage, and joining a race fails the run. React receives `jobBoard`,
`jobState` and `jobEnded`, and sends `acceptJob`, `abandonJob` and `dismissJobBoard`. Every
command is rechecked against the player's position.

New job types (errand, hatid) add definitions and, if needed, objective kinds. The objective list,
lifecycle, payout and HUD stay the same. The first job is `KYO_ICE_RUN` in `game/jobs/hubJobs.ts`,
taken from the corkboard on Kyo Coffee's terrace.
