# Banwa Auto Supply

Walk to the AUTO PARTS counter beside Tito Jun's talyer, to the right when approaching from
the road. The authored counter is at x=53–64, z=149–152.5 in the talyer chunk. Get out and
interact to browse. Shopping is blocked while racing, driving, or away from the counter;
leaving closes the shop and cancels its pending purchase quote.

Every performance part has a factory-new equivalent in permanent stock. Shop price is exactly
five times the midpoint of the corresponding used Marketplace template's price range. This stable
reference avoids shop prices changing whenever a random seller lists or expires a part. The UI
shows the reference and multiplier. The EFI harness/pump is ₱17,500 (₱3,500 × 5).

New variants have separate IDs and names, 100% condition, known inspection state, and zero
sketchiness. They retain the same physical fit, supporting requirements and effect design.
`satisfiesParts` lets either new or used supports fulfill the same requirement. Both variants
occupy the same slot. Factory-new variants are registered with inventory and installation but
excluded from used Marketplace generation. A new part is not a substitute for missing supports.

Purchases use server-side-style authoritative rules in game-core, not React prices. The scene
adapter issues single-use confirmation quotes and rechecks access and funds on payment. Successful
purchases create a `parts_shop_purchase` wallet entry and an owned inventory item with a
`parts_shop` origin. Ledger replay recovers interrupted item delivery without charging again.
Inventory acquisition tombstones prevent replay from recreating parts later sold or scrapped.
Existing snapshots migrate with an empty tombstone list. Wallet and inventory continue using
their existing session-storage adapters; no remote backend is introduced.

Parts go into inventory, not directly onto the car. Return next door to Tito Jun, choose
Performance, preview the build, and pay installation labor separately. No additional inspection
fee is needed for new shop parts. New parts can still be a bad build if cooling, clutch capacity,
tuning or component condition are unsuitable.
