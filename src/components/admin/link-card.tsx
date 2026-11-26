"use client";

import React, { useState } from "react";
import {
  Activity,
  BarChart3,
  CalendarClock,
  Check,
  Clock,
  Copy,
  CopyPlus,
  ExternalLink,
  GitBranch,
  Globe,
  Layers,
  Lock,
  MonitorCheck,
  Pencil,
  Pin,
  QrCode,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { LinkIcon } from "@/components/ui/icons";
import { Badge, Switch } from "@/components/ui/primitives";
import { getCanonicalHost } from "@/lib/env";
import type { LinkDTO } from "@/lib/types/link-dto";
import { cn, formatShortDate } from "@/lib/utils";

export interface LinkCardProps {
  link: LinkDTO;
  selected?: boolean;
  onToggleSelect?: (link: LinkDTO) => void;
  onEdit: (link: LinkDTO) => void;
  onDuplicate?: (link: LinkDTO) => void;
  onDelete: (link: LinkDTO) => void;
  onResetClicks?: (link: LinkDTO) => void;
  onToggleFlags: (
    link: LinkDTO,
    patch: { isActive?: boolean; isPinned?: boolean },
  ) => void;
  onOpenQr?: (link: LinkDTO) => void;
  onOpenAnalytics?: (link: LinkDTO) => void;
}

const CATEGORY_LABELS: Record<LinkDTO["category"], string> = {
  project: "Project",
  social: "Social",
  resource: "Resource",
  personal: "Personal",
  temporary: "Temporary",
};

function renderHealthBadge(link: LinkDTO) {
  if (!link.healthStatus) return null;
  const latencySuffix =
    link.healthLatencyMs !== null ? ` · ${link.healthLatencyMs}ms` : "";

  switch (link.healthStatus) {
    case "healthy":
      return (
        <Badge variant="emerald">
          <Activity className="h-3 w-3" />
          Healthy {link.healthStatusCode ?? 200}
          {latencySuffix}
        </Badge>
      );
    case "redirect":
      return (
        <Badge variant="amber">
          <Activity className="h-3 w-3" />
          Redirect {link.healthStatusCode ?? 302}
          {latencySuffix}
        </Badge>
      );
    case "timeout":
      return (
        <Badge variant="danger">
          <Activity className="h-3 w-3" />
          Timeout
        </Badge>
      );
    case "broken":
    default:
      return (
        <Badge variant="danger">
          <Activity className="h-3 w-3" />
          Broken{link.healthStatusCode ? ` ${link.healthStatusCode}` : ""}
        </Badge>
      );
  }
}

export function LinkCard({
  link,
  selected = false,
  onToggleSelect,
  onEdit,
  onDuplicate,
  onDelete,
  onResetClicks,
  onToggleFlags,
  onOpenQr,
  onOpenAnalytics,
}: LinkCardProps) {
  const [copied, setCopied] = useState(false);
  const canonicalHost = getCanonicalHost();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(link.shortUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback
    }
  };

  const maxClicksPct =
    link.maxClicks !== null
      ? Math.min(
          100,
          Math.round((link.clicksCount / Math.max(1, link.maxClicks)) * 100),
        )
      : null;

  return (
    <article
      className={cn(
        "obsidian-surface group relative flex min-w-0 max-w-full flex-col justify-between overflow-hidden rounded-2xl border p-4 transition",
        selected
          ? "border-emerald-500/60 bg-emerald-950/15 ring-1 ring-emerald-500/35"
          : link.isPinned
            ? "border-amber-500/35 bg-[#141418] shadow-lg"
            : "border-zinc-800/80 hover:border-zinc-700/90 hover:bg-[#16161b]",
        (!link.isActive || link.isExpired) && "opacity-75",
      )}
    >
      <div className="min-w-0">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            {onToggleSelect && (
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onToggleSelect(link)}
                aria-label={`Select /${link.slug}`}
                className="h-4 w-4 shrink-0 cursor-pointer rounded border-zinc-700 bg-[#09090b] accent-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
              />
            )}
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-[#09090b] text-zinc-200 transition group-hover:border-emerald-500/35 group-hover:text-emerald-300">
              <LinkIcon name={link.icon} className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <h3 className="truncate text-sm font-semibold text-white">
                  {link.title}
                </h3>
                {link.isPinned && (
                  <Pin
                    className="h-3.5 w-3.5 shrink-0 text-amber-400"
                    aria-label="Pinned link"
                  />
                )}
              </div>
              <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleCopy}
                  title="Copy short link"
                  aria-label={`Copy short link ${canonicalHost}/${link.slug}`}
                  className="inline-flex min-w-0 max-w-full cursor-pointer items-center gap-1 rounded font-mono text-xs text-zinc-300 hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
                >
                  <span className="min-w-0 truncate">
                    {canonicalHost}/{link.slug}
                  </span>
                  {copied ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  ) : (
                    <Copy className="h-3 w-3 shrink-0 text-zinc-500 group-hover:text-zinc-300" />
                  )}
                </button>
                <a
                  href={`/${link.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open link in new tab"
                  aria-label={`Open /${link.slug} in new tab`}
                  className="shrink-0 text-zinc-500 hover:text-emerald-300"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          </div>

          <Switch
            checked={link.isActive}
            onCheckedChange={(checked) =>
              onToggleFlags(link, { isActive: checked })
            }
            ariaLabel={`Toggle active state for ${link.slug}`}
          />
        </div>

        <p className="mt-3 truncate font-mono text-[11px] text-zinc-400">
          {link.type === "HUB"
            ? `Project HUB · ${link.hubLinks?.length ?? 0} blocks configured`
            : link.destinationUrl}
        </p>

        {link.description && (
          <p className="mt-1 line-clamp-1 text-xs text-zinc-500">
            {link.description}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {link.type === "HUB" ? (
            <Badge variant="violet">
              <Layers className="h-3 w-3" />
              HUB ({link.hubLinks?.length ?? 0})
            </Badge>
          ) : (
            <Badge variant="default">DIRECT {link.redirectStatus}</Badge>
          )}

          <Badge variant="default">{CATEGORY_LABELS[link.category]}</Badge>

          {link.isPublic && (
            <Badge variant="emerald">
              <Globe className="h-3 w-3" />
              Public /
            </Badge>
          )}

          {link.isPinned && (
            <Badge variant="amber">
              <Pin className="h-3 w-3" />
              Pinned
            </Badge>
          )}

          {link.hasPin && (
            <Badge variant="warning">
              <Lock className="h-3 w-3" />
              PIN Locked
            </Badge>
          )}

          {link.isCloaked && (
            <Badge variant="violet">
              <MonitorCheck className="h-3 w-3" />
              Cloaked
            </Badge>
          )}

          {link.routingRules.length > 0 && (
            <Badge variant="sky">
              <GitBranch className="h-3 w-3" />
              Routing ({link.routingRules.length})
            </Badge>
          )}

          {link.isScheduled && link.startsAt && (
            <Badge variant="sky">
              <CalendarClock className="h-3 w-3" />
              Launches {formatShortDate(link.startsAt)}
            </Badge>
          )}

          {renderHealthBadge(link)}

          {link.isExpired ? (
            <Badge variant="danger">
              <Clock className="h-3 w-3" />
              Expired
            </Badge>
          ) : link.expiresAt ? (
            <Badge variant="default">
              <Clock className="h-3 w-3" />
              Expires {formatShortDate(link.expiresAt)}
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="mt-4 space-y-2 border-t border-zinc-800/70 pt-3">
        {maxClicksPct !== null && (
          <div
            className="space-y-1"
            title={`${link.clicksCount} of ${link.maxClicks} max clicks`}
          >
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800/90">
              <div
                style={{ width: `${maxClicksPct}%` }}
                className={cn(
                  "h-full rounded-full transition-all",
                  maxClicksPct >= 100
                    ? "bg-red-500"
                    : maxClicksPct >= 85
                      ? "bg-amber-400"
                      : "bg-emerald-500",
                )}
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onOpenAnalytics?.(link)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-zinc-300 transition hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
            title="View link analytics"
          >
            <BarChart3 className="h-3.5 w-3.5 text-emerald-400" />
            <span>
              {link.clicksCount.toLocaleString("en-US")}
              {link.maxClicks !== null
                ? ` / ${link.maxClicks.toLocaleString("en-US")}`
                : ""}{" "}
              clicks
            </span>
          </button>

          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => onToggleFlags(link, { isPinned: !link.isPinned })}
              title={link.isPinned ? "Unpin from top" : "Pin to top"}
              aria-label={link.isPinned ? "Unpin link" : "Pin link"}
              className={cn(
                "cursor-pointer rounded-lg p-1.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50",
                link.isPinned
                  ? "bg-amber-500/15 text-amber-300"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-white",
              )}
            >
              <Pin className="h-3.5 w-3.5" />
            </button>

            {onOpenQr && (
              <button
                type="button"
                onClick={() => onOpenQr(link)}
                title="Generate and download QR code"
                aria-label={`QR code for ${link.slug}`}
                className="cursor-pointer rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
              >
                <QrCode className="h-3.5 w-3.5" />
              </button>
            )}

            {onResetClicks && (
              <button
                type="button"
                onClick={() => onResetClicks(link)}
                title="Reset click telemetry"
                aria-label={`Reset clicks for ${link.slug}`}
                className="cursor-pointer rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}

            {onDuplicate && (
              <button
                type="button"
                onClick={() => onDuplicate(link)}
                title="Duplicate link"
                aria-label={`Duplicate ${link.slug}`}
                className="cursor-pointer rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
              >
                <CopyPlus className="h-3.5 w-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={() => onEdit(link)}
              title="Edit link"
              aria-label={`Edit ${link.slug}`}
              className="cursor-pointer rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={() => onDelete(link)}
              title="Delete link"
              aria-label={`Delete ${link.slug}`}
              className="cursor-pointer rounded-lg p-1.5 text-zinc-400 transition hover:bg-red-950/60 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
