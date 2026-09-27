# M2 economy balance

Authoritative data: `src/game-core/economy/balance.ts`. Money is PHP; arithmetic remains integer centavos. Runtime UI and API use the same data. Existing saves retain their wallet, fuel, condition and transaction history; changed prices affect future transactions.

## Baseline and planning targets

Fresh M2 profile: **₱5,000**, a **45 L** tank, and the authored worn Dalagan (engine .72, transmission .78, brakes .65, suspension .55, tires .50). Cash includes a repair buffer for the inherited car; it is not an upgrade allowance. A full tank is inherited once, not replenished by loading a save or starting a job. The opening repair decision is brakes/tires versus a cosmetic purchase versus saving for suspension.

Ordinary-job planning income: **₱350 net per successful loop**, conservatively below most driving-job payouts. Counts below start from no savings, exclude starting cash, and round up. Use `jobsForCost` to recalculate them.

| Item | PHP band / assumption | Ordinary jobs |
| --- | --- | --- |
| Delivery | 340–1,200 including conditional tips | — |
| Errand | 300–650 | — |
| Parts pickup | 800–1,500 | — |
| Passenger / hatid | 380–940 including conditional tips | — |
| Low-stakes race win | 400–700; loss/DNF pays zero | — |
| Fuel | 65/L; .20 L/km, up to .30 at full throttle, no idle tax | — |
| 5 L reserve / top-up | 325 | 1 |
| Full 45 L tank | 2,925; normally buy small quantities | 9 |
| Light service/repair | 150–500 | 1–2 |
| Medium repair | 900–2,000 | 3–6 |
| Severe repair | 3,000–5,000 | 9–15 |
| Fluids / oil / tune-up | 350 / 900 / 1,200 | 1 / 3 / 4 |
| Common usable used part | 600–2,000 asking | 2–6 |
| Desirable used upgrade | 2,500–6,500 asking | 8–19 |
| Aspirational used upgrade | 8,000–14,000 asking | 23–40 |
| Mechanic inspection | 150 per unrevealed owned part | 1 |

Repair bands are targets for the five serviced systems, not flat charges. At uniform .96/.75/.30 condition, costs are approximately ₱260/₱1,570/₱4,340 respectively on the Dalagan. Component selection matters: the fresh profile's brakes plus tires cost ₱740 before driving wear, and its entire initial service quote is ₱2,120. Body/electrical and later component simulations are not included in these repair bands. At zero health across the five systems the full bill is ₱6,200; you can still drive slowly once fueled, and repair selected systems first.

| Serviced system | Full repair base PHP | Wear loss/km before load |
| --- | --- | --- |
| Engine | 1,800 | .0020 |
| Transmission | 1,400 | .0015 |
| Brakes | 700 | .0025 |
| Suspension | 1,100 | .0020 |
| Tires | 900 | .0045 |

Parts scarcity adds `(1 - partsAvailability) × .30`; each selected component rounds up to ₱10. Throttle, brakes, slip, handbrake and racing multiply wear. Collisions add condition loss immediately. Maintenance services charge the listed cost; they **do not** restore condition, so do not count an oil change as a substitute for a component repair.

## Job economics

Target minutes include reaching the board, loading, normal travel and returning to earning facilities. Kilometer budgets include that return. They are authored validation assumptions, not measured telemetry or enforced minimum completion times. The simulation advances the actual job timer for half the loop budget (the remainder is preparation/return), respecting existing time limits. Test the assumptions against real driving when routes or walking speeds change.

Baseline driving: 10 m/s, throttle .5, brake .1, slip .05, no handbrake, grounded. Operating costs below include replacement fuel and the incremental repair quote from full health, with per-component rounding. This reserves future wear even if the player postpones paying for it.

