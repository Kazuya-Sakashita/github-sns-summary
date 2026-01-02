// tests/summarizePullRequestFiles.test.ts
import { describe, it, expect } from "vitest"
import {
  summarizePullRequestFiles,
  type PullRequestFileItem,
} from "@/lib/github/fetchPullRequestFiles"

describe("summarizePullRequestFiles", () => {
  it("合計と拡張子別カウントを集計できる", () => {
    const files: PullRequestFileItem[] = [
      {
        filename: "a.ts",
        status: "modified",
        additions: 10,
        deletions: 3,
        changes: 13,
        extension: ".ts",
      },
      {
        filename: "b.ts",
        status: "added",
        additions: 5,
        deletions: 0,
        changes: 5,
        extension: ".ts",
      },
      {
        filename: "Dockerfile",
        status: "modified",
        additions: 2,
        deletions: 1,
        changes: 3,
        extension: null,
      },
      {
        filename: "schema.prisma",
        status: "modified",
        additions: 7,
        deletions: 4,
        changes: 11,
        extension: ".prisma",
      },
    ]

    const summary = summarizePullRequestFiles(files)

    expect(summary.prFilesCount).toBe(4)
    expect(summary.prAdditions).toBe(10 + 5 + 2 + 7)
    expect(summary.prDeletions).toBe(3 + 0 + 1 + 4)
    expect(summary.prFileStats).toEqual({
      ".ts": 2,
      ".prisma": 1,
      noext: 1,
    })
  })

  it("空配列でもゼロで返る", () => {
    const summary = summarizePullRequestFiles([])
    expect(summary).toEqual({
      prFilesCount: 0,
      prAdditions: 0,
      prDeletions: 0,
      prFileStats: {},
    })
  })
})
