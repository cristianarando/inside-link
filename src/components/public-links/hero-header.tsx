"use client";

import React, { useState } from "react";
import { ArrowUpRight, Globe } from "lucide-react";
import { LinkIcon } from "@/components/ui/icons";
import { env, getCanonicalHost } from "@/lib/env";
import type { StatusColor } from "@/lib/themes";
import type { SiteSettingsDTO } from "@/lib/types/link-dto";

export const STATUS_COLOR_STYLES: Record<
  StatusColor,
  { pill: string; dot: string; ping: string }
> = {
  emerald: {
    pill: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    dot: "bg-emerald-400",
    ping: "bg-emerald-400",
  },
  cyan: {
    pill: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
    dot: "bg-cyan-400",
    ping: "bg-cyan-400",
  },
  amber: {
    pill: "border-amber-500/30 bg-amber-500/10 text-amber-200",
    dot: "bg-amber-400",
    ping: "bg-amber-400",
  },
  rose: {
    pill: "border-rose-500/30 bg-rose-500/10 text-rose-200",
    dot: "bg-rose-400",
    ping: "bg-rose-400",
  },
  violet: {
    pill: "border-violet-500/30 bg-violet-500/10 text-violet-200",
    dot: "bg-violet-400",
    ping: "bg-violet-400",
  },
  zinc: {
    pill: "border-zinc-700 bg-zinc-800/70 text-zinc-200",
    dot: "bg-zinc-400",
    ping: "bg-zinc-400",
  },
};

export function isSafePublicHref(
  href: string | null | undefined,
): href is string {
  if (!href) return false;
  const trimmed = href.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return true;
  try {
    const parsed = new URL(trimmed);
    return (
      parsed.protocol === "http:" ||
      parsed.protocol === "https:" ||
      parsed.protocol === "mailto:"
    );
  } catch {
    return false;
  }
}

export function StatusPill({
  statusText,
  statusColor,
  statusHref,
}: {
  statusText: string | null;
  statusColor: StatusColor;
  statusHref: string | null;
}) {
  if (!statusText?.trim()) return null;
  const styles =
    STATUS_COLOR_STYLES[statusColor] ?? STATUS_COLOR_STYLES.emerald;
  const safeHref = isSafePublicHref(statusHref) ? statusHref : null;
  const isExternal = safeHref ? /^https?:\/\//i.test(safeHref) : false;

  const inner = (
    <>
      <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${styles.ping}`}
        />
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${styles.dot}`}
        />
      </span>
      <span className="truncate">{statusText.trim()}</span>
      {safeHref ? (
        <ArrowUpRight className="h-3 w-3 shrink-0 opacity-75" />
      ) : null}
    </>
  );

  if (safeHref) {
    return (
      <a
        href={safeHref}
        target={isExternal ? "_blank" : undefined}
        rel={isExternal ? "noopener noreferrer" : undefined}
        className={`inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--il-accent-rgb),0.55)] ${styles.pill}`}
      >
        {inner}
      </a>
    );
  }

  return (
    <span
      className={`inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${styles.pill}`}
    >
      {inner}
    </span>
  );
}

export interface HeroHeaderProps {
  siteSettings: SiteSettingsDTO;
}

export function HeroHeader({ siteSettings }: HeroHeaderProps) {
  const canonicalHost = getCanonicalHost();
  const portfolioUrl = env.NEXT_PUBLIC_PORTFOLIO_URL.replace(/\/+$/, "");
  const [avatarFailed, setAvatarFailed] = useState(false);

  const avatarSrc =
    !avatarFailed && isSafePublicHref(siteSettings.avatarUrl)
      ? siteSettings.avatarUrl
      : "/brand/author-avatar.png";

  const visibleSocials = (siteSettings.socialLinks ?? []).filter((item) =>
    isSafePublicHref(item.url),
  );

  return (
    <header className="il-themed-card relative mb-8 overflow-hidden rounded-3xl border p-6 sm:p-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(var(--il-accent-rgb), calc(var(--il-glow-alpha) * 1.1)), transparent 70%)",
        }}
      />

      <div className="relative flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
          <img
            src={avatarSrc}
            alt={siteSettings.displayName || "Profile avatar"}
            width={72}
            height={72}
            onError={() => setAvatarFailed(true)}
            className="h-16 w-16 shrink-0 rounded-2xl border border-[rgba(var(--il-accent-rgb),0.35)] bg-[var(--il-canvas)] object-cover shadow-lg sm:h-[72px] sm:w-[72px]"
          />

          <div className="min-w-0 space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="il-accent-pill inline-flex items-center gap-2 rounded-full border px-3 py-0.5 font-mono text-[11px]">
                <span
                  className="h-1.5 w-1.5 rounded-full bg-[var(--il-accent)]"
                  aria-hidden="true"
                />
                {canonicalHost}
              </span>
              <StatusPill
                statusText={siteSettings.statusText}
                statusColor={siteSettings.statusColor}
                statusHref={siteSettings.statusHref}
              />
            </div>

            <div>
              <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
                {siteSettings.displayName}
              </h1>
              <p className="mt-0.5 text-sm font-medium text-[var(--il-accent-muted)]">
                {siteSettings.headline}
              </p>
            </div>

            {siteSettings.bio ? (
              <p className="max-w-2xl text-sm leading-relaxed text-zinc-400">
                {siteSettings.bio}
              </p>
            ) : null}

            {visibleSocials.length > 0 ? (
              <div
                className="flex flex-wrap items-center gap-2 pt-1"
                aria-label="Verified social links"
              >
                {visibleSocials.map((social) => {
                  const isExternal = /^https?:\/\//i.test(social.url);
                  return (
                    <a
                      key={social.id}
                      href={social.url}
                      target={isExternal ? "_blank" : undefined}
                      rel={isExternal ? "noopener noreferrer" : undefined}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-800/90 bg-[var(--il-canvas)]/80 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-[rgba(var(--il-accent-rgb),0.45)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--il-accent-rgb),0.55)]"
                    >
                      <LinkIcon
                        name={social.icon || social.platform}
                        className="h-3.5 w-3.5 text-[var(--il-accent)]"
                      />
                      <span>{social.label}</span>
                    </a>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>

        <a
          href={portfolioUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-xl border border-zinc-800 bg-[var(--il-elevated)]/80 px-4 py-2.5 text-xs font-medium text-zinc-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition hover:border-[rgba(var(--il-accent-rgb),0.45)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--il-accent-rgb),0.55)]"
        >
          <Globe className="h-4 w-4 text-[var(--il-accent)]" />
          Main Portfolio
          <ArrowUpRight className="h-3.5 w-3.5 text-zinc-400" />
        </a>
      </div>
    </header>
  );
}
