-- CreateTable
CREATE TABLE "LocalCredential" (
    "userId" UUID NOT NULL,
    "username" VARCHAR(32) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocalCredential_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "tokenHash" VARCHAR(64) NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateIndex
CREATE UNIQUE INDEX "LocalCredential_username_key" ON "LocalCredential"("username");

-- CreateIndex
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");

-- CreateIndex
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");

-- AddForeignKey
ALTER TABLE "LocalCredential" ADD CONSTRAINT "LocalCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "LocalCredential" ADD CONSTRAINT "LocalCredential_username_format" CHECK ("username" ~ '^[a-z0-9_]{3,32}$');
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_token_format" CHECK ("tokenHash" ~ '^[a-f0-9]{64}$');
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_expiry" CHECK ("expiresAt" > "createdAt");
UPDATE "SchemaVersion" SET "version" = 3, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 1;
