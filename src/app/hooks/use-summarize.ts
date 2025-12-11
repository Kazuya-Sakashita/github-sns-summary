// src/app/hooks/use-summarize.ts
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useToast } from "@/app/hooks/use-toast"

type UseSummarizeOptions = {
  githubEventId: string
}

export function useSummarize({ githubEventId }: UseSummarizeOptions) {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  const summarize = async () => {
    if (!githubEventId) return

    setIsLoading(true)
    try {
      const res = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ githubEventId }),
      })

      if (!res.ok) {
        let message = "AI 要約の生成に失敗しました。"

        try {
          const data = await res.json()
          if (data?.error) message = data.error
        } catch {
          // JSON でないレスポンスは無視
        }

        toast({
          variant: "destructive",
          title: "要約生成エラー",
          description: message,
        })
        return
      }

      const data = await res.json()
      console.log("[ai/summarize] response:", data)

      toast({
        title: "AI 要約を生成しました",
        description: "ダッシュボードの内容を更新しました。",
      })

      // DB の最新状態を反映
      router.refresh()
    } catch (error) {
      console.error("[ai/summarize] failed:", error)
      toast({
        variant: "destructive",
        title: "要約生成エラー",
        description: "ネットワークエラーが発生しました。",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return { summarize, isLoading }
}
