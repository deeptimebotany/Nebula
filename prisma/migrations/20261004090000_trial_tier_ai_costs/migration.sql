-- Palier Essai, protection de l'IA, fin d'essai propre, coûts de l'IA,
-- visite guidée et sons (brief « Essai 14 jours », 29/09/2026).
-- Migration uniquement additive.

ALTER TABLE "User" ADD COLUMN "trialDeniedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "trialDeniedReason" TEXT;
ALTER TABLE "User" ADD COLUMN "freeActiveBrandId" TEXT;
ALTER TABLE "User" ADD COLUMN "activeBrandChangedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "freeActiveConnectionIds" JSONB;
ALTER TABLE "User" ADD COLUMN "tourCompletedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "tourStep" INTEGER;
ALTER TABLE "User" ADD COLUMN "uiSoundsEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Brand" ADD COLUMN "dormantAt" TIMESTAMP(3);
ALTER TABLE "SocialConnection" ADD COLUMN "dormantAt" TIMESTAMP(3);

ALTER TABLE "Post" ADD COLUMN "dormantScheduledAt" TIMESTAMP(3);

CREATE TABLE "TrialGrant" (
    "id" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "ipHash" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrialGrant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TrialGrant_emailHash_key" ON "TrialGrant"("emailHash");
CREATE INDEX "TrialGrant_ipHash_grantedAt_idx" ON "TrialGrant"("ipHash", "grantedAt");
CREATE INDEX "TrialGrant_grantedAt_idx" ON "TrialGrant"("grantedAt");

CREATE TABLE "AiUsageDaily" (
    "id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "images" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiUsageDaily_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AiUsageDaily_day_plan_kind_key" ON "AiUsageDaily"("day", "plan", "kind");
CREATE INDEX "AiUsageDaily_day_idx" ON "AiUsageDaily"("day");

-- Les comptes existants au déploiement voient déjà l'interface : pas de
-- visite guidée pour eux (seuls les nouveaux comptes la reçoivent).
UPDATE "User" SET "tourCompletedAt" = CURRENT_TIMESTAMP WHERE "tourCompletedAt" IS NULL;
