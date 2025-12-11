"use client";

import type React from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar, AvatarFallback } from "@/app/components/ui/avatar";
import { Button } from "@/app/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import { ChevronDown, Home, List, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const navigation = [
    { name: "ダッシュボード", href: "/dashboard", icon: Home },
    { name: "イベント一覧", href: "/events", icon: List },
    { name: "設定", href: "/settings", icon: Settings },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-card/80 backdrop-blur-xl supports-[backdrop-filter]:bg-card/60">
        <div className="flex h-14 items-center justify-between px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground shadow-sm">
              <span className="text-sm font-bold text-background">G</span>
            </div>
            <span className="text-base font-semibold text-foreground tracking-tight">
              GitHub SNS Summary
            </span>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="flex items-center gap-2 h-9"
              >
                <Avatar className="h-7 w-7 ring-1 ring-border/50">
                  <AvatarFallback className="bg-muted text-xs font-semibold text-foreground">
                    開
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium hidden sm:inline">
                  開発者
                </span>
                <ChevronDown className="h-3.5 w-3.5 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem>プロフィール</DropdownMenuItem>
              <DropdownMenuItem>ログアウト</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="hidden lg:block w-56 border-r border-border/40 bg-card/40">
          <nav className="flex flex-col gap-0.5 p-2">
            {navigation.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                    isActive
                      ? "bg-foreground text-background shadow-sm"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="flex-1 overflow-auto bg-background gradient-subtle-bg">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
