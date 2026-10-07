-- Premier commentaire (07/10/2026) : sort du commentaire publié sous la
-- publication, réseau par réseau (POSTED, WAITING, SENDING, FAILED,
-- UNSUPPORTED), raison, nombre d'essais et prochain essai (cron).
ALTER TABLE "PostTarget" ADD COLUMN "firstCommentStatus" TEXT;
ALTER TABLE "PostTarget" ADD COLUMN "firstCommentError" TEXT;
ALTER TABLE "PostTarget" ADD COLUMN "firstCommentAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PostTarget" ADD COLUMN "firstCommentNextAt" TIMESTAMP(3);

CREATE INDEX "PostTarget_firstCommentStatus_firstCommentNextAt_idx" ON "PostTarget"("firstCommentStatus", "firstCommentNextAt");
