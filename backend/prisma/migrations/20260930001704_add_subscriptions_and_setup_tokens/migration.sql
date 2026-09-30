-- AlterTable
ALTER TABLE "User" ALTER COLUMN "password" DROP NOT NULL,
ALTER COLUMN "role" SET DEFAULT 'pending';

-- CreateTable
CREATE TABLE "Subscription" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "abacatepaySubscriptionId" TEXT,
    "abacatepayCustomerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "currentPeriodEnd" TIMESTAMP(3),
    "plan" TEXT NOT NULL DEFAULT 'monthly',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordSetupToken" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordSetupToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedWebhookEvent" (
    "id" SERIAL NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordSetupToken_token_key" ON "PasswordSetupToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedWebhookEvent_eventId_key" ON "ProcessedWebhookEvent"("eventId");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordSetupToken" ADD CONSTRAINT "PasswordSetupToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
