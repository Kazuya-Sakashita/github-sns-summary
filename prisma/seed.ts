/* eslint-disable no-console */
// prisma/seed.ts
import "dotenv/config"
import { PrismaClient, Prisma } from "@prisma/client"
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3"
import { randomUUID } from "crypto"

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || "file:./dev.db",
})

const prisma = new PrismaClient({ adapter })

function minutesAgo(min: number) {
  return new Date(Date.now() - min * 60 * 1000)
}

function seedDeliveryId(label: string) {
  return `seed-${label}-${randomUUID()}`
}

async function resolveOwnerUser() {
  const ownerUserId = process.env.OWNER_USER_ID

  if (ownerUserId) {
    const owner = await prisma.user.findUnique({ where: { id: ownerUserId } })
    if (!owner) {
      throw new Error(`OWNER_USER_ID is set but user not found: ${ownerUserId}`)
    }
    return owner
  }

  const existing = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } })
  if (existing) return existing

  return prisma.user.create({ data: { name: "Owner" } })
}

async function main() {
  const owner = await resolveOwnerUser()

  console.log("Owner:", owner.id)

  await prisma.snsPost.deleteMany({ where: { event: { userId: owner.id } } })
  await prisma.githubEvent.deleteMany({ where: { userId: owner.id } })

  /**
   * =====================================
   * A) 未送信（ai-preview のみ）
   * =====================================
   */
  await prisma.githubEvent.create({
    data: {
      githubDeliveryId: seedDeliveryId("unsent"),
      userId: owner.id,
      repoName: "owner/repository-name",
      prNumber: 123,
      prTitle: "新機能: ユーザー認証システムの実装と UI の改善",
      prUrl: "https://github.com/owner/repository-name/pull/123",
      mergedBy: "tanaka-taro",
      mergedAt: minutesAgo(70),
      mergeCommitSha: "seed-unsent",

      rawPayload: { seed: true } satisfies Prisma.InputJsonValue,

      // #35
      prAuthor: "tanaka-taro",
      prBody: "JWT 認証を導入し、UI を改善しました。",
      prLabels: ["feature", "auth"] satisfies Prisma.InputJsonValue,
      prFetchedAt: minutesAgo(65),
      prFetchError: null,

      // #36 集計
      prFilesCount: 2,
      prAdditions: 120,
      prDeletions: 10,
      prChanges: 130,
      prFileStats: {
        ".ts": 2,
      } satisfies Prisma.InputJsonValue,

      prFiles: {
        create: [
          {
            filename: "backend/auth/jwt.ts",
            status: "added",
            additions: 80,
            deletions: 0,
            changes: 80,
            extension: ".ts",
          },
          {
            filename: "frontend/components/LoginForm.tsx",
            status: "modified",
            additions: 40,
            deletions: 10,
            changes: 50,
            extension: ".tsx",
          },
        ],
      },

      createdAt: minutesAgo(60),

      posts: {
        create: [
          {
            platform: "ai-preview",
            content: "JWT 認証を追加し、UI を改善しました。",
            status: "SUCCESS",
            createdAt: minutesAgo(59),
          },
        ],
      },
    },
  })

  /**
   * =====================================
   * B) Webhook 成功
   * =====================================
   */
  await prisma.githubEvent.create({
    data: {
      githubDeliveryId: seedDeliveryId("success"),
      userId: owner.id,
      repoName: "owner/api-server",
      prNumber: 87,
      prTitle: "バグ修正: DB 接続エラーのハンドリング改善",
      prUrl: "https://github.com/owner/api-server/pull/87",
      mergedBy: "suzuki-hanako",
      mergedAt: minutesAgo(50),
      mergeCommitSha: "seed-success",

      rawPayload: { seed: true } satisfies Prisma.InputJsonValue,

      prAuthor: "suzuki-hanako",
      prBody: "DB 接続失敗時のリトライ処理を追加。",
      prLabels: ["bugfix", "backend"] satisfies Prisma.InputJsonValue,
      prFetchedAt: minutesAgo(45),
      prFetchError: null,

      prFilesCount: 3,
      prAdditions: 60,
      prDeletions: 20,
      prChanges: 80,
      prFileStats: {
        ".ts": 2,
        ".sql": 1,
      } satisfies Prisma.InputJsonValue,

      prFiles: {
        create: [
          {
            filename: "server/db/connection.ts",
            status: "modified",
            additions: 30,
            deletions: 10,
            changes: 40,
            extension: ".ts",
          },
          {
            filename: "server/db/retry.ts",
            status: "added",
            additions: 30,
            deletions: 0,
            changes: 30,
            extension: ".ts",
          },
          {
            filename: "migrations/fix.sql",
            status: "modified",
            additions: 0,
            deletions: 10,
            changes: 10,
            extension: ".sql",
          },
        ],
      },

      createdAt: minutesAgo(40),

      posts: {
        create: [
          {
            platform: "ai-preview",
            content: "DB 接続エラー時のリトライ処理を改善しました。",
            status: "SUCCESS",
            createdAt: minutesAgo(39),
          },
          {
            platform: "webhook",
            content: "Webhook 送信成功",
            status: "SUCCESS",
            externalId: "seed-success-001",
            createdAt: minutesAgo(38),
          },
        ],
      },
    },
  })

  /**
   * =====================================
   * C) Webhook 失敗
   * =====================================
   */
  await prisma.githubEvent.create({
    data: {
      githubDeliveryId: seedDeliveryId("failed"),
      userId: owner.id,
      repoName: "owner/frontend-app",
      prNumber: 234,
      prTitle: "パフォーマンス改善: 画像の遅延読み込み",
      prUrl: "https://github.com/owner/frontend-app/pull/234",
      mergedBy: "yamada-ichiro",
      mergedAt: minutesAgo(30),
      mergeCommitSha: "seed-failed",

      rawPayload: { seed: true } satisfies Prisma.InputJsonValue,

      prAuthor: "yamada-ichiro",
      prBody: "Intersection Observer を用いた画像遅延読み込み。",
      prLabels: ["performance", "frontend"] satisfies Prisma.InputJsonValue,
      prFetchedAt: minutesAgo(25),
      prFetchError: null,

      prFilesCount: 1,
      prAdditions: 25,
      prDeletions: 5,
      prChanges: 30,
      prFileStats: {
        ".tsx": 1,
      } satisfies Prisma.InputJsonValue,

      prFiles: {
        create: [
          {
            filename: "components/LazyImage.tsx",
            status: "added",
            additions: 25,
            deletions: 5,
            changes: 30,
            extension: ".tsx",
          },
        ],
      },

      createdAt: minutesAgo(20),

      posts: {
        create: [
          {
            platform: "ai-preview",
            content: "画像遅延読み込みで表示速度を改善しました。",
            status: "SUCCESS",
            createdAt: minutesAgo(19),
          },
          {
            platform: "webhook",
            content: "Webhook 送信失敗",
            status: "FAILED",
            errorMessage: "fetch failed (seed)",
            createdAt: minutesAgo(18),
          },
        ],
      },
    },
  })

  console.log("Seed completed 🎉")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
