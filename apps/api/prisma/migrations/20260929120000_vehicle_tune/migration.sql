-- Tito Jun's setup per car. Existing cars keep their factory street tune.
ALTER TABLE "Vehicle" ADD COLUMN "tune" VARCHAR(16) NOT NULL DEFAULT 'street' CHECK ("tune" IN ('street', 'drift'));
