// src/app/api/github/webhook/route.ts
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/server/db/client"
import { verifyGithubSignature } from "@/lib/github/verifySignature"
import { fetchPullRequestDetails } from "@/lib/github/fetchPullRequest"
import { revalidatePath } from "next/cache"
import { Prisma } from "@prisma/client"
import type { WebhookDeliveryStatus } from "@prisma/client"

type PullRequestPayload = {
  action: string
  pull_request: {
    number: number
    title: string
    html_url: string
    merged: boolean
    merged_by: { login: string } | null
    merged_at: string | null
    merge_commit_sha: string | null

    // PR webhook payload は PR オブジェクトを含むが、
    // null/undefined の可能性もあるので optional で扱う
    body?: string | null
    user?: { login: string } | null
  }
  repository: { full_name: string }
}

type DeliveryLog = {
  id: string
  status: WebhookDeliveryStatus
  attemptCount: number
  githubEventId: string | null
}

function isKnownRequestError(e: unknown): e is Prisma.PrismaClientKnownRequestError {
  return e instanceof Prisma.PrismaClientKnownRequestError
}

function shouldShortCircuit(status: WebhookDeliveryStatus) {
  // 既に処理済み/無視済みなら同じ delivery を何度受けても即返す
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

function parseRawPayload(rawBody: string): Prisma.InputJsonValue {
  try {
    return JSON.parse(rawBody) as Prisma.InputJsonValue
  } catch {
    // 署名検証失敗時などの調査用に raw text も残せるようにしておく
    return rawBody as unknown as Prisma.InputJsonValue
  }
}

function isObjectPayload(rawPayload: Prisma.InputJsonValue): rawPayload is Prisma.JsonObject {
  return typeof rawPayload === "object" && rawPayload !== null && !Array.isArray(rawPayload)
}

/**
 * pull_request の最低限の shape チェック
 * - merged は false のことも多いので boolean であることだけ確認
 */
function isPullRequestPayload(x: Prisma.JsonObject): x is PullRequestPayload {
  const o = x as Record<string, unknown>
  const pr = o["pull_request"] as Record<string, unknown> | undefined
  const repo = o["repository"] as Record<string, unknown> | undefined

  return (
    typeof o["action"] === "string" &&
    !!pr &&
    typeof pr["number"] === "number" &&
    typeof pr["title"] === "string" &&
    typeof pr["html_url"] === "string" &&
    typeof pr["merged"] === "boolean" &&
    !!repo &&
    typeof repo["full_name"] === "string"
  )
}

/**
 * delivery log を作成 or 既存取得（レース対策込み）
 */
async function findOrCreateDeliveryLog(params: {
  deliveryId: string
  eventName: string
  signature256: string | null
  rawPayload: Prisma.InputJsonValue
}): Promise<DeliveryLog> {
  const { deliveryId, eventName, signature256, rawPayload } = params

  const existing = await prisma.githubWebhookDelivery.findUnique({
    where: { deliveryId },
    select: { id: true, status: true, attemptCount: true, githubEventId: true },
  })
  if (existing) return existing

  try {
    return await prisma.githubWebhookDelivery.create({
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
  } catch (e) {
    // 同時到達で create が競合した場合は取り直す
    if (isKnownRequestError(e) && e.code === "P2002") {
      const again = await prisma.githubWebhookDelivery.findUnique({
        where: { deliveryId },
        select: { id: true, status: true, attemptCount: true, githubEventId: true },
      })
      if (again) return again
    }
    throw e
  }
}

/**
 * PRの変化タイミングで GitHub API から本文/ラベルを取り直したい action
 */
function shouldFetchDetails(action: string): boolean {
  return [
    "opened",
    "edited",
    "synchronize",
    "labeled",
    "unlabeled",
    "ready_for_review",
    "reopened",
    "closed",
  ].includes(action)
}

export async function POST(req: NextRequest) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET
  const ownerUserId = process.env.OWNER_USER_ID
  const githubToken = process.env.GITHUB_TOKEN // PR本文/ラベル補完用（無ければスキップ）

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

  // raw body（署名検証のために必ず text）
  const rawBody = await req.text()
  const rawPayload = parseRawPayload(rawBody)

  // =====================================================
  // 1) delivery log を確実に作る / 既存を取得する
  // =====================================================
  let delivery: DeliveryLog
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

  // 完了済みは即終了（PROCESSED / IGNORED）
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
  // 2.5) 署名検証（厳密化）
  // - 原則: 常に検証（missing/format/mismatch も 401）
  // - 例外: SKIP_GITHUB_SIGNATURE_VERIFY=1 のときだけスキップ
  // =====================================================
  const skipVerify = process.env.SKIP_GITHUB_SIGNATURE_VERIFY === "1"
  if (!skipVerify) {
    const verified = verifyGithubSignature({ secret, payload: rawBody, signature256 })
    if (!verified.ok) {
      await prisma.githubWebhookDelivery.update({
        where: { deliveryId },
        data: {
          status: "FAILED",
          processedAt: new Date(),
          errorMessage: `Invalid signature: ${verified.reason}`,
        },
      })
      return NextResponse.json(
        { error: "Invalid signature", reason: verified.reason },
        { status: 401 },
      )
    }
  }

  // =====================================================
  // 3) 対象外イベント → IGNORED（push が来るのは “Send me everything” なので正常）
  // =====================================================
  if (eventName !== "pull_request") {
    await prisma.githubWebhookDelivery.update({
      where: { deliveryId },
      data: { status: "IGNORED", processedAt: new Date() },
    })
    return NextResponse.json({ ok: true, ignored: true, reason: "not pull_request" })
  }

  // =====================================================
  // 3.5) pull_request なのに JSON が壊れてる → FAILED
  // =====================================================
  if (!isObjectPayload(rawPayload)) {
    await prisma.githubWebhookDelivery.update({
      where: { deliveryId },
      data: { status: "FAILED", processedAt: new Date(), errorMessage: "Invalid JSON" },
    })
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  // =====================================================
  // 3.6) JSON は object だが、想定 shape ではない → FAILED
  // =====================================================
  if (!isPullRequestPayload(rawPayload)) {
    await prisma.githubWebhookDelivery.update({
      where: { deliveryId },
      data: { status: "FAILED", processedAt: new Date(), errorMessage: "Invalid payload shape" },
    })
    return NextResponse.json({ error: "Invalid payload shape" }, { status: 400 })
  }

  const payload = rawPayload
  const { action, pull_request, repository } = payload

  const repoFullName = repository.full_name
  const prNumber = pull_request.number

  // merge 情報（mergeしてないPRでは null/false になってOK）
  const mergedBy = pull_request.merged_by?.login ?? null
  const mergedAt = pull_request.merged_at ? new Date(pull_request.merged_at) : null
  const mergeCommitSha = pull_request.merge_commit_sha ?? null

  // =====================================================
  // 4) PR作成/更新のたびに GithubEvent を upsert（merge 以外でも保存）
  // =====================================================
  try {
    const saved = await prisma.$transaction(async (tx) => {
      const event = await tx.githubEvent.upsert({
        where: {
          userId_repoName_prNumber: {
            userId: ownerUserId,
            repoName: repoFullName,
            prNumber,
          },
        },
        create: {
          githubDeliveryId: deliveryId,
          userId: ownerUserId,
          repoName: repoFullName,
          prNumber,
          prTitle: pull_request.title,
          prUrl: pull_request.html_url,
          mergedBy,
          mergedAt,
          mergeCommitSha,
          rawPayload: payload as unknown as Prisma.InputJsonValue,

          // 既存カラム（schemaで確認済み）
          prAuthor: pull_request.user?.login ?? null,
          prBody: pull_request.body ?? null,
          prLabels: [] as unknown as Prisma.InputJsonValue,
          prFetchedAt: null,
          prFetchError: null,
        },
        update: {
          prTitle: pull_request.title,
          prUrl: pull_request.html_url,
          mergedBy,
          mergedAt,
          mergeCommitSha,
          rawPayload: payload as unknown as Prisma.InputJsonValue,

          // webhook に body/user が含まれるケースがあるので反映（edited など）
          prAuthor: pull_request.user?.login ?? null,
          prBody: pull_request.body ?? null,
        },
        select: { id: true },
      })

      await tx.githubWebhookDelivery.update({
        where: { deliveryId },
        data: {
          status: "PROCESSED",
          processedAt: new Date(),
          githubEventId: event.id,
          errorMessage: null,
        },
      })

      return event
    })

    // =====================================================
    // 5) GitHub API で PR本文/ラベルを補完（任意）
    // - GITHUB_TOKEN がない場合はスキップ
    // =====================================================
    if (githubToken && shouldFetchDetails(action)) {
      try {
        const details = await fetchPullRequestDetails({
          token: githubToken,
          repoFullName,
          prNumber,
        })

        await prisma.githubEvent.update({
          where: { id: saved.id },
          data: {
            prBody: details.body,
            prAuthor: details.authorLogin,
            prLabels: details.labels as unknown as Prisma.InputJsonValue,
            prFetchedAt: new Date(),
            prFetchError: null,
          },
        })
      } catch (e) {
        const msg = toErrorMessage(e)
        await prisma.githubEvent.update({
          where: { id: saved.id },
          data: {
            prFetchedAt: new Date(),
            prFetchError: msg,
          },
        })
      }
    }

    revalidatePath("/dashboard")
    return NextResponse.json({ ok: true, id: saved.id, action })
  } catch (err) {
    const msg = toErrorMessage(err)
    console.error("[github-webhook] failed to upsert event", err)

    await prisma.githubWebhookDelivery.update({
      where: { deliveryId },
      data: { status: "FAILED", processedAt: new Date(), errorMessage: msg },
    })

    return NextResponse.json({ error: "Failed to save event" }, { status: 500 })
  }
}
