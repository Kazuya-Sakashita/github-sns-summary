"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ExternalLink, Copy, RefreshCw, Send } from "lucide-react"

import { Button } from "@/app/components/ui/button"
import { Card, CardContent, CardHeader } from "@/app/components/ui/card"
import { StatusBadge } from "@/app/components/status-badge"
import { useToast } from "@/app/hooks/use-toast"
import { useSummarize } from "@/app/hooks/use-summarize"
import { useSendWebhook } from "@/app/hooks/use-send-webhook"

interface GithubEvent {
  id: string
  repository: string
  prTitle: string
  prNumber: number
  githubUrl: string
  mergedBy: string
  mergedAt: string

  status: "SUCCESS" | "FAILED" | "NONE"

  aiSummary?: string
  snsDraft?: string

  // Webhook 送信用（※ここが入ってないと送信できない）
  snsPostId?: string
  snsStatus?: "SUCCESS" | "FAILED" | "PENDING"
}

export function GithubEventCard({ event }: { event: GithubEvent }) {
  const router = useRouter()
  const { toast } = useToast()
  const [isCopying, setIsCopying] = useState(false)

  // AI 要約 再生成
  const { summarize, isLoading: isRegenerating } = useSummarize({
    githubEventId: event.id,
  })

  // Webhook 送信（snsPostId を送る想定）
  const { send, isSending } = useSendWebhook({
    onSuccess: () => {
      toast({ description: "Webhook に送信しました" })
      router.refresh()
    },
    onError: (message) => {
      toast({
        variant: "destructive",
        description: `送信に失敗しました: ${message}`,
      })
      router.refresh()
    },
  })

  const handleCopy = async (text: string) => {
    try {
      setIsCopying(true)
      await navigator.clipboard.writeText(text)
      toast({ description: "テキストをコピーしました" })
    } catch {
      toast({ variant: "destructive", description: "コピーに失敗しました" })
    } finally {
      setIsCopying(false)
    }
  }

  const handleSendWebhook = async () => {
    if (!event.snsPostId) {
      toast({
        variant: "destructive",
        description: "送信対象の SnsPost が見つかりません（snsPostId が未設定）",
      })
      return
    }

    // ✅ ここがポイント：string を渡す
    await send(event.snsPostId)
  }

  return (
    <Card className="group border-border/50 overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
      <CardHeader className="border-border/50 bg-muted/20 border-b p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-muted-foreground font-mono text-xs">{event.repository}</h3>
              <span className="text-muted-foreground/70 font-mono text-xs">#{event.prNumber}</span>
            </div>

            <h2 className="text-foreground text-base leading-snug font-semibold text-balance">
              {event.prTitle}
            </h2>

            <div className="text-muted-foreground flex items-center gap-3 text-xs">
              <span className="font-medium">{event.mergedBy}</span>
              <span className="opacity-50">•</span>
              <time>{event.mergedAt}</time>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2.5">
            <StatusBadge status={event.status} />

            <Button
              variant="outline"
              size="sm"
              asChild
              className="hover:bg-foreground hover:text-background h-8 bg-transparent text-xs transition-all"
            >
              <a
                href={event.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5"
              >
                <span>GitHub</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 p-5">
        {event.aiSummary && (
          <div className="space-y-2.5">
            <h4 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              AI 要約
            </h4>
            <div className="border-border/50 bg-muted/30 text-foreground/90 rounded-lg border p-4 text-sm leading-relaxed">
              {event.aiSummary}
            </div>
          </div>
        )}

        {event.snsDraft && (
          <div className="space-y-2.5">
            <h4 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              SNS 用ドラフト
            </h4>

            <div className="border-border/50 bg-card text-foreground/90 rounded-lg border p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap">
              {event.snsDraft}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopy(event.snsDraft!)}
                disabled={isCopying}
                className="hover:bg-foreground hover:text-background h-9 text-xs transition-all"
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                {isCopying ? "コピー中..." : "コピー"}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={summarize}
                disabled={isRegenerating}
                className="hover:bg-foreground hover:text-background h-9 bg-transparent text-xs transition-all"
              >
                <RefreshCw
                  className={`mr-1.5 h-3.5 w-3.5 ${isRegenerating ? "animate-spin" : ""}`}
                />
                {isRegenerating ? "再生成中..." : "AI 要約を再生成"}
              </Button>

              {/* ✅ snsPostId があるときだけ表示 */}
              {event.snsPostId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSendWebhook}
                  disabled={isSending}
                  className="hover:bg-foreground hover:text-background h-9 bg-transparent text-xs transition-all"
                >
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                  {isSending ? "送信中..." : "Webhook送信"}
                </Button>
              )}
            </div>
          </div>
        )}

        {!event.snsDraft && (
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={summarize}
              disabled={isRegenerating}
              className="hover:bg-foreground hover:text-background h-9 bg-transparent text-xs transition-all"
            >
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isRegenerating ? "animate-spin" : ""}`} />
              {isRegenerating ? "生成中..." : "AI 要約を生成"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
