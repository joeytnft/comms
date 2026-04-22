-- Add expoPushToken to users (was added to schema without a migration)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "expoPushToken" TEXT;
