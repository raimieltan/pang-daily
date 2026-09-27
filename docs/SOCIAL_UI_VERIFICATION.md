# PAN-60 — Contacts and social feedback

The phone now has a Contacts entry alongside Baligya. P or gamepad Start opens Contacts; Escape/B closes it. The runtime pauses gameplay while this view is open and restores the previous pause state on close. Held gameplay controls must be released before they can move the player again.

Contacts is read-only. Introduced people show their name, authored roles, known meeting place, separate trust/respect summary and scores, latest shared event, up to eight recent events, and outstanding favors with follow-up directions. Failed favors point back to a conversation at the talyer; completed recovery removes the old broken commitment from the outstanding list. Crew standing, invitation, and membership have their own section. Scene reputation uses the existing tier/progress selector.

Unintroduced people are absent. Known opportunities use vague authored descriptions until discovery; unmet requirements come from the existing eligibility evaluator. Only discovered rewards have their real names. No listing, hidden part condition, raw relationship flags, event fingerprints, or future story branches cross this presentation boundary. The coffee shop’s interactions are unchanged; following up still means talking to people and using existing gameplay systems.

`game-core/social/presentation.ts` owns public copy and projections. `SocialOpportunityService` publishes changed projections and batches from the existing authoritative session at most once per second. A single race’s relationship, recognition, tier, and discovery changes appear together. Event/source IDs deduplicate changes; reload establishes a baseline rather than replaying history. React receives these through typed game events and sends phone/dialogue intents through existing commands. It cannot grant benefits or change social scores.

The dialogue and contacts panels provide focus capture/restoration, visible focus, scrolling, and bounded viewport sizing. Contacts supports Tab and gamepad D-pad navigation; dialogue keeps its existing runtime keyboard/gamepad selector. Gamepad left/right scrolls Contacts.

## Verification performed

- `yarn test`: 83 files, 552 tests passed, including public projection/privacy, trust/respect divergence, favor recovery, grouped race feedback, reload baseline, change-only publishing, and input pause/release checks.
- `yarn typecheck`: passed.
- `yarn lint`: no errors; one pre-existing unused `yaw` warning in `WorldChunk.ts`.
- `yarn next build --webpack`: production build passed. Default Turbopack build could not run its CSS worker because port binding was denied, including after an escalation retry.
- `node tests/contacts.browser.mjs`: empty/populated contacts, favors/crew, vague locked rewards with actionable requirements, multiple changes from one race, duplicate race rejection, reload, keyboard/gamepad, scrolling, long names/history, dialogue focus restoration, and no browser errors. Viewports: 1440×900, 1280×720, 800×600, 390×844, 667×375.
- `node tests/dialogue.browser.mjs`: existing world interaction, conditions, stale choices, duplicate confirmation, reload, keyboard/gamepad cancellation, held-input quarantine, and scene exit checks passed.
- `node tests/social-unlocks.browser.mjs`: seller purchase/inspection, lost eligibility, repair quote/payment, crew invite/accept/decline/leave/rejoin, reload, and poor-standing basic repair passed. The fixture now introduces its mechanic/seller before expecting their discoveries, and reads grouped feedback.
- `node tests/contacts-runtime.browser.mjs` against the production game at port 3004: actual HUD entry, runtime open/close, keyboard focus restoration, and desktop/mobile layout passed without browser errors. Desktop/mobile screenshots were visually reviewed.

No unresolved PAN-60 acceptance criteria were found in these checks. Gamepad verification uses an emulated standard controller; physical hardware was not manually exercised. This does not verify PAN-13’s entire integrated campaign scenario or close PAN-60/PAN-13 in Linear.

References read: repository `AGENTS.md`, installed Next.js client/server guide, PAN-13/PAN-60, completed PAN-56/PAN-57/PAN-59 dependencies, and the Linear project’s STORY CANON, GAME VISION, and TECH ARCHITECTURE.
