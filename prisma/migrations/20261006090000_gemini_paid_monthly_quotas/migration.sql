-- Gemini payant, quotas mensuels, recharges Rétention, âge (30/09/2026).

-- User : âge confirmé, analyses Rétention achetées.
ALTER TABLE "User" ADD COLUMN "ageConfirmedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "retentionCredits" INTEGER NOT NULL DEFAULT 0;

-- AiUsageDaily : modèle, actions, jetons vidéo ; clé unique élargie au modèle.
ALTER TABLE "AiUsageDaily" ADD COLUMN "model" TEXT NOT NULL DEFAULT '';
ALTER TABLE "AiUsageDaily" ADD COLUMN "actions" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AiUsageDaily" ADD COLUMN "videoTokens" INTEGER NOT NULL DEFAULT 0;
DROP INDEX "AiUsageDaily_day_plan_kind_key";
CREATE UNIQUE INDEX "AiUsageDaily_day_plan_kind_model_key" ON "AiUsageDaily"("day", "plan", "kind", "model");

-- Quotas mensuels de l'IA.
CREATE TABLE "AiMonthlyUsage" (
    "id" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiMonthlyUsage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AiMonthlyUsage_keyHash_period_kind_key" ON "AiMonthlyUsage"("keyHash", "period", "kind");
CREATE INDEX "AiMonthlyUsage_period_idx" ON "AiMonthlyUsage"("period");
CREATE INDEX "AiMonthlyUsage_updatedAt_idx" ON "AiMonthlyUsage"("updatedAt");

-- Achats de recharges IA.
CREATE TABLE "AiCreditPurchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'retention',
    "credits" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'eur',
    "stripeCheckoutSessionId" TEXT NOT NULL,
    "stripePaymentIntentId" TEXT,
    "creditsRemoved" INTEGER NOT NULL DEFAULT 0,
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiCreditPurchase_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AiCreditPurchase_stripeCheckoutSessionId_key" ON "AiCreditPurchase"("stripeCheckoutSessionId");
CREATE UNIQUE INDEX "AiCreditPurchase_stripePaymentIntentId_key" ON "AiCreditPurchase"("stripePaymentIntentId");
CREATE INDEX "AiCreditPurchase_userId_createdAt_idx" ON "AiCreditPurchase"("userId", "createdAt");
ALTER TABLE "AiCreditPurchase" ADD CONSTRAINT "AiCreditPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- VideoInsight : ce que l'IA a vu, modèle, durée, jetons.
ALTER TABLE "VideoInsight" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'thumbnail';
ALTER TABLE "VideoInsight" ADD COLUMN "model" TEXT;
ALTER TABLE "VideoInsight" ADD COLUMN "durationSeconds" INTEGER;
ALTER TABLE "VideoInsight" ADD COLUMN "promptTokens" INTEGER;
ALTER TABLE "VideoInsight" ADD COLUMN "videoTokens" INTEGER;
ALTER TABLE "VideoInsight" ADD COLUMN "outputTokens" INTEGER;
