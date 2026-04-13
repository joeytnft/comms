-- CreateTable
CREATE TABLE "pco_people" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "pcoId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "avatarUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pco_people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pco_plans" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "pcoId" TEXT NOT NULL,
    "serviceTypeId" TEXT NOT NULL,
    "serviceTypeName" TEXT NOT NULL,
    "title" TEXT,
    "seriesTitle" TEXT,
    "sortDate" TIMESTAMP(3),
    "totalLength" INTEGER NOT NULL DEFAULT 0,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pco_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pco_people_organizationId_pcoId_key" ON "pco_people"("organizationId", "pcoId");
CREATE INDEX "pco_people_organizationId_idx" ON "pco_people"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "pco_plans_organizationId_pcoId_key" ON "pco_plans"("organizationId", "pcoId");
CREATE INDEX "pco_plans_organizationId_sortDate_idx" ON "pco_plans"("organizationId", "sortDate");

-- AddForeignKey
ALTER TABLE "pco_people" ADD CONSTRAINT "pco_people_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "pco_connections"("organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pco_plans" ADD CONSTRAINT "pco_plans_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "pco_connections"("organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
