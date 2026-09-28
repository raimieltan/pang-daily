-- Simulated wheel assemblies per vehicle. Rows appear on the first tire checkpoint; no row = a stock set.
CREATE TABLE "VehicleTireState" (
  "vehicleId" UUID NOT NULL PRIMARY KEY,
  "revision" BIGINT NOT NULL DEFAULT 0 CHECK ("revision" >= 0),
  "state" JSONB NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "VehicleTireState_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
