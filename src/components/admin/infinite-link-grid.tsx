"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link2Off } from "lucide-react";
import { Button, ConfirmDialog, Skeleton } from "@/components/ui/primitives";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { getCanonicalHost } from "@/lib/env";
import type {
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
    initialPage.nextCursor
  );
  const [hasNextPage, setHasNextPage] = useState<boolean>(
    initialPage.hasNextPage
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<
    LinkCategory | "all"
  >("all");
  const [selectedStatus, setSelectedStatus] =
    useState<LinkStatusFilter>("all");

  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [isFetchingNextPage, setIsFetchingNextPage] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<LinkDTO | null>(null);
  const [duplicatingLink, setDuplicatingLink] = useState<LinkDTO | null>(null);
  const [linkToDelete, setLinkToDelete] = useState<LinkDTO | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
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
    }, 2600);
  }, []);

  // Keyboard shortcuts: `/` focuses search, `N` opens New Link modal
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (modalOpen || qrLink || analyticsLink || linkToDelete) return;

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
  }, [modalOpen, qrLink, analyticsLink, linkToDelete]);

  const buildQueryUrl = useCallback(
    (cursor?: string | null) => {
      const params = new URLSearchParams({ limit: "12" });
      if (cursor) params.set("cursor", cursor);
      if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());
      if (selectedCategory !== "all") params.set("category", selectedCategory);
      if (selectedStatus !== "all") params.set("status", selectedStatus);
      return `/api/v1/links?${params.toString()}`;
    },
    [debouncedQuery, selectedCategory, selectedStatus]
  );

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
    patch: { isActive?: boolean; isPinned?: boolean }
  ) => {
    setItems((prev) =>
      sortLinksByKeyset(
        prev.map((item) => (item.id === link.id ? { ...item, ...patch } : item))
      )
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
            prev.map((item) => (item.id === updated.id ? updated : item))
          )
        );
        if (patch.isPinned !== undefined) {
          showToast(
            updated.isPinned
              ? `/${updated.slug} pinned to top`
              : `/${updated.slug} unpinned`
          );
        } else if (patch.isActive !== undefined) {
          showToast(
            updated.isActive
              ? `/${updated.slug} activated`
              : `/${updated.slug} paused`
          );
        }
      }
    } catch {
      setItems((prev) =>
        sortLinksByKeyset(
          prev.map((item) => (item.id === link.id ? link : item))
        )
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

  const handleSaved = (saved: LinkDTO, isEdit: boolean) => {
    if (isEdit) {
      setItems((prev) =>
        sortLinksByKeyset(
          prev.map((item) => (item.id === saved.id ? saved : item))
        )
      );
      showToast(`Changes saved to /${saved.slug}`);
    } else {
      setItems((prev) => sortLinksByKeyset([saved, ...prev]));
      showToast(`Link created: ${canonicalHost}/${saved.slug}`);
    }
  };

  return (
    <div className="space-y-5">
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
            <div
              ref={sentinelRef}
              aria-hidden="true"
              className="h-6 w-full"
            />
          )}
        </>
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
