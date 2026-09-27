# PAN-13 first social loop

This slice connects existing M3 content to the M3.5 command path. It leaves Chapter 1 beat sequencing to PAN-15. The four persistent contacts are `kyo_barista` (enabling friend and coffee seller), `mang_boy` (mechanic and mentor), `jun_surplus` (Marketplace seller), and `casey` (recurring rival and Kyo Regulars contact). These IDs are save keys; display names and dialogue text can change without changing identity. `kyo_barista` is an established generic label and remains a named-content placeholder. Jun currently appears through the Marketplace seller interaction rather than a placed hub character.

## Play route

1. On foot at Kyo Coffee, order coffee from the barista. Ask for a mechanic introduction. The one-time `introduced_mang_boy` flag produces a referred greeting at Mang Boy's talyer; returning to Kyo gets a different greeting. Conversation at Kyo stays social.
2. At the talyer, promise the oil run. Complete the existing `talyer_oil_errand` job. Mang Boy's trust reaches 60 and his 10% repair benefit becomes usable through the ordinary repair quote. Returning to him acknowledges the help. Basic repair remains available without the discount.
3. An alternate route abandons or fails the accepted oil run. Mang Boy responds to the broken commitment. Apologize, ask for the recovery favor, and complete `talyer_battery_drop`. The authored recovery award restores trust to 58 after a promise and failure, so the same mechanic benefit is reachable. His returning greeting acknowledges the repair of the relationship.
4. Meet Casey at Kyo and finish `barangay_sprint`. Losing is valid: it earns 5 scene points and 2 Casey respect. Return to Kyo for outcome-specific dialogue and congratulate Casey to become a trusted friend. Two more valid losses on that route reach 15 points and 56 respect, meeting the Regular and crew thresholds without a win or upgrade. The oil favor plus one loss also reaches Regular (8 + 5 points); more races can supply respect. At eligibility, request and accept the Kyo Regulars invitation. Casey's wall invitation is a race unlock; membership opens the Midnight Run.
5. Jun's Marketplace seller benefit is a 10% part offer after trust reaches 52 and scene reputation is Regular. Purchases through the existing Marketplace command raise Jun trust by one up to its authored repeat cap. The discount is applied to the actual quote and transaction, not merely dialogue.

## Authoring and integration contract

Add stable identities and reference validation in `social/catalog.ts`, authored branches in `social/conversation.ts`, effects in `social/rules.ts`, and opportunity thresholds in `social/opportunities.ts`. For example, the barista's `introduce_mang_boy` choice records a single server-owned flag, then `mang_referred` checks that flag. The client sends only dialogue/node/choice IDs. `progressSocial` checks the stored cursor and applies the choice in the same player command transaction as its receipt. Jobs, races, repairs, and purchases create social facts on the server from committed gameplay records. React and Babylon only present the resulting social snapshot.

Current values: trust and respect start at 50; Mang Boy's promise adds 2 trust, completed oil favor adds 8, failed favor removes 20, and completed recovery adds 26. Mechanic benefit requires trust 58 and a completed oil or recovery favor. Regular begins at 12 scene points. A valid race finish gives 5 points; a win gives 8. Jun's offer requires trust 52 and Regular. Crew invitation requires Casey trust 50, respect 55, `trusted_friend`, Regular, and nonnegative crew standing. Reward limits and all other tiers remain in `social/reputation.ts` and `social/rules.ts`.

History policy is in [DURABLE_PROGRESSION.md](DURABLE_PROGRESSION.md). PAN-15 can order these beats and replace the generic barista label and Marketplace-only Jun presentation without changing IDs or save contracts. Full Chapter 1 scenes, all archetypes, extra crews, and daily NPC schedules are outside this slice.

## Browser verification record

- `node tests/dialogue.browser.mjs`: the rendered dialogue opens from a hub world zone, supports keyboard selection and gamepad selection/cancel, blocks held movement, and survives scene exit. The added Kyo sequence used Enter to meet the barista and request Mang Boy's introduction; after reload Kyo gave the referred greeting and Mang Boy recognized the referral. The test reported no browser errors.
- `node tests/rival.browser.mjs`: the rendered rival harness completed win, loss, and DNF outcomes, returned to Casey for outcome-specific conversation, reloaded history, and verified rematch and reward caps. Its standalone run passed.
- `node tests/social-unlocks.browser.mjs`: rendered Marketplace, repair, and crew panels applied real local-session prices and eligibility; reload preserved discovery and membership. This harness seeds thresholds and does not drive the complete route.
- `node tests/contacts.browser.mjs`: rendered Contacts navigation, reload, keyboard/gamepad controls, and five viewport sizes passed.
- `node tests/auth.browser.mjs`: the production game canvas loaded with a newly registered server profile, reloaded the same wallet and vehicle, and returned through sign-out/sign-in without browser errors.

The full drive through the production Babylon scene from coffee shop to talyer to race start and back has not been manually completed in one browser session. The isolated API integration suite exercises the corresponding authoritative job, race, social, reward, and reload commands, while the browser harnesses cover their presentation and input paths. That combined evidence does not replace a complete production-scene playthrough.
