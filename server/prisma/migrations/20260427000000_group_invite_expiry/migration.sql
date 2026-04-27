-- Add invite-code expiry to groups. Existing rows get a NULL expiry which
-- is treated as "no expiration" by the read path (legacy codes keep working
-- until rotated). Admins can issue fresh codes that include an expiry.
ALTER TABLE "groups" ADD COLUMN "inviteCodeExpiresAt" TIMESTAMP(3);
