// prisma/backfill_github_delivery_id.ts
import "dotenv/config"
import { PrismaClient } from "@prisma/client"
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3"
import { randomUUID } from "crypto"

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || "file:./dev.db",
})

const prisma = new PrismaClient({ adapter })

const DRY_RUN = process.env.DRY_RUN === "1"
const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? "200")

function makeLegacyDeliveryId(eventId: string) {
  return `legacy-${eventId}-${randomUUID()}`
}

type CountRow = { c: number }
type IdRow = { id: string }

// NOTE:
// Prisma schema が required でも、DB には移行途中で NULL が残り得るため
// 「NULL判定」は Prisma の where ではなく raw SQL で吸収する
async function countMissingBySql() {
  const rows = await prisma.$queryRaw<CountRow[]>`
    SELECT COUNT(*) AS c
    FROM GithubEvent
    WHERE githubDeliveryId IS NULL OR githubDeliveryId = ''
  `
  return rows[0]?.c ?? 0
}

async function getMissingIdsBySql() {
  return prisma.$queryRaw<IdRow[]>`
    SELECT id
    FROM GithubEvent
    WHERE githubDeliveryId IS NULL OR githubDeliveryId = ''
  `
}

async function printCheck() {
  const total = await prisma.githubEvent.count()
  const missing = await countMissingBySql()
  const filled = total - missing
  console.warn("[check]", { total, filled, missing })
  return { total, filled, missing }
}

async function main() {
  await printCheck()

  const targets = await getMissingIdsBySql()

  if (targets.length === 0) {
    console.warn("[backfill] backfilled: 0 (no missing records)")
    return
  }

  if (DRY_RUN) {
    console.warn(`[backfill] DRY_RUN=1 targets: ${targets.length}`)
    return
  }

  let updated = 0
  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE)

    await prisma.$transaction(
      batch.map((t) =>
        prisma.githubEvent.update({
          where: { id: t.id },
          data: { githubDeliveryId: makeLegacyDeliveryId(t.id) },
        }),
      ),
    )

    updated += batch.length
    console.warn(`[backfill] progress ${updated}/${targets.length}`)
  }

  console.warn(`[backfill] backfilled: ${targets.length}`)
  await printCheck()
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
