-- AlterTable
ALTER TABLE "GithubEvent" ADD COLUMN "mergeCommitSha" TEXT;
ALTER TABLE "GithubEvent" ADD COLUMN "mergedAt" DATETIME;
