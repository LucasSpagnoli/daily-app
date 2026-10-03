-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "dataRetentionChoice" TEXT,
ADD COLUMN     "deletionWarningSentAt" TIMESTAMP(3),
ADD COLUMN     "scheduledDataDeletionAt" TIMESTAMP(3);
