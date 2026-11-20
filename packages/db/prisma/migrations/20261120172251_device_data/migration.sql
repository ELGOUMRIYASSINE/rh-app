-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "clockDriftSeconds" INTEGER,
ADD COLUMN     "faceCount" INTEGER,
ADD COLUMN     "fingerprintCapacity" INTEGER,
ADD COLUMN     "fingerprintCount" INTEGER,
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "logCapacity" INTEGER,
ADD COLUMN     "logCount" INTEGER,
ADD COLUMN     "macAddress" TEXT,
ADD COLUMN     "platform" TEXT,
ADD COLUMN     "reportedIp" TEXT,
ADD COLUMN     "userCapacity" INTEGER,
ADD COLUMN     "usersSyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Punch" ADD COLUMN     "state" TEXT,
ADD COLUMN     "workCode" TEXT;

-- CreateTable
CREATE TABLE "DeviceUser" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "deviceUserId" TEXT NOT NULL,
    "name" TEXT,
    "role" INTEGER NOT NULL DEFAULT 0,
    "cardNumber" TEXT,
    "hasPassword" BOOLEAN NOT NULL DEFAULT false,
    "fingerprints" INTEGER NOT NULL DEFAULT 0,
    "hasFace" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceCommand" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "deviceId" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "result" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),

    CONSTRAINT "DeviceCommand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeviceUser_organizationId_deviceUserId_idx" ON "DeviceUser"("organizationId", "deviceUserId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceUser_deviceId_deviceUserId_key" ON "DeviceUser"("deviceId", "deviceUserId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceCommand_seq_key" ON "DeviceCommand"("seq");

-- CreateIndex
CREATE INDEX "DeviceCommand_deviceId_status_idx" ON "DeviceCommand"("deviceId", "status");

-- AddForeignKey
ALTER TABLE "DeviceUser" ADD CONSTRAINT "DeviceUser_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceCommand" ADD CONSTRAINT "DeviceCommand_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
