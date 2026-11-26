"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowUpRight,
  Check,
  Clock,
  Copy,
  Lock,
  Pin,
  Search,
  Sparkles,
  Tag,
  X,
} from "lucide-react";
import { HeroHeader } from "@/components/public-links/hero-header";
import { LinkIcon } from "@/components/ui/icons";
import { Badge, Input, Skeleton } from "@/components/ui/primitives";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { getCanonicalHost } from "@/lib/env";
import { resolveThemeTokens, type DirectoryLayout } from "@/lib/themes";
import type {
  LinkCategory,
  LinkType,
  PaginatedResult,
  PublicLinkDTO,
  SiteSettingsDTO,
} from "@/lib/types/link-dto";
import { cn } from "@/lib/utils";

const CATEGORY_TABS: { value: LinkCategory | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "project", label: "Projects" },
  { value: "social", label: "Social" },
  { value: "resource", label: "Resources" },
  { value: "personal", label: "Personal" },
];

const KIND_FILTERS: { value: LinkType | "all"; label: string }[] = [
  { value: "all", label: "All formats" },
  { value: "DIRECT", label: "Direct" },
  { value: "HUB", label: "HUB" },
];

const VALID_CATEGORIES = new Set<LinkCategory | "all">([
  "all",
  "project",
  "social",
  "resource",
  "personal",
  "temporary",
]);

