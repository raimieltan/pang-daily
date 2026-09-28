-- Keep existing resources and authored milestone history. Legacy profiles keep their original
-- starter values; choosing a new origin must never reset an established wallet or car.
INSERT INTO "ChapterMarker" ("playerId", "chapterId", "markerId", "sourceReference", "completedAt")
SELECT "playerId", "chapterId", 'choose_origin', 'legacy', NOW()
FROM "ChapterProgress" WHERE "chapterId" = 'chapter_1'
ON CONFLICT DO NOTHING;
-- The old four-beat completion was a preview, not the recovery/recognition ending.
UPDATE "ChapterProgress" SET "currentBeatId" = 'brake_setback', "completedAt" = NULL
WHERE "chapterId" = 'chapter_1' AND "currentBeatId" IS NULL;
DELETE FROM "LocationUnlock" WHERE "unlockId" = 'chapter_2_access' AND "source" = 'chapter_1';
