-- Application mutations already serialize on PlayerProfile. These constraints also
-- protect administrative/direct SQL paths and future command implementations.
CREATE UNIQUE INDEX "RaceResult_one_active_per_player" ON "RaceResult" ("playerId") WHERE "outcome" = 'started';
CREATE UNIQUE INDEX "Vehicle_one_live_definition_per_player" ON "Vehicle" ("playerId", "definitionId") WHERE "retiredAt" IS NULL;
CREATE UNIQUE INDEX "Transaction_one_domain_reward" ON "Transaction" ("playerId", "kind", "sourceReference")
  WHERE "kind" IN ('JOB_REWARD', 'RACE_REWARD', 'REFUND');
ALTER TABLE "RaceResult" ADD CONSTRAINT "RaceResult_checkpoint_limit" CHECK ("checkpointIndex" <= 100);
ALTER TABLE "SceneReputation" ADD CONSTRAINT "SceneReputation_cap" CHECK ("points" <= 160);
ALTER TABLE "CrewMembership" ADD CONSTRAINT "CrewMembership_join_limit" CHECK ("joins" <= 2);
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_confirmed_response" CHECK (
  "status" <> 'succeeded' OR ("response" IS NOT NULL AND jsonb_typeof("response") = 'object' AND "responseStatus" BETWEEN 200 AND 299));
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_command_key" CHECK (
  "scope" <> 'player_command' OR "key" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');

-- Deferred so race_start can atomically abandon a job and start a race.
CREATE FUNCTION enforce_one_player_activity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "JobProgress" WHERE "playerId" = NEW."playerId" AND "status" IN ('accepted', 'active'))
     AND EXISTS (SELECT 1 FROM "RaceResult" WHERE "playerId" = NEW."playerId" AND "outcome" = 'started') THEN
    RAISE EXCEPTION 'A player cannot have an active job and race' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "JobProgress_one_activity" AFTER INSERT OR UPDATE ON "JobProgress"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_one_player_activity();
CREATE CONSTRAINT TRIGGER "RaceResult_one_activity" AFTER INSERT OR UPDATE ON "RaceResult"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_one_player_activity();
UPDATE "SchemaVersion" SET "version" = 5, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 1;
