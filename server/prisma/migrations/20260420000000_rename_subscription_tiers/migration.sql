-- Rename subscription tiers from the original four-tier model
-- (FREE / BASIC / STANDARD / ENTERPRISE) to the three-product RevenueCat
-- model (FREE / STARTER / TEAM / PRO).
--
-- ADD VALUE cannot run inside a transaction in Postgres, so those
-- statements appear first and must be committed before the rest runs.
-- Prisma executes migration files outside an implicit transaction only
-- when they begin with "-- This migration...", so run this manually if
-- needed: psql $DATABASE_URL -f migration.sql

ALTER TYPE "SubscriptionTier" ADD VALUE IF NOT EXISTS 'STARTER';
ALTER TYPE "SubscriptionTier" ADD VALUE IF NOT EXISTS 'TEAM';
ALTER TYPE "SubscriptionTier" ADD VALUE IF NOT EXISTS 'PRO';
