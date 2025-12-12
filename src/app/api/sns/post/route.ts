// src/app/api/sns/post/route.ts
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/server/db/client"

export async function POST(req: NextRequest) {
  const webhookUrl = process.env.SNS_WEBHOOK_URL
  if (!webhookUrl) {
    return NextResponse.json({ error: "SNS_WEBHOOK_URL is not configured" }, { status: 500 })
  }

  // body parse
  const { snsPostId } = await req.json().catch(() => ({}))
  if (!snsPostId) {
    return NextResponse.json({ error: "snsPostId is required" }, { status: 400 })
  }

  // fetch post
  const snsPost = await prisma.snsPost.findUnique({
    where: { id: snsPostId },
    include: { event: true },
  })

  if (!snsPost) {
    return NextResponse.json({ error: "SnsPost not found" }, { status: 404 })
  }

  const payload = {
    type: "github-sns-summary",
    snsPostId: snsPost.id,
    event: {
      repoName: snsPost.event.repoName,
      prNumber: snsPost.event.prNumber,
      prTitle: snsPost.event.prTitle,
      prUrl: snsPost.event.prUrl,
      mergedBy: snsPost.event.mergedBy,
    },
    content: snsPost.content,
    sentAt: new Date().toISOString(),
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    const text = await res.text()

    const updated = await prisma.snsPost.update({
      where: { id: snsPost.id },
      data: {
        status: res.ok ? "SUCCESS" : "FAILED",
        errorMessage: res.ok ? null : text || `status ${res.status}`,
      },
    })

    return NextResponse.json({ ok: res.ok, snsPost: updated })
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error"

    const updated = await prisma.snsPost.update({
      where: { id: snsPost.id },
      data: {
        status: "FAILED",
        errorMessage: message,
      },
    })

    return NextResponse.json({ error: message, snsPost: updated }, { status: 500 })
  }
}
