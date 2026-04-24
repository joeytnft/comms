-- Add polygon support to geofences table
ALTER TABLE "geofences" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'circle';
ALTER TABLE "geofences" ADD COLUMN "polygon" JSONB;
