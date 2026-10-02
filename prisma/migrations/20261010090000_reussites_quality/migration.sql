-- Réussites v3 (02/10/2026) : la qualité avant la quantité.
-- Preuve d'un record de qualité (carte à partager).
ALTER TABLE "AchievementUnlock" ADD COLUMN "detail" JSONB;
-- « Cet avis m'a aidé » sur les avis de la communauté.
ALTER TABLE "FeedbackComment" ADD COLUMN "helpfulAt" TIMESTAMP(3);
-- Rétention YouTube relevée avec les statistiques des publications.
ALTER TABLE "PostMetric" ADD COLUMN "avgViewPct" DOUBLE PRECISION;
ALTER TABLE "PostMetric" ADD COLUMN "durationSeconds" INTEGER;

-- Synchro quotidienne automatique des comptes connectés (verrou et date).
ALTER TABLE "SocialConnection" ADD COLUMN "autoSyncedAt" TIMESTAMP(3);
CREATE INDEX "SocialConnection_status_autoSyncedAt_idx" ON "SocialConnection"("status", "autoSyncedAt");
