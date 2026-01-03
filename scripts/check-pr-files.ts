// scripts/check-pr-files.ts
import "dotenv/config"

// ESM + ts-node では .ts 拡張子まで書く
import { prisma } from "../src/server/db/client.ts"
import {
  fetchPullRequestFiles,
  summarizePullRequestFiles,
} from "../src/lib/github/fetchPullRequestFiles.ts"

async function main() {
  const token = process.env.GITHUB_TOKEN
  const ownerUserId = process.env.OWNER_USER_ID

  if (!token) throw new Error("GITHUB_TOKEN is missing")
  if (!ownerUserId) throw new Error("OWNER_USER_ID is missing")

  // 実在 repo/pr
  const repoFullName = "Kazuya-Sakashita/github-sns-summary"
  const prNumber = 42

  // まず event を1件作る（files と紐付ける親）
  // まず event を upsert（files と紐付ける親）
  const event = await prisma.githubEvent.upsert({
    where: {
      userId_repoName_prNumber: {
        userId: ownerUserId,
        repoName: repoFullName,
        prNumber,
      },
    },
    create: {
      githubDeliveryId: `manual-${Date.now()}`,
      userId: ownerUserId,
      repoName: repoFullName,
      prNumber,
      prTitle: "manual check",
      prUrl: `https://github.com/${repoFullName}/pull/${prNumber}`,
      mergedBy: null,
      mergedAt: null,
      mergeCommitSha: null,
      rawPayload: {},

      prAuthor: null,
      prBody: null,
      prLabels: [],
      prFetchedAt: null,
      prFetchError: null,
    },
    update: {
      // 手動テストでは最低限でOK
      prTitle: "manual check",
      prUrl: `https://github.com/${repoFullName}/pull/${prNumber}`,
    },
    select: { id: true },
  })

  const files = await fetchPullRequestFiles({ token, repoFullName, prNumber })
  const summary = summarizePullRequestFiles(files)

  // filename 重複を排除
  const uniqueFiles = Array.from(new Map(files.map((f) => [f.filename, f])).values())

  await prisma.$transaction(async (tx) => {
    await tx.githubPullRequestFile.deleteMany({ where: { eventId: event.id } })

    if (uniqueFiles.length > 0) {
      await tx.githubPullRequestFile.createMany({
        data: uniqueFiles.map((f) => ({
          eventId: event.id,
          filename: f.filename,
          status: f.status,
          additions: f.additions,
          deletions: f.deletions,
          changes: f.changes,
          extension: f.extension,
        })),
      })
    }

    await tx.githubEvent.update({
      where: { id: event.id },
      data: {
        prFilesCount: summary.prFilesCount,
        prAdditions: summary.prAdditions,
        prDeletions: summary.prDeletions,
        prFileStats: summary.prFileStats,
        prFetchedAt: new Date(),
        prFetchError: null,
      },
    })
  })

  const saved = await prisma.githubEvent.findUnique({
    where: { id: event.id },
    select: {
      id: true,
      repoName: true,
      prNumber: true,
      prFilesCount: true,
      prAdditions: true,
      prDeletions: true,
      prFileStats: true,
      prFetchedAt: true,
    },
  })

  console.warn(saved)

  const detailCount = await prisma.githubPullRequestFile.count({
    where: { eventId: event.id },
  })
  console.warn({ detailCount })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
