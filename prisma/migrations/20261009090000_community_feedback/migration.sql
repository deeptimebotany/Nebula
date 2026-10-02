-- Avis de la communauté (02/10/2026) : demandes d'avis sur une miniature ou
-- un titre avant publication, options, votes et commentaires. Ajouts seulement.
CREATE TABLE "FeedbackRequest" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "context" TEXT NOT NULL DEFAULT '',
    "network" TEXT,
    "closesAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeedbackRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeedbackOption" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "label" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT,
    CONSTRAINT "FeedbackOption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeedbackVote" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeedbackVote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeedbackComment" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeedbackComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FeedbackRequest_closesAt_idx" ON "FeedbackRequest"("closesAt");
CREATE INDEX "FeedbackRequest_authorId_createdAt_idx" ON "FeedbackRequest"("authorId", "createdAt");
CREATE INDEX "FeedbackRequest_createdAt_idx" ON "FeedbackRequest"("createdAt");
CREATE INDEX "FeedbackOption_requestId_idx" ON "FeedbackOption"("requestId");
CREATE UNIQUE INDEX "FeedbackVote_requestId_userId_key" ON "FeedbackVote"("requestId", "userId");
CREATE INDEX "FeedbackVote_optionId_idx" ON "FeedbackVote"("optionId");
CREATE INDEX "FeedbackVote_userId_idx" ON "FeedbackVote"("userId");
CREATE INDEX "FeedbackComment_requestId_createdAt_idx" ON "FeedbackComment"("requestId", "createdAt");
CREATE INDEX "FeedbackComment_authorId_idx" ON "FeedbackComment"("authorId");

ALTER TABLE "FeedbackRequest" ADD CONSTRAINT "FeedbackRequest_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedbackOption" ADD CONSTRAINT "FeedbackOption_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "FeedbackRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedbackVote" ADD CONSTRAINT "FeedbackVote_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "FeedbackRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedbackVote" ADD CONSTRAINT "FeedbackVote_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "FeedbackOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedbackVote" ADD CONSTRAINT "FeedbackVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedbackComment" ADD CONSTRAINT "FeedbackComment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "FeedbackRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedbackComment" ADD CONSTRAINT "FeedbackComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
