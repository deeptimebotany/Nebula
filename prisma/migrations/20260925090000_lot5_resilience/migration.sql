-- AlterTable
ALTER TABLE "PostTarget" ADD COLUMN     "autoRetries" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "errorCategory" TEXT;

-- CreateTable
CREATE TABLE "NetworkControl" (
    "network" TEXT NOT NULL,
    "publishEnabled" BOOLEAN NOT NULL DEFAULT true,
    "syncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "message" TEXT,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "failureWindowStart" TIMESTAMP(3),
    "trippedUntil" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "lastFailureCategory" TEXT,
    "lastFailureMessage" TEXT,
    "lastSuccessAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NetworkControl_pkey" PRIMARY KEY ("network")
);

