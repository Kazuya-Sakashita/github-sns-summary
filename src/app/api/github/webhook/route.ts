// src/app/api/github/webhook/route.ts
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/server/db/client"
import { verifyGithubSignature } from "@/lib/github/verifySignature"
import { fetchPullRequestDetails } from "@/lib/github/fetchPullRequest"
import { revalidatePath } from "next/cache"
import { Prisma } from "@prisma/client"
import type { WebhookDeliveryStatus } from "@prisma/client"
import {
  fetchPullRequestFiles,
  summarizePullRequestFiles,
  type PullRequestFileItem, // ★ PullRequestFile → PullRequestFileItem
} from "@/lib/github/fetchPullRequestFiles"

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
    return rawBody as unknown as Prisma.InputJsonValue
  }
}

function isObjectPayload(rawPayload: Prisma.InputJsonValue): rawPayload is Prisma.JsonObject {
  return typeof rawPayload === "object" && rawPayload !== null && !Array.isArray(rawPayload)
}

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

/**
 * ★重要：PullRequestFile に固定して型が崩れないようにする
 */
function uniqByFilename(files: PullRequestFileItem[]): PullRequestFileItem[] {
  return Array.from(new Map(files.map((f) => [f.filename, f])).values())
}

export async function POST(req: NextRequest) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET
  const ownerUserId = process.env.OWNER_USER_ID
  const githubToken = process.env.GITHUB_TOKEN

  if (!secret || !ownerUserId) {
    return NextResponse.json(
      { error: "Server not configured (missing secret or OWNER_USER_ID)" },
      { status: 500 },
    )
  }

  // OWNER_USER_ID の user が無いと FK で落ちるので先に検証
  const ownerUser = await prisma.user.findUnique({ where: { id: ownerUserId } })
  if (!ownerUser) {
    console.error("[github-webhook] OWNER_USER_ID user not found", { ownerUserId })
    return NextResponse.json({ error: "Owner user not found" }, { status: 500 })
  }

  const deliveryId = req.headers.get("x-github-delivery")
  if (!deliveryId) {
    return NextResponse.json({ error: "Missing x-github-delivery header" }, { status: 400 })
  }

  const eventName = req.headers.get("x-github-event") ?? "unknown"
  const signature256 = req.headers.get("x-hub-signature-256")

  const rawBody = await req.text()
  const rawPayload = parseRawPayload(rawBody)

  let delivery: DeliveryLog
  try {
    delivery = await findOrCreateDeliveryLog({ deliveryId, eventName, signature256, rawPayload })
  } catch (e) {
    console.error("[github-webhook] failed to create delivery log", e)
    return NextResponse.json({ error: "Failed to log delivery" }, { status: 500 })
  }

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

  if (eventName !== "pull_request") {
    await prisma.githubWebhookDelivery.update({
      where: { deliveryId },
      data: { status: "IGNORED", processedAt: new Date() },
    })
    return NextResponse.json({ ok: true, ignored: true, reason: "not pull_request" })
  }

  if (!isObjectPayload(rawPayload)) {
    await prisma.githubWebhookDelivery.update({
      where: { deliveryId },
      data: { status: "FAILED", processedAt: new Date(), errorMessage: "Invalid JSON" },
    })
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

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

  const mergedBy = pull_request.merged_by?.login ?? null
  const mergedAt = pull_request.merged_at ? new Date(pull_request.merged_at) : null
  const mergeCommitSha = pull_request.merge_commit_sha ?? null

  try {
    const saved = await prisma.$transaction(async (tx) => {
      const event = await tx.githubEvent.upsert({
        where: {
          userId_repoName_prNumber: { userId: ownerUserId, repoName: repoFullName, prNumber },
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

    // #35: 本文/ラベル補完（任意）
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
          data: { prFetchedAt: new Date(), prFetchError: msg },
        })
      }
    }

    // #36: 変更ファイル保存（任意）
    if (githubToken && shouldFetchDetails(action)) {
      try {
        const files = await fetchPullRequestFiles({ token: githubToken, repoFullName, prNumber })
        const summary = summarizePullRequestFiles(files)
        const uniqueFiles = uniqByFilename(files)

        await prisma.$transaction(async (tx) => {
          // いったん同期（全削除→最新insert）
          await tx.githubPullRequestFile.deleteMany({ where: { eventId: saved.id } })

          if (uniqueFiles.length > 0) {
            await tx.githubPullRequestFile.createMany({
              data: uniqueFiles.map((f) => ({
                eventId: saved.id,
                filename: f.filename,
                status: f.status,
                additions: f.additions,
                deletions: f.deletions,
                changes: f.changes,
                extension: f.extension,
              })),
            })
          }

          await tx.githubEvent.update({
            where: { id: saved.id },
            data: {
              prFilesCount: summary.prFilesCount,
              prAdditions: summary.prAdditions,
              prDeletions: summary.prDeletions,
              prFileStats: summary.prFileStats as unknown as Prisma.InputJsonValue,
            },
          })
        })
      } catch (e) {
        const msg = toErrorMessage(e)
        await prisma.githubEvent.update({
          where: { id: saved.id },
          data: { prFetchError: msg, prFetchedAt: new Date() },
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
