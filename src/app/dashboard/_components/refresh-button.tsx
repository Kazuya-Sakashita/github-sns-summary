"use client"

import { useRouter } from "next/navigation"
import { Button } from "@/app/components/ui/button"

export function RefreshButton() {
  const router = useRouter()
  return (
    <Button variant="outline" size="sm" onClick={() => router.refresh()}>
      更新
    </Button>
  )
}
