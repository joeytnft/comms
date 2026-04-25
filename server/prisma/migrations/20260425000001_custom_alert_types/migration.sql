-- CreateTable
CREATE TABLE "custom_alert_types" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "label" VARCHAR(50) NOT NULL,
    "description" VARCHAR(100) NOT NULL DEFAULT '',
    "color" VARCHAR(7) NOT NULL,
    "emoji" VARCHAR(10) NOT NULL,
    "defaultLevel" "AlertLevel" NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_alert_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "custom_alert_types_organizationId_idx" ON "custom_alert_types"("organizationId");

-- AddForeignKey
ALTER TABLE "custom_alert_types" ADD CONSTRAINT "custom_alert_types_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_alert_types" ADD CONSTRAINT "custom_alert_types_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
