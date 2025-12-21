// src/app/api/github/webhook/route.ts
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/server/db/client"
import { verifyGithubSignature } from "@/lib/github/verifySignature"
import { revalidatePath } from "next/cache"
import { Prisma } from "@prisma/client"
import type { WebhookDeliveryStatus } from "@prisma/client"

type PullRequestMergedPayload = {
  action: string
  pull_request: {
    number: number
    title: string
    html_url: string
    merged: boolean
    merged_by: { login: string } | null
    merged_at: string | null
    merge_commit_sha: string | null
  }
  repository: { full_name: string }
}

function isKnownRequestError(e: unknown): e is Prisma.PrismaClientKnownRequestError {
  return e instanceof Prisma.PrismaClientKnownRequestError
}

function shouldShortCircuit(status: WebhookDeliveryStatus) {
  return status === "PROCESSED" || status === "IGNORED"
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === "string") return err
  try {
    return JSON.stringify(err)
  } catch {
    return "unknown error"
  }
}

/**
 * delivery log を作成 or 既存取得（レース対策込み）
 */
async function findOrCreateDeliveryLog(params: {
  deliveryId: string
  eventName: string
  signature256: string | null
  rawPayload: Prisma.InputJsonValue
}) {
  const { deliveryId, eventName, signature256, rawPayload } = params

  let delivery = await prisma.githubWebhookDelivery.findUnique({
    where: { deliveryId },
    select: { id: true, status: true, attemptCount: true, githubEventId: true },
  })

  if (delivery) return delivery

  try {
    delivery = await prisma.githubWebhookDelivery.create({
      data: {
        deliveryId,
        eventName,
        signature256,
        rawPayload,
        status: "RECEIVED",
        attemptCount: 0,
      },
      select: { id: true, status: true, attemptCount: true, githubEventId: true },
    })
    return delivery
  } catch (e) {
    if (isKnownRequestError(e) && e.code === "P2002") {
      // create レース → 取り直し
      const again = await prisma.githubWebhookDelivery.findUnique({
        where: { deliveryId },
        select: { id: true, status: true, attemptCount: true, githubEventId: true },
      })
      if (again) return again
    }
    throw e
  }
}

