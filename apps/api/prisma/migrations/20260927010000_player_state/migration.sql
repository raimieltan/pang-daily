BEGIN;
-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('accepted', 'active', 'completed', 'failed', 'abandoned');

-- CreateEnum
CREATE TYPE "RaceOutcome" AS ENUM ('started', 'win', 'loss', 'dnf');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('none', 'invited', 'accepted', 'declined');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('none', 'member', 'left');

-- CreateEnum
CREATE TYPE "FavorStatus" AS ENUM ('offered', 'accepted', 'completed', 'failed', 'abandoned');

-- CreateEnum
CREATE TYPE "PartOrigin" AS ENUM ('parts_shop', 'marketplace', 'grant');

-- CreateEnum
CREATE TYPE "RevealMethod" AS ENUM ('mechanic', 'known');

-- CreateEnum
CREATE TYPE "PaintFinish" AS ENUM ('body_color', 'primer', 'mismatched', 'bare_plastic', 'fake_carbon', 'damaged');

-- CreateEnum
CREATE TYPE "ListingGrade" AS ENUM ('like_new', 'good', 'fair', 'as_is');

-- CreateEnum
CREATE TYPE "CommandStatus" AS ENUM ('pending', 'succeeded', 'rejected');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "identityProvider" TEXT NOT NULL,
    "identitySubject" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivatedAt" TIMESTAMPTZ(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerProfile" (
    "activeVehicleId" UUID,
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "displayName" VARCHAR(80) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),

    CONSTRAINT "PlayerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerSaveVersion" (
    "playerId" UUID NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 2,
    "contentVersion" TEXT NOT NULL,
    "revision" BIGINT NOT NULL DEFAULT 0,
    "legacyImportedAt" TIMESTAMPTZ(3),
    "legacyImportKey" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PlayerSaveVersion_pkey" PRIMARY KEY ("playerId")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "playerId" UUID NOT NULL,
    "balanceCentavos" BIGINT NOT NULL DEFAULT 0,
    "revision" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("playerId")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "sequence" BIGINT NOT NULL,
    "amountCentavos" BIGINT NOT NULL,
    "balanceBeforeCentavos" BIGINT NOT NULL,
    "balanceAfterCentavos" BIGINT NOT NULL,
    "kind" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceReference" TEXT NOT NULL,
    "sourceLine" TEXT NOT NULL DEFAULT 'primary',
    "description" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "vehicleId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionComponent" (
    "transactionId" UUID NOT NULL,
    "componentId" TEXT NOT NULL,

    CONSTRAINT "TransactionComponent_pkey" PRIMARY KEY ("transactionId","componentId")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "definitionId" TEXT NOT NULL,
    "acquisitionKey" TEXT NOT NULL,
    "acquiredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retiredAt" TIMESTAMPTZ(3),
    "paint" VARCHAR(7) NOT NULL,
    "rideHeightM" DECIMAL(5,3) NOT NULL DEFAULT 0,
    "stockSpoilerRemoved" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleCondition" (
    "vehicleId" UUID NOT NULL,
    "revision" BIGINT NOT NULL DEFAULT 0,
    "engine" DECIMAL(9,8) NOT NULL,
    "transmission" DECIMAL(9,8) NOT NULL,
    "suspension" DECIMAL(9,8) NOT NULL,
    "brakes" DECIMAL(9,8) NOT NULL,
    "tires" DECIMAL(9,8) NOT NULL,
    "body" DECIMAL(9,8) NOT NULL,
    "electrical" DECIMAL(9,8) NOT NULL,
    "clutch" DECIMAL(9,8) NOT NULL,
    "cooling" DECIMAL(9,8) NOT NULL,
    "fuelLiters" DECIMAL(9,3) NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "VehicleCondition_pkey" PRIMARY KEY ("vehicleId")
);

-- CreateTable
CREATE TABLE "Inventory" (
    "playerId" UUID NOT NULL,
    "revision" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Inventory_pkey" PRIMARY KEY ("playerId")
);

-- CreateTable
CREATE TABLE "OwnedPart" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "partDefinitionId" TEXT NOT NULL,
    "acquisitionKey" TEXT NOT NULL,
    "condition" DECIMAL(9,8),
    "revealedBy" "RevealMethod",
    "finish" "PaintFinish",
    "origin" "PartOrigin" NOT NULL,
    "sourceReference" TEXT NOT NULL,
    "sellerId" TEXT,
    "paidCentavos" BIGINT,
    "advertisedGrade" "ListingGrade",
    "transactionId" UUID,
    "acquiredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retiredAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OwnedPart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstalledPart" (
    "ownedPartId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "installedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstalledPart_pkey" PRIMARY KEY ("ownedPartId")
);

-- CreateTable
CREATE TABLE "InstalledPartSlot" (
    "playerId" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "slotId" TEXT NOT NULL,
    "ownedPartId" UUID NOT NULL,

    CONSTRAINT "InstalledPartSlot_pkey" PRIMARY KEY ("vehicleId","slotId")
);

-- CreateTable
CREATE TABLE "JobProgress" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "runId" TEXT NOT NULL,
    "jobDefinitionId" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'accepted',
    "objectiveIndex" INTEGER NOT NULL DEFAULT 0,
    "elapsedMs" BIGINT NOT NULL DEFAULT 0,
    "cargoLoaded" BOOLEAN NOT NULL DEFAULT false,
    "cargoDamage" DECIMAL(9,8) NOT NULL DEFAULT 0,
    "reason" TEXT,
    "payoutTransactionId" UUID,
    "acceptedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "JobProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaceResult" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "attemptId" TEXT NOT NULL,
    "raceDefinitionId" TEXT NOT NULL,
    "vehicleId" UUID NOT NULL,
    "rivalNpcId" TEXT,
    "rivalVehicleContentId" TEXT,
    "outcome" "RaceOutcome" NOT NULL DEFAULT 'started',
    "position" INTEGER,
    "elapsedMs" BIGINT,
    "payoutTransactionId" UUID,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "RaceResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NpcRelationship" (
    "playerId" UUID NOT NULL,
    "npcId" TEXT NOT NULL,
    "introduced" BOOLEAN NOT NULL DEFAULT false,
    "trust" INTEGER NOT NULL DEFAULT 50,
    "respect" INTEGER NOT NULL DEFAULT 50,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "NpcRelationship_pkey" PRIMARY KEY ("playerId","npcId")
);

-- CreateTable
CREATE TABLE "NpcRelationshipFlag" (
    "playerId" UUID NOT NULL,
    "npcId" TEXT NOT NULL,
    "flagId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NpcRelationshipFlag_pkey" PRIMARY KEY ("playerId","npcId","flagId")
);

-- CreateTable
CREATE TABLE "NpcMilestone" (
    "playerId" UUID NOT NULL,
    "npcId" TEXT NOT NULL,
    "eventContentId" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NpcMilestone_pkey" PRIMARY KEY ("playerId","npcId","eventContentId")
);

-- CreateTable
CREATE TABLE "FavorProgress" (
    "playerId" UUID NOT NULL,
    "favorId" TEXT NOT NULL,
    "npcId" TEXT NOT NULL,
    "status" "FavorStatus" NOT NULL DEFAULT 'offered',
    "jobProgressId" UUID,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FavorProgress_pkey" PRIMARY KEY ("playerId","favorId")
);

-- CreateTable
CREATE TABLE "SceneReputation" (
    "playerId" UUID NOT NULL,
    "sceneId" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SceneReputation_pkey" PRIMARY KEY ("playerId","sceneId")
);

-- CreateTable
CREATE TABLE "ReputationRewardSource" (
    "playerId" UUID NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ReputationRewardSource_pkey" PRIMARY KEY ("playerId","sourceKey")
);

-- CreateTable
CREATE TABLE "PlayerCrewStanding" (
    "playerId" UUID NOT NULL,
    "crewId" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "introduced" BOOLEAN NOT NULL DEFAULT false,
    "invitation" "InvitationStatus" NOT NULL DEFAULT 'none',
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PlayerCrewStanding_pkey" PRIMARY KEY ("playerId","crewId")
);

-- CreateTable
CREATE TABLE "CrewMembership" (
    "playerId" UUID NOT NULL,
    "crewId" TEXT NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'none',
    "joins" INTEGER NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMPTZ(3),
    "leftAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CrewMembership_pkey" PRIMARY KEY ("playerId","crewId")
);

-- CreateTable
CREATE TABLE "RivalState" (
    "playerId" UUID NOT NULL,
    "npcId" TEXT NOT NULL,
    "rivalVehicleContentId" TEXT NOT NULL,
    "metAtHub" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RivalState_pkey" PRIMARY KEY ("playerId","npcId")
);

-- CreateTable
CREATE TABLE "LocationUnlock" (
    "playerId" UUID NOT NULL,
    "unlockId" TEXT NOT NULL,
    "locationContentId" TEXT,
    "source" TEXT NOT NULL,
    "sourceReference" TEXT NOT NULL,
    "unlockedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocationUnlock_pkey" PRIMARY KEY ("playerId","unlockId")
);

-- CreateTable
CREATE TABLE "ChapterProgress" (
    "playerId" UUID NOT NULL,
    "chapterId" TEXT NOT NULL,
    "currentBeatId" TEXT,
    "completedAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ChapterProgress_pkey" PRIMARY KEY ("playerId","chapterId")
);

-- CreateTable
CREATE TABLE "ChapterMarker" (
    "playerId" UUID NOT NULL,
    "chapterId" TEXT NOT NULL,
    "markerId" TEXT NOT NULL,
    "sourceReference" TEXT NOT NULL,
    "completedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChapterMarker_pkey" PRIMARY KEY ("playerId","chapterId","markerId")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "requestId" TEXT NOT NULL,
    "status" "CommandStatus" NOT NULL DEFAULT 'pending',
    "resourceId" TEXT,
    "responseVersion" INTEGER NOT NULL DEFAULT 1,
    "responseStatus" INTEGER,
    "response" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialEvent" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "eventId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "targetContentId" TEXT NOT NULL,
    "contextContentId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "sceneId" TEXT,
    "reputationSourceKey" TEXT,
    "reputationDelta" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialEventEffect" (
    "socialEventId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "npcId" TEXT NOT NULL,
    "trustDelta" INTEGER NOT NULL,
    "respectDelta" INTEGER NOT NULL,
    "flagsAdded" TEXT[],
    "flagsRemoved" TEXT[],

    CONSTRAINT "SocialEventEffect_pkey" PRIMARY KEY ("socialEventId","npcId")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_identityProvider_identitySubject_key" ON "User"("identityProvider", "identitySubject");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerProfile_userId_key" ON "PlayerProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerSaveVersion_legacyImportKey_key" ON "PlayerSaveVersion"("legacyImportKey");

-- CreateIndex
CREATE INDEX "Transaction_playerId_createdAt_id_idx" ON "Transaction"("playerId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Transaction_vehicleId_playerId_idx" ON "Transaction"("vehicleId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_id_playerId_key" ON "Transaction"("id", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_playerId_sequence_key" ON "Transaction"("playerId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_playerId_source_sourceReference_sourceLine_key" ON "Transaction"("playerId", "source", "sourceReference", "sourceLine");

-- CreateIndex
CREATE INDEX "Vehicle_playerId_retiredAt_idx" ON "Vehicle"("playerId", "retiredAt");

-- CreateIndex
CREATE INDEX "Vehicle_playerId_definitionId_idx" ON "Vehicle"("playerId", "definitionId");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_id_playerId_key" ON "Vehicle"("id", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_playerId_acquisitionKey_key" ON "Vehicle"("playerId", "acquisitionKey");

-- CreateIndex
CREATE INDEX "OwnedPart_playerId_retiredAt_partDefinitionId_idx" ON "OwnedPart"("playerId", "retiredAt", "partDefinitionId");

-- CreateIndex
CREATE INDEX "OwnedPart_transactionId_playerId_idx" ON "OwnedPart"("transactionId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "OwnedPart_id_playerId_key" ON "OwnedPart"("id", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "OwnedPart_playerId_acquisitionKey_key" ON "OwnedPart"("playerId", "acquisitionKey");

-- CreateIndex
CREATE INDEX "InstalledPart_vehicleId_playerId_idx" ON "InstalledPart"("vehicleId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "InstalledPart_ownedPartId_playerId_key" ON "InstalledPart"("ownedPartId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "InstalledPart_ownedPartId_playerId_vehicleId_key" ON "InstalledPart"("ownedPartId", "playerId", "vehicleId");

-- CreateIndex
CREATE INDEX "InstalledPartSlot_ownedPartId_playerId_vehicleId_idx" ON "InstalledPartSlot"("ownedPartId", "playerId", "vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "JobProgress_payoutTransactionId_key" ON "JobProgress"("payoutTransactionId");

-- CreateIndex
CREATE INDEX "JobProgress_playerId_jobDefinitionId_status_idx" ON "JobProgress"("playerId", "jobDefinitionId", "status");

-- CreateIndex
CREATE INDEX "JobProgress_playerId_acceptedAt_id_idx" ON "JobProgress"("playerId", "acceptedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "JobProgress_payoutTransactionId_playerId_key" ON "JobProgress"("payoutTransactionId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "JobProgress_playerId_runId_key" ON "JobProgress"("playerId", "runId");

-- CreateIndex
CREATE UNIQUE INDEX "JobProgress_id_playerId_key" ON "JobProgress"("id", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "RaceResult_payoutTransactionId_key" ON "RaceResult"("payoutTransactionId");

-- CreateIndex
CREATE INDEX "RaceResult_playerId_completedAt_id_idx" ON "RaceResult"("playerId", "completedAt", "id");

-- CreateIndex
CREATE INDEX "RaceResult_playerId_raceDefinitionId_outcome_idx" ON "RaceResult"("playerId", "raceDefinitionId", "outcome");

-- CreateIndex
CREATE INDEX "RaceResult_playerId_rivalNpcId_startedAt_idx" ON "RaceResult"("playerId", "rivalNpcId", "startedAt");

-- CreateIndex
CREATE INDEX "RaceResult_vehicleId_playerId_idx" ON "RaceResult"("vehicleId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "RaceResult_payoutTransactionId_playerId_key" ON "RaceResult"("payoutTransactionId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "RaceResult_playerId_attemptId_key" ON "RaceResult"("playerId", "attemptId");

-- CreateIndex
CREATE INDEX "NpcMilestone_playerId_npcId_occurredAt_idx" ON "NpcMilestone"("playerId", "npcId", "occurredAt");

-- CreateIndex
CREATE INDEX "FavorProgress_playerId_npcId_idx" ON "FavorProgress"("playerId", "npcId");

-- CreateIndex
CREATE INDEX "FavorProgress_jobProgressId_playerId_idx" ON "FavorProgress"("jobProgressId", "playerId");

-- CreateIndex
CREATE INDEX "LocationUnlock_playerId_locationContentId_idx" ON "LocationUnlock"("playerId", "locationContentId");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_status_createdAt_idx" ON "IdempotencyRecord"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_playerId_scope_key_key" ON "IdempotencyRecord"("playerId", "scope", "key");

-- CreateIndex
CREATE INDEX "SocialEvent_playerId_createdAt_id_idx" ON "SocialEvent"("playerId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "SocialEvent_playerId_type_targetContentId_contextContentId_idx" ON "SocialEvent"("playerId", "type", "targetContentId", "contextContentId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialEvent_id_playerId_key" ON "SocialEvent"("id", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialEvent_playerId_eventId_key" ON "SocialEvent"("playerId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialEvent_playerId_sourceKey_key" ON "SocialEvent"("playerId", "sourceKey");

-- AddForeignKey
ALTER TABLE "PlayerProfile" ADD CONSTRAINT "PlayerProfile_activeVehicleId_id_fkey" FOREIGN KEY ("activeVehicleId", "id") REFERENCES "Vehicle"("id", "playerId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PlayerProfile" ADD CONSTRAINT "PlayerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PlayerSaveVersion" ADD CONSTRAINT "PlayerSaveVersion_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayerProfile"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayerProfile"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Wallet"("playerId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_vehicleId_playerId_fkey" FOREIGN KEY ("vehicleId", "playerId") REFERENCES "Vehicle"("id", "playerId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "TransactionComponent" ADD CONSTRAINT "TransactionComponent_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayerProfile"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "VehicleCondition" ADD CONSTRAINT "VehicleCondition_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayerProfile"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "OwnedPart" ADD CONSTRAINT "OwnedPart_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Inventory"("playerId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "OwnedPart" ADD CONSTRAINT "OwnedPart_transactionId_playerId_fkey" FOREIGN KEY ("transactionId", "playerId") REFERENCES "Transaction"("id", "playerId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "InstalledPart" ADD CONSTRAINT "InstalledPart_ownedPartId_playerId_fkey" FOREIGN KEY ("ownedPartId", "playerId") REFERENCES "OwnedPart"("id", "playerId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "InstalledPart" ADD CONSTRAINT "InstalledPart_vehicleId_playerId_fkey" FOREIGN KEY ("vehicleId", "playerId") REFERENCES "Vehicle"("id", "playerId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "InstalledPartSlot" ADD CONSTRAINT "InstalledPartSlot_ownedPartId_playerId_vehicleId_fkey" FOREIGN KEY ("ownedPartId", "playerId", "vehicleId") REFERENCES "InstalledPart"("ownedPartId", "playerId", "vehicleId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JobProgress" ADD CONSTRAINT "JobProgress_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayerProfile"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JobProgress" ADD CONSTRAINT "JobProgress_payoutTransactionId_playerId_fkey" FOREIGN KEY ("payoutTransactionId", "playerId") REFERENCES "Transaction"("id", "playerId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RaceResult" ADD CONSTRAINT "RaceResult_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayerProfile"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RaceResult" ADD CONSTRAINT "RaceResult_vehicleId_playerId_fkey" FOREIGN KEY ("vehicleId", "playerId") REFERENCES "Vehicle"("id", "playerId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RaceResult" ADD CONSTRAINT "RaceResult_payoutTransactionId_playerId_fkey" FOREIGN KEY ("payoutTransactionId", "playerId") REFERENCES "Transaction"("id", "playerId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "NpcRelationship" ADD CONSTRAINT "NpcRelationship_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayerProfile"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "NpcRelationshipFlag" ADD CONSTRAINT "NpcRelationshipFlag_playerId_npcId_fkey" FOREIGN KEY ("playerId", "npcId") REFERENCES "NpcRelationship"("playerId", "npcId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "NpcMilestone" ADD CONSTRAINT "NpcMilestone_playerId_npcId_fkey" FOREIGN KEY ("playerId", "npcId") REFERENCES "NpcRelationship"("playerId", "npcId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "FavorProgress" ADD CONSTRAINT "FavorProgress_playerId_npcId_fkey" FOREIGN KEY ("playerId", "npcId") REFERENCES "NpcRelationship"("playerId", "npcId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "FavorProgress" ADD CONSTRAINT "FavorProgress_jobProgressId_playerId_fkey" FOREIGN KEY ("jobProgressId", "playerId") REFERENCES "JobProgress"("id", "playerId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SceneReputation" ADD CONSTRAINT "SceneReputation_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayerProfile"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ReputationRewardSource" ADD CONSTRAINT "ReputationRewardSource_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayerProfile"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PlayerCrewStanding" ADD CONSTRAINT "PlayerCrewStanding_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayerProfile"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CrewMembership" ADD CONSTRAINT "CrewMembership_playerId_crewId_fkey" FOREIGN KEY ("playerId", "crewId") REFERENCES "PlayerCrewStanding"("playerId", "crewId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RivalState" ADD CONSTRAINT "RivalState_playerId_npcId_fkey" FOREIGN KEY ("playerId", "npcId") REFERENCES "NpcRelationship"("playerId", "npcId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "LocationUnlock" ADD CONSTRAINT "LocationUnlock_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayerProfile"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ChapterProgress" ADD CONSTRAINT "ChapterProgress_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayerProfile"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ChapterMarker" ADD CONSTRAINT "ChapterMarker_playerId_chapterId_fkey" FOREIGN KEY ("playerId", "chapterId") REFERENCES "ChapterProgress"("playerId", "chapterId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayerProfile"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SocialEvent" ADD CONSTRAINT "SocialEvent_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayerProfile"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SocialEventEffect" ADD CONSTRAINT "SocialEventEffect_playerId_npcId_fkey" FOREIGN KEY ("playerId", "npcId") REFERENCES "NpcRelationship"("playerId", "npcId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SocialEventEffect" ADD CONSTRAINT "SocialEventEffect_socialEventId_playerId_fkey" FOREIGN KEY ("socialEventId", "playerId") REFERENCES "SocialEvent"("id", "playerId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Constraints not expressible in Prisma: preserve these in future migrations.
ALTER TABLE "PlayerSaveVersion" ADD CONSTRAINT "PlayerSaveVersion_check_1" CHECK ("schemaVersion" > 0);
ALTER TABLE "PlayerSaveVersion" ADD CONSTRAINT "PlayerSaveVersion_check_2" CHECK ("revision" >= 0);
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_check_1" CHECK ("balanceCentavos" >= 0);
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_check_2" CHECK ("revision" >= 0);
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_check_1" CHECK ("amountCentavos" <> 0);
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_check_2" CHECK ("sequence" > 0);
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_check_3" CHECK ("balanceBeforeCentavos" >= 0 AND "balanceAfterCentavos" >= 0);
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_check_4" CHECK ("balanceBeforeCentavos"::numeric + "amountCentavos"::numeric = "balanceAfterCentavos"::numeric);
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_check_5" CHECK (length("source") > 0 AND length("sourceReference") > 0 AND length("sourceLine") > 0);
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_check_1" CHECK ("rideHeightM" BETWEEN -0.15 AND 0.15);
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_check_2" CHECK ("paint" ~ '^#[0-9a-fA-F]{6}$' );
ALTER TABLE "VehicleCondition" ADD CONSTRAINT "VehicleCondition_check_1" CHECK ("revision" >= 0);
ALTER TABLE "VehicleCondition" ADD CONSTRAINT "VehicleCondition_check_2" CHECK ("fuelLiters" >= 0);
ALTER TABLE "VehicleCondition" ADD CONSTRAINT "VehicleCondition_check_3" CHECK ("engine" BETWEEN 0 AND 1);
ALTER TABLE "VehicleCondition" ADD CONSTRAINT "VehicleCondition_check_4" CHECK ("transmission" BETWEEN 0 AND 1);
ALTER TABLE "VehicleCondition" ADD CONSTRAINT "VehicleCondition_check_5" CHECK ("suspension" BETWEEN 0 AND 1);
ALTER TABLE "VehicleCondition" ADD CONSTRAINT "VehicleCondition_check_6" CHECK ("brakes" BETWEEN 0 AND 1);
ALTER TABLE "VehicleCondition" ADD CONSTRAINT "VehicleCondition_check_7" CHECK ("tires" BETWEEN 0 AND 1);
ALTER TABLE "VehicleCondition" ADD CONSTRAINT "VehicleCondition_check_8" CHECK ("body" BETWEEN 0 AND 1);
ALTER TABLE "VehicleCondition" ADD CONSTRAINT "VehicleCondition_check_9" CHECK ("electrical" BETWEEN 0 AND 1);
ALTER TABLE "VehicleCondition" ADD CONSTRAINT "VehicleCondition_check_10" CHECK ("clutch" BETWEEN 0 AND 1);
ALTER TABLE "VehicleCondition" ADD CONSTRAINT "VehicleCondition_check_11" CHECK ("cooling" BETWEEN 0 AND 1);
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_check_1" CHECK ("revision" >= 0);
ALTER TABLE "OwnedPart" ADD CONSTRAINT "OwnedPart_check_1" CHECK ("condition" IS NULL OR "condition" BETWEEN 0 AND 1);
ALTER TABLE "OwnedPart" ADD CONSTRAINT "OwnedPart_check_2" CHECK ("paidCentavos" IS NULL OR "paidCentavos" >= 0);
ALTER TABLE "OwnedPart" ADD CONSTRAINT "OwnedPart_check_3" CHECK (("origin" = 'grant') OR ("transactionId" IS NOT NULL AND "paidCentavos" IS NOT NULL));
ALTER TABLE "OwnedPart" ADD CONSTRAINT "OwnedPart_check_4" CHECK ("origin" <> 'marketplace' OR ("sellerId" IS NOT NULL AND "advertisedGrade" IS NOT NULL));
ALTER TABLE "JobProgress" ADD CONSTRAINT "JobProgress_check_1" CHECK ("objectiveIndex" >= 0 AND "elapsedMs" >= 0);
ALTER TABLE "JobProgress" ADD CONSTRAINT "JobProgress_check_2" CHECK ("cargoDamage" BETWEEN 0 AND 1);
ALTER TABLE "JobProgress" ADD CONSTRAINT "JobProgress_check_3" CHECK (("status" IN ('accepted', 'active') AND "completedAt" IS NULL AND "payoutTransactionId" IS NULL) OR ("status" IN ('completed', 'failed', 'abandoned') AND "completedAt" IS NOT NULL));
ALTER TABLE "JobProgress" ADD CONSTRAINT "JobProgress_check_4" CHECK ("payoutTransactionId" IS NULL OR "status" = 'completed' );
ALTER TABLE "RaceResult" ADD CONSTRAINT "RaceResult_check_1" CHECK ("elapsedMs" IS NULL OR "elapsedMs" >= 0);
ALTER TABLE "RaceResult" ADD CONSTRAINT "RaceResult_check_2" CHECK ("position" IS NULL OR "position" > 0);
ALTER TABLE "RaceResult" ADD CONSTRAINT "RaceResult_check_3" CHECK (("outcome" = 'started' AND "completedAt" IS NULL AND "elapsedMs" IS NULL AND "position" IS NULL AND "payoutTransactionId" IS NULL) OR ("outcome" <> 'started' AND "completedAt" IS NOT NULL AND "elapsedMs" IS NOT NULL));
ALTER TABLE "RaceResult" ADD CONSTRAINT "RaceResult_check_4" CHECK ("outcome" <> 'win' OR ("position" IS NOT NULL AND "position" = 1));
ALTER TABLE "RaceResult" ADD CONSTRAINT "RaceResult_check_5" CHECK ("outcome" <> 'loss' OR ("position" IS NOT NULL AND "position" > 1));
ALTER TABLE "RaceResult" ADD CONSTRAINT "RaceResult_check_6" CHECK ("outcome" <> 'dnf' OR "position" IS NULL);
ALTER TABLE "NpcRelationship" ADD CONSTRAINT "NpcRelationship_check_1" CHECK ("trust" BETWEEN 0 AND 100 AND "respect" BETWEEN 0 AND 100);
ALTER TABLE "SceneReputation" ADD CONSTRAINT "SceneReputation_check_1" CHECK ("points" >= 0);
ALTER TABLE "ReputationRewardSource" ADD CONSTRAINT "ReputationRewardSource_check_1" CHECK ("count" >= 0);
ALTER TABLE "CrewMembership" ADD CONSTRAINT "CrewMembership_check_1" CHECK ("joins" >= 0);
ALTER TABLE "CrewMembership" ADD CONSTRAINT "CrewMembership_check_2" CHECK (("status" = 'none' AND "joins" = 0 AND "joinedAt" IS NULL AND "leftAt" IS NULL) OR ("status" = 'member' AND "joins" > 0 AND "joinedAt" IS NOT NULL AND "leftAt" IS NULL) OR ("status" = 'left' AND "joins" > 0 AND "joinedAt" IS NOT NULL AND "leftAt" IS NOT NULL));
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_check_1" CHECK ("responseVersion" > 0);
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_check_2" CHECK ("requestHash" ~ '^[0-9a-f]{64}$' );
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_check_3" CHECK (("status" = 'pending' AND "completedAt" IS NULL AND "responseStatus" IS NULL) OR ("status" <> 'pending' AND "completedAt" IS NOT NULL AND "responseStatus" IS NOT NULL AND "responseStatus" BETWEEN 100 AND 599));

CREATE UNIQUE INDEX "JobProgress_one_active_per_player" ON "JobProgress" ("playerId") WHERE "status" IN ('accepted', 'active');
CREATE UNIQUE INDEX "CrewMembership_one_active_per_player" ON "CrewMembership" ("playerId") WHERE "status" = 'member';

-- A wallet is a projection of an append-only, contiguous ledger. Row locks serialize writers.
CREATE FUNCTION pang_ledger_append() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous_amount bigint; previous_sequence bigint;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Transaction ledger is append-only' USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM "Wallet" WHERE "playerId" = NEW."playerId" FOR UPDATE;
  SELECT "balanceAfterCentavos", "sequence" INTO previous_amount, previous_sequence
    FROM "Transaction" WHERE "playerId" = NEW."playerId" ORDER BY "sequence" DESC LIMIT 1;
  IF NEW."sequence" <> COALESCE(previous_sequence, 0) + 1 OR
     NEW."balanceBeforeCentavos" <> COALESCE(previous_amount, 0) THEN
    RAISE EXCEPTION 'Ledger sequence or opening balance mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Transaction_append_only" BEFORE INSERT OR UPDATE OR DELETE ON "Transaction"
  FOR EACH ROW EXECUTE FUNCTION pang_ledger_append();

CREATE FUNCTION pang_wallet_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE balance bigint; revision bigint; ledger_balance bigint; ledger_sequence bigint;
BEGIN
  SELECT "balanceCentavos", "revision" INTO balance, revision FROM "Wallet" WHERE "playerId" = NEW."playerId";
  SELECT "balanceAfterCentavos", "sequence" INTO ledger_balance, ledger_sequence
    FROM "Transaction" WHERE "playerId" = NEW."playerId" ORDER BY "sequence" DESC LIMIT 1;
  IF balance <> COALESCE(ledger_balance, 0) OR revision <> COALESCE(ledger_sequence, 0) THEN
    RAISE EXCEPTION 'Wallet must match committed ledger balance and sequence' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "Wallet_matches_ledger" AFTER INSERT OR UPDATE ON "Wallet"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION pang_wallet_consistency();
CREATE CONSTRAINT TRIGGER "Transaction_matches_wallet" AFTER INSERT ON "Transaction"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION pang_wallet_consistency();

UPDATE "SchemaVersion" SET "version" = 2, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 1;
COMMIT;
