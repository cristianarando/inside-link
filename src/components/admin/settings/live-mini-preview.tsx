"use client";

import React from "react";
import { ArrowUpRight, Clock, Lock, Pin, Sparkles } from "lucide-react";
import { STATUS_COLOR_STYLES } from "@/components/public-links/hero-header";
import { LinkIcon } from "@/components/ui/icons";
import type {
  DirectoryLayout,
  ResolvedThemeTokens,
  StatusColor,
} from "@/lib/themes";
import type { SocialLinkItem } from "@/lib/types/link-dto";
import { cn } from "@/lib/utils";

export interface LiveMiniPreviewProps {
  displayName: string;
  headline: string;
  bio: string;
  avatarUrl: string;
  statusText: string;
  statusColor: StatusColor;
  directoryLayout: DirectoryLayout;
  socialLinks: SocialLinkItem[];
  tokens: ResolvedThemeTokens;
}

export function LiveMiniPreview({
  displayName,
  headline,
  bio,
  avatarUrl,
  statusText,
  statusColor,
  directoryLayout,
  socialLinks,
  tokens,
}: LiveMiniPreviewProps) {
  const statusStyle =
    STATUS_COLOR_STYLES[statusColor] ?? STATUS_COLOR_STYLES.emerald;

  const cardSurfaceStyle: React.CSSProperties =
    tokens.cardStyle === "minimal"
      ? {
          backgroundColor: "rgba(9, 9, 11, 0.72)",
          borderColor: "rgba(255, 255, 255, 0.08)",
        }
      : tokens.cardStyle === "bordered"
        ? {
            backgroundColor: tokens.cardHex,
            borderColor: `rgba(${tokens.accentRgb}, 0.34)`,
          }
        : {
            backgroundColor: tokens.cardHex,
            borderColor: "rgba(255, 255, 255, 0.1)",
            backdropFilter: "blur(12px)",
          };

  return (
    <div className="rounded-2xl border border-zinc-800/90 bg-[var(--il-card)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
            Live Mini Preview
          </p>
          <p className="text-[11px] text-zinc-500">
            Reflects unsaved theme, card style &amp; layout edits
          </p>
        </div>
        <span className="rounded-md border border-zinc-800 bg-[var(--il-canvas)] px-2 py-0.5 font-mono text-[10px] uppercase text-zinc-400">
          {directoryLayout} · {tokens.cardStyle}
        </span>
      </div>

      <div
        className="overflow-hidden rounded-xl border border-zinc-800/80 p-4 text-zinc-100"
        style={{
          backgroundColor: tokens.canvasHex,
          backgroundImage: `radial-gradient(ellipse 90% 55% at 50% -15%, rgba(${tokens.accentRgb}, ${tokens.glowAlpha}), transparent 70%)`,
        }}
      >
        {/* Mini Hero */}
        <div className="rounded-xl border p-3.5" style={cardSurfaceStyle}>
          <div className="flex items-start gap-3">
            <img
              src={avatarUrl || "/brand/author-avatar.png"}
              alt={displayName || "Preview avatar"}
              width={40}
              height={40}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src =
                  "/brand/author-avatar.png";
              }}
              className="h-10 w-10 shrink-0 rounded-xl border object-cover"
              style={{ borderColor: `rgba(${tokens.accentRgb}, 0.4)` }}
            />
            <div className="min-w-0 flex-1 space-y-1">
              {statusText.trim() ? (
                <span
                  className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusStyle.pill}`}
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusStyle.dot}`}
                  />
                  <span className="truncate">{statusText.trim()}</span>
                </span>
              ) : null}
              <p className="truncate text-sm font-semibold text-white">
                {displayName.trim() || "Your Name"}
              </p>
              <p
                className="truncate text-[11px] font-medium"
                style={{ color: tokens.accentMutedHex }}
              >
                {headline.trim() || "Links & Projects"}
              </p>
            </div>
          </div>
          {bio.trim() ? (
            <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-zinc-400">
              {bio.trim()}
            </p>
          ) : null}

          {socialLinks.length > 0 ? (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {socialLinks.slice(0, 4).map((item) => (
                <span
                  key={item.id}
                  className="inline-flex items-center gap-1 rounded-md border border-zinc-800 px-2 py-0.5 text-[10px] text-zinc-300"
                  style={{ backgroundColor: tokens.canvasHex }}
                >
                  <span style={{ color: tokens.accentHex }}>
                    <LinkIcon
                      name={item.icon || item.platform}
                      className="h-2.5 w-2.5"
                    />
                  </span>
                  {item.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {/* Mini Category Pill Preview */}
        <div className="mt-3 flex items-center gap-1.5">
          <span
            className="rounded-lg px-2.5 py-1 text-[10px] font-semibold"
            style={{
              backgroundColor: tokens.accentHex,
              color: tokens.accentTextHex,
            }}
          >
            All
          </span>
          <span
            className="rounded-lg border border-zinc-800 px-2.5 py-1 text-[10px] text-zinc-400"
            style={{ backgroundColor: tokens.cardHex }}
          >
            Projects
          </span>
          <span
            className="rounded-lg border border-zinc-800 px-2.5 py-1 text-[10px] text-zinc-400"
            style={{ backgroundColor: tokens.cardHex }}
          >
            Resources
          </span>
        </div>

        {/* Mini Cards Layout */}
        <div
          className={cn(
            "mt-3 gap-2.5",
            directoryLayout === "list" ? "flex flex-col" : "grid grid-cols-2",
          )}
        >
          {/* Featured Pinned Card */}
          <div
            className={cn(
              "relative overflow-hidden rounded-xl border p-3",
              directoryLayout === "bento" && "col-span-2",
            )}
            style={{
              ...cardSurfaceStyle,
              borderColor: `rgba(${tokens.accentRgb}, 0.35)`,
              backgroundImage:
                directoryLayout === "bento"
                  ? `radial-gradient(ellipse 80% 70% at 100% 0%, rgba(${tokens.accentRgb}, 0.16), transparent 65%)`
                  : undefined,
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-xs font-semibold text-white">
                  InsideLink v2 Studio
                </span>
                <span
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-medium"
                  style={{
                    backgroundColor: `rgba(${tokens.accentRgb}, 0.14)`,
                    color: tokens.accentMutedHex,
                  }}
                >
                  <Pin className="h-2 w-2" />
                  Featured
                </span>
              </div>
              <ArrowUpRight
                className="h-3.5 w-3.5 shrink-0"
                style={{ color: tokens.accentHex }}
              />
            </div>
            <p className="mt-1 truncate text-[10px] text-zinc-400">
              Flagship Bento directory &amp; smart edge router
            </p>
          </div>

          {/* HUB Card */}
          <div className="rounded-xl border p-2.5" style={cardSurfaceStyle}>
            <div className="flex items-center justify-between gap-1">
              <span className="truncate text-[11px] font-semibold text-zinc-100">
                Open Source Hub
              </span>
              <Sparkles className="h-3 w-3 shrink-0 text-violet-400" />
            </div>
            <p className="mt-1 font-mono text-[9px] text-zinc-500">/oss</p>
          </div>

          {/* Scheduled / Protected Card */}
          <div className="rounded-xl border p-2.5" style={cardSurfaceStyle}>
            <div className="flex items-center justify-between gap-1">
              <span className="truncate text-[11px] font-semibold text-zinc-100">
                v3 Release Notes
              </span>
              <Lock className="h-3 w-3 shrink-0 text-amber-400" />
            </div>
            <span className="mt-1 inline-flex items-center gap-1 text-[9px] text-sky-300">
              <Clock className="h-2.5 w-2.5" />
              Launching soon
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
