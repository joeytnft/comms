-- CreateIndex
CREATE INDEX "group_memberships_userId_idx" ON "group_memberships"("userId");

-- CreateIndex
CREATE INDEX "read_receipts_userId_idx" ON "read_receipts"("userId");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_expiresAt_idx" ON "refresh_tokens"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "users_organizationId_idx" ON "users"("organizationId");
