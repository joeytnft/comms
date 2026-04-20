-- Rename BASIC→STARTER, STANDARD→TEAM, ENTERPRISE→PRO and replace the
-- enum type. Wrapped in a DO block so it is idempotent: if BASIC no
-- longer exists (already migrated manually) the entire block is a no-op.
-- All DDL is via EXECUTE to keep the whole thing transaction-safe.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'SubscriptionTier' AND e.enumlabel = 'BASIC'
  ) THEN
    EXECUTE 'CREATE TYPE "SubscriptionTier_new" AS ENUM (''FREE'', ''STARTER'', ''TEAM'', ''PRO'')';

    EXECUTE 'ALTER TABLE organizations ALTER COLUMN "subscriptionTier" DROP DEFAULT';
    EXECUTE 'ALTER TABLE organizations ALTER COLUMN "subscriptionTier" TYPE text USING "subscriptionTier"::text';
    EXECUTE 'ALTER TABLE billing_events ALTER COLUMN tier TYPE text USING tier::text';

    EXECUTE 'UPDATE organizations SET "subscriptionTier" = ''STARTER'' WHERE "subscriptionTier" = ''BASIC''';
    EXECUTE 'UPDATE organizations SET "subscriptionTier" = ''TEAM''    WHERE "subscriptionTier" = ''STANDARD''';
    EXECUTE 'UPDATE organizations SET "subscriptionTier" = ''PRO''     WHERE "subscriptionTier" = ''ENTERPRISE''';
    EXECUTE 'UPDATE billing_events SET tier = ''STARTER'' WHERE tier = ''BASIC''';
    EXECUTE 'UPDATE billing_events SET tier = ''TEAM''    WHERE tier = ''STANDARD''';
    EXECUTE 'UPDATE billing_events SET tier = ''PRO''     WHERE tier = ''ENTERPRISE''';

    EXECUTE 'ALTER TABLE organizations ALTER COLUMN "subscriptionTier" TYPE "SubscriptionTier_new" USING "subscriptionTier"::"SubscriptionTier_new"';
    EXECUTE 'ALTER TABLE billing_events ALTER COLUMN tier TYPE "SubscriptionTier_new" USING tier::"SubscriptionTier_new"';

    EXECUTE 'ALTER TABLE organizations ALTER COLUMN "subscriptionTier" SET DEFAULT ''FREE''::"SubscriptionTier_new"';

    EXECUTE 'DROP TYPE "SubscriptionTier"';
    EXECUTE 'ALTER TYPE "SubscriptionTier_new" RENAME TO "SubscriptionTier"';
  END IF;
END
$$;