| Job | Loop min | Travel km | Base + possible tip PHP | Fuel + wear PHP | Base net PHP/min | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| kyo_ice_run | 5 | 0.8 | 450 + 0 | 63.00 | 77.40 | low |
| kyo_pastry_round | 7 | 1.2 | 560 + 0 | 69.50 | 70.07 | low |
| kyo_overlook_catering | 12 | 6 | 950 + 250 | 227.50 | 60.21 | medium |
| kyo_bean_pickup | 18 | 12 | 1500 + 0 | 435.00 | 59.17 | medium |
| talyer_oil_errand | 5 | 0 | 300 + 0 | 0.00 | 60.00 | low |
| talyer_battery_drop | 7 | 1.2 | 650 + 0 | 69.50 | 82.93 | low |
| talyer_alternator_drop | 8 | 2 | 600 + 0 | 102.50 | 62.19 | medium |
| talyer_rims_pickup | 12 | 5 | 800 + 0 | 201.25 | 49.90 | medium |
| hatid_suki_home | 5 | 0.6 | 380 + 100 | 59.75 | 64.05 | low |
| fuel_lpg_delivery | 5 | 0.6 | 340 + 0 | 59.75 | 56.05 | low |
| hatid_overlook | 12 | 6 | 740 + 200 | 227.50 | 42.71 | medium |

All base payouts cover fuel and light wear. The highest base net/minute stays within 2× the lowest. Tips reward smooth or timely work, not guaranteed income. Long jobs require fuel for full-throttle travel plus .5 L reserve: catering 2.3 L, beans 4.1 L, battery .86 L, alternator 1.1 L, rims 2 L, overlook passenger 2.3 L. Jobs with no preflight fuel gate still consume fuel while driving; choose the walking errand when empty.

Race comparison: budget four minutes including access, staging and return, 1 km of travel, 60% win probability, racing wear ×1.5. A ₱400 race produces roughly ₱40–50 expected net/minute, below a ₱300 five-minute recovery errand. One win can pay more quickly, but one collision or loss can wipe it out. Current race rules also cap paid wins at **three per route**, across local reward history and durable server results; later rematches are not unlimited income. Actual race finish times are much shorter than the full activity budget. This is a finite early windfall, not a claim that a 20-second sprint has low instantaneous PHP/minute. Rewards/checkpoint validation and attempt IDs remain authoritative; no reward-reset shortcut is added here.

## Used parts and upgrade tradeoffs

Catalog ranges in `PART_PRICE_RANGES` are pre-discount prices for a nominal 100% part. Sellers use **advertised** grade (like-new 1.00, good .82, fair .60, as-is .38), a ±5% asking spread, and ₱50/₱100 rounding. They do not price from guaranteed actual condition. Existing seller honesty and per-part condition ranges remain intact. A cheap as-is listing is not equivalent to a healthy common part.

Representative usable prices: rubber lip ₱600–1,500, stock shocks ₱1,200–2,000, lowering springs ₱1,500–3,800, adjustable coilovers ₱4,000–9,000, stock engine/gearbox ₱8,000–14,000. Inspecting costs ₱150; budget **20% of asking price** for a disappointing purchase/replacement. This is a planning reserve, not an automatic surcharge or guaranteed protection. At the upper asking targets, all-in planning budgets are common ₱2,550 (8 jobs), desirable ₱7,950 (23 jobs), aspirational ₱16,950 (49 jobs). Performance installation labor is additional and also configured in `balance.ts`; exterior fitting remains free in this slice. Later EFI long blocks and elaborate supporting builds above these targets remain longer-term content.

At minute 43, ₱7,587 can buy a ₱6,500 attractive upgrade, leaving just ₱1,087 before inspection/labor/risk reserve. This cannot simultaneously fund a ₱4,340 severe repair. Saving the money preserves operating resilience; buying the upgrade commits several more earning loops. The severe repair alone represents 13 conservative ordinary loops (roughly 65–100 minutes), meaningfully delaying the upgrade without requiring days of grinding. Repair selected safety/drive components rather than assuming every visit must restore all systems.

