# M2 marketplace (Baligya)

`MarketplaceSession` is the listing authority (TECH_ARCHITECTURE §18), serverless like
`VehicleSession`/`JobSession`: it generates listings, keeps each part's actual condition hidden, and
charges the PAN-11 wallet. Only views (`listingView`, `OwnedPartView`) leave it; views are built
field by field, so the hidden `actualCondition` never reaches React until it is revealed.

Listings come from the shared `PART_TEMPLATES` (`game-core/parts`) and `SELLERS` (`sellers.ts`), with a seeded mulberry32 roll per
`seed ^ serial`. Each listing has an asking price, seller, location/meet-up, advertised grade and blurb,
and an expiry. Honest sellers grade from the actual roll, and the rest bump it 1–2 grades (seller
`honesty` is hidden, while `rating`/`sales` hint at it). About 8% of listings undersell. Prices follow
the *advertised* grade, which is where the gamble comes from.

The board holds `BOARD_SIZE` (8) listings that each last 8–25 min of wall-clock time. `sync()` drops
expired listings and posts new ones. The first fill staggers expiry so the board turns over gradually.
`MarketplaceService` (runtime-level, because the phone works in every scene) syncs at 1 Hz even with
the phone closed.

`buy(listingId)` spends kind `parts_purchase`, source `marketplace:<sellerId>`, with the listing id as
`relatedEntityId`. It then adds the part to the shared `InventorySession`, keyed
`marketplace:<listingId>` and carrying the hidden condition, and takes the listing down. The
marketplace keeps no parts list of its own. There is no haggling or meet-up travel yet.

`inspect(itemId, method)` spends `MECHANIC_INSPECTION_PHP` (₱150), kind `part_inspection`, and calls
`inventory.reveal`. It works on any inventory item. The verdict (`better | as_described | oversold |
scammed`) compares the result with the listing's advertised grade. Scenes lend a `Workshop` through
`SceneContext.market.useWorkshop`. The hub lends the talyer via `talyerRejection`, so the car must be
at the talyer and the player on foot.

Crash safety works like jobs. The wallet saves first, then the inventory, then the market. On load,
ledger entries are replayed: a purchase whose listing is still on the board is delivered again (the
keyed add makes this safe), and a paid inspection whose item is still unrevealed is revealed. Saves use the
storage key `pang-daily.marketplace.v1`.
