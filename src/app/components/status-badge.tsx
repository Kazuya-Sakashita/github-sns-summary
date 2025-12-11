// src/components/status-badge.tsx
import { cn } from "@/lib/utils"

type RawStatus = string | null | undefined

interface StatusBadgeProps {
  status: RawStatus
}

const STATUS_CONFIG: Record<
  string,
  {
    label: string
    className: string
  }
> = {
  SUCCESS: {
    label: "生成済み",
    className: "bg-green-100 text-green-700 border-green-200",
  },
  FAILED: {
    label: "生成エラー",
    className: "bg-red-100 text-red-700 border-red-200",
  },
  DRAFT: {
    label: "下書き",
    className: "bg-blue-50 text-blue-700 border-blue-200",
  },
  POSTED: {
    label: "投稿済み",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  NONE: {
    label: "未生成",
    className: "bg-gray-100 text-gray-600 border-gray-200",
  },
}

export function StatusBadge({ status }: StatusBadgeProps) {
  // null / undefined / 想定外の文字列はすべて "NONE" にフォールバック
  const normalized = status ?? "NONE"
  const config = STATUS_CONFIG[normalized] ?? STATUS_CONFIG.NONE

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        config.className,
      )}
    >
      {config.label}
    </span>
  )
}
