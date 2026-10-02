-- Veille des API (02/10/2026) : sources relues chaque jour, annonces
-- repérées, signaux de dépréciation lus dans les réponses des API.
CREATE TABLE "ApiWatchSource" (
    "key" TEXT NOT NULL,
    "lastCheckedAt" TIMESTAMP(3),
    "lastOkAt" TIMESTAMP(3),
    "lastError" TEXT,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "contentHash" TEXT,
    "snapshot" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiWatchSource_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "ApiWatchItem" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "excerpt" TEXT,
    "publishedAt" TIMESTAMP(3),
    "important" BOOLEAN NOT NULL DEFAULT false,
    "baseline" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handledAt" TIMESTAMP(3),

    CONSTRAINT "ApiWatchItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApiWatchItem_sourceKey_externalId_key" ON "ApiWatchItem"("sourceKey", "externalId");
CREATE INDEX "ApiWatchItem_createdAt_idx" ON "ApiWatchItem"("createdAt");

CREATE TABLE "ApiSignal" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "sunsetAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "count" INTEGER NOT NULL DEFAULT 1,
    "handledAt" TIMESTAMP(3),

    CONSTRAINT "ApiSignal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApiSignal_key_key" ON "ApiSignal"("key");
CREATE INDEX "ApiSignal_lastSeenAt_idx" ON "ApiSignal"("lastSeenAt");
