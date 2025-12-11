import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import { FileQuestion } from "lucide-react";
import Link from "next/link";

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
}

export function EmptyState({
  title,
  description,
  actionLabel,
  actionHref,
}: EmptyStateProps) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
          <FileQuestion className="h-10 w-10 text-muted-foreground" />
        </div>
        <h3 className="mt-6 text-xl font-semibold">{title}</h3>
        <p className="mt-2 max-w-md text-sm text-muted-foreground leading-relaxed">
          {description}
        </p>
        {actionLabel && actionHref && (
          <Button asChild className="mt-6">
            <Link href={actionHref}>{actionLabel}</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
