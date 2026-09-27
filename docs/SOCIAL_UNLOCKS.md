# Social opportunities (PAN-57 / PAN-13 M3)

`src/game-core/social/opportunities.ts` authors the rules. `evaluateEligibility` is a pure evaluator returning eligibility, persisted discovery, and authored readable unmet requirements. Requirements reuse dialogue's all/any predicates for relationships, reputation, favors, crew standing/membership, and flags, with NPC event history supported as a separate requirement. Evaluating a rule never spends money or changes ownership.

Discovery is a permanent record in the existing social save's `unlocks` table. `SocialSession.discoverOpportunities` commits new discoveries before the runtime emits their notices. Repeated evaluation, closing/reopening panels, restoring a save, and losing/recovering standing do not notify again. The HUD queues simultaneous notices.

| Opportunity | Requirements | Standing loss |
| --- | --- | --- |
| Casey's invitation to The wall | Meet Casey at Kyo; Regular reputation (12 points) | Discovered race access remains available. Undiscovered access checks current requirements. |
| Jun's suki offer | Jun trust ≥52; Regular reputation | Discovery remains; the 10% part discount suspends when either threshold is lost. Ordinary Marketplace purchases remain available. |
| Mang Boy's repair benefit | Trust ≥58; completed oil favor or recovery favor | Discovery remains; the 10% repair discount suspends if trust drops. Reputation is not a requirement. Basic repairs and free vehicle inspection remain available. |
| Kyo Regulars invitation | Casey trust ≥50, respect ≥55, trusted-friend flag; Regular reputation; crew standing ≥0 | Discovery remains; invitation acceptance suspends when any requirement is lost. Accepted membership remains intact; expulsion is outside this slice. |

Earn reputation from valid race finishes or the repeatable ice run. Talk to Casey before or after racing, congratulate Casey after the Pahuway race, then request the crew invitation and choose to join. Finish Mang Boy's oil favor (or recovery favor) for his service benefit. Two purchases from Jun earn the required seller trust; Jun's eligible listings show his offer in their detail panel.

Both PAN-33 race start paths (bridge command and world interaction) call the same fresh eligibility check before positioning the car or beginning countdown. The existing checkpoint, result, replay, and reward paths remain responsible for the race.

Marketplace's existing purchase handler receives the selected offer ID, validates listing availability/expiry and current eligibility, then prices from the original asking price. A stale benefit rejects before wallet payment and delivery. PAN-11 payment and PAN-51 inventory remain the only ownership/payment paths. Ledger recovery uses the actual debit for the inventory's paid-price metadata. The offer never discloses actual condition: the existing explicit paid mechanic inspection is required.

Repair quotes show discounted lines and the benefit label. Execution validates revision and selected components, rechecks the quoted benefit, and recomputes the same lines from current condition and authored pricing. A lost quoted benefit rejects without payment or repair; inspect again for the ordinary quote. Reopening or loading always starts from base prices, so discounts cannot accumulate. Prices round to centavos and clamp at zero. The shipped 10% rules keep positive payable amounts compatible with existing economy transactions.

Verification commands:

- `yarn test`: domain boundaries, stale/expired/rejected purchases, discounted ledger recovery, repair price consistency, crew acceptance, repeatable job payment, and discovery deduplication. `socialRaceAccess.test.ts` starts the existing Babylon race system under `NullEngine` through both entry paths.
- `yarn typecheck` and `yarn lint`.
- `yarn next build --webpack`: production build passes. Default `yarn build` fails on this environment's Turbopack/PostCSS worker port-binding restriction (`Operation not permitted`), including an escalated attempt.
- `node tests/social-unlocks.browser.mjs`: actual React panels and bridge/session handlers; stale seller rejection, paid purchase, hidden condition until explicit paid inspection, repair quote/payment agreement, crew invitation/acceptance, and no rediscovery after reload. Its fixture seeds social thresholds and substitutes stationary workshop access; it does not exercise driving to the talyer or driving The wall in a rendered world.

Persistence follows the repository's existing tab-scoped session storage. This slice adds no backend, separate save format, new race route, or replacement economy. Manual driving and rendered-world navigation remain a separate gameplay verification step.
