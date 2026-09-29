-- Statistiques anonymes (accord facultatif), préférences d'affichage et
-- brouillons du Composer enregistrés dans le compte (29/09/2026). Ajout seulement.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "statsConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "statsConsentAt" TIMESTAMP(3),
ADD COLUMN "uiPrefs" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "AnonStat" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "dimension" TEXT NOT NULL DEFAULT '',
    "value" DOUBLE PRECISION NOT NULL,
    "sampleAccounts" INTEGER NOT NULL,
    "sampleItems" INTEGER NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnonStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComposerDraft" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComposerDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnonStat_period_metric_dimension_key" ON "AnonStat"("period", "metric", "dimension");

-- CreateIndex
CREATE INDEX "AnonStat_period_idx" ON "AnonStat"("period");

-- CreateIndex
CREATE UNIQUE INDEX "ComposerDraft_userId_brandId_key" ON "ComposerDraft"("userId", "brandId");

-- CreateIndex
CREATE INDEX "ComposerDraft_brandId_idx" ON "ComposerDraft"("brandId");

-- AddForeignKey
ALTER TABLE "ComposerDraft" ADD CONSTRAINT "ComposerDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComposerDraft" ADD CONSTRAINT "ComposerDraft_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
