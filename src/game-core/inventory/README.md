# Inventory

`InventorySession` owns every part the player has, plus what is installed on which car. It is its own
save (`pang-daily.inventory.v1`) and never moves money. Sellers charge the PAN-11 wallet first,
then call `add`.

- **Items.** Each entry is one physical part: a unique `id`, a `partId` from the shared definitions
  (`game-core/parts`), and its own `condition` (0..1, or null for parts that don't wear). Two
  identical tire sets are two items. `revealedBy` gates whether views may show the condition.
  `origin` records where the part came from (marketplace listing, price, advertised grade, or a grant).
- **Duplicates.** `add` with a `key` is idempotent: the same key returns the existing item. The
  marketplace keys purchases `marketplace:<listingId>`, so a ledger replay after a lost save never
  duplicates a part. Adds without a key always create a new item. Ids come from a saved serial and
  are never reused.
- **Installs.** `installed` maps `vehicleId → slot → itemId`. A car references an item and never
  copies it, and an item is on at most one car. `install` fills every slot the part needs (coilovers
  take `shocks` + `springs`, headlight pairs take both `EXTERIOR_SLOTS` sides). Anything in those
  slots goes back to the trunk as a whole part and is returned as `displaced`. `remove` refuses
  installed items; call `uninstall` first.
- **API.** `items`, `item`, `byKey`, `installation`, `installedOn`, `add`, `remove`, `reveal`,
  `install`, `uninstall`, `subscribe`. Failures return `{ rejected }`, and reads return copies.
- **Saves.** Saves that reference missing items, reuse ids or keys, or name unknown parts fall back
  to an empty inventory, matching the other sessions' fresh-session fallback.

Nothing applies installed parts to handling or visuals yet. The garage/customization milestone
reads `installedOn(vehicleId)` and resolves each item through `partDefinition`
(`component`, `slots`).
