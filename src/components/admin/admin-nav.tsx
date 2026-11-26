"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Command,
  ExternalLink,
  Link2,
  Loader2,
  LogOut,
  ShieldCheck,
  SlidersHorizontal,
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
  const isSettingsActive = pathname?.startsWith("/admin/settings") ?? false;

  const handleOpenCommandPalette = () => {
    window.dispatchEvent(new CustomEvent("insidelink:open-command-palette"));
  };

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

  const navLinkClass = (active: boolean, mobile = false) =>
    cn(
      "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--il-accent-rgb),0.55)]",
      mobile && "shrink-0",
      active
        ? "il-accent-pill border"
        : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100",
    );

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-[var(--il-canvas)]/85 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-5">
          <Link
            href="/admin"
            className="flex min-w-0 items-center gap-2 rounded-lg text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--il-accent-rgb),0.55)]"
          >
            <span className="il-accent-pill flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border">
              <Link2 className="h-4 w-4" />
            </span>
            <span className="shrink-0 tracking-tight">InsideLink</span>
            <span className="hidden truncate rounded-md border border-zinc-800 bg-[var(--il-card)] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 md:inline-block">
              {canonicalHost}
            </span>
          </Link>

          <nav
            className="hidden items-center gap-1 sm:flex"
            aria-label="Admin navigation"
          >
            <Link href="/admin" className={navLinkClass(isLinksActive)}>
              <Link2 className="h-3.5 w-3.5" />
              Links
            </Link>
            <Link
              href="/admin/analytics"
              className={navLinkClass(isAnalyticsActive)}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Analytics
            </Link>
            <Link
              href="/admin/settings"
              className={navLinkClass(isSettingsActive)}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Customize
            </Link>
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--il-accent-rgb),0.55)]"
            >
              Public Directory
              <ExternalLink className="h-3 w-3" />
            </a>
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handleOpenCommandPalette}
            aria-label="Open Command Palette"
            title="Command Palette (⌘K)"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-800 bg-[var(--il-card)] px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-[rgba(var(--il-accent-rgb),0.45)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--il-accent-rgb),0.55)]"
          >
            <Command className="h-3.5 w-3.5 text-[var(--il-accent)]" />
            <span className="hidden lg:inline">Quick Actions</span>
            <kbd className="rounded border border-zinc-700/80 bg-[var(--il-canvas)] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
              ⌘K
            </kbd>
          </button>

          <div className="hidden items-center gap-1.5 rounded-lg border border-zinc-800/90 bg-[var(--il-card)] px-2.5 py-1 text-xs text-zinc-300 md:inline-flex">
            <ShieldCheck className="h-3.5 w-3.5 text-[var(--il-accent)]" />
            <span className="max-w-[160px] truncate">{userEmail}</span>
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            disabled={isSigningOut}
            aria-label="Sign out"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-800 bg-[var(--il-card)] px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-red-500/40 hover:bg-red-950/40 hover:text-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--il-accent-rgb),0.55)] disabled:opacity-50"
          >
            {isSigningOut ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <LogOut className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">
              {isSigningOut ? "Signing out..." : "Sign out"}
            </span>
          </button>
        </div>
      </div>

      {/* Mobile navigation bar */}
      <nav
        className="flex items-center gap-1 overflow-x-auto border-t border-zinc-800/80 bg-[var(--il-canvas)]/95 px-4 py-2 sm:hidden"
        aria-label="Mobile admin navigation"
      >
        <Link href="/admin" className={navLinkClass(isLinksActive, true)}>
          <Link2 className="h-3.5 w-3.5" />
          Links
        </Link>
        <Link
          href="/admin/analytics"
          className={navLinkClass(isAnalyticsActive, true)}
        >
          <BarChart3 className="h-3.5 w-3.5" />
          Analytics
        </Link>
        <Link
          href="/admin/settings"
          className={navLinkClass(isSettingsActive, true)}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Customize
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