## Repeatable recovery, including a stranded empty car

Supported minimum: **₱0, 0 L, all five serviced components at 0**, with a mobile player on traversable roads and the ability to exit the car. Walk to the talyer board, accept `talyer_oil_errand`, walk to the Bahandi kiosk, collect the already-paid oil/coolant and walk back. No purchase, vehicle condition, fuel, vehicle proximity, timed deadline or social benefit is required. Walking access and objectives use the existing game interaction system.

The job pays ₱300 every legitimate completion. Three loops yield **₱900** without consuming fuel or worsening vehicle condition. Walking to and finishing recovery requires **0 L**; trips are fully on foot, including the return to the board. This is ordinary work, not free emergency cash.

An empty stationary car (≤.5 L) can receive a **paid reserve can**, bought by walking to an authored pump even if the car is far away. Requests cap at 5 L, costing ₱325, leaving **₱575 after three loops**. Returning to the car is on foot; refueling applies at purchase as an explicit M2 abstraction rather than a new carried-container simulation. The normal wallet `fuel_purchase` transaction records the charge. Repeat payment with the same consumed quote cannot charge twice. Further remote purchases are blocked once the tank exceeds the empty threshold. At a pump with the car nearby, normal refueling continues; an empty-tank purchase is capped to the same small reserve quantity.

There is no emergency cash grant, debt, condition reset, free tow or recurring bailout. Condition modifies performance but leaves nonzero power/grip/brakes for the stock car; no repair threshold blocks this job or slow travel back to service. Five liters covers the local baseline jobs many times over. Complete ordinary driving jobs and repair selected systems to rebuild resilience. A walking player physically stuck outside traversable space is a world-navigation problem outside this economy guarantee.

## Deterministic 75-minute run

Run `yarn test src/game-core/economy/balance.test.ts src/game/maintenance/FuelSystem.test.ts`.
`representativePlaythrough()` executes real job settlement, fuel purchases, repair quotes,
validated race payment, used listing purchase and mechanic inspection. Seed 42 supplies the listing metadata; the representative listing's configured asking price is ₱1,600, advertised good but actual **55%** (oversold). It expires after the itinerary. No free repair or fuel refill is inserted.

Health columns: engine / transmission / brakes / suspension / tires. Checkpoints below are exact for the scripted inputs, not random targets.

| Step | Minute | Wallet PHP | Fuel L | Condition | New transactions PHP |
| --- | --- | --- | --- | --- | --- |
| fresh profile | 0 | 5000 | 45.000 | 0.7200 / 0.7800 / 0.6500 / 0.5500 / 0.5000 | starting_cash +5000 |
| kyo_ice_run | 5 | 5450 | 44.800 | 0.7172 / 0.7782 / 0.6485 / 0.5483 / 0.4955 | job_payout +450 |
| brakes, tires and fuel | 7 | 4697 | 45.000 | 0.7172 / 0.7782 / 1.0000 / 0.5483 / 1.0000 | repair -740, fuel_purchase -13 |
| talyer_oil_errand | 12 | 4997 | 45.000 | 0.7172 / 0.7782 / 1.0000 / 0.5483 / 1.0000 | job_payout +300 |
| hatid_suki_home | 17 | 5377 | 44.850 | 0.7151 / 0.7769 / 0.9989 / 0.5471 / 0.9966 | job_payout +380 |
| first race win | 21 | 5777 | 44.600 | 0.7098 / 0.7735 / 0.9961 / 0.5439 / 0.9882 | race_prize +400 |
| kyo_pastry_round | 28 | 6337 | 44.300 | 0.7056 / 0.7708 / 0.9938 / 0.5414 / 0.9814 | job_payout +560 |
| talyer_battery_drop | 35 | 6987 | 44.000 | 0.7015 / 0.7681 / 0.9916 / 0.5389 / 0.9747 | job_payout +650 |
| talyer_alternator_drop | 43 | 7587 | 43.500 | 0.6945 / 0.7636 / 0.9878 / 0.5347 / 0.9634 | job_payout +600 |
| talyer_rims_pickup | 55 | 8387 | 42.250 | 0.6770 / 0.7523 / 0.9784 / 0.5242 / 0.9353 | job_payout +800 |
| hatid_overlook | 67 | 9327 | 40.750 | 0.6560 / 0.7388 / 0.9672 / 0.5116 / 0.9016 | job_payout +940 |
| talyer_oil_errand | 72 | 9627 | 40.750 | 0.6560 / 0.7388 / 0.9672 / 0.5116 / 0.9016 | job_payout +300 |
| used shocks and inspection (oversold) | 75 | 7877 | 40.750 | 0.6560 / 0.7388 / 0.9672 / 0.5116 / 0.9016 | parts_purchase -1600, part_inspection -150 |

