// prisma/backfill_github_delivery_id.ts
import "dotenv/config"
import { PrismaClient } from "@prisma/client"
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3"
import { randomUUID } from "crypto"

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || "file:./dev.db",
})

const prisma = new PrismaClient({ adapter })

async function main() {
  // ✅ where で null を使わず全件取得 → JS側で null 判定（型エラー回避）
  const events = await prisma.githubEvent.findMany({
    select: { id: true, githubDeliveryId: true },
  })

  const targets = events.filter((e) => e.githubDeliveryId == null)

  // 既存データが多い場合は transaction にしてもOK（まずは安全に逐次）
  for (const t of targets) {
    await prisma.githubEvent.update({
      where: { id: t.id },
      data: { githubDeliveryId: `legacy-${t.id}-${randomUUID()}` },
    })
  }

  // eslint no-console 対策（warn/error のみ許可されてる運用想定）
  console.warn(`[backfill] backfilled: ${targets.length}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
