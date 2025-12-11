// src/app/dashboard/page.tsx
import { AppLayout } from "@/app/components/app-layout"
import { StatsCard } from "@/app/components/stats-card"
import { GithubEventCard } from "@/app/components/github-event-card"
import { EmptyState } from "@/app/components/empty-state"
import { GitMerge, FileText, AlertCircle } from "lucide-react"
import { getDashboardEvents } from "@/server/dashboard/getDashboardEvents"

function formatJpDate(date: Date) {
  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default async function DashboardPage() {
  const events = await getDashboardEvents()

  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  // 直近7日間に作られたイベント
  const recentEvents = events.filter((e) => e.createdAt >= sevenDaysAgo && e.createdAt <= now)

  // SnsPost 全体
  const allPosts = events.flatMap((e) => e.posts)

  const totalMergedLast7Days = recentEvents.length
  const totalSnsDrafts = allPosts.length
  const totalFailed = allPosts.filter((p) => p.status === "FAILED").length

  const isEmpty = events.length === 0

  return (
    <AppLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="space-y-3">
          <h1 className="text-gradient text-3xl font-bold tracking-tight sm:text-4xl">
            ダッシュボード
          </h1>
          <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed sm:text-base">
            GitHub のマージ済み PR と AI の要約・SNSドラフトを一覧で確認できます
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
          <StatsCard title="直近7日間のマージ数" value={totalMergedLast7Days} icon={GitMerge} />
          <StatsCard title="生成されたSNSドラフト数" value={totalSnsDrafts} icon={FileText} />
          <StatsCard title="失敗した生成数" value={totalFailed} icon={AlertCircle} />
        </div>

        {/* Events */}
        <div className="space-y-5">
          <h2 className="text-foreground text-xl font-semibold tracking-tight sm:text-2xl">
            最近のイベント
          </h2>

          {isEmpty ? (
            <EmptyState
              title="まだ GitHub のイベントがありません"
              description="GitHub の Webhook を設定すると、ここにマージ済み PR が表示されます。"
              actionLabel="設定ページを開く"
              actionHref="/settings"
            />
          ) : (
            <div className="space-y-4">
              {events.map((event) => {
                const latestPost = event.posts[0] ?? null

                // GithubEventCard が期待している形にマッピング
                return (
                  <GithubEventCard
                    key={event.id}
                    event={{
                      id: event.id,
                      repository: event.repoName,
                      prTitle: event.prTitle,
                      prNumber: event.prNumber,
                      githubUrl: event.prUrl,
                      mergedBy: event.mergedBy ?? "unknown",
                      mergedAt: formatJpDate(event.createdAt),
                      status: (latestPost?.status as "SUCCESS" | "FAILED" | "NONE") ?? "NONE",
                      aiSummary: latestPost?.content ?? "",
                      snsDraft: latestPost?.content ?? "",
                    }}
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
