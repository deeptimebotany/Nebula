-- Réussites v2 (lot C) : le social. Ajouts seulement.
--  - accord « à la une » et outils essayés avant l'inscription (User) ;
--  - vidéos à la une (FeaturedVideo) ;
--  - défi collectif du mois (CollectiveChallenge) ;
--  - rareté réelle des badges (BadgeRarity).

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "featureConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "toolsExplored" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "FeaturedVideo" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sharedVideoId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "removedAt" TIMESTAMP(3),
    "removedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeaturedVideo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectiveChallenge" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "metric" TEXT NOT NULL DEFAULT 'videos',
    "target" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'auto',
    "reachedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectiveChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BadgeRarity" (
    "key" TEXT NOT NULL,
    "owners" INTEGER NOT NULL,
    "creators" INTEGER NOT NULL,
    "share" DOUBLE PRECISION NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BadgeRarity_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "FeaturedVideo_endsAt_idx" ON "FeaturedVideo"("endsAt");

-- CreateIndex
CREATE INDEX "FeaturedVideo_userId_idx" ON "FeaturedVideo"("userId");

-- CreateIndex
CREATE INDEX "FeaturedVideo_sharedVideoId_idx" ON "FeaturedVideo"("sharedVideoId");

-- CreateIndex
CREATE UNIQUE INDEX "CollectiveChallenge_month_key" ON "CollectiveChallenge"("month");

-- AddForeignKey
ALTER TABLE "FeaturedVideo" ADD CONSTRAINT "FeaturedVideo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeaturedVideo" ADD CONSTRAINT "FeaturedVideo_sharedVideoId_fkey" FOREIGN KEY ("sharedVideoId") REFERENCES "SharedVideo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
