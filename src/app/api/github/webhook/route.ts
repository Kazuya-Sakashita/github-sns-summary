import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/server/db/client"
import { verifyGithubSignature } from "@/lib/github/verifySignature"
import { revalidatePath } from "next/cache"
import { Prisma } from "@prisma/client"

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

  // prod: 署名検証
  const isDev = process.env.NODE_ENV !== "production"
  if (!isDev) {
    const valid = verifyGithubSignature({ secret, payload: rawBody, signature256 })
    if (!valid) {
      // 署名NGはログ残すかは好み。残したいならここでも create を試してOK。
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
    }
  }

  // ---- ここが “強い冪等性” の本体（insert-first） ----
  let deliveryLogId: string | null = null
  try {
    const created = await prisma.githubWebhookDelivery.create({
      data: {
        deliveryId,
        eventName,
        signature256,
        rawPayload: (() => {
          try {
            return JSON.parse(rawBody) as Prisma.InputJsonValue
          } catch {
            // JSON不正でも調査できるように文字列で残す（Json型に string は入る）
            return rawBody as unknown as Prisma.InputJsonValue
          }
        })(),
      },
      select: { id: true },
    })
    deliveryLogId = created.id
  } catch (e) {
    // unique衝突 = 既に処理した deliveryId
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ ok: true, duplicated: true, deliveryId })
    }
    console.error("[github-webhook] failed to create delivery log", e)
    return NextResponse.json({ error: "Failed to log delivery" }, { status: 500 })
  }

  // pull_request 以外は無視（ログは残っている）
  if (eventName !== "pull_request") {
    return NextResponse.json({ ok: true, ignored: true, reason: "not pull_request" })
  }

  // JSON parse
  let payload: PullRequestMergedPayload
  try {
    payload = JSON.parse(rawBody) as PullRequestMergedPayload
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { action, pull_request, repository } = payload

  // マージ以外は保存しない
  if (action !== "closed" || !pull_request.merged) {
    return NextResponse.json({ ok: true, ignored: true, reason: "not merged PR" })
  }

  // merge 情報
  const mergedBy = pull_request.merged_by?.login ?? null
  const mergedAt = pull_request.merged_at ? new Date(pull_request.merged_at) : null
  const mergeCommitSha = pull_request.merge_commit_sha ?? null

  // upsert（同一PRは1件に収束）
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
        // githubDeliveryId は unique なので update しない
      },
      select: { id: true },
    })

    // delivery log に紐付け（調査性UP）
    await prisma.githubWebhookDelivery.update({
      where: { id: deliveryLogId },
      data: { githubEventId: saved.id },
    })

    revalidatePath("/dashboard")
    return NextResponse.json({ ok: true, id: saved.id })
  } catch (err) {
    console.error("[github-webhook] failed to upsert event", err)
    // 失敗しても delivery log は残ってるので追跡できる
    return NextResponse.json({ error: "Failed to save event" }, { status: 500 })
  }
}
