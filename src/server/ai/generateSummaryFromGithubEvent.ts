// src/server/ai/generateSummaryFromGithubEvent.ts
import type { GithubEvent } from "@prisma/client"

/**
 * 将来的に AI 用のプロンプトを組み立てる関数。
 * まずはテンプレートでの「なんちゃって要約」を返す。
 */
export function buildPromptFromGithubEvent(event: GithubEvent): string {
  return [
    `リポジトリ: ${event.repoName}`,
    `PR #${event.prNumber}: ${event.prTitle}`,
    event.prUrl ? `URL: ${event.prUrl}` : "",
    event.mergedBy ? `マージした人: ${event.mergedBy}` : "",
  ]
    .filter(Boolean)
    .join("\n")
}

/**
 * フェーズ1: 擬似 AI 要約。
 * - 後からここを OpenAI / Claude などの呼び出しに差し替える想定。
 */
export async function generateSummaryFromGithubEvent(
  event: GithubEvent,
): Promise<string> {
  const baseInfo = buildPromptFromGithubEvent(event)

  // TODO: ここを本物の AI 呼び出しに差し替える
  // 例: OpenAI に baseInfo を投げて、SNS 向けの 200 文字要約を生成する…など
  const summaryLines = [
    "GitHub の PR マージ内容を要約しました。",
    "",
    baseInfo,
    "",
    "この PR では、リポジトリの改善・機能追加・バグ修正などが行われています。",
  ]

  return summaryLines.join("\n")
}
