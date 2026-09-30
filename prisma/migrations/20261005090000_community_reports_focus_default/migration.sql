-- Signalements de la Communauté et Mode focus désactivé par défaut pour les
-- nouveaux comptes (30/09/2026). Les comptes existants gardent leur réglage.

CREATE TABLE "CommunityReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommunityReport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CommunityReport_reporterId_targetType_targetId_key" ON "CommunityReport"("reporterId", "targetType", "targetId");
CREATE INDEX "CommunityReport_targetType_targetId_idx" ON "CommunityReport"("targetType", "targetId");
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "User" ALTER COLUMN "focusMode" SET DEFAULT false;
