"use client"

import { useState } from "react"

type Options = {
  onSuccess?: () => void
  onError?: (message: string) => void
}

export function useSendWebhook(options: Options = {}) {
  const [isSending, setIsSending] = useState(false)

  const send = async (snsPostId: string) => {
    if (!snsPostId) return
    setIsSending(true)

    try {
      const res = await fetch("/api/sns/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snsPostId }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok || data?.ok === false) {
        const msg = data?.error || data?.snsPost?.errorMessage || `HTTP ${res.status}`
        options.onError?.(msg)
        return
      }

      options.onSuccess?.()
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown error"
      options.onError?.(msg)
    } finally {
      setIsSending(false)
    }
  }

  return { send, isSending }
}
