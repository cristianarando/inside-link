"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ExternalLink,
  Link2,
  Loader2,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { getCanonicalHost } from "@/lib/env";
import { cn } from "@/lib/utils";

export interface AdminNavProps {
  userEmail: string;
}

export function AdminNav({ userEmail }: AdminNavProps) {
  const pathname = usePathname();
  const canonicalHost = getCanonicalHost();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const isLinksActive = pathname === "/admin" || pathname === "/admin/";
  const isAnalyticsActive = pathname?.startsWith("/admin/analytics") ?? false;

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await authClient.signOut();
    } catch {
      // Redirect to login even if session was already cleared
    } finally {
      window.location.assign("/login");
    }
  };

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-[#09090b]/85 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-5">
          <Link
            href="/admin"
            className="flex min-w-0 items-center gap-2 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 rounded-lg"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
              <Link2 className="h-4 w-4" />
            </span>
            <span className="shrink-0 tracking-tight">InsideLink</span>
            <span className="hidden truncate rounded-md border border-zinc-800 bg-[#111114] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 md:inline-block">
              {canonicalHost}
            </span>
          </Link>

          <nav className="hidden items-center gap-1 sm:flex" aria-label="Admin navigation">
            <Link
              href="/admin"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50",
                isLinksActive
                  ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
              )}
            >
              <Link2 className="h-3.5 w-3.5" />
              Links
            </Link>
            <Link
              href="/admin/analytics"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50",
                isAnalyticsActive
                  ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
              )}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Analytics
            </Link>
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
            >
              Public Directory
              <ExternalLink className="h-3 w-3" />
            </a>
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          <div className="hidden items-center gap-1.5 rounded-lg border border-zinc-800/90 bg-[#111114] px-2.5 py-1 text-xs text-zinc-300 md:inline-flex">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            <span className="max-w-[180px] truncate">{userEmail}</span>
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            disabled={isSigningOut}
            aria-label="Sign out"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-800 bg-[#111114] px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-red-500/40 hover:bg-red-950/40 hover:text-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 disabled:opacity-50"
          >
            {isSigningOut ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <LogOut className="h-3.5 w-3.5" />
            )}
            <span>{isSigningOut ? "Signing out..." : "Sign out"}</span>
          </button>
        </div>
      </div>

      {/* Mobile navigation bar */}
      <nav
        className="flex items-center gap-1 overflow-x-auto border-t border-zinc-800/80 bg-[#09090b]/95 px-4 py-2 sm:hidden"
        aria-label="Mobile admin navigation"
      >
        <Link
          href="/admin"
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition",
            isLinksActive
              ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
          )}
        >
          <Link2 className="h-3.5 w-3.5" />
          Links
        </Link>
        <Link
          href="/admin/analytics"
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition",
            isAnalyticsActive
              ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
          )}
        >
          <BarChart3 className="h-3.5 w-3.5" />
          Analytics
        </Link>
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-100"
        >
          Public Directory
          <ExternalLink className="h-3 w-3" />
        </a>
      </nav>
    </header>
  );
}
