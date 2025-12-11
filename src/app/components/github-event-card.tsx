"use client";

import { useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardHeader } from "@/app/components/ui/card";
import { StatusBadge } from "@/app/components/status-badge";
import { ExternalLink, Copy, RefreshCw } from "lucide-react";
import { useToast } from "@/app/hooks/use-toast";

interface GithubEvent {
  id: string;
  repository: string;
  prTitle: string;
  prNumber: number;
  githubUrl: string;
  mergedBy: string;
  mergedAt: string;
  status: "SUCCESS" | "FAILED" | "NONE";
  aiSummary?: string;
  snsDraft?: string;
}

export function GithubEventCard({ event }: { event: GithubEvent }) {
  const { toast } = useToast();
  const [isRegenerating, setIsRegenerating] = useState(false);

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast({
      description: "テキストをコピーしました",
    });
  };

  const handleRegenerate = () => {
    setIsRegenerating(true);
    setTimeout(() => {
      setIsRegenerating(false);
      toast({
        description: "再生成を開始しました",
      });
    }, 1000);
  };

  return (
    <Card className="group overflow-hidden border-border/50 transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
      <CardHeader className="border-b border-border/50 bg-muted/20 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-xs font-mono text-muted-foreground">
                {event.repository}
              </h3>
              <span className="text-xs font-mono text-muted-foreground/70">
                #{event.prNumber}
              </span>
            </div>
            <h2 className="text-base font-semibold leading-snug text-balance text-foreground">
              {event.prTitle}
            </h2>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="font-medium">{event.mergedBy}</span>
              <span className="opacity-50">•</span>
              <time>{event.mergedAt}</time>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2.5 flex-shrink-0">
            <StatusBadge status={event.status} />
            <Button
              variant="outline"
              size="sm"
              asChild
              className="h-8 text-xs hover:bg-foreground hover:text-background transition-all bg-transparent"
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
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              AI 要約
            </h4>
            <div className="rounded-lg bg-muted/30 border border-border/50 p-4 text-sm leading-relaxed text-foreground/90">
              {event.aiSummary}
            </div>
          </div>
        )}

        {event.snsDraft && (
          <div className="space-y-2.5">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              SNS 用ドラフト
            </h4>
            <div className="rounded-lg border border-border/50 bg-card p-4 text-sm leading-relaxed font-mono text-foreground/90 whitespace-pre-wrap">
              {event.snsDraft}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopy(event.snsDraft!)}
                className="h-9 text-xs hover:bg-foreground hover:text-background transition-all"
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                コピー
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRegenerate}
                disabled={isRegenerating}
                className="h-9 text-xs hover:bg-foreground hover:text-background transition-all bg-transparent"
              >
                <RefreshCw
                  className={`mr-1.5 h-3.5 w-3.5 ${isRegenerating ? "animate-spin" : ""}`}
                />
                再生成
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
