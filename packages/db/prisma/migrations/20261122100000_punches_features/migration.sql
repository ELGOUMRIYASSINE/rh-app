-- DropIndex
DROP INDEX "Punch_deviceId_deviceUserId_timestamp_key";

-- AlterTable
ALTER TABLE "AttendanceDay" ADD COLUMN     "absenceNote" TEXT,
ADD COLUMN     "absenceReason" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "featureOverrides" JSONB,
ADD COLUMN     "punchDedupMinutes" INTEGER NOT NULL DEFAULT 10;

-- AlterTable
ALTER TABLE "Punch" ADD COLUMN     "deviceTime" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- Backfill: existing clock-ins keep their stored time as the clock time (repair tool fixes server-stamped ones)
UPDATE "Punch" SET "deviceTime" = "timestamp" WHERE "deviceId" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Punch_deviceId_deviceUserId_deviceTime_key" ON "Punch"("deviceId", "deviceUserId", "deviceTime");

