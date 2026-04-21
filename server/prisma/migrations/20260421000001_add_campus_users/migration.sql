-- CreateTable: campus_users (many-to-many between campuses and users)
CREATE TABLE "campus_users" (
    "id" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campus_users_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: a user can only appear once per campus
ALTER TABLE "campus_users" ADD CONSTRAINT "campus_users_campusId_userId_key" UNIQUE ("campusId", "userId");

-- Indexes
CREATE INDEX "campus_users_campusId_idx" ON "campus_users"("campusId");
CREATE INDEX "campus_users_userId_idx" ON "campus_users"("userId");

-- Foreign keys
ALTER TABLE "campus_users" ADD CONSTRAINT "campus_users_campusId_fkey"
    FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campus_users" ADD CONSTRAINT "campus_users_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate existing data: backfill a campus_users row for every user that has a campusId
INSERT INTO "campus_users" ("id", "campusId", "userId", "joinedAt")
SELECT
    gen_random_uuid()::text,
    "campusId",
    "id",
    "createdAt"
FROM "users"
WHERE "campusId" IS NOT NULL
ON CONFLICT DO NOTHING;
