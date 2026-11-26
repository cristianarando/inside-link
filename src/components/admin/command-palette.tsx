"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  BarChart3,
  ExternalLink,
  Link2,
  Loader2,
  Palette,
  Plus,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { LinkIcon } from "@/components/ui/icons";
import { Badge } from "@/components/ui/primitives";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { LinkDTO, PaginatedResult } from "@/lib/types/link-dto";
import { cn } from "@/lib/utils";

type PaletteActionItem =
  | {
      kind: "action";
      id: string;
      label: string;
      description: string;
      shortcut?: string;
      icon: React.ReactNode;
      onSelect: () => void | Promise<void>;
    }
  | {
      kind: "nav";
      id: string;
      label: string;
      description: string;
      href: string;
      external?: boolean;
      icon: React.ReactNode;
    }
  | {
      kind: "link";
      id: string;
      link: LinkDTO;
    };

export function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [links, setLinks] = useState<LinkDTO[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const [isScanningHealth, setIsScanningHealth] = useState(false);
  const [healthSummary, setHealthSummary] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const debouncedQuery = useDebouncedValue(query, 180);

  const closePalette = useCallback(() => {
    setOpen(false);
  }, []);

  const openPalette = useCallback(() => {
    setOpen(true);
    setHealthSummary(null);
    setActiveIndex(0);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => {
          if (!prev) {
            setHealthSummary(null);
            setActiveIndex(0);
          }
          return !prev;
        });
      }
    };

    const onCustomOpen = () => {
      openPalette();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("insidelink:open-command-palette", onCustomOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(
        "insidelink:open-command-palette",
        onCustomOpen,
      );
    };
  }, [openPalette]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 20);
    return () => {
      clearTimeout(focusTimer);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoadingLinks(true);

    const params = new URLSearchParams({ limit: "20" });
    if (debouncedQuery.trim()) {
      params.set("q", debouncedQuery.trim());
    }

    fetch(`/api/v1/links?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) return;
        const page = (await res.json()) as PaginatedResult<LinkDTO>;
        setLinks(page.items);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadingLinks(false);
        }
      });

    return () => controller.abort();
  }, [open, debouncedQuery]);

  const handleNewShortlink = useCallback(() => {
    closePalette();
    if (pathname === "/admin" || pathname === "/admin/") {
      window.dispatchEvent(new CustomEvent("insidelink:new-link"));
    } else {
      router.push("/admin?new=1");
    }
  }, [closePalette, pathname, router]);

  const handleRunHealthCheck = useCallback(async () => {
    if (isScanningHealth) return;
    setIsScanningHealth(true);
    setHealthSummary(null);

    try {
      const res = await fetch("/api/v1/links/health-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const json = (await res.json()) as {
        data?: Array<{ status: string }>;
        error?: { message?: string };
      };
      if (!res.ok || !json.data) {
        setHealthSummary(json.error?.message || "Health check failed.");
        return;
      }

      const total = json.data.length;
      const healthy = json.data.filter(
        (r) => r.status === "healthy" || r.status === "redirect",
      ).length;
      const issues = total - healthy;
      setHealthSummary(
        total === 0
          ? "No active direct links to scan."
          : `Scanned ${total} active links: ${healthy} reachable, ${issues} broken/timeout.`,
      );
      window.dispatchEvent(new CustomEvent("insidelink:links-updated"));
    } catch {
      setHealthSummary("Network error while scanning link health.");
    } finally {
      setIsScanningHealth(false);
    }
  }, [isScanningHealth]);

  const items = useMemo<PaletteActionItem[]>(() => {
    const q = query.trim().toLowerCase();

    const quickActions: PaletteActionItem[] = [
      {
        kind: "action",
        id: "action-new-link",
        label: "New Shortlink",
        description: "Create a new direct redirect or Rich HUB micro-landing",
        shortcut: "N",
        icon: <Plus className="h-4 w-4 text-emerald-400" />,
        onSelect: handleNewShortlink,
      },
      {
        kind: "action",
        id: "action-health-check",
        label: "Run Health Check",
        description:
          "Probe up to 25 active direct links for HTTP status & latency",
        icon: isScanningHealth ? (
          <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
        ) : (
          <Activity className="h-4 w-4 text-emerald-400" />
        ),
        onSelect: handleRunHealthCheck,
      },
    ];

    const navItems: PaletteActionItem[] = [
      {
        kind: "nav",
        id: "nav-admin",
        label: "Links Manager",
        description: "Manage shortlinks, HUB blocks, and bulk actions",
        href: "/admin",
        icon: <Link2 className="h-4 w-4 text-zinc-400" />,
      },
      {
        kind: "nav",
        id: "nav-analytics",
        label: "Analytics 3.0",
        description:
          "90-day heatmap, 24h peak UTC traffic, cities & live stream",
        href: "/admin/analytics",
        icon: <BarChart3 className="h-4 w-4 text-zinc-400" />,
      },
      {
        kind: "nav",
        id: "nav-settings",
        label: "Theme & Profile Studio",
        description: "Customize dark presets, accent HEX, layout & backups",
        href: "/admin/settings",
        icon: <Palette className="h-4 w-4 text-zinc-400" />,
      },
      {
        kind: "nav",
        id: "nav-public",
        label: "Public Directory",
        description: "Open the public Bento directory in a new tab",
        href: "/",
        external: true,
        icon: <ExternalLink className="h-4 w-4 text-zinc-400" />,
      },
    ];

    const filteredCommands = [...quickActions, ...navItems].filter((item) => {
      if (item.kind === "link") return false;
      if (!q) return true;
      return (
        item.label.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
      );
    });

    const linkItems: PaletteActionItem[] = links.slice(0, 8).map((link) => ({
      kind: "link",
      id: `link-${link.id}`,
      link,
    }));

    return [...filteredCommands, ...linkItems];
  }, [
    query,
    links,
    handleNewShortlink,
    handleRunHealthCheck,
    isScanningHealth,
  ]);

  useEffect(() => {
    if (activeIndex >= items.length) {
      setActiveIndex(Math.max(0, items.length - 1));
    }
  }, [items.length, activeIndex]);

  const executeItem = useCallback(
    (item: PaletteActionItem) => {
      if (item.kind === "action") {
        void item.onSelect();
        return;
      }
      if (item.kind === "nav") {
        closePalette();
        if (item.external) {
          window.open(item.href, "_blank", "noopener,noreferrer");
        } else {
          router.push(item.href);
        }
        return;
      }
      closePalette();
      if (pathname === "/admin" || pathname === "/admin/") {
        window.dispatchEvent(
          new CustomEvent("insidelink:edit-link", { detail: item.link }),
        );
      } else {
        router.push(`/admin?edit=${encodeURIComponent(item.link.id)}`);
      }
    },
    [closePalette, pathname, router],
  );

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closePalette();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) =>
          items.length === 0 ? 0 : (prev + 1) % items.length,
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) =>
          items.length === 0 ? 0 : (prev - 1 + items.length) % items.length,
        );
      } else if (e.key === "Enter") {
        const selected = items[activeIndex];
        if (selected) {
          e.preventDefault();
          executeItem(selected);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, items, activeIndex, executeItem, closePalette]);

  if (!open) return null;

  const commandItems = items.filter((i) => i.kind !== "link");
  const linkItems = items.filter((i) => i.kind === "link");

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) closePalette();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/80 px-4 pt-16 backdrop-blur-md sm:pt-24"
    >
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-zinc-800/90 bg-[#0d0d10]/95 text-zinc-100 shadow-[0_24px_70px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.06)]">
        <div className="flex items-center gap-2.5 border-b border-zinc-800/80 px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-emerald-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            placeholder="Search links by slug/title, jump to pages, or run commands..."
            aria-label="Command palette search"
            className="w-full bg-transparent text-sm text-white placeholder:text-zinc-500 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear command query"
              className="cursor-pointer rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <kbd className="rounded border border-zinc-800 bg-[#16161b] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
            ESC
          </kbd>
        </div>

        {healthSummary && (
          <div
            role="status"
            className="flex items-center justify-between gap-2 border-b border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-xs text-emerald-200"
          >
            <span className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
              {healthSummary}
            </span>
            <button
              type="button"
              onClick={() => setHealthSummary(null)}
              className="cursor-pointer text-zinc-400 hover:text-white"
              aria-label="Dismiss health summary"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {commandItems.length > 0 && (
            <div className="mb-2">
              <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Actions &amp; Navigation
              </div>
              <div className="space-y-0.5">
                {commandItems.map((item) => {
                  const globalIdx = items.indexOf(item);
                  const active = globalIdx === activeIndex;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onMouseEnter={() => setActiveIndex(globalIdx)}
                      onClick={() => executeItem(item)}
                      className={cn(
                        "flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition",
                        active
                          ? "bg-emerald-500/15 text-white ring-1 ring-emerald-500/35"
                          : "text-zinc-300 hover:bg-zinc-900/90",
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-[#111114]">
                          {item.icon}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-xs font-medium text-zinc-100">
                            {item.label}
                          </div>
                          <div className="truncate text-[11px] text-zinc-500">
                            {item.description}
                          </div>
                        </div>
                      </div>
                      {item.kind === "action" && item.shortcut && (
                        <kbd className="rounded border border-zinc-800 bg-[#16161b] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                          {item.shortcut}
                        </kbd>
                      )}
                      {item.kind === "nav" && (
                        <span className="font-mono text-[10px] text-zinc-500">
                          {item.href}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              <span>Matching Links</span>
              {loadingLinks && (
                <Loader2 className="h-3 w-3 animate-spin text-emerald-400" />
              )}
            </div>

            {linkItems.length === 0 && !loadingLinks ? (
              <p className="px-3 py-4 text-center text-xs text-zinc-500">
                No matching links found.
              </p>
            ) : (
              <div className="space-y-0.5">
                {linkItems.map((item) => {
                  if (item.kind !== "link") return null;
                  const globalIdx = items.indexOf(item);
                  const active = globalIdx === activeIndex;
                  const { link } = item;

                  return (
                    <div
                      key={item.id}
                      onMouseEnter={() => setActiveIndex(globalIdx)}
                      className={cn(
                        "flex items-center justify-between gap-2 rounded-xl px-3 py-2 transition",
                        active
                          ? "bg-emerald-500/15 ring-1 ring-emerald-500/35"
                          : "hover:bg-zinc-900/90",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => executeItem(item)}
                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-[#111114] text-zinc-300">
                          <LinkIcon name={link.icon} className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-xs font-medium text-zinc-100">
                              {link.title}
                            </span>
                            <code className="shrink-0 font-mono text-[11px] text-emerald-400">
                              /{link.slug}
                            </code>
                          </div>
                          <div className="truncate font-mono text-[10px] text-zinc-500">
                            {link.type === "HUB"
                              ? `HUB · ${link.hubLinks?.length ?? 0} blocks`
                              : link.destinationUrl}
                          </div>
                        </div>
                      </button>

                      <div className="flex shrink-0 items-center gap-1.5">
                        {link.healthStatus && (
                          <Badge
                            variant={
                              link.healthStatus === "healthy"
                                ? "emerald"
                                : link.healthStatus === "redirect"
                                  ? "amber"
                                  : "danger"
                            }
                          >
                            {link.healthStatus}
                          </Badge>
                        )}
                        <a
                          href={`/${link.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          title={`Open /${link.slug}`}
                          aria-label={`Open /${link.slug} in new tab`}
                          className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-emerald-300"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-zinc-800/80 bg-[#09090b]/80 px-4 py-2 text-[10px] text-zinc-500">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="rounded border border-zinc-800 bg-[#16161b] px-1 py-0.5 font-mono text-zinc-300">
                ↑↓
              </kbd>{" "}
              Navigate
            </span>
            <span>
              <kbd className="rounded border border-zinc-800 bg-[#16161b] px-1 py-0.5 font-mono text-zinc-300">
                ↵
              </kbd>{" "}
              Open / Edit
            </span>
          </div>
          <span className="font-mono">Cmd+K / Ctrl+K</span>
        </div>
      </div>
    </div>
  );
}
