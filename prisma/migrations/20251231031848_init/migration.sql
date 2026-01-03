-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "GithubEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "githubDeliveryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "repoName" TEXT NOT NULL,
    "prNumber" INTEGER NOT NULL,
    "prTitle" TEXT NOT NULL,
    "prUrl" TEXT NOT NULL,
    "mergedBy" TEXT,
    "mergedAt" DATETIME,
    "mergeCommitSha" TEXT,
    "rawPayload" JSONB NOT NULL,
    "prAuthor" TEXT,
    "prBody" TEXT,
    "prLabels" JSONB,
    "prFetchedAt" DATETIME,
    "prFetchError" TEXT,
    "prFilesCount" INTEGER,
    "prAdditions" INTEGER,
    "prDeletions" INTEGER,
    "prFileStats" JSONB,
    "prChanges" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GithubEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GithubPullRequestFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "additions" INTEGER NOT NULL,
    "deletions" INTEGER NOT NULL,
    "changes" INTEGER NOT NULL,
    "extension" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GithubPullRequestFile_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "GithubEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GithubWebhookDelivery" (
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

-- CreateTable
CREATE TABLE "SnsPost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "externalId" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SnsPost_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "GithubEvent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "GithubEvent_githubDeliveryId_key" ON "GithubEvent"("githubDeliveryId");

-- CreateIndex
CREATE INDEX "GithubEvent_userId_createdAt_idx" ON "GithubEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "GithubEvent_repoName_prNumber_idx" ON "GithubEvent"("repoName", "prNumber");

-- CreateIndex
CREATE INDEX "GithubEvent_prFetchedAt_idx" ON "GithubEvent"("prFetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GithubEvent_userId_repoName_prNumber_key" ON "GithubEvent"("userId", "repoName", "prNumber");

-- CreateIndex
CREATE INDEX "GithubPullRequestFile_eventId_idx" ON "GithubPullRequestFile"("eventId");

-- CreateIndex
CREATE INDEX "GithubPullRequestFile_extension_idx" ON "GithubPullRequestFile"("extension");

-- CreateIndex
CREATE UNIQUE INDEX "GithubPullRequestFile_eventId_filename_key" ON "GithubPullRequestFile"("eventId", "filename");

-- CreateIndex
CREATE UNIQUE INDEX "GithubWebhookDelivery_deliveryId_key" ON "GithubWebhookDelivery"("deliveryId");

-- CreateIndex
CREATE INDEX "GithubWebhookDelivery_eventName_receivedAt_idx" ON "GithubWebhookDelivery"("eventName", "receivedAt");

-- CreateIndex
CREATE INDEX "GithubWebhookDelivery_githubEventId_idx" ON "GithubWebhookDelivery"("githubEventId");

-- CreateIndex
CREATE INDEX "GithubWebhookDelivery_status_receivedAt_idx" ON "GithubWebhookDelivery"("status", "receivedAt");

-- CreateIndex
CREATE INDEX "SnsPost_eventId_createdAt_idx" ON "SnsPost"("eventId", "createdAt");
