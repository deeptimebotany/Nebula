-- Studio IA (produit n°9) : historique des générations. Ajout seulement.

-- CreateTable
CREATE TABLE "StudioGeneration" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB NOT NULL,
    "sources" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudioGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudioGeneration_brandId_createdAt_idx" ON "StudioGeneration"("brandId", "createdAt");

-- CreateIndex
CREATE INDEX "StudioGeneration_userId_createdAt_idx" ON "StudioGeneration"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "StudioGeneration" ADD CONSTRAINT "StudioGeneration_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioGeneration" ADD CONSTRAINT "StudioGeneration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
