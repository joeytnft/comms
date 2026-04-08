-- CreateTable
CREATE TABLE "alert_group_targets" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,

    CONSTRAINT "alert_group_targets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "alert_group_targets_alertId_groupId_key" ON "alert_group_targets"("alertId", "groupId");

-- AddForeignKey
ALTER TABLE "alert_group_targets" ADD CONSTRAINT "alert_group_targets_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_group_targets" ADD CONSTRAINT "alert_group_targets_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
