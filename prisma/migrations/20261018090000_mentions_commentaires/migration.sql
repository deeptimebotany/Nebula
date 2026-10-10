-- Mentions et commentaires (10/10/2026, demandes de Lucas).

-- 1. Mentions @pseudo de la Communauté : une ligne par personne mentionnée
--    et par message (onglet « Mentions »). Part avec le message.
CREATE TABLE "CommunityMention" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "threadId" TEXT,
    "replyId" TEXT,
    "requestId" TEXT,
    "commentId" TEXT,
    "excerpt" TEXT NOT NULL DEFAULT '',
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityMention_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CommunityMention_userId_createdAt_idx" ON "CommunityMention"("userId", "createdAt");
CREATE INDEX "CommunityMention_authorId_idx" ON "CommunityMention"("authorId");
CREATE INDEX "CommunityMention_threadId_idx" ON "CommunityMention"("threadId");
CREATE INDEX "CommunityMention_replyId_idx" ON "CommunityMention"("replyId");
CREATE INDEX "CommunityMention_requestId_idx" ON "CommunityMention"("requestId");
CREATE INDEX "CommunityMention_commentId_idx" ON "CommunityMention"("commentId");
ALTER TABLE "CommunityMention" ADD CONSTRAINT "CommunityMention_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityMention" ADD CONSTRAINT "CommunityMention_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityMention" ADD CONSTRAINT "CommunityMention_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ForumThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityMention" ADD CONSTRAINT "CommunityMention_replyId_fkey" FOREIGN KEY ("replyId") REFERENCES "ForumReply"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityMention" ADD CONSTRAINT "CommunityMention_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "FeedbackRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityMention" ADD CONSTRAINT "CommunityMention_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "FeedbackComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Commentaires des réseaux façon YouTube Studio : contenu commenté
--    (titre, miniature) et « j'aime » du compte sur le commentaire.
ALTER TABLE "EngagementItem" ADD COLUMN "postTitle" TEXT;
ALTER TABLE "EngagementItem" ADD COLUMN "postThumbnailUrl" TEXT;
ALTER TABLE "EngagementItem" ADD COLUMN "ownerLikedAt" TIMESTAMP(3);
ALTER TABLE "EngagementItem" ADD COLUMN "ownerLikeId" TEXT;
