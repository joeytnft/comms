-- Per-campus geofence support
-- Drop org-level unique constraint
ALTER TABLE "geofences" DROP CONSTRAINT IF EXISTS "geofences_organizationId_key";

-- Add campusId column (required, unique — one geofence per campus)
ALTER TABLE "geofences" ADD COLUMN "campusId" TEXT NOT NULL;
ALTER TABLE "geofences" ADD CONSTRAINT "geofences_campusId_key" UNIQUE ("campusId");
ALTER TABLE "geofences" ADD CONSTRAINT "geofences_campusId_fkey"
  FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Index for org-level queries
CREATE INDEX IF NOT EXISTS "geofences_organizationId_idx" ON "geofences"("organizationId");
