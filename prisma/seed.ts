// prisma/seed.ts
import "dotenv/config"
import { PrismaClient, Prisma } from "@prisma/client"
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
  // x-github-delivery は UUID 形式っぽいことが多いので寄せてもOK
  return `seed-${label}-${randomUUID()}`
}

/**
 * cuid運用で「Owner を必ず 1人」に寄せる。
 * - OWNER_USER_ID があれば、その User を必ず使う（無ければ作らない・エラー）
 * - OWNER_USER_ID が無ければ、既存 user がいればそれを使う / 無ければ作る
 */
async function resolveOwnerUser() {
  const ownerUserId = process.env.OWNER_USER_ID

  if (ownerUserId) {
    const owner = await prisma.user.findUnique({ where: { id: ownerUserId } })
    if (!owner) {
      throw new Error(`OWNER_USER_ID is set but user not found. OWNER_USER_ID="${ownerUserId}"`)
    }
    return owner
  }

  // OWNER_USER_ID 未指定なら既存の先頭を使う（なければ作る）
  const existing = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } })
  if (existing) return existing

  return prisma.user.create({
    data: { name: "Owner" },
  })
}

async function main() {
  const owner = await resolveOwnerUser()

  console.log("Owner user:")
  console.log("id  :", owner.id)
  console.log("name:", owner.name)

  console.log("\nSet OWNER_USER_ID in .env as:")
  console.log(`OWNER_USER_ID="${owner.id}"`)

  // 既存のイベント＆投稿ログを一旦クリアしてクリーンな状態にする（Owner分だけ）
  console.log("\nClearing existing events/posts for this owner ...")
  await prisma.snsPost.deleteMany({ where: { event: { userId: owner.id } } })
  await prisma.githubEvent.deleteMany({ where: { userId: owner.id } })

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

  // ※ mergedAt / mergeCommitSha は Issue #22 に合わせて seed にも入れておく
  //    （本番では GitHub webhook payload から入る）

  // -----------------------------
  // A) 未送信：ai-preview だけ（webhook post なし）
  // -----------------------------
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
      mergeCommitSha: `seed-unsent-${randomUUID().replace(/-/g, "")}`,
      rawPayload: {
        sample: true,
        type: "pull_request",
        action: "closed",
        merged: true,
        merged_by: { login: "tanaka-taro" },
        merged_at: minutesAgo(70).toISOString(),
        merge_commit_sha: "seed-unsent",
      } satisfies Prisma.InputJsonValue,
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
      userId: owner.id,
      repoName: "owner/api-server",
      prNumber: 87,
      prTitle: "バグ修正: データベース接続エラーのハンドリング",
      prUrl: "https://github.com/owner/api-server/pull/87",
      mergedBy: "suzuki-hanako",
      mergedAt: minutesAgo(50),
      mergeCommitSha: `seed-success-${randomUUID().replace(/-/g, "")}`,
      rawPayload: {
        sample: true,
        type: "pull_request",
        action: "closed",
        merged: true,
        merged_by: { login: "suzuki-hanako" },
        merged_at: minutesAgo(50).toISOString(),
        merge_commit_sha: "seed-success",
      } satisfies Prisma.InputJsonValue,
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
      githubDeliveryId: seedDeliveryId("failed"),
      userId: owner.id,
      repoName: "owner/frontend-app",
      prNumber: 234,
      prTitle: "パフォーマンス改善: 画像の遅延読み込みを実装",
      prUrl: "https://github.com/owner/frontend-app/pull/234",
      mergedBy: "yamada-ichiro",
      mergedAt: minutesAgo(30),
      mergeCommitSha: `seed-failed-${randomUUID().replace(/-/g, "")}`,
      rawPayload: {
        sample: true,
        type: "pull_request",
        action: "closed",
        merged: true,
        merged_by: { login: "yamada-ichiro" },
        merged_at: minutesAgo(30).toISOString(),
        merge_commit_sha: "seed-failed",
      } satisfies Prisma.InputJsonValue,
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
