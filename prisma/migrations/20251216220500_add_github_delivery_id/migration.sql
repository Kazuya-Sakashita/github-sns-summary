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
    "rawPayload" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GithubEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
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
CREATE UNIQUE INDEX "GithubEvent_userId_repoName_prNumber_key" ON "GithubEvent"("userId", "repoName", "prNumber");

-- CreateIndex
CREATE INDEX "SnsPost_eventId_createdAt_idx" ON "SnsPost"("eventId", "createdAt");
