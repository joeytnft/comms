-- AlterTable
ALTER TABLE "alerts" ADD COLUMN     "campusId" TEXT;

-- AlterTable
ALTER TABLE "groups" ADD COLUMN     "campusId" TEXT;

-- AlterTable
ALTER TABLE "incidents" ADD COLUMN     "campusId" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "campusId" TEXT;

-- CreateTable
CREATE TABLE "campuses" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "address" TEXT,
    "inviteCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campuses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "campuses_inviteCode_key" ON "campuses"("inviteCode");

-- CreateIndex
CREATE INDEX "campuses_organizationId_idx" ON "campuses"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "campuses_organizationId_name_key" ON "campuses"("organizationId", "name");

-- AddForeignKey
ALTER TABLE "campuses" ADD CONSTRAINT "campuses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
