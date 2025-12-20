-- CreateTable
CREATE TABLE "GithubWebhookDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deliveryId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "signature256" TEXT,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "githubEventId" TEXT,
    "rawPayload" JSONB NOT NULL,
    CONSTRAINT "GithubWebhookDelivery_githubEventId_fkey" FOREIGN KEY ("githubEventId") REFERENCES "GithubEvent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "GithubWebhookDelivery_deliveryId_key" ON "GithubWebhookDelivery"("deliveryId");

-- CreateIndex
CREATE INDEX "GithubWebhookDelivery_eventName_receivedAt_idx" ON "GithubWebhookDelivery"("eventName", "receivedAt");

-- CreateIndex
CREATE INDEX "GithubWebhookDelivery_githubEventId_idx" ON "GithubWebhookDelivery"("githubEventId");
