"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  Link2Off,
  Loader2,
  PauseCircle,
  Pin,
  PinOff,
  Play,
  Trash2,
  X,
} from "lucide-react";
import { Button, ConfirmDialog, Skeleton } from "@/components/ui/primitives";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { getCanonicalHost } from "@/lib/env";
import type {
  BulkLinkAction,
  LinkCategory,
  LinkDTO,
  LinkStatusFilter,
  PaginatedResult,
} from "@/lib/types/link-dto";
import { AdminToolbar } from "./admin-toolbar";
import { AnalyticsDrawer } from "./analytics-drawer";
import { LinkCard } from "./link-card";
import { LinkFormModal } from "./link-form-modal";
import { QrCodeModal } from "./qr-modal";

export function sortLinksByKeyset(items: LinkDTO[]): LinkDTO[] {
  return [...items].sort((a, b) => {
    if (a.isPinned !== b.isPinned) {
      return a.isPinned ? -1 : 1;
    }
    return b.id.localeCompare(a.id);
  });
}

export interface InfiniteLinkGridProps {
  initialPage: PaginatedResult<LinkDTO>;
  onOpenQr?: (link: LinkDTO) => void;
  onOpenAnalytics?: (link: LinkDTO) => void;
}

export function InfiniteLinkGrid({
  initialPage,
  onOpenQr,
  onOpenAnalytics,
}: InfiniteLinkGridProps) {
  const canonicalHost = getCanonicalHost();
  const [items, setItems] = useState<LinkDTO[]>(initialPage.items);
  const [nextCursor, setNextCursor] = useState<string | null>(
    initialPage.nextCursor,
  );
  const [hasNextPage, setHasNextPage] = useState<boolean>(
    initialPage.hasNextPage,
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<
    LinkCategory | "all"
  >("all");
  const [selectedStatus, setSelectedStatus] = useState<LinkStatusFilter>("all");

  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [isFetchingNextPage, setIsFetchingNextPage] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<LinkDTO | null>(null);
  const [duplicatingLink, setDuplicatingLink] = useState<LinkDTO | null>(null);
  const [linkToDelete, setLinkToDelete] = useState<LinkDTO | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [linkToResetClicks, setLinkToResetClicks] = useState<LinkDTO | null>(
    null,
  );
  const [isResettingClicks, setIsResettingClicks] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkRunning, setIsBulkRunning] = useState(false);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [isHealthScanning, setIsHealthScanning] = useState(false);

  const [qrLink, setQrLink] = useState<LinkDTO | null>(null);
  const [analyticsLink, setAnalyticsLink] = useState<LinkDTO | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const debouncedQuery = useDebouncedValue(searchQuery, 300);
  const isFirstRenderRef = useRef(true);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr));
    }, 2800);
  }, []);

  const buildQueryUrl = useCallback(
    (cursor?: string | null) => {
      const params = new URLSearchParams({ limit: "12" });
      if (cursor) params.set("cursor", cursor);
      if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());
      if (selectedCategory !== "all") params.set("category", selectedCategory);
      if (selectedStatus !== "all") params.set("status", selectedStatus);
      return `/api/v1/links?${params.toString()}`;
    },
    [debouncedQuery, selectedCategory, selectedStatus],
  );

  const refreshFirstPage = useCallback(async () => {
    try {
      const res = await fetch(buildQueryUrl(null));
      if (!res.ok) return;
      const page = (await res.json()) as PaginatedResult<LinkDTO>;
      setItems(page.items);
      setNextCursor(page.nextCursor);
      setHasNextPage(page.hasNextPage);
    } catch {
      // Ignore refresh error
    }
  }, [buildQueryUrl]);

  // Listen to Command Palette events & URL deep-links (`?new=1`, `?edit=<id>`)
  useEffect(() => {
    const onNewLink = () => {
      setEditingLink(null);
      setDuplicatingLink(null);
      setModalOpen(true);
    };

    const onEditLink = (event: Event) => {
      const detail = (event as CustomEvent<LinkDTO>).detail;
      if (!detail) return;
      setEditingLink(detail);
      setDuplicatingLink(null);
      setModalOpen(true);
    };

    const onLinksUpdated = () => {
      void refreshFirstPage();
    };

    window.addEventListener("insidelink:new-link", onNewLink);
    window.addEventListener("insidelink:edit-link", onEditLink);
    window.addEventListener("insidelink:links-updated", onLinksUpdated);

    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1") {
      onNewLink();
      params.delete("new");
      const nextSearch = params.toString();
      window.history.replaceState(
        null,
        "",
        nextSearch ? `?${nextSearch}` : window.location.pathname,
      );
    } else {
      const editId = params.get("edit");
      if (editId) {
        const localMatch = items.find((item) => item.id === editId);
        if (localMatch) {
          setEditingLink(localMatch);
          setDuplicatingLink(null);
          setModalOpen(true);
        } else {
          fetch(`/api/v1/links/${encodeURIComponent(editId)}`)
            .then(async (res) => {
              if (!res.ok) return;
              const link = (await res.json()) as LinkDTO;
              setEditingLink(link);
              setDuplicatingLink(null);
              setModalOpen(true);
            })
            .catch(() => undefined);
        }
        params.delete("edit");
        const nextSearch = params.toString();
        window.history.replaceState(
          null,
          "",
          nextSearch ? `?${nextSearch}` : window.location.pathname,
        );
      }
    }

    return () => {
      window.removeEventListener("insidelink:new-link", onNewLink);
      window.removeEventListener("insidelink:edit-link", onEditLink);
      window.removeEventListener("insidelink:links-updated", onLinksUpdated);
    };
  }, [items, refreshFirstPage]);

  // Keyboard shortcuts: `/` focuses search, `N` opens New Link modal
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (
        modalOpen ||
        qrLink ||
        analyticsLink ||
        linkToDelete ||
        linkToResetClicks ||
        bulkDeleteConfirmOpen
      ) {
        return;
      }

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target?.isContentEditable
      ) {
        return;
      }

      if (e.key === "/") {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setEditingLink(null);
        setDuplicatingLink(null);
        setModalOpen(true);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    modalOpen,
    qrLink,
    analyticsLink,
    linkToDelete,
    linkToResetClicks,
    bulkDeleteConfirmOpen,
  ]);

  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }

    const controller = new AbortController();
    setIsInitialLoading(true);

    fetch(buildQueryUrl(null), { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) return;
        const page = (await res.json()) as PaginatedResult<LinkDTO>;
        setItems(page.items);
        setNextCursor(page.nextCursor);
        setHasNextPage(page.hasNextPage);
        setSelectedIds(new Set());
      })
      .catch(() => {
        // Request cancelled via AbortController
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsInitialLoading(false);
        }
      });

    return () => controller.abort();
  }, [buildQueryUrl]);

  const handleLoadMore = useCallback(async () => {
    if (!hasNextPage || !nextCursor || isFetchingNextPage || isInitialLoading) {
      return;
    }

    setIsFetchingNextPage(true);
    try {
      const res = await fetch(buildQueryUrl(nextCursor));
      if (!res.ok) return;
      const page = (await res.json()) as PaginatedResult<LinkDTO>;
      setItems((prev) => {
        const existingIds = new Set(prev.map((i) => i.id));
        const fresh = page.items.filter((i) => !existingIds.has(i.id));
        return [...prev, ...fresh];
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
    buildQueryUrl,
  ]);

  const { sentinelRef } = useInfiniteScroll({
    hasNextPage,
    isFetchingNextPage,
    disabled: isInitialLoading,
    onLoadMore: handleLoadMore,
  });

  const handleToggleFlags = async (
    link: LinkDTO,
    patch: { isActive?: boolean; isPinned?: boolean },
  ) => {
    setItems((prev) =>
      sortLinksByKeyset(
        prev.map((item) =>
          item.id === link.id ? { ...item, ...patch } : item,
        ),
      ),
    );

    try {
      const res = await fetch(`/api/v1/links/${link.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const updated = (await res.json()) as LinkDTO;
        setItems((prev) =>
          sortLinksByKeyset(
            prev.map((item) => (item.id === updated.id ? updated : item)),
          ),
        );
        if (patch.isPinned !== undefined) {
          showToast(
            updated.isPinned
              ? `/${updated.slug} pinned to top`
              : `/${updated.slug} unpinned`,
          );
        } else if (patch.isActive !== undefined) {
          showToast(
            updated.isActive
              ? `/${updated.slug} activated`
              : `/${updated.slug} paused`,
          );
        }
      }
    } catch {
      setItems((prev) =>
        sortLinksByKeyset(
          prev.map((item) => (item.id === link.id ? link : item)),
        ),
      );
    }
  };

  const handleConfirmDelete = async () => {
    if (!linkToDelete) return;
    const target = linkToDelete;
    const previous = items;
    setIsDeleting(true);
    setItems((prev) => prev.filter((item) => item.id !== target.id));

    try {
      const res = await fetch(`/api/v1/links/${target.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(target.id);
          return next;
        });
        showToast(`Link /${target.slug} deleted`);
      } else {
        setItems(previous);
        showToast(`Could not delete /${target.slug}`);
      }
    } catch {
      setItems(previous);
      showToast(`Network error while deleting /${target.slug}`);
    } finally {
      setIsDeleting(false);
      setLinkToDelete(null);
    }
  };

  const handleConfirmResetClicks = async () => {
    if (!linkToResetClicks) return;
    const target = linkToResetClicks;
    setIsResettingClicks(true);

    try {
      const res = await fetch(`/api/v1/links/${target.id}/reset-clicks`, {
        method: "POST",
      });
      if (res.ok) {
        const body = (await res.json()) as { data?: LinkDTO } | LinkDTO;
        const updated =
          body && typeof body === "object" && "data" in body && body.data
            ? body.data
            : (body as LinkDTO);
        setItems((prev) =>
          sortLinksByKeyset(
            prev.map((item) => (item.id === updated.id ? updated : item)),
          ),
        );
        showToast(`Click telemetry cleared for /${target.slug}`);
      } else {
        showToast(`Could not reset clicks for /${target.slug}`);
      }
    } catch {
      showToast(`Network error while resetting clicks for /${target.slug}`);
    } finally {
      setIsResettingClicks(false);
      setLinkToResetClicks(null);
    }
  };

  const handleToggleSelect = (link: LinkDTO) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(link.id)) {
        next.delete(link.id);
      } else {
        next.add(link.id);
      }
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (selectedIds.size > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((item) => item.id)));
    }
  };

  const handleRunHealthCheck = async (ids?: string[]) => {
    const useBulk = Boolean(ids && ids.length > 0);
    if (useBulk) {
      setIsBulkRunning(true);
    } else {
      setIsHealthScanning(true);
    }

    try {
      const res = await fetch("/api/v1/links/health-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(useBulk ? { ids } : { all: true }),
      });

      const body = (await res.json()) as {
        data?: Array<{ link?: LinkDTO; status: string }>;
        error?: { message?: string };
      };

      if (!res.ok || !body.data) {
        showToast(body.error?.message || "Health check failed.");
        return;
      }

      const updatedById = new Map<string, LinkDTO>();
      for (const entry of body.data) {
        if (entry.link) {
          updatedById.set(entry.link.id, entry.link);
        }
      }

      if (updatedById.size > 0) {
        setItems((prev) =>
          sortLinksByKeyset(
            prev.map((item) => updatedById.get(item.id) ?? item),
          ),
        );
      }

      const healthyCount = body.data.filter(
        (r) => r.status === "healthy" || r.status === "redirect",
      ).length;
      const issueCount = body.data.length - healthyCount;
      showToast(
        body.data.length === 0
          ? "No active direct links to scan."
          : `Health scan complete: ${healthyCount} reachable, ${issueCount} broken/timeout.`,
      );
    } catch {
      showToast("Network error during health scan.");
    } finally {
      setIsBulkRunning(false);
      setIsHealthScanning(false);
    }
  };

  const handleBulkPin = async (isPinned: boolean) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    setIsBulkRunning(true);
    try {
      const responses = await Promise.all(
        ids.map((id) =>
          fetch(`/api/v1/links/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isPinned }),
          }).then(async (res) =>
            res.ok ? ((await res.json()) as LinkDTO) : null,
          ),
        ),
      );

      const updatedMap = new Map<string, LinkDTO>();
      for (const updated of responses) {
        if (updated) updatedMap.set(updated.id, updated);
      }

      setItems((prev) =>
        sortLinksByKeyset(prev.map((item) => updatedMap.get(item.id) ?? item)),
      );
      setSelectedIds(new Set());
      showToast(
        `${updatedMap.size} link${updatedMap.size === 1 ? "" : "s"} ${isPinned ? "pinned" : "unpinned"}.`,
      );
    } catch {
      showToast("Network error while updating pinned state.");
    } finally {
      setIsBulkRunning(false);
    }
  };

  const handleBulkAction = async (action: BulkLinkAction) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    setIsBulkRunning(true);
    try {
      const res = await fetch("/api/v1/links/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, action }),
      });

      const body = (await res.json()) as {
        data?: { affectedCount: number };
        error?: { message?: string };
      };

      if (!res.ok || !body.data) {
        showToast(body.error?.message || "Bulk action failed.");
        return;
      }

      const idSet = new Set(ids);
      if (action === "delete") {
        setItems((prev) => prev.filter((item) => !idSet.has(item.id)));
        showToast(`Deleted ${body.data.affectedCount} link(s).`);
      } else if (action === "activate" || action === "pause") {
        const nextActive = action === "activate";
        setItems((prev) =>
          prev.map((item) =>
            idSet.has(item.id) ? { ...item, isActive: nextActive } : item,
          ),
        );
        showToast(
          `${body.data.affectedCount} link(s) ${nextActive ? "activated" : "paused"}.`,
        );
      }
      setSelectedIds(new Set());
    } catch {
      showToast("Network error while executing bulk action.");
    } finally {
      setIsBulkRunning(false);
      setBulkDeleteConfirmOpen(false);
    }
  };

  const handleSaved = (saved: LinkDTO, isEdit: boolean) => {
    if (isEdit) {
      setItems((prev) =>
        sortLinksByKeyset(
          prev.map((item) => (item.id === saved.id ? saved : item)),
        ),
      );
      showToast(`Changes saved to /${saved.slug}`);
    } else {
      setItems((prev) => sortLinksByKeyset([saved, ...prev]));
      showToast(`Link created: ${canonicalHost}/${saved.slug}`);
    }
  };

  return (
    <div className="space-y-5 pb-20">
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-40 rounded-xl border border-emerald-500/30 bg-[#111114]/95 px-4 py-2.5 text-xs font-medium text-emerald-200 shadow-xl backdrop-blur-md"
        >
          {toastMessage}
        </div>
      )}

      <AdminToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        selectedStatus={selectedStatus}
        onStatusChange={setSelectedStatus}
        searchInputRef={searchInputRef}
        onCreateClick={() => {
          setEditingLink(null);
          setDuplicatingLink(null);
          setModalOpen(true);
        }}
        onRunHealthScan={() => void handleRunHealthCheck()}
        isHealthScanning={isHealthScanning}
        selectedCount={selectedIds.size}
        onToggleSelectAll={handleToggleSelectAll}
        totalLoadedCount={items.length}
      />

      {isInitialLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="obsidian-surface flex flex-col items-center justify-center rounded-2xl border border-zinc-800/80 p-12 text-center">
          <Link2Off className="h-8 w-8 text-zinc-500" />
          <h3 className="mt-3 text-base font-medium text-white">
            No links found
          </h3>
          <p className="mt-1 text-xs text-zinc-400">
            Try adjusting your filters or create a new short link.
          </p>
          <Button
            className="mt-4"
            onClick={() => {
              setEditingLink(null);
              setDuplicatingLink(null);
              setModalOpen(true);
            }}
          >
            Create first link
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {items.map((link) => (
              <LinkCard
                key={link.id}
                link={link}
                selected={selectedIds.has(link.id)}
                onToggleSelect={handleToggleSelect}
                onEdit={(target) => {
                  setEditingLink(target);
                  setDuplicatingLink(null);
                  setModalOpen(true);
                }}
                onDuplicate={(target) => {
                  setEditingLink(null);
                  setDuplicatingLink(target);
                  setModalOpen(true);
                }}
                onDelete={(target) => setLinkToDelete(target)}
                onResetClicks={(target) => setLinkToResetClicks(target)}
                onToggleFlags={handleToggleFlags}
                onOpenQr={(target) => {
                  setQrLink(target);
                  onOpenQr?.(target);
                }}
                onOpenAnalytics={(target) => {
                  setAnalyticsLink(target);
                  onOpenAnalytics?.(target);
                }}
              />
            ))}

            {isFetchingNextPage &&
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={`sk-${i}`} className="h-48 w-full" />
              ))}
          </div>

          {hasNextPage && (
            <div ref={sentinelRef} aria-hidden="true" className="h-6 w-full" />
          )}
        </>
      )}

      {/* Floating Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div
          role="region"
          aria-label="Bulk actions toolbar"
          className="fixed bottom-5 left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 flex-wrap items-center justify-between gap-2 rounded-2xl border border-zinc-700/90 bg-[#111114]/95 px-4 py-2.5 shadow-[0_20px_50px_rgba(0,0,0,0.85)] backdrop-blur-xl"
        >
          <div className="flex items-center gap-2">
            <span className="rounded-lg border border-emerald-500/35 bg-emerald-500/15 px-2.5 py-1 font-mono text-xs font-semibold text-emerald-300">
              {selectedIds.size} selected
            </span>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="cursor-pointer rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
              aria-label="Clear selection"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              disabled={isBulkRunning}
              onClick={() => void handleBulkPin(true)}
            >
              <Pin className="h-3.5 w-3.5 text-amber-400" />
              Pin
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={isBulkRunning}
              onClick={() => void handleBulkPin(false)}
            >
              <PinOff className="h-3.5 w-3.5 text-zinc-400" />
              Unpin
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={isBulkRunning}
              onClick={() => void handleBulkAction("activate")}
            >
              <Play className="h-3.5 w-3.5 text-emerald-400" />
              Activate
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={isBulkRunning}
              onClick={() => void handleBulkAction("pause")}
            >
              <PauseCircle className="h-3.5 w-3.5 text-zinc-400" />
              Deactivate
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={isBulkRunning}
              onClick={() => void handleRunHealthCheck(Array.from(selectedIds))}
            >
              {isBulkRunning ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
              ) : (
                <Activity className="h-3.5 w-3.5 text-emerald-400" />
              )}
              Health Check
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={isBulkRunning}
              onClick={() => setBulkDeleteConfirmOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        </div>
      )}

      <LinkFormModal
        open={modalOpen}
        initialLink={editingLink}
        duplicateFrom={duplicatingLink}
        onClose={() => {
          setModalOpen(false);
          setDuplicatingLink(null);
        }}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        open={linkToDelete !== null}
        onClose={() => setLinkToDelete(null)}
        onConfirm={handleConfirmDelete}
        title={linkToDelete ? `Delete /${linkToDelete.slug}?` : "Delete link"}
        description={
          linkToDelete
            ? `This will permanently delete "${linkToDelete.title}" (/${linkToDelete.slug}) and all recorded click telemetry. This action cannot be undone.`
            : ""
        }
        confirmLabel="Delete link"
        cancelLabel="Cancel"
        danger
        loading={isDeleting}
      />

      <ConfirmDialog
        open={linkToResetClicks !== null}
        onClose={() => setLinkToResetClicks(null)}
        onConfirm={handleConfirmResetClicks}
        title={
          linkToResetClicks
            ? `Reset clicks for /${linkToResetClicks.slug}?`
            : "Reset clicks"
        }
        description={
          linkToResetClicks
            ? `This will zero out the click counter and delete all recorded click events for "/${linkToResetClicks.slug}". The link itself will remain intact.`
            : ""
        }
        confirmLabel="Reset clicks"
        cancelLabel="Cancel"
        danger
        loading={isResettingClicks}
      />

      <ConfirmDialog
        open={bulkDeleteConfirmOpen}
        onClose={() => setBulkDeleteConfirmOpen(false)}
        onConfirm={() => void handleBulkAction("delete")}
        title={`Delete ${selectedIds.size} selected link(s)?`}
        description={`This will permanently delete ${selectedIds.size} selected link(s) and all associated click telemetry. This action cannot be undone.`}
        confirmLabel="Delete selected"
        cancelLabel="Cancel"
        danger
        loading={isBulkRunning}
      />

      <QrCodeModal
        open={qrLink !== null}
        link={qrLink}
        onClose={() => setQrLink(null)}
      />

      <AnalyticsDrawer
        open={analyticsLink !== null}
        link={analyticsLink}
        onClose={() => setAnalyticsLink(null)}
      />
    </div>
  );
}
