// src/app/api/ai/summarize/route.ts
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/server/db/client"
import { generateSummaryFromGithubEvent } from "@/server/ai/generateSummaryFromGithubEvent"

const bodySchema = z.object({
  githubEventId: z.string().min(1),
})

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === "string") return err
  try {
    return JSON.stringify(err)
  } catch {
    return "unknown error"
  }
}

export async function POST(req: NextRequest) {
  let body: z.infer<typeof bodySchema>

  // 1. リクエストボディのバリデーション
  try {
    const json = await req.json()
    body = bodySchema.parse(json)
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const { githubEventId } = body

  // 2. 対象の GithubEvent を取得
  const githubEvent = await prisma.githubEvent.findUnique({
    where: { id: githubEventId },
  })

  if (!githubEvent) {
    return NextResponse.json(
      { error: "GithubEvent not found" },
      { status: 404 },
    )
  }

  // 3. AI 要約（フェーズ1は擬似要約）
  try {
    const summary = await generateSummaryFromGithubEvent(githubEvent)

    const snsPost = await prisma.snsPost.create({
      data: {
        eventId: githubEvent.id,
        platform: "ai-preview",
        content: summary,
        status: "SUCCESS",
        // externalId, errorMessage は不要なので未設定
      },
    })

    return NextResponse.json({
      ok: true,
      snsPostId: snsPost.id,
      content: snsPost.content,
    })
  } catch (err) {
    // 4. 失敗時も FAILED ログとして残す
    const errorMessage = getErrorMessage(err)

    const failedPost = await prisma.snsPost.create({
      data: {
        eventId: githubEvent.id,
        platform: "ai-preview",
        content: "",
        status: "FAILED",
        errorMessage,
      },
    })

    console.error("[api/ai/summarize] failed to generate summary", err)

    return NextResponse.json(
      {
        ok: false,
        error: "Failed to generate summary",
        snsPostId: failedPost.id,
      },
      { status: 500 },
    )
  }
}
