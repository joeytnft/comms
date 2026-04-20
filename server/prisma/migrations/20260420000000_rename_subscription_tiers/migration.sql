-- Rename SubscriptionTier enum values: BASIC→STARTER, STANDARD→TEAM, ENTERPRISE→PRO
--
-- Wrapped in a DO block so it is:
--   1. Transaction-safe (no bare ALTER TYPE ADD VALUE outside a transaction)
--   2. Idempotent — skips entirely if BASIC no longer exists (already migrated)

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'SubscriptionTier' AND e.enumlabel = 'BASIC'
  ) THEN
    -- Create the replacement enum
    EXECUTE 'CREATE TYPE "SubscriptionTier_new" AS ENUM (''FREE'', ''STARTER'', ''TEAM'', ''PRO'')';

    -- Convert columns to text so values can be freely rewritten
    EXECUTE 'ALTER TABLE organizations ALTER COLUMN "subscriptionTier" DROP DEFAULT';
    EXECUTE 'ALTER TABLE organizations ALTER COLUMN "subscriptionTier" TYPE text USING "subscriptionTier"::text';
    EXECUTE 'ALTER TABLE billing_events ALTER COLUMN tier TYPE text USING tier::text';

    -- Rename existing rows
    EXECUTE 'UPDATE organizations SET "subscriptionTier" = ''STARTER'' WHERE "subscriptionTier" = ''BASIC''';
    EXECUTE 'UPDATE organizations SET "subscriptionTier" = ''TEAM''    WHERE "subscriptionTier" = ''STANDARD''';
    EXECUTE 'UPDATE organizations SET "subscriptionTier" = ''PRO''     WHERE "subscriptionTier" = ''ENTERPRISE''';
    EXECUTE 'UPDATE billing_events SET tier = ''STARTER'' WHERE tier = ''BASIC''';
    EXECUTE 'UPDATE billing_events SET tier = ''TEAM''    WHERE tier = ''STANDARD''';
    EXECUTE 'UPDATE billing_events SET tier = ''PRO''     WHERE tier = ''ENTERPRISE''';

    -- Cast columns to the new enum
    EXECUTE 'ALTER TABLE organizations ALTER COLUMN "subscriptionTier" TYPE "SubscriptionTier_new" USING "subscriptionTier"::"SubscriptionTier_new"';
    EXECUTE 'ALTER TABLE billing_events ALTER COLUMN tier TYPE "SubscriptionTier_new" USING tier::"SubscriptionTier_new"';

    -- Restore the column default
    EXECUTE 'ALTER TABLE organizations ALTER COLUMN "subscriptionTier" SET DEFAULT ''FREE''::"SubscriptionTier_new"';

    -- Swap type names
    EXECUTE 'DROP TYPE "SubscriptionTier"';
    EXECUTE 'ALTER TYPE "SubscriptionTier_new" RENAME TO "SubscriptionTier"';
  END IF;
END
$$;
