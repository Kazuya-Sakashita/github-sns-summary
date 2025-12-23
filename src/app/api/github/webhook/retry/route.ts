import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/server/db/client"
import { Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { processGithubWebhookDelivery } from "@/server/github/webhook/processDelivery"

type Body = {
  deliveryId?: string
  force?: boolean
}

function toRawBody(rawPayload: Prisma.InputJsonValue): string {
  if (typeof rawPayload === "string") return rawPayload
  return JSON.stringify(rawPayload)
}

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-retry-api-key") ?? ""
  const expected = process.env.WEBHOOK_RETRY_API_KEY
  const ownerUserId = process.env.OWNER_USER_ID
  const secret = process.env.GITHUB_WEBHOOK_SECRET

  if (!expected || !ownerUserId || !secret) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 })
  }
  if (apiKey !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as Body
  const deliveryId = body.deliveryId
  const force = body.force ?? false

  if (!deliveryId) {
    return NextResponse.json({ error: "deliveryId is required" }, { status: 400 })
  }

  const delivery = await prisma.githubWebhookDelivery.findUnique({
    where: { deliveryId },
  })
  if (!delivery) {
    return NextResponse.json({ error: "Delivery not found" }, { status: 404 })
  }

  // 完了済みはリトライ不可
  if (delivery.status === "PROCESSED" || delivery.status === "IGNORED") {
    return NextResponse.json({ error: `Cannot retry status=${delivery.status}` }, { status: 409 })
  }

  // 受信直後(RECEIVED)は「処理中かも」なので force なしは弾く
  if (delivery.status === "RECEIVED" && !force) {
    return NextResponse.json(
      { error: "Delivery is in RECEIVED. Use force=true to retry." },
      { status: 409 },
    )
  }

  // attempt を進めてから処理（監査性UP）
  await prisma.githubWebhookDelivery.update({
    where: { deliveryId },
    data: {
      attemptCount: { increment: 1 },
      lastAttemptAt: new Date(),
      status: "RECEIVED",
      errorMessage: null,
      processedAt: null,
    },
  })

  const rawBody = toRawBody(delivery.rawPayload as Prisma.InputJsonValue)

  try {
    const result = await processGithubWebhookDelivery({
      deliveryId,
      eventName: delivery.eventName,
      signature256: delivery.signature256,
      rawBody,
      ownerUserId,
      secret,
      isDev: process.env.NODE_ENV !== "production",
    })

    if (result.ok) {
      // ✅ テストでは next/cache が落ちやすいので実行しない（or テストでmockする）
      if (process.env.NODE_ENV !== "test") {
        revalidatePath("/dashboard")
      }
      return NextResponse.json({ ok: true, githubEventId: result.githubEventId })
    }

    // process 側で status 更新済み想定なので、ここは 500 を返すだけでOK
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)

    await prisma.githubWebhookDelivery.update({
      where: { deliveryId },
      data: {
        status: "FAILED",
        processedAt: new Date(),
        errorMessage: msg,
      },
    })

    return NextResponse.json({ error: "Retry failed", detail: msg }, { status: 500 })
  }
}
