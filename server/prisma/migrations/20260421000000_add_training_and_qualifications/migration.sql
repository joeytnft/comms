-- CreateEnum
CREATE TYPE "SignupStatus" AS ENUM ('CONFIRMED', 'CANCELLED', 'WAITLISTED');

-- CreateTable: qualification_types
CREATE TABLE "qualification_types" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "validityDays" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qualification_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable: member_qualifications
CREATE TABLE "member_qualifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "qualificationTypeId" TEXT NOT NULL,
    "earnedDate" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "notes" TEXT,
    "awardedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_qualifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable: training_events
CREATE TABLE "training_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "maxAttendees" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable: training_group_targets
CREATE TABLE "training_group_targets" (
    "id" TEXT NOT NULL,
    "trainingEventId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,

    CONSTRAINT "training_group_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable: training_signups
CREATE TABLE "training_signups" (
    "id" TEXT NOT NULL,
    "trainingEventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "SignupStatus" NOT NULL DEFAULT 'CONFIRMED',
    "notes" TEXT,
    "signedUpAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_signups_pkey" PRIMARY KEY ("id")
);

-- Unique constraints
ALTER TABLE "qualification_types" ADD CONSTRAINT "qualification_types_organizationId_name_key" UNIQUE ("organizationId", "name");
ALTER TABLE "member_qualifications" ADD CONSTRAINT "member_qualifications_userId_qualificationTypeId_key" UNIQUE ("userId", "qualificationTypeId");
ALTER TABLE "training_group_targets" ADD CONSTRAINT "training_group_targets_trainingEventId_groupId_key" UNIQUE ("trainingEventId", "groupId");
ALTER TABLE "training_signups" ADD CONSTRAINT "training_signups_trainingEventId_userId_key" UNIQUE ("trainingEventId", "userId");

-- Indexes
CREATE INDEX "qualification_types_organizationId_idx" ON "qualification_types"("organizationId");
CREATE INDEX "member_qualifications_userId_idx" ON "member_qualifications"("userId");
CREATE INDEX "member_qualifications_qualificationTypeId_idx" ON "member_qualifications"("qualificationTypeId");
CREATE INDEX "training_events_organizationId_idx" ON "training_events"("organizationId");
CREATE INDEX "training_events_startDate_idx" ON "training_events"("startDate");
CREATE INDEX "training_group_targets_trainingEventId_idx" ON "training_group_targets"("trainingEventId");
CREATE INDEX "training_group_targets_groupId_idx" ON "training_group_targets"("groupId");
CREATE INDEX "training_signups_trainingEventId_idx" ON "training_signups"("trainingEventId");
CREATE INDEX "training_signups_userId_idx" ON "training_signups"("userId");

-- Foreign keys: qualification_types
ALTER TABLE "qualification_types" ADD CONSTRAINT "qualification_types_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Foreign keys: member_qualifications
ALTER TABLE "member_qualifications" ADD CONSTRAINT "member_qualifications_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "member_qualifications" ADD CONSTRAINT "member_qualifications_qualificationTypeId_fkey"
    FOREIGN KEY ("qualificationTypeId") REFERENCES "qualification_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Foreign keys: training_events
ALTER TABLE "training_events" ADD CONSTRAINT "training_events_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "training_events" ADD CONSTRAINT "training_events_createdBy_fkey"
    FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Foreign keys: training_group_targets
ALTER TABLE "training_group_targets" ADD CONSTRAINT "training_group_targets_trainingEventId_fkey"
    FOREIGN KEY ("trainingEventId") REFERENCES "training_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "training_group_targets" ADD CONSTRAINT "training_group_targets_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Foreign keys: training_signups
ALTER TABLE "training_signups" ADD CONSTRAINT "training_signups_trainingEventId_fkey"
    FOREIGN KEY ("trainingEventId") REFERENCES "training_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "training_signups" ADD CONSTRAINT "training_signups_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