Final wallet: **₱7,877**, after buying and inspecting the part. Reserving a full current
repair quote (₱1,740) and replacing 4.25 L of used fuel (₱276.25) still leaves
**₱5,860.75**, above the starting wallet. The installed car condition is unchanged by
buying shocks: this path buys and inspects them, then saves for fitting/other work.

Normal-performance bands: through the first race, wallet ±₱250; subsequent checkpoints
±₱750 cumulatively; fuel ±1 L; each condition component ±.03. These permit tips, small
route variation and light contact, with the same purchase decisions and race win. A lost
first race shifts later wallet checkpoints down ₱400 and is included in the later band.
Skipping repairs or buying a different part changes the scenario, rather than proving a
variance failure. Significant crashes intentionally exceed the normal-performance band.

## Tuning changes and repeat procedure

- Kept fresh cash ₱5,000, inherited 45 L, fuel ₱65/L and .2–.3 L/km; these preserve existing saves and baseline fixtures.
- Reduced full component repair bases from engine 6,000→1,800; transmission 4,500→1,400; brakes 1,800→700; suspension 3,000→1,100; tires 2,200→900.
- Reduced each routine wear/km rate to one quarter of the former rate. Kept impact losses unchanged, preserving expensive reckless crashes.
- Raised Pahuway passenger base 720→740 to bring all base job net/minute rates inside the 2× spread target. Other payouts, tips, maintenance charges and used-part ranges remain at their authored values, now consolidated.
- Replaced 5–18 L preflight job gates with full route fuel plus reserve, using .30 L/km. Added the paid empty-car reserve-can access path and quantity cap.
- Removed duplicate runtime race reward literals. Both routes and durable race validation consume `RACE_REWARDS`. Retained existing per-run/attempt/listing deduplication and paid-win limits.

To rebalance Chapter 1/M3: edit starting cash/fuel, `JOB_BALANCE` payouts, bonuses, loop
minutes and travel budgets, `SERVICE_BALANCE`, wear load multipliers, `RACE_REWARDS`,
`PART_PRICE_RANGES`, advertised-grade pricing, inspection/labor fees or reserve targets.
Keep route/time assumptions explicit. Re-run the scripted scenario and regenerate these
tables; update exact expected checkpoints only after investigating the changed economics.
Check no-bonus net income, best/worst activity rates, repair delay, used-part risk budget,
zero-funds recovery, and the existing reward/durable transaction tests. Do not change
only the on-screen numbers.

Automated coverage asserts all job types have matching tuning, positive net operating
income, route fuel reserves, activity rate spread, severe-repair planning jobs, reckless
losses, race expected income, used-part risk budgets, near-zero/low-fuel/damaged combinations,
paid reserve-can cap/access/single charge, a replayed race reward after reload, exact wallet,
fuel and final-condition checkpoints, and positive wealth after reserving all remaining
service/fuel liabilities. These are deterministic model tests; the loop-time and route
budgets still need confirmation against human play when world content changes.
