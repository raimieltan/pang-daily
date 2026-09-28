# Iloilo scene recognition balance

Scene recognition is separate from each NPC's trust, respect, and relationship flags. The thresholds and reward limits are authored in `src/game-core/social/reputation.ts`. Both the HUD and content gates use `getReputationProgress`; gates can use `meetsReputationTier`.

| Tier | Minimum points |
| --- | ---: |
| Unknown | 0 |
| Regular | 12 |
| Known | 30 |
| Respected | 55 |
| Feared | 90 |
| Local Legend | 130 |

New profiles start at 0 (Unknown). Each threshold is inclusive: 11 is Unknown and 12 is Regular. Points are whole numbers bounded to 0–160. Every applied event recalculates the tier, so positive and negative changes can promote or demote immediately. A tier notification is emitted only when the tier actually changes; replaying a consumed event emits nothing. At the top tier, next-tier progress is complete and there is no next threshold. Feared describes recognition for driving and does not grant hostility, violence, or crew membership.

| Available action | Scene points | Repeat policy |
| --- | ---: | --- |
| Finish a valid race in any of the five calendar routes, including a loss | +5 | First 3 finishes per route |
| Win a valid race in any of the five calendar routes | +8 instead of +5 | Same 3 finishes per route |
| Complete Kyo's ice-run job | +4 | First 2 completed runs |
| Complete Tito Jun's parts-help errand | +8 | Once |
| Complete Tito Jun's recovery favor after a broken commitment | +6 | Once |
| Fail / abandon the parts-help errand | −3 / −2 | Each distinct accepted run that ends this way |
| Fail / abandon the recovery favor | −2 / −2 | Each distinct accepted run that ends this way |

Positive repeat counts are stored by source in the social save and survive reload. A valid event after its source limit is still recorded, with zero scene reward. Distinct race attempts and job runs have distinct IDs; replaying the same result never pays twice. A negative favor consequence is not suppressed by the positive reward limit. Wealth, car value, repair or Marketplace purchases, greetings, idle proximity, and opening menus do not award scene points.

The starting Kyo block lap and Tito Jun's oil errand are available before any recognition gate. A first valid block-lap loss earns 5; completing that errand earns 8, reaching **13 points and Regular**. Three valid finishes of the starting lap also reach 15. Neither path requires a race win or content gated by Regular. The five authored race routes can supply at most 120 points through wins, and the available job and favors supply another 22, making the Local Legend threshold reachable without uncapped repetition. Later content can add sources to this table and configuration while keeping the same projection and ledger.
