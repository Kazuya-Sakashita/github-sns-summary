// src/lib/github/fetchPullRequestFiles.ts
import { extname } from "path"

export type PullRequestFileItem = {
  filename: string
  status: string
  additions: number
  deletions: number
  changes: number
  extension: string | null
}

// 互換用（PullRequestFile という名前でも使えるようにする）
export type PullRequestFile = PullRequestFileItem

function normalizeExtension(filename: string): string | null {
  const ext = extname(filename).toLowerCase()
  if (!ext) return null
  return ext
}

async function ghFetch<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "github-sns-summary",
    },
    cache: "no-store",
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`GitHub API error: ${res.status} ${res.statusText} ${text}`.trim())
  }
  return (await res.json()) as T
}

/**
 * PRの変更ファイル一覧を全件取得（ページング対応）
 * GET /repos/{owner}/{repo}/pulls/{pull_number}/files
 */
export async function fetchPullRequestFiles(params: {
  token: string
  repoFullName: string // "owner/repo"
  prNumber: number
  perPage?: number // default 100
  maxPages?: number // safety
}): Promise<PullRequestFileItem[]> {
  const { token, repoFullName, prNumber } = params
  const perPage = params.perPage ?? 100
  const maxPages = params.maxPages ?? 20

  const out: PullRequestFileItem[] = []
  for (let page = 1; page <= maxPages; page++) {
    const url = `https://api.github.com/repos/${repoFullName}/pulls/${prNumber}/files?per_page=${perPage}&page=${page}`
    const items = await ghFetch<
      Array<{
        filename: string
        status: string
        additions: number
        deletions: number
        changes: number
      }>
    >(url, token)

    for (const it of items) {
      out.push({
        filename: it.filename,
        status: it.status,
        additions: it.additions,
        deletions: it.deletions,
        changes: it.changes,
        extension: normalizeExtension(it.filename),
      })
    }

    if (items.length < perPage) break
  }

  return out
}

/**
 * 集計（filesCount / additions / deletions / extension stats）
 */
export function summarizePullRequestFiles(files: PullRequestFileItem[]) {
  let prAdditions = 0
  let prDeletions = 0
  let prChanges = 0

  const stats: Record<string, number> = {}

  for (const f of files) {
    prAdditions += f.additions
    prDeletions += f.deletions
    prChanges += f.changes

    const key = f.extension ?? "noext"
    stats[key] = (stats[key] ?? 0) + 1
  }

  return {
    prFilesCount: files.length,
    prAdditions,
    prDeletions,
    prChanges,
    prFileStats: stats,
  }
}
