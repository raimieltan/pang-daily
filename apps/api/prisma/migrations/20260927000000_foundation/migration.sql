CREATE TABLE "SchemaVersion" (
    "id" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "SchemaVersion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SchemaVersion_singleton" CHECK ("id" = 1),
    CONSTRAINT "SchemaVersion_positive" CHECK ("version" > 0)
);
INSERT INTO "SchemaVersion" ("id", "version", "updatedAt") VALUES (1, 1, CURRENT_TIMESTAMP);
