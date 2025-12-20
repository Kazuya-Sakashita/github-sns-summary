import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/server/db/client"
import { verifyGithubSignature } from "@/lib/github/verifySignature"
import { revalidatePath } from "next/cache"
import type { Prisma } from "@prisma/client"

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

  // delivery id（重複対策の主キー）
  const deliveryId = req.headers.get("x-github-delivery")
  if (!deliveryId) {
    return NextResponse.json({ error: "Missing x-github-delivery header" }, { status: 400 })
  }

  const eventName = req.headers.get("x-github-event")
  const signature256 = req.headers.get("x-hub-signature-256")
  const rawBody = await req.text()

  // prod: 署名検証
  const isDev = process.env.NODE_ENV !== "production"
  if (!isDev) {
    const valid = verifyGithubSignature({ secret, payload: rawBody, signature256 })
    if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  // pull_request 以外は無視
  if (eventName !== "pull_request") {
    return NextResponse.json({ ok: true, ignored: true, reason: "not pull_request" })
  }

  let payload: PullRequestMergedPayload
  try {
    payload = JSON.parse(rawBody) as PullRequestMergedPayload
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { action, pull_request, repository } = payload

  // ✅ マージ以外は保存しない（方針どおり）
  if (action !== "closed" || !pull_request.merged) {
    return NextResponse.json({ ok: true, ignored: true, reason: "not merged PR" })
  }

  // merge 情報
  const mergedBy = pull_request.merged_by?.login ?? null
  const mergedAt = pull_request.merged_at ? new Date(pull_request.merged_at) : null
  const mergeCommitSha = pull_request.merge_commit_sha ?? null

  // ✅ 二重防止1: deliveryId が同一なら即終了
  const already = await prisma.githubEvent.findUnique({
    where: { githubDeliveryId: deliveryId },
    select: { id: true },
  })
  if (already) {
    return NextResponse.json({ ok: true, duplicated: true, id: already.id })
  }

  // ✅ 二重防止2: 同じPRは upsert で1件に収束（@@unique([userId, repoName, prNumber]) が必要）
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
    })

    revalidatePath("/dashboard")
    return NextResponse.json({ ok: true, id: saved.id })
  } catch (err) {
    console.error("[github-webhook] failed to upsert event", err)
    return NextResponse.json({ error: "Failed to save event" }, { status: 500 })
  }
}
