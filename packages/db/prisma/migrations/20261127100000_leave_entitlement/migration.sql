-- AlterTable
ALTER TABLE "LeaveBalance" ADD COLUMN     "entitlement" DECIMAL(6,2),
ADD COLUMN     "declaredAt" TIMESTAMP(3),
ADD COLUMN     "declaredById" TEXT;
