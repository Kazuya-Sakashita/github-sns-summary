import { Card, CardContent, CardHeader } from "@/app/components/ui/card";

export function EventSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border bg-muted/30 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            <div className="h-6 w-full animate-pulse rounded bg-muted" />
            <div className="h-4 w-48 animate-pulse rounded bg-muted" />
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="h-6 w-20 animate-pulse rounded-full bg-muted" />
            <div className="h-8 w-32 animate-pulse rounded bg-muted" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 p-4">
        <div className="space-y-2">
          <div className="h-4 w-16 animate-pulse rounded bg-muted" />
          <div className="h-20 w-full animate-pulse rounded-lg bg-muted" />
        </div>
        <div className="space-y-2">
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="h-24 w-full animate-pulse rounded-lg bg-muted" />
          <div className="flex gap-2">
            <div className="h-9 w-40 animate-pulse rounded bg-muted" />
            <div className="h-9 w-24 animate-pulse rounded bg-muted" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
