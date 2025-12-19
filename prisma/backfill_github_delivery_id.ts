// prisma/backfill_github_delivery_id.ts
import "dotenv/config"
import { PrismaClient } from "@prisma/client"
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3"
import { randomUUID } from "crypto"

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || "file:./dev.db",
})

const prisma = new PrismaClient({ adapter })

// ---- 設定（必要なら env で切替）----
const DRY_RUN = process.env.DRY_RUN === "1"
const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? "200")

function makeLegacyDeliveryId(eventId: string) {
  return `legacy-${eventId}-${randomUUID()}`
}

type EventRow = {
  id: string
  githubDeliveryId: string | null
}

function isMissingDeliveryId(v: string | null) {
  // required でも過去データで "" が入ってる可能性を拾う
  return v == null || v.trim() === ""
}

async function loadEvents(): Promise<EventRow[]> {
  // where で null を使えないので、必要な列だけ取ってJSで判定する
  return prisma.githubEvent.findMany({
    select: { id: true, githubDeliveryId: true },
  })
}

async function printCheck(events?: EventRow[]) {
  const rows = events ?? (await loadEvents())
  const total = rows.length
  const missing = rows.filter((e) => isMissingDeliveryId(e.githubDeliveryId)).length
  const filled = total - missing
  console.warn("[check]", { total, filled, missing })
  return { total, filled, missing, rows }
}

async function main() {
  const { rows } = await printCheck()

  const targets = rows.filter((e) => isMissingDeliveryId(e.githubDeliveryId))

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
