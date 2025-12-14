// src/app/api/sns/post/route.ts
import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { prisma } from "@/server/db/client"

export async function POST(req: NextRequest) {
  const webhookUrl = process.env.SNS_WEBHOOK_URL
  if (!webhookUrl) {
    return NextResponse.json({ error: "SNS_WEBHOOK_URL is not configured" }, { status: 500 })
  }

  console.log("[sns/post] SNS_WEBHOOK_URL =", webhookUrl)

  const { snsPostId } = await req.json().catch(() => ({}) as { snsPostId?: string })
  if (!snsPostId) {
    return NextResponse.json({ error: "snsPostId is required" }, { status: 400 })
  }

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

    const text = await res.text().catch(() => "")

    const updated = await prisma.snsPost.update({
      where: { id: snsPost.id },
      data: {
        status: res.ok ? "SUCCESS" : "FAILED",
        errorMessage: res.ok ? null : text || `status ${res.status}`,
      },
    })

    // ✅ /dashboard の表示キャッシュを破棄
    revalidatePath("/dashboard")

    return NextResponse.json({ ok: res.ok, snsPost: updated }, { status: res.ok ? 200 : 500 })
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error"

    const updated = await prisma.snsPost.update({
      where: { id: snsPost.id },
      data: {
        status: "FAILED",
        errorMessage: message,
      },
    })

    // ✅ 失敗時も /dashboard の表示キャッシュを破棄
    revalidatePath("/dashboard")

    return NextResponse.json({ ok: false, error: message, snsPost: updated }, { status: 500 })
  }
}
