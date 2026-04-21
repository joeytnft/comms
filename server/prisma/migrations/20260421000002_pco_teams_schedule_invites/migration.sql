-- Add invite and PCO link fields to users
ALTER TABLE "users" ADD COLUMN "pcoPersonId" TEXT;
ALTER TABLE "users" ADD COLUMN "inviteToken" TEXT;
ALTER TABLE "users" ADD COLUMN "inviteExpiresAt" TIMESTAMPTZ;
ALTER TABLE "users" ADD COLUMN "accountStatus" TEXT NOT NULL DEFAULT 'ACTIVE';

CREATE UNIQUE INDEX "users_inviteToken_key" ON "users"("inviteToken");
CREATE INDEX "users_pcoPersonId_idx" ON "users"("pcoPersonId");

-- PCO Teams (mirrors Planning Center Services teams)
CREATE TABLE "pco_teams" (
  "id"              TEXT         NOT NULL,
  "organizationId"  TEXT         NOT NULL,
  "pcoId"           TEXT         NOT NULL,
  "serviceTypeId"   TEXT         NOT NULL,
  "serviceTypeName" TEXT         NOT NULL,
  "name"            TEXT         NOT NULL,
  "groupId"         TEXT,
  "syncedAt"        TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pco_teams_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "pco_teams_organizationId_pcoId_key" ON "pco_teams"("organizationId", "pcoId");
CREATE INDEX "pco_teams_organizationId_idx" ON "pco_teams"("organizationId");

-- PCO Team Members (standing roster per team)
CREATE TABLE "pco_team_members" (
  "id"             TEXT        NOT NULL,
  "organizationId" TEXT        NOT NULL,
  "pcoTeamId"      TEXT        NOT NULL,
  "pcoPersonId"    TEXT        NOT NULL,
  "syncedAt"       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pco_team_members_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "pco_team_members_org_team_person_key" ON "pco_team_members"("organizationId", "pcoTeamId", "pcoPersonId");
CREATE INDEX "pco_team_members_organizationId_pcoTeamId_idx" ON "pco_team_members"("organizationId", "pcoTeamId");

-- PCO Scheduled People (per-plan service assignments)
CREATE TABLE "pco_scheduled_people" (
  "id"             TEXT        NOT NULL,
  "organizationId" TEXT        NOT NULL,
  "pcoPlanId"      TEXT        NOT NULL,
  "pcoPersonId"    TEXT        NOT NULL,
  "pcoTeamId"      TEXT,
  "status"         TEXT        NOT NULL DEFAULT 'U',
  "position"       TEXT,
  "syncedAt"       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pco_scheduled_people_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "pco_scheduled_people_org_plan_person_key" ON "pco_scheduled_people"("organizationId", "pcoPlanId", "pcoPersonId");
CREATE INDEX "pco_scheduled_people_organizationId_pcoPlanId_idx" ON "pco_scheduled_people"("organizationId", "pcoPlanId");
