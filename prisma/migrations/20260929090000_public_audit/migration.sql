-- Audit de présence en ligne (produit n°8) : rapports publics par lien
-- secret, conservés 30 jours. Ajout seulement.

-- CreateTable
CREATE TABLE "PublicAudit" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "inputKey" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "score" INTEGER,
    "sources" TEXT NOT NULL,
    "advice" JSONB,
    "adviceAttempts" INTEGER NOT NULL DEFAULT 0,
    "ipHash" TEXT NOT NULL,
    "emailSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PublicAudit_token_key" ON "PublicAudit"("token");

-- CreateIndex
CREATE INDEX "PublicAudit_inputKey_createdAt_idx" ON "PublicAudit"("inputKey", "createdAt");

-- CreateIndex
CREATE INDEX "PublicAudit_expiresAt_idx" ON "PublicAudit"("expiresAt");
