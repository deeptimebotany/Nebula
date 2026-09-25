-- Réussites v2 (lot A) : missions de la semaine, objets (boucliers,
-- fragments), source des médias importés. Ajouts seulement.

-- AlterTable
ALTER TABLE "MediaAsset" ADD COLUMN     "importSource" TEXT;

-- CreateTable
CREATE TABLE "WeeklyMissions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "week" TEXT NOT NULL,
    "habitKey" TEXT NOT NULL,
    "habitTarget" INTEGER NOT NULL,
    "choices" TEXT[],
    "progressKey" TEXT NOT NULL,
    "swapsUsed" INTEGER NOT NULL DEFAULT 0,
    "mysteryKey" TEXT NOT NULL,
    "revealedAt" TIMESTAMP(3),
    "chestOpenedAt" TIMESTAMP(3),
    "chestItem" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyMissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReussiteItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReussiteItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyMissions_userId_week_key" ON "WeeklyMissions"("userId", "week");

-- CreateIndex
CREATE INDEX "ReussiteItem_userId_item_idx" ON "ReussiteItem"("userId", "item");

-- CreateIndex
CREATE UNIQUE INDEX "ReussiteItem_userId_reason_key" ON "ReussiteItem"("userId", "reason");

-- AddForeignKey
ALTER TABLE "WeeklyMissions" ADD CONSTRAINT "WeeklyMissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReussiteItem" ADD CONSTRAINT "ReussiteItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
