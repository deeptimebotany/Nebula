-- Bilan du mois par e-mail (03/10/2026) : la personne l'active dans ses
-- réglages (monthlySummaryAt) et choisit ses marques (liste vide = toutes).
-- Une ligne MonthlySummary par compte, marque et mois envoyé.
ALTER TABLE "User" ADD COLUMN "monthlySummaryAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "monthlySummaryBrandIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "MonthlySummary" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SENDING',
    "error" TEXT,
    "bioClicks" INTEGER,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "lastAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonthlySummary_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MonthlySummary_userId_brandId_month_key" ON "MonthlySummary"("userId", "brandId", "month");
CREATE INDEX "MonthlySummary_month_status_idx" ON "MonthlySummary"("month", "status");
CREATE INDEX "MonthlySummary_sentAt_idx" ON "MonthlySummary"("sentAt");
CREATE INDEX "MonthlySummary_brandId_idx" ON "MonthlySummary"("brandId");
CREATE INDEX "User_monthlySummaryAt_idx" ON "User"("monthlySummaryAt");

ALTER TABLE "MonthlySummary" ADD CONSTRAINT "MonthlySummary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MonthlySummary" ADD CONSTRAINT "MonthlySummary_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
