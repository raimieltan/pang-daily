ALTER TABLE "SocialEvent" ADD COLUMN "sequence" INTEGER;
WITH ordered AS (SELECT "id", row_number() OVER (PARTITION BY "playerId" ORDER BY "createdAt", "id") AS n FROM "SocialEvent")
UPDATE "SocialEvent" SET "sequence" = ordered.n FROM ordered WHERE "SocialEvent"."id" = ordered."id";
ALTER TABLE "SocialEvent" ALTER COLUMN "sequence" SET NOT NULL;
CREATE UNIQUE INDEX "SocialEvent_playerId_sequence_key" ON "SocialEvent"("playerId", "sequence");
UPDATE "ChapterProgress" SET "currentBeatId" = 'meet_mang_boy' WHERE "chapterId" = 'chapter_1' AND "currentBeatId" IS NULL AND "completedAt" IS NULL;
CREATE TABLE "ConversationProgress" (
 "playerId" UUID NOT NULL, "dialogueId" TEXT NOT NULL, "currentNodeId" TEXT NOT NULL,
 "updatedAt" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "ConversationProgress_pkey" PRIMARY KEY ("playerId", "dialogueId"),
 CONSTRAINT "ConversationProgress_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayerProfile"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
