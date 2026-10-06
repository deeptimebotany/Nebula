-- Plafond TikTok des comptes qui publient (06/10/2026) : une ligne par compte
-- TikTok (open_id) avec sa dernière publication acceptée, et le pic quotidien
-- du nombre de comptes différents sur 24 h glissantes.
CREATE TABLE "TiktokPublisher" (
    "accountId" TEXT NOT NULL,
    "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TiktokPublisher_pkey" PRIMARY KEY ("accountId")
);

CREATE INDEX "TiktokPublisher_lastAt_idx" ON "TiktokPublisher"("lastAt");

CREATE TABLE "TiktokPublisherDay" (
    "day" TEXT NOT NULL,
    "peak" INTEGER NOT NULL,
    "peakAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TiktokPublisherDay_pkey" PRIMARY KEY ("day")
);
