-- Offres fondateurs (02/10/2026) : « Fondateur » (Pro 1 marque à 10 € pendant
-- 3 mois, 100 premiers abonnés) et « Fondateur Premium » (100 € une fois,
-- Pro 1 marque pendant 1 an, 100 places). Badge « Fondateur » à vie.
ALTER TABLE "User" ADD COLUMN "founderKind" TEXT;
ALTER TABLE "User" ADD COLUMN "founderSince" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "founderPremiumAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "founderPremiumUntil" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "founderPremiumSessionId" TEXT;
ALTER TABLE "User" ADD COLUMN "founderPremiumPaymentId" TEXT;
ALTER TABLE "User" ADD COLUMN "founderPremiumEndedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "founderEndNoticeAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "User_founderPremiumSessionId_key" ON "User"("founderPremiumSessionId");
CREATE UNIQUE INDEX "User_founderPremiumPaymentId_key" ON "User"("founderPremiumPaymentId");
CREATE INDEX "User_founderKind_idx" ON "User"("founderKind");
CREATE INDEX "User_founderPremiumAt_idx" ON "User"("founderPremiumAt");
