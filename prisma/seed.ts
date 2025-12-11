// prisma/seed.ts
import "dotenv/config"
import { PrismaClient } from "@prisma/client"
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3"

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || "file:./dev.db",
})

const prisma = new PrismaClient({ adapter })

async function main() {
  // 1. User を準備（既存があればそれを使う）
  let user = await prisma.user.findFirst()

  if (user) {
    console.log("User already exists:")
    console.log("id  :", user.id)
    console.log("name:", user.name)
  } else {
    user = await prisma.user.create({
      data: {
        name: "Owner",
      },
    })

    console.log("Created owner user:")
    console.log("id  :", user.id)
    console.log("name:", user.name)
  }

  console.log("\nYou can set OWNER_USER_ID in .env as:")
  console.log(`OWNER_USER_ID="${user.id}"`)

  // 2. 既存のイベント＆投稿ログを一旦クリアしてクリーンな状態にする
  console.log("\nClearing existing events/posts for this user ...")
  await prisma.snsPost.deleteMany({ where: { event: { userId: user.id } } })
  await prisma.githubEvent.deleteMany({ where: { userId: user.id } })

  console.log("Seeding GithubEvent + SnsPost ...\n")

  // 3. サンプルイベント + 投稿ログを複数件作成

  await prisma.githubEvent.create({
    data: {
      userId: user.id,
      repoName: "owner/repository-name",
      prNumber: 123,
      prTitle: "新機能: ユーザー認証システムの実装と UI の改善",
      prUrl: "https://github.com/owner/repository-name/pull/123",
      mergedBy: "tanaka-taro",
      rawPayload: {
        sample: true,
        type: "pull_request",
        action: "closed",
        merged: true,
      },
      posts: {
        create: [
          {
            platform: "ai-preview",
            content:
              "このPRでは、ユーザー認証システムを新たに実装しました。主な変更点として、JWTベースの認証機能、ログイン・ログアウトのエンドポイント、認証ミドルウェアを追加しています。また、ログインフォームのUIを改善し、エラーハンドリングを強化しました。",
            status: "SUCCESS",
          },
        ],
      },
    },
  })

  await prisma.githubEvent.create({
    data: {
      userId: user.id,
      repoName: "owner/api-server",
      prNumber: 87,
      prTitle: "バグ修正: データベース接続エラーのハンドリング",
      prUrl: "https://github.com/owner/api-server/pull/87",
      mergedBy: "suzuki-hanako",
      rawPayload: {
        sample: true,
        type: "pull_request",
        action: "closed",
        merged: true,
      },
      posts: {
        create: [
          {
            platform: "ai-preview",
            content:
              "データベース接続が失敗した際のエラーハンドリングを改善しました。リトライロジックを追加し、接続プールの設定を最適化しています。これにより、一時的なネットワークエラーに対する耐性が向上しました。",
            status: "SUCCESS",
          },
        ],
      },
    },
  })

  await prisma.githubEvent.create({
    data: {
      userId: user.id,
      repoName: "owner/frontend-app",
      prNumber: 234,
      prTitle: "パフォーマンス改善: 画像の遅延読み込みを実装",
      prUrl: "https://github.com/owner/frontend-app/pull/234",
      mergedBy: "yamada-ichiro",
      rawPayload: {
        sample: true,
        type: "pull_request",
        action: "closed",
        merged: true,
      },
      posts: {
        create: [
          {
            platform: "ai-preview",
            content:
              "画像の遅延読み込み機能を実装し、初期ページ読み込み時のパフォーマンスを大幅に改善しました。Intersection Observer APIを使用し、ビューポートに入った画像のみを読み込むように変更しています。",
            status: "FAILED",
            errorMessage: "一時的な AI API エラーにより再試行が必要です。",
          },
        ],
      },
    },
  })

  console.log("Seeding completed 🎉")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
