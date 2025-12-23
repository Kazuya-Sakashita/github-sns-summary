// src/server/github/webhook/processDelivery.ts
import { prisma } from "@/server/db/client"
import { Prisma } from "@prisma/client"
import { verifyGithubSignature } from "@/lib/github/verifySignature"

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

/**
 * pull_request の最低限の shape チェック
 */
function isPullRequestMergedPayload(x: Prisma.JsonObject): x is PullRequestMergedPayload {
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

export async function processGithubWebhookDelivery(params: {
  deliveryId: string
  eventName: string
  signature256: string | null
  rawBody: string
  ownerUserId: string
  secret: string
  isDev: boolean
}): Promise<{ ok: true; githubEventId: string } | { ok: false; error: string }> {
  const { deliveryId, eventName, signature256, rawBody, ownerUserId, secret, isDev } = params

  // 署名検証（本番のみ）
  if (!isDev) {
    const valid = verifyGithubSignature({ secret, payload: rawBody, signature256 })
    if (!valid) {
      const msg = "Invalid signature"
      await prisma.githubWebhookDelivery.update({
        where: { deliveryId },
        data: { status: "FAILED", processedAt: new Date(), errorMessage: msg },
      })
      return { ok: false, error: msg }
    }
  }

  // pull_request 以外 → IGNORED
  if (eventName !== "pull_request") {
    await prisma.githubWebhookDelivery.update({
      where: { deliveryId },
      data: { status: "IGNORED", processedAt: new Date(), errorMessage: null },
    })
    return { ok: false, error: "ignored: not pull_request" }
  }

  const rawPayload = parseRawPayload(rawBody)

  // JSON 壊れ → FAILED
  if (!isObjectPayload(rawPayload)) {
    const msg = "Invalid JSON"
    await prisma.githubWebhookDelivery.update({
      where: { deliveryId },
      data: { status: "FAILED", processedAt: new Date(), errorMessage: msg },
    })
    return { ok: false, error: msg }
  }

  // shape 不正 → FAILED
  if (!isPullRequestMergedPayload(rawPayload)) {
    const msg = "Invalid payload shape"
    await prisma.githubWebhookDelivery.update({
      where: { deliveryId },
      data: { status: "FAILED", processedAt: new Date(), errorMessage: msg },
    })
    return { ok: false, error: msg }
  }

  const payload = rawPayload
  const { action, pull_request, repository } = payload

  // マージ以外 → IGNORED
  if (action !== "closed" || !pull_request.merged) {
    await prisma.githubWebhookDelivery.update({
      where: { deliveryId },
      data: { status: "IGNORED", processedAt: new Date(), errorMessage: null },
    })
    return { ok: false, error: "ignored: not merged PR" }
  }

  const mergedBy = pull_request.merged_by?.login ?? null
  const mergedAt = pull_request.merged_at ? new Date(pull_request.merged_at) : null
  const mergeCommitSha = pull_request.merge_commit_sha ?? null

  try {
    const saved = await prisma.$transaction(async (tx) => {
      const event = await tx.githubEvent.upsert({
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

    return { ok: true, githubEventId: saved.id }
  } catch (e) {
    const msg = toErrorMessage(e)
    await prisma.githubWebhookDelivery.update({
      where: { deliveryId },
      data: { status: "FAILED", processedAt: new Date(), errorMessage: msg },
    })
    return { ok: false, error: msg }
  }
}
