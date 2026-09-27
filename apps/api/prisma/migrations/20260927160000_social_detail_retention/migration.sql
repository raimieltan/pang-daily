-- Keep every social event envelope for source-key deduplication and rival progression.
-- Detailed per-NPC deltas are retained for the newest 200 events per player.
DELETE FROM "SocialEventEffect" AS detail
USING "SocialEvent" AS event,
 (SELECT "playerId", MAX("sequence") AS latest_sequence FROM "SocialEvent" GROUP BY "playerId") AS latest
WHERE detail."socialEventId" = event."id"
 AND detail."playerId" = event."playerId"
 AND latest."playerId" = event."playerId"
 AND event."sequence" <= latest.latest_sequence - 200;
