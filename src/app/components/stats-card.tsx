import { Card, CardContent } from "@/app/components/ui/card";
import type { LucideIcon } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
}

export function StatsCard({ title, value, icon: Icon }: StatsCardProps) {
  return (
    <Card className="group overflow-hidden border-border/50 transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {title}
            </p>
            <p className="text-3xl font-bold text-foreground tabular-nums">
              {value}
            </p>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/50 text-foreground/60 transition-all duration-300 group-hover:bg-foreground group-hover:text-background group-hover:scale-110 group-hover:rotate-6">
            <Icon className="h-5 w-5" strokeWidth={2.5} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
