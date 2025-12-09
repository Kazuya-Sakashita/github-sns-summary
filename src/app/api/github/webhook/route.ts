// src/app/api/github/webhook/route.ts
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/server/db/client"
import { verifyGithubSignature } from "@/lib/github/verifySignature"

type PullRequestMergedPayload = {
  action: string
  pull_request: {
    number: number
    title: string
    html_url: string
    merged: boolean
    merged_by: { login: string } | null
  }
  repository: {
    full_name: string // "owner/repo"
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

  // ここで存在チェック（P2003 を避ける）
  const ownerUser = await prisma.user.findUnique({
    where: { id: ownerUserId },
  })

  if (!ownerUser) {
    console.error("[github-webhook] OWNER_USER_ID user not found", {
      ownerUserId,
    })
    return NextResponse.json(
      { error: "Owner user not found for OWNER_USER_ID" },
      { status: 500 },
    )
  }

  const signature256 = req.headers.get("x-hub-signature-256")
  const event = req.headers.get("x-github-event") // "pull_request" など
  const rawBody = await req.text()

  const isDev = process.env.NODE_ENV !== "production"

  if (!isDev) {
    const valid = verifyGithubSignature({
      secret,
      payload: rawBody,
      signature256,
    })

    if (!valid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
    }
  } else {
    console.log("[github-webhook] skip signature validation in dev", {
      signature256,
    })
  }

  let payload: PullRequestMergedPayload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (event !== "pull_request") {
    return NextResponse.json({ ok: true, ignored: true })
  }

  const { action, pull_request, repository } = payload

  if (action !== "closed" || !pull_request.merged) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  try {
    const created = await prisma.githubEvent.create({
      data: {
        userId: ownerUserId,
        repoName: repository.full_name,
        prNumber: pull_request.number,
        prTitle: pull_request.title,
        prUrl: pull_request.html_url,
        mergedBy: pull_request.merged_by?.login ?? null,
        rawPayload: payload as unknown as object,
      },
    })

    return NextResponse.json({ ok: true, id: created.id })
  } catch (e) {
    console.error("[github-webhook] failed to create event", e)
    return NextResponse.json({ error: "Failed to save event" }, { status: 500 })
  }
}
