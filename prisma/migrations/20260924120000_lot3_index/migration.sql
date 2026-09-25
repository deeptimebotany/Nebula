-- CreateIndex
CREATE INDEX "PartnerGrant_userId_idx" ON "PartnerGrant"("userId");

-- CreateIndex
CREATE INDEX "Membership_brandId_role_idx" ON "Membership"("brandId", "role");

-- CreateIndex
CREATE INDEX "MediaAsset_brandId_createdAt_idx" ON "MediaAsset"("brandId", "createdAt");

-- CreateIndex
CREATE INDEX "Post_brandId_scheduledAt_idx" ON "Post"("brandId", "scheduledAt");

-- CreateIndex
CREATE INDEX "Post_brandId_createdAt_idx" ON "Post"("brandId", "createdAt");

-- CreateIndex
CREATE INDEX "Post_createdById_status_idx" ON "Post"("createdById", "status");

-- CreateIndex
CREATE INDEX "PostMedia_postId_idx" ON "PostMedia"("postId");

-- CreateIndex
CREATE INDEX "PostMedia_mediaAssetId_idx" ON "PostMedia"("mediaAssetId");

-- CreateIndex
CREATE INDEX "PostTarget_postId_idx" ON "PostTarget"("postId");

-- CreateIndex
CREATE INDEX "PostTarget_connectionId_status_idx" ON "PostTarget"("connectionId", "status");

-- CreateIndex
CREATE INDEX "ForumThread_authorId_idx" ON "ForumThread"("authorId");

-- CreateIndex
CREATE INDEX "ForumReply_authorId_idx" ON "ForumReply"("authorId");

-- CreateIndex
CREATE INDEX "SharedVideo_authorId_idx" ON "SharedVideo"("authorId");

-- CreateIndex
CREATE INDEX "PollVote_userId_idx" ON "PollVote"("userId");

-- CreateIndex
CREATE INDEX "LifecycleEmail_userId_idx" ON "LifecycleEmail"("userId");

