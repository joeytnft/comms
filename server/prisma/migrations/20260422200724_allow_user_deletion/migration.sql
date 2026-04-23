-- DropForeignKey
ALTER TABLE "alerts" DROP CONSTRAINT "alerts_triggeredById_fkey";

-- DropForeignKey
ALTER TABLE "incidents" DROP CONSTRAINT "incidents_reportedById_fkey";

-- DropForeignKey
ALTER TABLE "messages" DROP CONSTRAINT "messages_senderId_fkey";

-- DropForeignKey
ALTER TABLE "ptt_logs" DROP CONSTRAINT "ptt_logs_senderId_fkey";

-- DropForeignKey
ALTER TABLE "service_schedules" DROP CONSTRAINT "service_schedules_createdById_fkey";

-- DropForeignKey
ALTER TABLE "service_templates" DROP CONSTRAINT "service_templates_createdById_fkey";

-- DropForeignKey
ALTER TABLE "shift_assignments" DROP CONSTRAINT "shift_assignments_userId_fkey";

-- DropForeignKey
ALTER TABLE "shift_swap_requests" DROP CONSTRAINT "shift_swap_requests_toUserId_fkey";

-- DropForeignKey
ALTER TABLE "training_events" DROP CONSTRAINT "training_events_createdBy_fkey";

-- DropIndex
DROP INDEX IF EXISTS "geofences_organizationId_key";

-- DropIndex
DROP INDEX IF EXISTS "users_pcoPersonId_idx";

-- AlterTable
ALTER TABLE "alerts" ALTER COLUMN "triggeredById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "incidents" ALTER COLUMN "reportedById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "messages" ALTER COLUMN "senderId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "pco_scheduled_people" ALTER COLUMN "syncedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "pco_team_members" ALTER COLUMN "syncedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "pco_teams" ALTER COLUMN "syncedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "service_schedules" ALTER COLUMN "createdById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "service_templates" ALTER COLUMN "createdById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "training_events" ALTER COLUMN "createdBy" DROP NOT NULL;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "inviteExpiresAt" SET DATA TYPE TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ptt_push_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ptt_push_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "response_plans" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "response_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "response_plan_steps" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "assignedTo" TEXT,

    CONSTRAINT "response_plan_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ptt_push_tokens_groupId_idx" ON "ptt_push_tokens"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "ptt_push_tokens_userId_groupId_key" ON "ptt_push_tokens"("userId", "groupId");

-- CreateIndex
CREATE INDEX "response_plans_organizationId_idx" ON "response_plans"("organizationId");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ptt_logs" ADD CONSTRAINT "ptt_logs_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ptt_push_tokens" ADD CONSTRAINT "ptt_push_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ptt_push_tokens" ADD CONSTRAINT "ptt_push_tokens_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_templates" ADD CONSTRAINT "service_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_schedules" ADD CONSTRAINT "service_schedules_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_swap_requests" ADD CONSTRAINT "shift_swap_requests_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "response_plans" ADD CONSTRAINT "response_plans_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "response_plan_steps" ADD CONSTRAINT "response_plan_steps_planId_fkey" FOREIGN KEY ("planId") REFERENCES "response_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pco_teams" ADD CONSTRAINT "pco_teams_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "pco_connections"("organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pco_team_members" ADD CONSTRAINT "pco_team_members_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "pco_connections"("organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pco_scheduled_people" ADD CONSTRAINT "pco_scheduled_people_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "pco_connections"("organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_events" ADD CONSTRAINT "training_events_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "pco_scheduled_people_org_plan_person_key" RENAME TO "pco_scheduled_people_organizationId_pcoPlanId_pcoPersonId_key";

-- RenameIndex
ALTER INDEX "pco_team_members_org_team_person_key" RENAME TO "pco_team_members_organizationId_pcoTeamId_pcoPersonId_key";
