-- Media kit public (produit n°10). Ajout seulement.

-- CreateTable
CREATE TABLE "MediaKit" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "headline" TEXT NOT NULL DEFAULT '',
    "about" TEXT NOT NULL DEFAULT '',
    "contactEmail" TEXT,
    "hiddenConnectionIds" JSONB NOT NULL DEFAULT '[]',
    "featuredPostIds" JSONB NOT NULL DEFAULT '[]',
    "offers" JSONB NOT NULL DEFAULT '[]',
    "views" INTEGER NOT NULL DEFAULT 0,
    "lastViewedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaKit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaKit_brandId_key" ON "MediaKit"("brandId");

-- AddForeignKey
ALTER TABLE "MediaKit" ADD CONSTRAINT "MediaKit_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
