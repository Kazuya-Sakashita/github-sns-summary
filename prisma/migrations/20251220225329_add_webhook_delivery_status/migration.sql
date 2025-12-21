-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GithubWebhookDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deliveryId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "signature256" TEXT,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" DATETIME,
    "processedAt" DATETIME,
    "errorMessage" TEXT,
    "githubEventId" TEXT,
    "rawPayload" JSONB NOT NULL,
    CONSTRAINT "GithubWebhookDelivery_githubEventId_fkey" FOREIGN KEY ("githubEventId") REFERENCES "GithubEvent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_GithubWebhookDelivery" ("deliveryId", "eventName", "githubEventId", "id", "rawPayload", "receivedAt", "signature256") SELECT "deliveryId", "eventName", "githubEventId", "id", "rawPayload", "receivedAt", "signature256" FROM "GithubWebhookDelivery";
DROP TABLE "GithubWebhookDelivery";
ALTER TABLE "new_GithubWebhookDelivery" RENAME TO "GithubWebhookDelivery";
CREATE UNIQUE INDEX "GithubWebhookDelivery_deliveryId_key" ON "GithubWebhookDelivery"("deliveryId");
CREATE INDEX "GithubWebhookDelivery_eventName_receivedAt_idx" ON "GithubWebhookDelivery"("eventName", "receivedAt");
CREATE INDEX "GithubWebhookDelivery_githubEventId_idx" ON "GithubWebhookDelivery"("githubEventId");
CREATE INDEX "GithubWebhookDelivery_status_receivedAt_idx" ON "GithubWebhookDelivery"("status", "receivedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
