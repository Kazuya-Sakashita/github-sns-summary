// tests/fetchPullRequestFiles.test.ts
import { describe, it, expect, vi, afterEach } from "vitest"
import { fetchPullRequestFiles } from "@/lib/github/fetchPullRequestFiles"

type FetchMock = ReturnType<typeof vi.fn>

// Node 環境の global fetch を安全に差し替える（ts-expect-error 不要）
function setFetchMock(fetchMock: FetchMock) {
  vi.stubGlobal("fetch", fetchMock)
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("fetchPullRequestFiles", () => {
  it("perPage を満たす限りページングし、最後のページで止まる（items.length < perPage）", async () => {
    const token = "dummy"
    const repoFullName = "owner/repo"
    const prNumber = 123
    const perPage = 2

    // page1: perPage ちょうど -> 続く
    const page1 = [
      { filename: "a.ts", status: "modified", additions: 1, deletions: 2, changes: 3 },
      { filename: "b.ts", status: "added", additions: 4, deletions: 0, changes: 4 },
    ]
    // page2: 1件 -> ここで終了
    const page2 = [
      { filename: "Dockerfile", status: "modified", additions: 2, deletions: 1, changes: 3 },
    ]

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => page1,
        text: async () => JSON.stringify(page1),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => page2,
        text: async () => JSON.stringify(page2),
      })

    setFetchMock(fetchMock)

    const files = await fetchPullRequestFiles({
      token,
      repoFullName,
      prNumber,
      perPage,
      maxPages: 10,
    })

    expect(files).toHaveLength(3)
    expect(files.map((x) => x.filename)).toEqual(["a.ts", "b.ts", "Dockerfile"])
    expect(files[0].extension).toBe(".ts")
    expect(files[2].extension).toBeNull()

    // 呼び出し URL（page=1,2）
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `https://api.github.com/repos/${repoFullName}/pulls/${prNumber}/files?per_page=${perPage}&page=1`,
    )
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `https://api.github.com/repos/${repoFullName}/pulls/${prNumber}/files?per_page=${perPage}&page=2`,
    )
  })

  it("maxPages に達したら強制終了する（無限ループ防止）", async () => {
    const token = "dummy"
    const repoFullName = "owner/repo"
    const prNumber = 999
    const perPage = 2
    const maxPages = 3

    // 常に perPage 件返してくる = 本来は終わらないケース
    const page = [
      { filename: "a.ts", status: "modified", additions: 1, deletions: 0, changes: 1 },
      { filename: "b.ts", status: "modified", additions: 1, deletions: 0, changes: 1 },
    ]

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => page,
      text: async () => JSON.stringify(page),
    })

    setFetchMock(fetchMock)

    const files = await fetchPullRequestFiles({ token, repoFullName, prNumber, perPage, maxPages })

    // maxPages 回だけ呼ばれて止まる
    expect(fetchMock).toHaveBeenCalledTimes(maxPages)
    expect(files).toHaveLength(perPage * maxPages)
  })

  it("GitHub API がエラーなら例外になる（ステータス/本文込み）", async () => {
    const token = "dummy"
    const repoFullName = "owner/repo"
    const prNumber = 1

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
      json: async () => ({}),
      text: async () => "rate limit",
    })

    setFetchMock(fetchMock)

    await expect(
      fetchPullRequestFiles({ token, repoFullName, prNumber, perPage: 100, maxPages: 1 }),
    ).rejects.toThrow("GitHub API error: 403 Forbidden rate limit")
  })
})
