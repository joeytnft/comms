-- Migrate existing rows to new tier names, then swap out the enum type.

-- 1. Migrate data (new values exist after the previous migration)
UPDATE "organizations" SET "subscriptionTier" = 'STARTER' WHERE "subscriptionTier" = 'BASIC';
UPDATE "organizations" SET "subscriptionTier" = 'TEAM'    WHERE "subscriptionTier" = 'STANDARD';
UPDATE "organizations" SET "subscriptionTier" = 'PRO'     WHERE "subscriptionTier" = 'ENTERPRISE';

UPDATE "billing_events" SET "tier" = 'STARTER' WHERE "tier" = 'BASIC';
UPDATE "billing_events" SET "tier" = 'TEAM'    WHERE "tier" = 'STANDARD';
UPDATE "billing_events" SET "tier" = 'PRO'     WHERE "tier" = 'ENTERPRISE';

-- 2. Replace the enum type (Postgres requires creating a new type,
--    swapping columns, then dropping the old type)
CREATE TYPE "SubscriptionTier_new" AS ENUM ('FREE', 'STARTER', 'TEAM', 'PRO');

ALTER TABLE "organizations"
  ALTER COLUMN "subscriptionTier" TYPE "SubscriptionTier_new"
  USING "subscriptionTier"::text::"SubscriptionTier_new";

ALTER TABLE "billing_events"
  ALTER COLUMN "tier" TYPE "SubscriptionTier_new"
  USING "tier"::text::"SubscriptionTier_new";

DROP TYPE "SubscriptionTier";
ALTER TYPE "SubscriptionTier_new" RENAME TO "SubscriptionTier";
