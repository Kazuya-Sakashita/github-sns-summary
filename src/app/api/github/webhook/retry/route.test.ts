import { describe, it, expect, beforeEach, vi } from "vitest"
import { NextRequest } from "next/server"
import type { Prisma } from "@prisma/client"

// NextRequest を作るヘルパー
function makePost(url: string, body: unknown, headers?: Record<string, string>) {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(headers ?? {}),
    },
    body: JSON.stringify(body),
  })
}

const RETRY_URL = "http://localhost:3000/api/github/webhook/retry"

/**
 * User の必須カラムが増えても破綻しにくいように、
 * “最低限 + 足りない分はここに追加” の形にしておく。
 */
function buildOwnerUserInput(): Prisma.UserCreateInput {
  return {
    id: process.env.OWNER_USER_ID!,
    name: "Owner Test", // ✅ 必須
  }
}

describe("POST /api/github/webhook/retry (sqlite integration)", () => {
  beforeEach(async () => {
    vi.resetModules()

    const { prisma } = await import("@/server/db/client")

    // テーブルを掃除（外部キーがあるなら順番調整）
    await prisma.githubEvent.deleteMany()
    await prisma.githubWebhookDelivery.deleteMany()
    await prisma.user.deleteMany()

    // OWNER ユーザーを作る（webhook/retry の前提）
    await prisma.user.create({
      data: buildOwnerUserInput(),
    })
  })

  it("401: x-retry-api-key が一致しない", async () => {
    const { POST } = await import("./route")

    const req = makePost(RETRY_URL, { deliveryId: "x" }, { "x-retry-api-key": "wrong-key" })
    const res = await POST(req)
    expect(res.status).toBe(401)

    const json = await res.json()
    expect(json.error).toBe("Unauthorized")
  })

  it("400: deliveryId がない", async () => {
    const { POST } = await import("./route")

    const req = makePost(RETRY_URL, {}, { "x-retry-api-key": process.env.WEBHOOK_RETRY_API_KEY! })
    const res = await POST(req)
    expect(res.status).toBe(400)

    const json = await res.json()
    expect(json.error).toBe("deliveryId is required")
  })

  it("404: Delivery not found", async () => {
    const { POST } = await import("./route")

    const req = makePost(
      RETRY_URL,
      { deliveryId: "not-exist" },
      { "x-retry-api-key": process.env.WEBHOOK_RETRY_API_KEY! },
    )
    const res = await POST(req)
    expect(res.status).toBe(404)

    const json = await res.json()
    expect(json.error).toBe("Delivery not found")
  })

  it("409: PROCESSED はリトライ不可", async () => {
    const { prisma } = await import("@/server/db/client")
    const { POST } = await import("./route")

    await prisma.githubWebhookDelivery.create({
      data: {
        deliveryId: "processed-001",
        eventName: "pull_request",
        signature256: null,
        rawPayload: { hello: "world" },
        status: "PROCESSED",
        attemptCount: 1,
      },
    })

    const req = makePost(
      RETRY_URL,
      { deliveryId: "processed-001" },
      { "x-retry-api-key": process.env.WEBHOOK_RETRY_API_KEY! },
    )
    const res = await POST(req)
    expect(res.status).toBe(409)

    const json = await res.json()
    expect(String(json.error)).toContain("Cannot retry status=PROCESSED")
  })

  it("409: RECEIVED は force=true なしでリトライ不可", async () => {
    const { prisma } = await import("@/server/db/client")
    const { POST } = await import("./route")

    await prisma.githubWebhookDelivery.create({
      data: {
        deliveryId: "received-001",
        eventName: "pull_request",
        signature256: null,
        rawPayload: { hello: "world" },
        status: "RECEIVED",
        attemptCount: 0,
      },
    })

    const req = makePost(
      RETRY_URL,
      { deliveryId: "received-001" },
      { "x-retry-api-key": process.env.WEBHOOK_RETRY_API_KEY! },
    )
    const res = await POST(req)
    expect(res.status).toBe(409)

    const json = await res.json()
    expect(String(json.error)).toContain("Use force=true")
  })

  it("FAILED → retry で PROCESSED になり GithubEvent が作成される", async () => {
    const { prisma } = await import("@/server/db/client")
    const { POST } = await import("./route")

    const deliveryId = "failed-then-ok-001"

    const rawPayload = {
      action: "closed",
      pull_request: {
        number: 7777,
        title: "retry test",
        html_url: "https://github.com/owner/repo/pull/7777",
        merged: true,
        merged_by: { login: "tester" },
        merged_at: "2025-12-21T00:00:00Z",
        merge_commit_sha: "sha7777",
      },
      repository: { full_name: "owner/repo" },
    }

    await prisma.githubWebhookDelivery.create({
      data: {
        deliveryId,
        eventName: "pull_request",
        signature256: null,
        rawPayload,
        status: "FAILED",
        attemptCount: 1,
        errorMessage: "Invalid JSON",
      },
    })

    const req = makePost(
      RETRY_URL,
      { deliveryId },
      { "x-retry-api-key": process.env.WEBHOOK_RETRY_API_KEY! },
    )

    const res = await POST(req)
    expect(res.status).toBe(200)

    const json: { ok: boolean; githubEventId?: string } = await res.json()
    expect(json.ok).toBe(true)
    expect(typeof json.githubEventId).toBe("string")

    const savedDelivery = await prisma.githubWebhookDelivery.findUnique({
      where: { deliveryId },
      select: { status: true, attemptCount: true, githubEventId: true },
    })
    expect(savedDelivery?.status).toBe("PROCESSED")
    expect(savedDelivery?.attemptCount).toBe(2)
    expect(savedDelivery?.githubEventId).toBe(json.githubEventId)

    const event = await prisma.githubEvent.findUnique({
      where: { id: json.githubEventId! },
      select: { repoName: true, prNumber: true, githubDeliveryId: true },
    })
    expect(event?.repoName).toBe("owner/repo")
    expect(event?.prNumber).toBe(7777)
    expect(event?.githubDeliveryId).toBe(deliveryId)
  })
})
