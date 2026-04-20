-- Add new enum values so the data migration step can reference them.
-- ADD VALUE IF NOT EXISTS is safe to re-run and works in Postgres 12+
-- transactions (the new values are visible after commit).

ALTER TYPE "SubscriptionTier" ADD VALUE IF NOT EXISTS 'STARTER';
ALTER TYPE "SubscriptionTier" ADD VALUE IF NOT EXISTS 'TEAM';
ALTER TYPE "SubscriptionTier" ADD VALUE IF NOT EXISTS 'PRO';
