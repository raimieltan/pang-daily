# PAN-11 economy

`VehicleSession` remains the authoritative owner of wallet, ledger and vehicle state.
Gameplay should call `earn(amountPhp, metadata)`, `spend(amountPhp, metadata)`,
`refuel(definition, request)`, `repair(definition, quote, components)` or
`service(definition, serviceId)`. Every failure returns `{ rejected: string }`.
Successful purchases update their vehicle effect and ledger before saving and notifying
subscribers. Returned snapshots and transaction receipts cannot mutate session state.

Amounts use PHP with at most two decimal places; balance arithmetic uses integer
centavos. Transactions have signed `amountPhp`, `balanceBeforePhp`, and `balancePhp`
(the balance after payment), plus timestamp, source, description and optional entity ID.
Metadata categories are extensible for jobs, races, parts, rewards and fees.

Fuel requests accept `{ liters }`, `{ targetLiters }`, or `{ budgetPhp }`. Quotes
cap at tank capacity and use milliliter quantities. The initial slice uses a 45 L
tank and a tunable fictional price of ₱65/L. Driving consumes 0.2 L/km plus up to
50% under throttle; consumption is batched and saved each second and on scene disposal.
An empty tank disables propulsion in both gears, preserving steering and brakes.
At the hub gas station, park beside a pump, exit, and interact to open the fuel panel.
Choose liters, a peso budget or a full tank, then pay the serverless session quote.
Access is rechecked at payment; quote IDs are single-use and leaving closes the panel.
Maintenance service expenses use the shared service catalog and do not simulate wear
or duplicate the existing repair condition rules.

Persistence continues through the existing session-storage adapter and key. Version 1
saves migrate to version 2 with full tanks and enriched ledger entries. Legacy
transaction timestamps use the Unix epoch because the original save did not record
times. Saves with inconsistent ledger balances are rejected using the existing
fresh-session fallback. Storage failure retains a valid in-memory session, as before.
