/*
  Warnings:

  - Made the column `githubDeliveryId` on table `GithubEvent` required. This step will fail if there are existing NULL values in that column.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GithubEvent" (
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
INSERT INTO "new_GithubEvent" ("createdAt", "githubDeliveryId", "id", "mergedBy", "prNumber", "prTitle", "prUrl", "rawPayload", "repoName", "userId") SELECT "createdAt", "githubDeliveryId", "id", "mergedBy", "prNumber", "prTitle", "prUrl", "rawPayload", "repoName", "userId" FROM "GithubEvent";
DROP TABLE "GithubEvent";
ALTER TABLE "new_GithubEvent" RENAME TO "GithubEvent";
CREATE UNIQUE INDEX "GithubEvent_githubDeliveryId_key" ON "GithubEvent"("githubDeliveryId");
CREATE INDEX "GithubEvent_userId_createdAt_idx" ON "GithubEvent"("userId", "createdAt");
CREATE INDEX "GithubEvent_repoName_prNumber_idx" ON "GithubEvent"("repoName", "prNumber");
CREATE UNIQUE INDEX "GithubEvent_userId_repoName_prNumber_key" ON "GithubEvent"("userId", "repoName", "prNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
