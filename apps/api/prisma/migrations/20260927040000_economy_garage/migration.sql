ALTER TABLE "VehicleCondition" ADD COLUMN "mileageMeters" BIGINT NOT NULL DEFAULT 0 CHECK ("mileageMeters" >= 0);
ALTER TABLE "RaceResult" ADD COLUMN "checkpointIndex" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "lastCheckpointElapsedMs" BIGINT NOT NULL DEFAULT 0,
 ADD CONSTRAINT "race_checkpoint_nonnegative" CHECK ("checkpointIndex" >= 0 AND "lastCheckpointElapsedMs" >= 0);
CREATE TABLE "MarketplaceListing" (
 "id" UUID NOT NULL PRIMARY KEY, "playerId" UUID NOT NULL,
 "definitionId" TEXT NOT NULL, "sellerId" TEXT NOT NULL, "locationId" TEXT NOT NULL,
 "askingCentavos" BIGINT NOT NULL CHECK ("askingCentavos" > 0), "advertisedGrade" "ListingGrade" NOT NULL,
 "actualCondition" DECIMAL(9,8) NOT NULL CHECK ("actualCondition" BETWEEN 0 AND 1),
 "blurb" TEXT NOT NULL, "photoSeed" INTEGER NOT NULL,
 "postedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMPTZ(3) NOT NULL,
 "soldAt" TIMESTAMPTZ(3), CONSTRAINT "MarketplaceListing_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayerProfile"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "marketplace_expiry" CHECK ("expiresAt" > "postedAt")
);
CREATE INDEX "MarketplaceListing_playerId_soldAt_expiresAt_idx" ON "MarketplaceListing"("playerId", "soldAt", "expiresAt");
UPDATE "SchemaVersion" SET "version" = 4, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 1;