const CLIENT_FALLBACK_SETTINGS: SiteSettingsDTO = {
  id: "default",
  displayName: "Cristian Arando",
  headline: "Links & Projects",
  bio: "Curated directory of full-stack projects, interactive micro-landings, open-source repositories, and verified social profiles.",
  avatarUrl: "/brand/author-avatar.png",
  statusText: null,
  statusColor: "emerald",
  statusHref: null,
  themePreset: "obsidian-emerald",
  customAccentHex: null,
  surfaceTone: "obsidian",
  glowIntensity: "subtle",
  cardStyle: "glass",
  directoryLayout: "bento",
  socialLinks: [],
  resolvedTheme: resolveThemeTokens(),
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function normalizeInitialCategory(
  initialCategory?: string,
  initialKind?: string,
): LinkCategory | "all" {
  const cat = initialCategory?.trim().toLowerCase();
  if (cat && VALID_CATEGORIES.has(cat as LinkCategory | "all")) {
    return cat as LinkCategory | "all";
  }
  const kindLower = initialKind?.trim().toLowerCase();
  if (kindLower && VALID_CATEGORIES.has(kindLower as LinkCategory | "all")) {
    return kindLower as LinkCategory | "all";
  }
  return "all";
}

function normalizeInitialKind(initialKind?: string): LinkType | "all" {
  const upper = initialKind?.trim().toUpperCase();
  if (upper === "DIRECT" || upper === "HUB") return upper;
  return "all";
}

function formatLaunchLabel(startsAt: string | null): string {
  if (!startsAt) return "Launching soon";
  try {
    const d = new Date(startsAt);
    if (Number.isNaN(d.getTime())) return "Launching soon";
    const formatted = d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    return `Launching soon · ${formatted}`;
  } catch {
    return "Launching soon";
  }
}

export interface PublicLinkDirectoryProps {
  initialPage: PaginatedResult<PublicLinkDTO>;
  siteSettings?: SiteSettingsDTO;
  initialQuery?: string;
  initialCategory?: string;
  initialKind?: string;
  initialTag?: string;
}

export function PublicLinkDirectory({
  initialPage,
  siteSettings,
  initialQuery = "",
  initialCategory,
  initialKind,
  initialTag = "",
}: PublicLinkDirectoryProps) {
  const settings = siteSettings ?? CLIENT_FALLBACK_SETTINGS;
  const layout: DirectoryLayout = settings.directoryLayout ?? "bento";
  const canonicalHost = getCanonicalHost();

  const [items, setItems] = useState<PublicLinkDTO[]>(initialPage.items);
  const [nextCursor, setNextCursor] = useState<string | null>(
    initialPage.nextCursor,
  );
  const [hasNextPage, setHasNextPage] = useState<boolean>(
    initialPage.hasNextPage,
  );

  const [category, setCategory] = useState<LinkCategory | "all">(() =>
    normalizeInitialCategory(initialCategory, initialKind),
  );
  const [kindFilter, setKindFilter] = useState<LinkType | "all">(() =>
    normalizeInitialKind(initialKind),
  );
  const [activeTag, setActiveTag] = useState<string>(() => initialTag.trim());
  const [searchQuery, setSearchQuery] = useState<string>(() =>
    initialQuery.trim(),
  );

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [isFetchingNextPage, setIsFetchingNextPage] = useState(false);

  const debouncedQuery = useDebouncedValue(searchQuery, 300);
  const isFirstFetchEffectRef = useRef(true);
  const hasMountedUrlSyncRef = useRef(false);

  const buildPublicQueryUrl = useCallback(
    (cursor?: string | null) => {
      const needsExpandedPage = kindFilter !== "all" || Boolean(activeTag);
      const params = new URLSearchParams({
        limit: needsExpandedPage ? "50" : "12",
      });
      if (cursor) params.set("cursor", cursor);
      if (category !== "all") params.set("category", category);
      if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());
      return `/api/v1/links/public?${params.toString()}`;
    },
    [category, debouncedQuery, kindFilter, activeTag],
  );

  // Sync URL query string with active category, kind, tag & search filters
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hasMountedUrlSyncRef.current) {
      hasMountedUrlSyncRef.current = true;
      return;
    }
    const params = new URLSearchParams();
    if (category !== "all") params.set("category", category);
    if (kindFilter !== "all") params.set("kind", kindFilter);
    if (activeTag) params.set("tag", activeTag);
    if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());
    const qs = params.toString();
    const nextUrl = qs
      ? `${window.location.pathname}?${qs}`
      : window.location.pathname;
    window.history.replaceState(null, "", nextUrl);
  }, [category, kindFilter, activeTag, debouncedQuery]);

  useEffect(() => {
    if (isFirstFetchEffectRef.current) {
      isFirstFetchEffectRef.current = false;
      return;
    }

    const controller = new AbortController();
    setIsInitialLoading(true);

    fetch(buildPublicQueryUrl(null), { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) return;
        const page = (await res.json()) as PaginatedResult<PublicLinkDTO>;
        setItems(page.items);
        setNextCursor(page.nextCursor);
        setHasNextPage(page.hasNextPage);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsInitialLoading(false);
        }
      });

    return () => controller.abort();
  }, [buildPublicQueryUrl]);

  const handleLoadMore = useCallback(async () => {
    if (!hasNextPage || !nextCursor || isFetchingNextPage || isInitialLoading) {
      return;
    }
    setIsFetchingNextPage(true);
    try {
      const res = await fetch(buildPublicQueryUrl(nextCursor));
      if (!res.ok) return;
      const page = (await res.json()) as PaginatedResult<PublicLinkDTO>;
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.id));
        const nextItems = page.items.filter((i) => !seen.has(i.id));
        return [...prev, ...nextItems];
      });
      setNextCursor(page.nextCursor);
      setHasNextPage(page.hasNextPage);
    } finally {
      setIsFetchingNextPage(false);
    }
  }, [
    hasNextPage,
    nextCursor,
    isFetchingNextPage,
    isInitialLoading,
    buildPublicQueryUrl,
  ]);

  const { sentinelRef } = useInfiniteScroll({
    hasNextPage,
    isFetchingNextPage,
    disabled: isInitialLoading,
    onLoadMore: handleLoadMore,
  });

  const visibleItems = useMemo(() => {
    const normalizedTag = activeTag.trim().toLowerCase();
    return items.filter((item) => {
      if (kindFilter !== "all" && item.type !== kindFilter) return false;
      if (
        normalizedTag &&
        !item.tags.some((t) => t.toLowerCase() === normalizedTag)
      ) {
        return false;
      }
      return true;
    });
  }, [items, kindFilter, activeTag]);

  const hasActiveFilters =
    category !== "all" ||
    kindFilter !== "all" ||
    Boolean(activeTag) ||
    Boolean(searchQuery.trim());

  const clearAllFilters = () => {
    setCategory("all");
    setKindFilter("all");
    setActiveTag("");
    setSearchQuery("");
  };

  const handleCopyShortLink = async (
    e: React.MouseEvent<HTMLButtonElement>,
    item: PublicLinkDTO,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const target = item.shortUrl || `https://${canonicalHost}/${item.slug}`;
    try {
      await navigator.clipboard.writeText(target);
      setCopiedId(item.id);
      setTimeout(() => {
        setCopiedId((curr) => (curr === item.id ? null : curr));
      }, 1800);
    } catch {
      // Clipboard unavailable
    }
  };

  const handleTagClick = (
    e: React.MouseEvent<HTMLButtonElement>,
    tag: string,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveTag((prev) =>
      prev.toLowerCase() === tag.toLowerCase() ? "" : tag,
    );
  };

  const containerLayoutClass =
    layout === "list"
      ? "flex flex-col gap-3"
      : layout === "grid"
        ? "grid grid-cols-1 gap-4 sm:grid-cols-2"
        : "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3";

  return (
    <div>
      <HeroHeader siteSettings={settings} />

      <div className="space-y-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="flex flex-wrap gap-1.5"
              role="tablist"
              aria-label="Link categories"
            >
              {CATEGORY_TABS.map((tab) => {
                const active = category === tab.value;
                return (
                  <button
                    key={tab.value}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setCategory(tab.value)}
                    className={cn(
                      "cursor-pointer rounded-xl px-3.5 py-2 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--il-accent-rgb),0.55)]",
                      active
                        ? "il-accent-btn font-semibold shadow-sm"
                        : "border border-zinc-800 bg-[var(--il-card)]/90 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200",
                    )}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div
              className="inline-flex items-center rounded-xl border border-zinc-800 bg-[var(--il-canvas)]/90 p-0.5"
              role="group"
              aria-label="Link format filter"
            >
              {KIND_FILTERS.map((kf) => {
                const active = kindFilter === kf.value;
                return (
                  <button
                    key={kf.value}
                    type="button"
                    onClick={() => setKindFilter(kf.value)}
                    className={cn(
                      "cursor-pointer rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition",
                      active
                        ? "bg-[var(--il-elevated)] text-white"
                        : "text-zinc-400 hover:text-zinc-200",
                    )}
                  >
                    {kf.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="relative w-full lg:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <Input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search projects, slugs, or tags..."
              aria-label="Search public directory"
              className="pl-9"
            />
          </div>
        </div>

        {(activeTag || hasActiveFilters) && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              {activeTag ? (
                <span className="il-accent-pill inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-[11px]">
                  <Tag className="h-3 w-3" />#{activeTag}
                  <button
                    type="button"
                    onClick={() => setActiveTag("")}
                    aria-label={`Clear tag filter ${activeTag}`}
                    className="ml-0.5 cursor-pointer rounded hover:text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ) : null}
              <span className="text-zinc-500">
                Showing {visibleItems.length}{" "}
                {visibleItems.length === 1 ? "link" : "links"}
              </span>
            </div>

            {hasActiveFilters ? (
              <button
                type="button"
                onClick={clearAllFilters}
                className="cursor-pointer text-xs font-medium text-zinc-400 transition hover:text-[var(--il-accent-muted)]"
              >
                Reset filters
              </button>
            ) : null}
          </div>
        )}

        {isInitialLoading ? (
          <div className={containerLayoutClass}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton
                key={i}
                className={cn(
                  layout === "list" ? "h-20 w-full" : "h-36 w-full",
                  layout === "bento" && i === 0 && "sm:col-span-2",
                )}
              />
            ))}
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="il-themed-card rounded-2xl border p-10 text-center">
            <p className="text-sm font-medium text-zinc-200">
              No public links found for this filter.
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Try selecting another category, clearing the tag filter, or
              updating your search query.
            </p>
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={clearAllFilters}
                className="il-accent-btn mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition"
              >
                Show all public links
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <div className={containerLayoutClass}>
              {visibleItems.map((item) => {
                const isCopied = copiedId === item.id;
                const isBentoSpotlight = layout === "bento" && item.isPinned;
                const itemTokens = item.theme
                  ? resolveThemeTokens(settings, item.theme)
                  : null;
                const cardAccentStyle = itemTokens
                  ? ({
                      "--card-accent-rgb": itemTokens.accentRgb,
                    } as React.CSSProperties)
                  : undefined;

                if (layout === "list") {
                  return (
                    <a
                      key={item.id}
                      href={`/${item.slug}`}
                      style={cardAccentStyle}
                      className="il-themed-card group relative flex flex-col justify-between gap-3 overflow-hidden rounded-2xl border px-4 py-3.5 transition hover:-translate-y-0.5 sm:flex-row sm:items-center"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3.5">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-[var(--il-canvas)] text-zinc-200 transition group-hover:border-[rgba(var(--il-accent-rgb),0.45)] group-hover:text-[var(--il-accent-muted)]">
                          <LinkIcon name={item.icon} className="h-5 w-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="truncate text-sm font-semibold text-zinc-100 group-hover:text-white">
                              {item.title}
                            </h2>
                            {item.isPinned ? (
                              <span className="il-accent-pill inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium">
                                <Pin className="h-2.5 w-2.5" />
                                Featured
                              </span>
                            ) : null}
                            {item.isScheduled ? (
                              <Badge variant="sky">
                                <Clock className="h-3 w-3" />
                                Launching soon
                              </Badge>
                            ) : null}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2">
                            <span className="truncate font-mono text-xs text-zinc-500">
                              {canonicalHost}/{item.slug}
                            </span>
                            {item.description ? (
                              <span className="hidden truncate text-xs text-zinc-400 md:inline">
                                · {item.description}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end">
                        <div className="flex items-center gap-1.5">
                          {item.type === "HUB" ? (
                            <Badge variant="violet">
                              <Sparkles className="h-3 w-3" />
                              HUB
                            </Badge>
                          ) : null}
                          {item.hasPin ? (
                            <Badge variant="amber">
                              <Lock className="h-3 w-3" />
                              PIN
                            </Badge>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => handleCopyShortLink(e, item)}
                            aria-label={`Copy short link for ${item.title}`}
                            title="Copy short link"
                            className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-zinc-800 bg-[var(--il-canvas)]/80 text-zinc-400 transition hover:border-[rgba(var(--il-accent-rgb),0.45)] hover:text-[var(--il-accent-muted)]"
                          >
                            {isCopied ? (
                              <Check className="h-3.5 w-3.5 text-[var(--il-accent)]" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <ArrowUpRight className="h-4 w-4 text-zinc-500 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[var(--il-accent-muted)]" />
                        </div>
                      </div>
                    </a>
                  );
                }

                return (
                  <a
                    key={item.id}
                    href={`/${item.slug}`}
                    style={cardAccentStyle}
                    className={cn(
                      "il-themed-card group relative flex flex-col justify-between overflow-hidden rounded-2xl border transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--il-accent-rgb),0.55)]",
                      isBentoSpotlight
                        ? "border-[rgba(var(--il-accent-rgb),0.32)] p-5 sm:col-span-2 sm:p-6"
                        : "p-4 sm:p-5",
                    )}
                  >
                    {isBentoSpotlight ? (
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 opacity-90 transition group-hover:opacity-100"
                        style={{
                          background: `radial-gradient(ellipse 85% 75% at 100% 0%, rgba(${itemTokens?.accentRgb ?? "var(--il-accent-rgb)"}, 0.14), transparent 65%)`,
                        }}
                      />
                    ) : null}

                    <div className="relative">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <span
                            className={cn(
                              "flex shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-[var(--il-canvas)] text-zinc-200 transition group-hover:border-[rgba(var(--il-accent-rgb),0.45)] group-hover:text-[var(--il-accent-muted)]",
                              isBentoSpotlight ? "h-11 w-11" : "h-10 w-10",
                            )}
                          >
                            <LinkIcon name={item.icon} className="h-5 w-5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <h2
                                className={cn(
                                  "truncate font-semibold text-zinc-100 group-hover:text-white",
                                  isBentoSpotlight ? "text-base" : "text-sm",
                                )}
                              >
                                {item.title}
                              </h2>
                              {item.isPinned ? (
                                <span className="il-accent-pill inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium">
                                  <Pin className="h-2.5 w-2.5" />
                                  Featured
                                </span>
                              ) : null}
                            </div>
                            <p className="truncate font-mono text-xs text-zinc-500">
                              {canonicalHost}/{item.slug}
                            </p>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                          {item.type === "HUB" ? (
                            <Badge variant="violet">
                              <Sparkles className="h-3 w-3" />
                              HUB
                            </Badge>
                          ) : null}
                          {item.hasPin ? (
                            <Badge variant="amber">
                              <Lock className="h-3 w-3" />
                              PIN
                            </Badge>
                          ) : null}
                          <button
                            type="button"
                            onClick={(e) => handleCopyShortLink(e, item)}
                            aria-label={`Copy short link for ${item.title}`}
                            title="Copy short link"
                            className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-zinc-800 bg-[var(--il-canvas)]/80 text-zinc-400 transition hover:border-[rgba(var(--il-accent-rgb),0.45)] hover:text-[var(--il-accent-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--il-accent-rgb),0.55)]"
                          >
                            {isCopied ? (
                              <Check className="h-3.5 w-3.5 text-[var(--il-accent)]" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <ArrowUpRight className="h-4 w-4 text-zinc-500 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[var(--il-accent-muted)]" />
                        </div>
                      </div>

                      {item.isScheduled ? (
                        <div className="mt-2.5">
                          <Badge variant="sky">
                            <Clock className="h-3 w-3" />
                            {formatLaunchLabel(item.startsAt)}
                          </Badge>
                        </div>
                      ) : null}

                      {item.description ? (
                        <p
                          className={cn(
                            "mt-3 text-xs leading-relaxed text-zinc-400",
                            isBentoSpotlight ? "line-clamp-3" : "line-clamp-2",
                          )}
                        >
                          {item.description}
                        </p>
                      ) : null}
                    </div>

                    {item.tags.length > 0 ? (
                      <div className="relative mt-3 flex flex-wrap gap-1.5 pt-2">
                        {item.tags
                          .slice(0, isBentoSpotlight ? 6 : 4)
                          .map((tag) => {
                            const isSelectedTag =
                              activeTag.toLowerCase() === tag.toLowerCase();
                            return (
                              <button
                                key={tag}
                                type="button"
                                onClick={(e) => handleTagClick(e, tag)}
                                className={cn(
                                  "cursor-pointer rounded-md border px-2 py-0.5 font-mono text-[10px] transition",
                                  isSelectedTag
                                    ? "il-accent-pill border"
                                    : "border-zinc-800/80 bg-[var(--il-canvas)]/80 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200",
                                )}
                              >
                                #{tag}
                              </button>
                            );
                          })}
                      </div>
                    ) : null}
                  </a>
                );
              })}

              {isFetchingNextPage &&
                Array.from({ length: 2 }).map((_, i) => (
                  <Skeleton key={`pub-sk-${i}`} className="h-36 w-full" />
                ))}
            </div>

            {hasNextPage && (
              <div
                ref={sentinelRef}
                aria-hidden="true"
                className="h-6 w-full"
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