export async function POST(req: NextRequest) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET
  const ownerUserId = process.env.OWNER_USER_ID

  if (!secret || !ownerUserId) {
    return NextResponse.json(
      { error: "Server not configured (missing secret or OWNER_USER_ID)" },
      { status: 500 },
    )
  }

  // owner user exists?（P2003回避）
  const ownerUser = await prisma.user.findUnique({ where: { id: ownerUserId } })
  if (!ownerUser) {
    console.error("[github-webhook] OWNER_USER_ID user not found", { ownerUserId })
    return NextResponse.json({ error: "Owner user not found" }, { status: 500 })
  }

  // headers
  const deliveryId = req.headers.get("x-github-delivery")
  if (!deliveryId) {
    return NextResponse.json({ error: "Missing x-github-delivery header" }, { status: 400 })
  }

  const eventName = req.headers.get("x-github-event") ?? "unknown"
  const signature256 = req.headers.get("x-hub-signature-256")

  // raw body
  const rawBody = await req.text()

  // rawPayload を “必ず” 何かしら残す（JSON不正でも文字列で残す）
  const rawPayload: Prisma.InputJsonValue = (() => {
    try {
      return JSON.parse(rawBody) as Prisma.InputJsonValue
    } catch {
      return rawBody as unknown as Prisma.InputJsonValue
    }
  })()

  // =====================================================
  // 1) delivery log を確実に作る / 既存を取得する
  // =====================================================
  let delivery
  try {
    delivery = await findOrCreateDeliveryLog({
      deliveryId,
      eventName,
      signature256,
      rawPayload,
    })
  } catch (e) {
    console.error("[github-webhook] failed to create delivery log", e)
    return NextResponse.json({ error: "Failed to log delivery" }, { status: 500 })
  }

  // 完了済みは即終了
  if (shouldShortCircuit(delivery.status)) {
    return NextResponse.json({
      ok: true,
      duplicated: true,
      deliveryId,
      status: delivery.status,
      githubEventId: delivery.githubEventId,
      attemptCount: delivery.attemptCount,
    })
  }

  // =====================================================
  // 2) 今回の試行を記録（attemptCount++, lastAttemptAt, status=RECEIVED）
  // =====================================================
  await prisma.githubWebhookDelivery.update({
    where: { deliveryId },
    data: {
      attemptCount: { increment: 1 },
      lastAttemptAt: new Date(),
      status: "RECEIVED",
      errorMessage: null,
      rawPayload,
      eventName,
      signature256,
    },
  })

  // =====================================================
  // 2.5) 署名検証（本番のみ）
  // - 署名NGでも delivery log を FAILED にして残す（調査性を上げる）
  // =====================================================
  const isDev = process.env.NODE_ENV !== "production"
  if (!isDev) {
    const valid = verifyGithubSignature({ secret, payload: rawBody, signature256 })
    if (!valid) {
      await prisma.githubWebhookDelivery.update({
        where: { deliveryId },
        data: {
          status: "FAILED",
          processedAt: new Date(),
          errorMessage: "Invalid signature",
        },
      })
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
    }
  }

  // =====================================================
  // 3) 対象外イベント → IGNORED
  // =====================================================
  if (eventName !== "pull_request") {
    await prisma.githubWebhookDelivery.update({
      where: { deliveryId },
      data: {
        status: "IGNORED",
        processedAt: new Date(),
      },
    })
    return NextResponse.json({ ok: true, ignored: true, reason: "not pull_request" })
  }

  // JSON parse（pull_request として扱う）
  let payload: PullRequestMergedPayload
  try {
    payload = JSON.parse(rawBody) as PullRequestMergedPayload
  } catch {
    await prisma.githubWebhookDelivery.update({
      where: { deliveryId },
      data: {
        status: "FAILED",
        processedAt: new Date(),
        errorMessage: "Invalid JSON",
      },
    })
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { action, pull_request, repository } = payload

  // マージ以外は保存しない → IGNORED
  if (action !== "closed" || !pull_request.merged) {
    await prisma.githubWebhookDelivery.update({
      where: { deliveryId },
      data: {
        status: "IGNORED",
        processedAt: new Date(),
      },
    })
    return NextResponse.json({ ok: true, ignored: true, reason: "not merged PR" })
  }

  // merge 情報
  const mergedBy = pull_request.merged_by?.login ?? null
  const mergedAt = pull_request.merged_at ? new Date(pull_request.merged_at) : null
  const mergeCommitSha = pull_request.merge_commit_sha ?? null

  // =====================================================
  // 4) 本処理（GithubEvent upsert）→ 成功/失敗を delivery に反映
  // =====================================================
  try {
    const saved = await prisma.githubEvent.upsert({
      where: {
        userId_repoName_prNumber: {
          userId: ownerUserId,
          repoName: repository.full_name,
          prNumber: pull_request.number,
        },
      },
      create: {
        githubDeliveryId: deliveryId,
        userId: ownerUserId,
        repoName: repository.full_name,
        prNumber: pull_request.number,
        prTitle: pull_request.title,
        prUrl: pull_request.html_url,
        mergedBy,
        mergedAt,
        mergeCommitSha,
        rawPayload: payload as unknown as Prisma.InputJsonValue,
      },
      update: {
        prTitle: pull_request.title,
        prUrl: pull_request.html_url,
        mergedBy,
        mergedAt,
        mergeCommitSha,
        rawPayload: payload as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    })

    await prisma.githubWebhookDelivery.update({
      where: { deliveryId },
      data: {
        status: "PROCESSED",
        processedAt: new Date(),
        githubEventId: saved.id,
      },
    })

    revalidatePath("/dashboard")
    return NextResponse.json({ ok: true, id: saved.id })
  } catch (err) {
    const msg = toErrorMessage(err)
    console.error("[github-webhook] failed to upsert event", err)

    await prisma.githubWebhookDelivery.update({
      where: { deliveryId },
      data: {
        status: "FAILED",
        processedAt: new Date(),
        errorMessage: msg,
      },
    })

    return NextResponse.json({ error: "Failed to save event" }, { status: 500 })
  }
}
