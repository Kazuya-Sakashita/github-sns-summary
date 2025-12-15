// prisma/seed.ts
import "dotenv/config"
import { PrismaClient } from "@prisma/client"
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3"
import { randomUUID } from "crypto"

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || "file:./dev.db",
})

const prisma = new PrismaClient({ adapter })

/**
 * createdAt を安全にずらす（SQLiteでも安定して "最新" 判定させる）
 */
function minutesAgo(min: number) {
  return new Date(Date.now() - min * 60 * 1000)
}

/**
 * seed 用 deliveryId（@unique 必須）
 * - GitHub 本番だと x-github-delivery が入る想定
 * - seed は衝突しないよう UUID を使う
 */
function seedDeliveryId(label: string) {
  return `seed-${label}-${randomUUID()}`
}

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

  /**
   * 目的：
   * - /dashboard のカードで Webhook 状態を確認できるようにする
   *   - 未送信（webhook の post が無い）
   *   - 送信済み（webhook の post が SUCCESS）
   *   - 送信失敗（webhook の post が FAILED）
   *
   * 注意：
   * - /dashboard は posts の「最新1件（take:1）」を見る設計なので
   *   webhook 状態を見せたいカードでは webhook の post を "最新" にする必要がある
   */

  // -----------------------------
  // A) 未送信：ai-preview だけ（webhook post なし）
  // -----------------------------
  await prisma.githubEvent.create({
    data: {
      githubDeliveryId: seedDeliveryId("unsent"), // ✅ 追加
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
      createdAt: minutesAgo(60),
      posts: {
        create: [
          {
            platform: "ai-preview",
            content:
              "このPRでは、ユーザー認証システムを新たに実装しました。主な変更点として、JWTベースの認証機能、ログイン・ログアウトのエンドポイント、認証ミドルウェアを追加しています。また、ログインフォームのUIを改善し、エラーハンドリングを強化しました。",
            status: "SUCCESS",
            createdAt: minutesAgo(59),
          },
        ],
      },
    },
  })

  // -----------------------------
  // B) 送信済み：webhook post を最新にする（SUCCESS）
  // -----------------------------
  await prisma.githubEvent.create({
    data: {
      githubDeliveryId: seedDeliveryId("success"),
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
      createdAt: minutesAgo(40),
      posts: {
        create: [
          // 先に ai-preview（古い）
          {
            platform: "ai-preview",
            content:
              "データベース接続が失敗した際のエラーハンドリングを改善しました。リトライロジックを追加し、接続プールの設定を最適化しています。これにより、一時的なネットワークエラーに対する耐性が向上しました。",
            status: "SUCCESS",
            createdAt: minutesAgo(39),
          },
          // 次に webhook（新しい＝最新1件）
          {
            platform: "webhook",
            content: "Webhook送信済みテスト：DB接続エラーのハンドリング改善を反映しました。",
            status: "SUCCESS",
            externalId: "seed-success-001",
            errorMessage: null,
            createdAt: minutesAgo(38),
          },
        ],
      },
    },
  })

  // -----------------------------
  // C) 送信失敗：webhook post を最新にする（FAILED）
  // -----------------------------
  await prisma.githubEvent.create({
    data: {
      githubDeliveryId: seedDeliveryId("failed"), // ✅ 追加
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
      createdAt: minutesAgo(20),
      posts: {
        create: [
          // ai-preview（古い）
          {
            platform: "ai-preview",
            content:
              "画像の遅延読み込み機能を実装し、初期ページ読み込み時のパフォーマンスを大幅に改善しました。Intersection Observer APIを使用し、ビューポートに入った画像のみを読み込むように変更しています。",
            status: "SUCCESS",
            createdAt: minutesAgo(19),
          },
          // webhook（新しい＝最新1件、FAILED）
          {
            platform: "webhook",
            content: "Webhook送信失敗テスト：画像遅延読み込み実装の投稿を試行しました。",
            status: "FAILED",
            externalId: null,
            errorMessage: "fetch failed（seed用の疑似エラー）",
            createdAt: minutesAgo(18),
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
