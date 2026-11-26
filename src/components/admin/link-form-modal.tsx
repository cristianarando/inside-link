"use client";

import React, { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  GitBranch,
  Loader2,
  MonitorCheck,
  Palette,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import {
  Badge,
  Button,
  DialogModal,
  Input,
  Switch,
} from "@/components/ui/primitives";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { getCanonicalHost } from "@/lib/env";
import {
  ROUTING_DEVICES,
  ROUTING_OS_LIST,
  type RoutingDevice,
  type RoutingOs,
  type RoutingRule,
} from "@/lib/smart-routing";
import {
  GLOW_INTENSITIES,
  isValidHexColor,
  resolveThemeTokens,
  SURFACE_TONES,
  THEME_PRESET_LIST,
  type GlowIntensity,
  type LinkThemeOverride,
  type SurfaceTone,
  type ThemePresetId,
} from "@/lib/themes";
import type {
  LinkCategory,
  LinkDTO,
  LinkType,
  OgMode,
  SlugAvailability,
} from "@/lib/types/link-dto";
import type { HubLinkItem } from "@/lib/validations/link.schema";
import { classifySlug, normalizeSlug } from "@/lib/validations/slug.schema";
import type {
  FrameCompatibilityResult,
  MetadataPreviewResult,
} from "@/server/services/metadata.service";
import { HubLinksEditor } from "./hub-links-editor";
import { IconPicker } from "./icon-picker";

export interface LinkFormModalProps {
  open: boolean;
  initialLink?: LinkDTO | null;
  duplicateFrom?: LinkDTO | null;
  onClose: () => void;
  onSaved: (saved: LinkDTO, isEdit: boolean) => void;
}

const DEFAULT_HUB_ITEMS: HubLinkItem[] = [
  {
    id: "repo",
    kind: "button",
    label: "View GitHub Repository",
    url: "https://github.com/cristianarando/",
    icon: "github",
    variant: "primary",
  },
  {
    id: "demo",
    kind: "button",
    label: "View Live Demo",
    url: "https://cristianarando.dev",
    icon: "external-link",
    variant: "secondary",
  },
];

const VALID_REDIRECT_STATUSES = [301, 302, 307, 308] as const;
type RedirectStatusCode = (typeof VALID_REDIRECT_STATUSES)[number];

interface RoutingRuleDraft {
  id: string;
  label: string;
  destinationUrl: string;
  countriesText: string;
  languagesText: string;
  devices: RoutingDevice[];
  os: RoutingOs[];
}

function normalizeRedirectStatus(code: number | undefined): RedirectStatusCode {
  return VALID_REDIRECT_STATUSES.includes(code as RedirectStatusCode)
    ? (code as RedirectStatusCode)
    : 307;
}

/** Formats an ISO timestamp into local `YYYY-MM-DDTHH:mm` for `<input type="datetime-local">`. */
function toLocalDatetimeInputValue(
  isoString: string | null | undefined,
): string {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseCsvCodes(raw: string): string[] {
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toRoutingRuleDraft(
  rule: RoutingRule,
  index: number,
): RoutingRuleDraft {
  return {
    id:
      rule.id ||
      `rule-${index + 1}-${Date.now().toString(36).slice(-4)}`.slice(0, 64),
    label: rule.label ?? "",
    destinationUrl: rule.destinationUrl ?? "",
    countriesText: (rule.countries ?? []).join(", "),
    languagesText: (rule.languages ?? []).join(", "),
    devices: [...(rule.devices ?? [])],
    os: [...(rule.os ?? [])],
  };
}

function sanitizeRoutingDrafts(drafts: RoutingRuleDraft[]): RoutingRule[] {
  return drafts.map((draft, idx) => {
    const countries = Array.from(
      new Set(
        parseCsvCodes(draft.countriesText)
          .map((c) => c.toUpperCase())
          .filter((c) => /^[A-Z]{2}$/.test(c)),
      ),
    ).slice(0, 50);

    const languages = Array.from(
      new Set(
        parseCsvCodes(draft.languagesText)
          .map((l) => l.toLowerCase())
          .filter((l) => l.length >= 2 && l.length <= 16),
      ),
    ).slice(0, 25);

    const rule: RoutingRule = {
      id: draft.id || `rule-${idx + 1}`,
      label: draft.label.trim() || null,
      destinationUrl: draft.destinationUrl.trim(),
    };
    if (countries.length > 0) rule.countries = countries;
    if (languages.length > 0) rule.languages = languages;
    if (draft.devices.length > 0) rule.devices = draft.devices;
    if (draft.os.length > 0) rule.os = draft.os;
    return rule;
  });
}

export function LinkFormModal({
  open,
  initialLink,
  duplicateFrom,
  onClose,
  onSaved,
}: LinkFormModalProps) {
  const isEdit = Boolean(initialLink);
  const sourceLink = initialLink ?? duplicateFrom ?? null;
  const canonicalHost = getCanonicalHost();

  const [slugInput, setSlugInput] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<LinkType>("DIRECT");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [redirectStatus, setRedirectStatus] = useState<RedirectStatusCode>(307);
  const [forwardQueryParams, setForwardQueryParams] = useState(true);
  const [hubLinks, setHubLinks] = useState<HubLinkItem[]>(DEFAULT_HUB_ITEMS);
  const [category, setCategory] = useState<LinkCategory>("project");
  const [tagsText, setTagsText] = useState("");
  const [icon, setIcon] = useState("link");
  const [isActive, setIsActive] = useState(true);
  const [isPublic, setIsPublic] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [clearExistingPin, setClearExistingPin] = useState(false);

  // Schedule & Expiration Fallback
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [startsAtInput, setStartsAtInput] = useState("");
  const [expiresAtInput, setExpiresAtInput] = useState("");
  const [expiredRedirectUrl, setExpiredRedirectUrl] = useState("");
  const [maxClicksInput, setMaxClicksInput] = useState("");

  // Smart Routing Rules (DIRECT)
  const [routingOpen, setRoutingOpen] = useState(false);
  const [routingRules, setRoutingRules] = useState<RoutingRuleDraft[]>([]);

  // Iframe Cloaking & Compatibility Check (DIRECT)
  const [cloakingOpen, setCloakingOpen] = useState(false);
  const [isCloaked, setIsCloaked] = useState(false);
  const [isCheckingFrame, setIsCheckingFrame] = useState(false);
  const [frameCheckResult, setFrameCheckResult] =
    useState<FrameCompatibilityResult | null>(null);
  const [frameCheckError, setFrameCheckError] = useState<string | null>(null);

  // HUB Theme Override (HUB)
  const [themeOpen, setThemeOpen] = useState(false);
  const [themePreset, setThemePreset] = useState<ThemePresetId | "custom" | "">(
    "",
  );
  const [themeAccentHex, setThemeAccentHex] = useState("#10b981");
  const [themeSurfaceTone, setThemeSurfaceTone] = useState<SurfaceTone | "">(
    "",
  );
  const [themeGlowIntensity, setThemeGlowIntensity] = useState<
    GlowIntensity | ""
  >("");

  const [ogMode, setOgMode] = useState<OgMode>("auto");
  const [ogImageUrl, setOgImageUrl] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [isPreviewing, setIsPreviewing] = useState(false);

  const [isMagicFilling, setIsMagicFilling] = useState(false);
  const [magicFillMessage, setMagicFillMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  const [slugStatus, setSlugStatus] = useState<
    | { state: "idle" }
    | { state: "checking"; normalized: string }
    | { state: "available"; normalized: string }
    | { state: "blocked"; normalized: string; message: string }
  >({ state: "idle" });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPreviewUrl("");
    setPreviewError("");
    setSubmitError(null);
    setClearExistingPin(false);
    setPinInput("");
    setMagicFillMessage(null);
    setFrameCheckResult(null);
    setFrameCheckError(null);

    if (sourceLink) {
      const isDuplicate = !initialLink && Boolean(duplicateFrom);
      setSlugInput(isDuplicate ? `${sourceLink.slug}-copy` : sourceLink.slug);
      setTitle(isDuplicate ? `${sourceLink.title} (Copy)` : sourceLink.title);
      setDescription(sourceLink.description ?? "");
      setType(sourceLink.type);
      setDestinationUrl(sourceLink.destinationUrl ?? "");
      setRedirectStatus(normalizeRedirectStatus(sourceLink.redirectStatus));
      setForwardQueryParams(sourceLink.forwardQueryParams);
      setHubLinks(
        sourceLink.hubLinks && sourceLink.hubLinks.length > 0
          ? sourceLink.hubLinks.map((item, idx) => ({
              ...item,
              id: isDuplicate
                ? `hub-${idx + 1}-${Date.now().toString(36)}`
                : item.id,
            }))
          : DEFAULT_HUB_ITEMS,
      );
      setCategory(sourceLink.category);
      setTagsText(sourceLink.tags.join(", "));
      setIcon(sourceLink.icon);
      setIsActive(sourceLink.isActive);
      setIsPublic(sourceLink.isPublic);
      setIsPinned(isDuplicate ? false : sourceLink.isPinned);

      const hasSchedule = Boolean(
        sourceLink.startsAt ||
        sourceLink.expiresAt ||
        sourceLink.expiredRedirectUrl,
      );
      setScheduleOpen(hasSchedule);
      setStartsAtInput(toLocalDatetimeInputValue(sourceLink.startsAt));
      setExpiresAtInput(toLocalDatetimeInputValue(sourceLink.expiresAt));
      setExpiredRedirectUrl(sourceLink.expiredRedirectUrl ?? "");
      setMaxClicksInput(
        sourceLink.maxClicks !== null ? String(sourceLink.maxClicks) : "",
      );

      const drafts = (sourceLink.routingRules ?? []).map(toRoutingRuleDraft);
      setRoutingRules(drafts);
      setRoutingOpen(drafts.length > 0);

      setIsCloaked(sourceLink.isCloaked);
      setCloakingOpen(sourceLink.isCloaked);

      const override = sourceLink.theme;
      setThemeOpen(Boolean(override));
      setThemePreset(override?.preset ?? "");
      setThemeAccentHex(
        override?.accentHex && isValidHexColor(override.accentHex)
          ? override.accentHex
          : "#10b981",
      );
      setThemeSurfaceTone(override?.surfaceTone ?? "");
      setThemeGlowIntensity(override?.glowIntensity ?? "");

      setOgMode(
        sourceLink.ogMode ?? (sourceLink.ogImageUrl ? "custom" : "auto"),
      );
      setOgImageUrl(sourceLink.ogImageUrl ?? "");
    } else {
      setSlugInput("");
      setTitle("");
      setDescription("");
      setOgMode("auto");
      setType("DIRECT");
      setDestinationUrl("");
      setRedirectStatus(307);
      setForwardQueryParams(true);
      setHubLinks(DEFAULT_HUB_ITEMS);
      setCategory("project");
      setTagsText("");
      setIcon("link");
      setIsActive(true);
      setIsPublic(false);
      setIsPinned(false);
      setScheduleOpen(false);
      setStartsAtInput("");
      setExpiresAtInput("");
      setExpiredRedirectUrl("");
      setMaxClicksInput("");
      setRoutingOpen(false);
      setRoutingRules([]);
      setCloakingOpen(false);
      setIsCloaked(false);
      setThemeOpen(false);
      setThemePreset("");
      setThemeAccentHex("#10b981");
      setThemeSurfaceTone("");
      setThemeGlowIntensity("");
      setOgImageUrl("");
    }
  }, [open, initialLink, duplicateFrom, sourceLink]);

  const debouncedSlug = useDebouncedValue(slugInput, 250);

  useEffect(() => {
    if (!open) return;
    const raw = slugInput.trim();
    if (!raw) {
      setSlugStatus({ state: "idle" });
      return;
    }

    const localCheck = classifySlug(raw);
    if (!localCheck.ok) {
      setSlugStatus({
        state: "blocked",
        normalized: localCheck.normalized,
        message: localCheck.message,
      });
      return;
    }

    if (initialLink && localCheck.normalized === initialLink.slug) {
      setSlugStatus({
        state: "available",
        normalized: localCheck.normalized,
      });
      return;
    }

    if (normalizeSlug(debouncedSlug) !== localCheck.normalized) {
      setSlugStatus({ state: "checking", normalized: localCheck.normalized });
      return;
    }

    const controller = new AbortController();
    setSlugStatus({ state: "checking", normalized: localCheck.normalized });

    const params = new URLSearchParams({ slug: localCheck.normalized });
    if (initialLink) params.set("excludeId", initialLink.id);

    fetch(`/api/v1/links/check-slug?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as SlugAvailability;
        if (data.available) {
          setSlugStatus({
            state: "available",
            normalized: data.normalizedSlug,
          });
        } else {
          setSlugStatus({
            state: "blocked",
            normalized: data.normalizedSlug,
            message: data.message || "This slug is not available",
          });
        }
      })
      .catch(() => {
        // Ignore aborted requests
      });

    return () => controller.abort();
  }, [open, slugInput, debouncedSlug, initialLink]);

  const handleGenerateRandomSlug = async () => {
    try {
      const res = await fetch("/api/v1/links/check-slug?action=generate");
      if (!res.ok) return;
      const data = (await res.json()) as SlugAvailability;
      if (data.normalizedSlug) {
        setSlugInput(data.normalizedSlug);
        setSlugStatus({ state: "available", normalized: data.normalizedSlug });
      }
    } catch {
      // ignore
    }
  };

  const handleMagicFill = async () => {
    const trimmedUrl = destinationUrl.trim();
    if (!trimmedUrl) {
      setMagicFillMessage({
        kind: "error",
        text: "Enter a destination URL first.",
      });
      return;
    }

    setIsMagicFilling(true);
    setMagicFillMessage(null);

    try {
      const res = await fetch("/api/v1/links/metadata-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmedUrl }),
      });

      const body = (await res.json()) as {
        data?: MetadataPreviewResult;
        error?: { message?: string };
      };

      if (!res.ok || !body.data) {
        setMagicFillMessage({
          kind: "error",
          text:
            body.error?.message || "Could not fetch metadata from target URL.",
        });
        return;
      }

      const meta = body.data;
      if (meta.title) setTitle(meta.title);
      if (meta.description) setDescription(meta.description);
      if (meta.icon) setIcon(meta.icon);

      setMagicFillMessage({
        kind: "success",
        text: "Metadata auto-filled from destination URL.",
      });
    } catch {
      setMagicFillMessage({
        kind: "error",
        text: "Network error while fetching metadata.",
      });
    } finally {
      setIsMagicFilling(false);
    }
  };

  const handleCheckFrameCompatibility = async () => {
    const trimmedUrl = destinationUrl.trim();
    if (!trimmedUrl) {
      setFrameCheckResult(null);
      setFrameCheckError("Enter a destination URL first.");
      return;
    }

    setIsCheckingFrame(true);
    setFrameCheckError(null);
    setFrameCheckResult(null);

    try {
      const res = await fetch("/api/v1/links/frame-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmedUrl }),
      });

      const body = (await res.json()) as {
        data?: FrameCompatibilityResult;
        error?: { message?: string };
      };

      if (!res.ok || !body.data) {
        setFrameCheckError(
          body.error?.message || "Could not check frame compatibility.",
        );
        return;
      }

      setFrameCheckResult(body.data);
    } catch {
      setFrameCheckError("Network error while checking iframe compatibility.");
    } finally {
      setIsCheckingFrame(false);
    }
  };

  const handleAddRoutingRule = () => {
    if (routingRules.length >= 15) return;
    setRoutingOpen(true);
    setRoutingRules((prev) => [
      ...prev,
      {
        id: `rule-${Date.now().toString(36)}-${prev.length + 1}`,
        label: "",
        destinationUrl: "",
        countriesText: "",
        languagesText: "",
        devices: [],
        os: [],
      },
    ]);
  };

  const handleUpdateRoutingRule = (
    index: number,
    patch: Partial<RoutingRuleDraft>,
  ) => {
    setRoutingRules((prev) =>
      prev.map((rule, idx) => (idx === index ? { ...rule, ...patch } : rule)),
    );
  };

  const handleMoveRoutingRule = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= routingRules.length) return;
    setRoutingRules((prev) => {
      const next = [...prev];
      const current = next[index]!;
      next[index] = next[target]!;
      next[target] = current;
      return next;
    });
  };

  const handleRemoveRoutingRule = (index: number) => {
    setRoutingRules((prev) => prev.filter((_, idx) => idx !== index));
  };

  const toggleRuleDevice = (index: number, device: RoutingDevice) => {
    const rule = routingRules[index];
    if (!rule) return;
    const exists = rule.devices.includes(device);
    handleUpdateRoutingRule(index, {
      devices: exists
        ? rule.devices.filter((d) => d !== device)
        : [...rule.devices, device],
    });
  };

  const toggleRuleOs = (index: number, osName: RoutingOs) => {
    const rule = routingRules[index];
    if (!rule) return;
    const exists = rule.os.includes(osName);
    handleUpdateRoutingRule(index, {
      os: exists ? rule.os.filter((o) => o !== osName) : [...rule.os, osName],
    });
  };

  const buildThemeOverride = (): LinkThemeOverride | null => {
    if (type !== "HUB") return null;
    const override: LinkThemeOverride = {};
    if (themePreset) {
      override.preset = themePreset;
      if (themePreset === "custom" && isValidHexColor(themeAccentHex)) {
        override.accentHex = themeAccentHex.trim().toLowerCase();
      }
    }
    if (themeSurfaceTone) {
      override.surfaceTone = themeSurfaceTone;
    }
    if (themeGlowIntensity) {
      override.glowIntensity = themeGlowIntensity;
    }
    return Object.keys(override).length > 0 ? override : null;
  };

  const previewThemeTokens = resolveThemeTokens(
    null,
    buildThemeOverride() ?? undefined,
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (slugStatus.state === "blocked") return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const tags = tagsText
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 10);

      const sanitizedRules =
        type === "DIRECT" ? sanitizeRoutingDrafts(routingRules) : [];

      const payload: Record<string, unknown> = {
        slug: slugInput.trim() ? normalizeSlug(slugInput) : undefined,
        title: title.trim(),
        description: description.trim() || null,
        type,
        destinationUrl: type === "DIRECT" ? destinationUrl.trim() : null,
        redirectStatus,
        forwardQueryParams,
        hubLinks: type === "HUB" ? hubLinks : null,
        category,
        tags,
        icon,
        isActive,
        isPublic,
        isPinned,
        ogMode,
        ogImageUrl: ogMode === "custom" ? ogImageUrl.trim() || null : null,
        startsAt: startsAtInput ? new Date(startsAtInput).toISOString() : null,
        expiresAt: expiresAtInput
          ? new Date(expiresAtInput).toISOString()
          : null,
        expiredRedirectUrl: expiredRedirectUrl.trim() || null,
        maxClicks: maxClicksInput.trim() ? Number(maxClicksInput) : null,
        isCloaked: type === "DIRECT" ? isCloaked : false,
        routingRules: type === "DIRECT" ? sanitizedRules : [],
        theme: buildThemeOverride(),
      };

      if (pinInput.trim()) {
        payload.pin = pinInput.trim();
      } else if (clearExistingPin && isEdit) {
        payload.pin = null;
      }

      const endpoint = initialLink
        ? `/api/v1/links/${initialLink.id}`
        : "/api/v1/links";
      const method = initialLink ? "PATCH" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = await res.json();
      if (!res.ok) {
        const firstFieldDetail = body?.error?.details
          ? Object.values(body.error.details as Record<string, string[]>)
              .flat()
              .find(Boolean)
          : null;
        setSubmitError(
          firstFieldDetail ||
            body?.error?.message ||
            "Could not save the link. Please check the fields.",
        );
        setIsSubmitting(false);
        return;
      }

      setIsSubmitting(false);
      onSaved(body as LinkDTO, isEdit);
      onClose();
    } catch {
      setSubmitError("Network error while saving the link.");
      setIsSubmitting(false);
    }
  };

  const modalTitle = isEdit
    ? `Edit /${initialLink?.slug}`
    : duplicateFrom
      ? `Duplicate /${duplicateFrom.slug}`
      : "Create New Short Link";

  return (
    <DialogModal
      open={open}
      onClose={onClose}
      title={modalTitle}
      description={`Configure a direct redirect or a Rich HUB micro-landing for ${canonicalHost}.`}
      maxWidthClass="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {submitError && (
          <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-950/40 p-3 text-xs text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            <span>{submitError}</span>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-zinc-300">
              Custom Slug{" "}
              <span className="text-zinc-500">
                (leave empty to autogenerate 6 chars)
              </span>
            </label>
            <button
              type="button"
              onClick={handleGenerateRandomSlug}
              className="inline-flex cursor-pointer items-center gap-1 rounded text-xs text-emerald-400 hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
            >
              <Sparkles className="h-3 w-3" />
              Autogenerate (6 chars)
            </button>
          </div>
          <div className="mt-1.5 flex items-center rounded-xl border border-zinc-800 bg-[#111114] px-3 focus-within:border-emerald-500/60 focus-within:ring-2 focus-within:ring-emerald-500/30">
            <span className="select-none font-mono text-xs text-zinc-500">
              {canonicalHost}/
            </span>
            <input
              type="text"
              value={slugInput}
              onChange={(e) => setSlugInput(e.target.value)}
              placeholder="smart-travel-guide"
              className="w-full bg-transparent py-2 pl-1 font-mono text-sm text-white placeholder:text-zinc-600 focus:outline-none"
            />
          </div>

          {slugStatus.state === "checking" && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-zinc-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Checking availability for{" "}
              <code className="text-zinc-200">/{slugStatus.normalized}</code>...
            </p>
          )}
          {slugStatus.state === "available" && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Available:{" "}
              <code className="font-mono">
                {canonicalHost}/{slugStatus.normalized}
              </code>
            </p>
          )}
          {slugStatus.state === "blocked" && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-red-400">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{slugStatus.message}</span>
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-zinc-300">
              Link Title *
            </label>
            <Input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Smart Travel Guide App"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-300">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as LinkCategory)}
              className="mt-1 w-full rounded-xl border border-zinc-800 bg-[#111114] px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
            >
              <option value="project">Projects</option>
              <option value="social">Social</option>
              <option value="resource">Resources / Docs</option>
              <option value="personal">Personal</option>
              <option value="temporary">Temporary</option>
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-zinc-300">
            Resolution Mode
          </label>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setType("DIRECT")}
              className={`cursor-pointer rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 ${
                type === "DIRECT"
                  ? "border-emerald-500/50 bg-emerald-500/10 text-white"
                  : "border-zinc-800 bg-[#111114]/60 text-zinc-400 hover:border-zinc-700"
              }`}
            >
              <div className="text-xs font-semibold">
                Direct Redirect (301/302/307/308)
              </div>
              <div className="mt-0.5 text-[11px] text-zinc-400">
                Redirects in &lt;50ms with smart routing &amp; cloaking options.
              </div>
            </button>
            <button
              type="button"
              onClick={() => setType("HUB")}
              className={`cursor-pointer rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 ${
                type === "HUB"
                  ? "border-emerald-500/50 bg-emerald-500/10 text-white"
                  : "border-zinc-800 bg-[#111114]/60 text-zinc-400 hover:border-zinc-700"
              }`}
            >
              <div className="text-xs font-semibold">
                Rich Micro-Landing (HUB)
              </div>
              <div className="mt-0.5 text-[11px] text-zinc-400">
                Buttons, GitHub repo cards, YouTube, Spotify, code &amp;
                callouts.
              </div>
            </button>
          </div>
        </div>

        {type === "DIRECT" ? (
          <div className="space-y-3 rounded-xl border border-zinc-800/80 bg-[#111114]/60 p-3.5">
            <div>
              <label className="text-xs font-medium text-zinc-300">
                Destination URL *
              </label>
              <div className="mt-1 flex flex-col gap-2 sm:flex-row">
                <Input
                  required
                  type="url"
                  value={destinationUrl}
                  onChange={(e) => setDestinationUrl(e.target.value)}
                  placeholder="https://github.com/cristianarando/..."
                  className="flex-1 font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleMagicFill}
                  disabled={isMagicFilling || !destinationUrl.trim()}
                  title="Auto-fill title, description, and icon from URL metadata"
                  className="shrink-0 py-2"
                >
                  {isMagicFilling ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                  ) : (
                    <Wand2 className="h-3.5 w-3.5 text-emerald-400" />
                  )}
                  Magic Fill
                </Button>
              </div>
              {magicFillMessage && (
                <p
                  role="status"
                  className={`mt-1.5 text-[11px] ${
                    magicFillMessage.kind === "success"
                      ? "text-emerald-400"
                      : "text-red-400"
                  }`}
                >
                  {magicFillMessage.text}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs text-zinc-400">HTTP Status:</label>
                <select
                  value={redirectStatus}
                  onChange={(e) =>
                    setRedirectStatus(
                      normalizeRedirectStatus(Number(e.target.value)),
                    )
                  }
                  className="rounded-lg border border-zinc-800 bg-[#111114] px-2.5 py-1 text-xs text-zinc-200 focus:border-emerald-500/60 focus:outline-none"
                >
                  <option value={307}>
                    307 Temporary (Preserve Method · Recommended)
                  </option>
                  <option value={308}>308 Permanent (Preserve Method)</option>
                  <option value={302}>302 Found (Temporary)</option>
                  <option value={301}>
                    301 Moved Permanently (High cache)
                  </option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-xs text-zinc-300">
                <Switch
                  checked={forwardQueryParams}
                  onCheckedChange={setForwardQueryParams}
                  ariaLabel="Forward Query Params"
                />
                Forward query params (<code>?ref=cv</code>)
              </label>
            </div>
          </div>
        ) : (
          <HubLinksEditor items={hubLinks} onChange={setHubLinks} />
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-zinc-300">
              Description (Open Graph / Directory)
            </label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short summary of the project or destination"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-300">
              Tags (comma-separated)
            </label>
            <Input
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="nextjs, turso, opensource"
              className="mt-1"
            />
          </div>
        </div>

        <fieldset className="space-y-2 rounded-xl border border-zinc-800/80 bg-[#111114]/40 p-3.5">
          <legend className="px-1 text-xs font-medium text-zinc-300">
            Social Preview
          </legend>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Social preview mode"
              className="rounded-lg border border-zinc-800 bg-[#111114] p-2 text-xs text-zinc-200 focus:border-emerald-500/60 focus:outline-none"
              value={ogMode}
              onChange={(event) => setOgMode(event.target.value as OgMode)}
            >
              <option value="auto">Automatic</option>
              <option value="custom">Custom image</option>
              <option value="minimal">Generic card</option>
            </select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPreviewing || !title.trim()}
              onClick={async () => {
                setIsPreviewing(true);
                setPreviewError("");
                setPreviewUrl("");
                try {
                  const hasPin = Boolean(
                    pinInput || (initialLink?.hasPin && !clearExistingPin),
                  );
                  const response = await fetch("/api/v1/og/preview", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      title,
                      description,
                      slug: normalizeSlug(slugInput),
                      category,
                      type,
                      ogMode,
                      hasPin,
                    }),
                  });
                  if (
                    !response.ok ||
                    !response.headers
                      .get("content-type")
                      ?.startsWith("image/png")
                  ) {
                    throw new Error("Preview unavailable");
                  }
                  const png = await response.blob();
                  const dataUrl = await new Promise<string>(
                    (resolve, reject) => {
                      const reader = new FileReader();
                      reader.onload = () => resolve(String(reader.result));
                      reader.onerror = () => reject(reader.error);
                      reader.readAsDataURL(png);
                    },
                  );
                  setPreviewUrl(dataUrl);
                } catch {
                  setPreviewError("Could not load the generated preview.");
                } finally {
                  setIsPreviewing(false);
                }
              }}
            >
              {isPreviewing ? "Generating..." : "Preview generated card"}
            </Button>
          </div>
          {ogMode === "custom" && (
            <Input
              type="url"
              aria-label="Custom social image URL"
              placeholder="https://example.com/social-image.png"
              value={ogImageUrl}
              onChange={(event) => setOgImageUrl(event.target.value)}
              required
            />
          )}
          {previewUrl && (
            <img
              src={previewUrl}
              alt="Generated social card preview"
              className="w-full rounded-lg border border-zinc-800"
            />
          )}
          {previewError && (
            <p role="status" className="text-xs text-red-300">
              {previewError}
            </p>
          )}
          <p className="text-[11px] text-zinc-500">
            Social previews can show the title and description of unlisted
            links. PIN-protected links use a generic protected card.
          </p>
        </fieldset>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-zinc-300">
            Icon
          </label>
          <IconPicker value={icon} onChange={setIcon} />
        </div>

        <div className="grid grid-cols-1 gap-2 rounded-xl border border-zinc-800/80 bg-[#111114]/60 p-3 sm:grid-cols-3">
          <label className="flex items-center justify-between gap-2 text-xs text-zinc-300">
            <span>Active Link</span>
            <Switch
              checked={isActive}
              onCheckedChange={setIsActive}
              ariaLabel="Active link"
            />
          </label>
          <label className="flex items-center justify-between gap-2 text-xs text-zinc-300">
            <span>Public Directory (/)</span>
            <Switch
              checked={isPublic}
              onCheckedChange={setIsPublic}
              ariaLabel="Visible on public directory"
            />
          </label>
          <label className="flex items-center justify-between gap-2 text-xs text-zinc-300">
            <span>Pin to top</span>
            <Switch
              checked={isPinned}
              onCheckedChange={setIsPinned}
              ariaLabel="Pin link to top"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-zinc-300">
              Access PIN {initialLink?.hasPin ? "(Configured)" : "(Optional)"}
            </label>
            <Input
              type="password"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder={initialLink?.hasPin ? "New PIN..." : "Min. 4 chars"}
              className="mt-1 text-xs"
            />
            {initialLink?.hasPin && (
              <label className="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-400">
                <input
                  type="checkbox"
                  checked={clearExistingPin}
                  onChange={(e) => setClearExistingPin(e.target.checked)}
                />
                Remove current PIN
              </label>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-300">
              Max Clicks (Optional)
            </label>
            <Input
              type="number"
              min={1}
              value={maxClicksInput}
              onChange={(e) => setMaxClicksInput(e.target.value)}
              placeholder="Unlimited"
              className="mt-1 text-xs"
            />
          </div>
        </div>

        {/* Collapsible Pro Section 1: Schedule & Expiration Fallback */}
        <div className="rounded-xl border border-zinc-800/90 bg-[#111114]/60">
          <button
            type="button"
            onClick={() => setScheduleOpen((prev) => !prev)}
            aria-expanded={scheduleOpen}
            className="flex w-full cursor-pointer items-center justify-between gap-2 px-3.5 py-2.5 text-left text-xs font-medium text-zinc-200 transition hover:bg-zinc-900/50"
          >
            <span className="flex items-center gap-2">
              <CalendarClock className="h-3.5 w-3.5 text-emerald-400" />
              Schedule &amp; Expiration Fallback
              {(startsAtInput || expiresAtInput || expiredRedirectUrl) && (
                <Badge variant="emerald">Configured</Badge>
              )}
            </span>
            {scheduleOpen ? (
              <ChevronDown className="h-4 w-4 text-zinc-400" />
            ) : (
              <ChevronRight className="h-4 w-4 text-zinc-400" />
            )}
          </button>

          {scheduleOpen && (
            <div className="space-y-3 border-t border-zinc-800/80 p-3.5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-zinc-300">
                    Scheduled Launch (Local Time)
                  </label>
                  <Input
                    type="datetime-local"
                    value={startsAtInput}
                    onChange={(e) => setStartsAtInput(e.target.value)}
                    className="mt-1 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-300">
                    Expiration Date (Local Time)
                  </label>
                  <Input
                    type="datetime-local"
                    value={expiresAtInput}
                    onChange={(e) => setExpiresAtInput(e.target.value)}
                    className="mt-1 text-xs"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-300">
                  Expired Fallback Redirect URL (Optional)
                </label>
                <Input
                  type="url"
                  value={expiredRedirectUrl}
                  onChange={(e) => setExpiredRedirectUrl(e.target.value)}
                  placeholder="https://cristianarando.dev/archive"
                  className="mt-1 font-mono text-xs"
                />
                <p className="mt-1 text-[11px] text-zinc-500">
                  Visitors hitting this slug after expiration or max clicks are
                  redirected here instead of seeing a 410 page.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Collapsible Pro Section 2: Smart Routing Rules (DIRECT only) */}
        {type === "DIRECT" && (
          <div className="rounded-xl border border-zinc-800/90 bg-[#111114]/60">
            <button
              type="button"
              onClick={() => setRoutingOpen((prev) => !prev)}
              aria-expanded={routingOpen}
              className="flex w-full cursor-pointer items-center justify-between gap-2 px-3.5 py-2.5 text-left text-xs font-medium text-zinc-200 transition hover:bg-zinc-900/50"
            >
              <span className="flex items-center gap-2">
                <GitBranch className="h-3.5 w-3.5 text-sky-400" />
                Smart Conditional Routing
                {routingRules.length > 0 && (
                  <Badge variant="sky">{routingRules.length} rules</Badge>
                )}
              </span>
              {routingOpen ? (
                <ChevronDown className="h-4 w-4 text-zinc-400" />
              ) : (
                <ChevronRight className="h-4 w-4 text-zinc-400" />
              )}
            </button>

            {routingOpen && (
              <div className="space-y-3 border-t border-zinc-800/80 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] text-zinc-400">
                    Evaluated top-to-bottom. First rule matching all selected
                    conditions wins; otherwise falls back to Destination URL.
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleAddRoutingRule}
                    disabled={routingRules.length >= 15}
                  >
                    <Plus className="h-3.5 w-3.5 text-sky-400" />
                    Add Rule ({routingRules.length}/15)
                  </Button>
                </div>

                {routingRules.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-zinc-800 bg-[#09090b]/60 py-4 text-center text-xs text-zinc-500">
                    No routing rules configured. Click &ldquo;Add Rule&rdquo; to
                    target by country, language, device, or OS.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {routingRules.map((rule, idx) => {
                      const countryChips = parseCsvCodes(rule.countriesText)
                        .map((c) => c.toUpperCase())
                        .filter((c) => /^[A-Z]{2}$/.test(c));
                      const langChips = parseCsvCodes(rule.languagesText)
                        .map((l) => l.toLowerCase())
                        .filter((l) => l.length >= 2);
                      const hasAnyCondition =
                        countryChips.length > 0 ||
                        langChips.length > 0 ||
                        rule.devices.length > 0 ||
                        rule.os.length > 0;

                      return (
                        <div
                          key={rule.id}
                          className="space-y-2.5 rounded-xl border border-zinc-800 bg-[#09090b]/85 p-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[11px] text-sky-300">
                              Rule #{idx + 1}
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleMoveRoutingRule(idx, -1)}
                                disabled={idx === 0}
                                title="Move rule up"
                                aria-label={`Move routing rule ${idx + 1} up`}
                                className="cursor-pointer rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white disabled:opacity-30"
                              >
                                <ArrowUp className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMoveRoutingRule(idx, 1)}
                                disabled={idx === routingRules.length - 1}
                                title="Move rule down"
                                aria-label={`Move routing rule ${idx + 1} down`}
                                className="cursor-pointer rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white disabled:opacity-30"
                              >
                                <ArrowDown className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveRoutingRule(idx)}
                                title="Delete rule"
                                aria-label={`Delete routing rule ${idx + 1}`}
                                className="cursor-pointer rounded-lg p-1 text-zinc-500 hover:bg-red-950/50 hover:text-red-300"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                            <div className="sm:col-span-4">
                              <Input
                                maxLength={80}
                                placeholder="Rule label (e.g. LatAm Mobile)"
                                aria-label={`Rule ${idx + 1} label`}
                                value={rule.label}
                                onChange={(e) =>
                                  handleUpdateRoutingRule(idx, {
                                    label: e.target.value,
                                  })
                                }
                                className="text-xs"
                              />
                            </div>
                            <div className="sm:col-span-8">
                              <Input
                                required
                                type="url"
                                placeholder="Target URL (https://...)"
                                aria-label={`Rule ${idx + 1} target URL`}
                                value={rule.destinationUrl}
                                onChange={(e) =>
                                  handleUpdateRoutingRule(idx, {
                                    destinationUrl: e.target.value,
                                  })
                                }
                                className="font-mono text-xs"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <div>
                              <label className="text-[11px] text-zinc-400">
                                Countries (2-letter ISO CSV)
                              </label>
                              <Input
                                placeholder="CO, US, ES"
                                aria-label={`Rule ${idx + 1} countries`}
                                value={rule.countriesText}
                                onChange={(e) =>
                                  handleUpdateRoutingRule(idx, {
                                    countriesText: e.target.value,
                                  })
                                }
                                className="mt-1 font-mono text-xs"
                              />
                              {countryChips.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {countryChips.map((code) => (
                                    <Badge key={code} variant="default">
                                      {code}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div>
                              <label className="text-[11px] text-zinc-400">
                                Languages (CSV)
                              </label>
                              <Input
                                placeholder="es, en"
                                aria-label={`Rule ${idx + 1} languages`}
                                value={rule.languagesText}
                                onChange={(e) =>
                                  handleUpdateRoutingRule(idx, {
                                    languagesText: e.target.value,
                                  })
                                }
                                className="mt-1 font-mono text-xs"
                              />
                              {langChips.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {langChips.map((lang) => (
                                    <Badge key={lang} variant="default">
                                      {lang}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <div>
                              <span className="text-[11px] text-zinc-400">
                                Devices
                              </span>
                              <div className="mt-1 flex flex-wrap gap-1.5">
                                {ROUTING_DEVICES.map((dev) => {
                                  const active = rule.devices.includes(dev);
                                  return (
                                    <button
                                      key={dev}
                                      type="button"
                                      onClick={() => toggleRuleDevice(idx, dev)}
                                      className={`cursor-pointer rounded-lg border px-2 py-1 text-[11px] capitalize transition ${
                                        active
                                          ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                                          : "border-zinc-800 bg-[#111114] text-zinc-400 hover:text-zinc-200"
                                      }`}
                                    >
                                      {dev}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            <div>
                              <span className="text-[11px] text-zinc-400">
                                Operating Systems
                              </span>
                              <div className="mt-1 flex flex-wrap gap-1.5">
                                {ROUTING_OS_LIST.map((osName) => {
                                  const active = rule.os.includes(osName);
                                  return (
                                    <button
                                      key={osName}
                                      type="button"
                                      onClick={() => toggleRuleOs(idx, osName)}
                                      className={`cursor-pointer rounded-lg border px-2 py-1 text-[11px] transition ${
                                        active
                                          ? "border-sky-500/50 bg-sky-500/15 text-sky-300"
                                          : "border-zinc-800 bg-[#111114] text-zinc-400 hover:text-zinc-200"
                                      }`}
                                    >
                                      {osName}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>

                          {!hasAnyCondition && (
                            <p className="text-[11px] text-amber-400">
                              Select at least one country, language, device, or
                              OS for this rule to match.
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Collapsible Pro Section 3: Iframe Cloaking (DIRECT only) */}
        {type === "DIRECT" && (
          <div className="rounded-xl border border-zinc-800/90 bg-[#111114]/60">
            <button
              type="button"
              onClick={() => setCloakingOpen((prev) => !prev)}
              aria-expanded={cloakingOpen}
              className="flex w-full cursor-pointer items-center justify-between gap-2 px-3.5 py-2.5 text-left text-xs font-medium text-zinc-200 transition hover:bg-zinc-900/50"
            >
              <span className="flex items-center gap-2">
                <MonitorCheck className="h-3.5 w-3.5 text-violet-400" />
                Iframe Cloaking &amp; Frame Compatibility
                {isCloaked && <Badge variant="violet">Cloaked</Badge>}
              </span>
              {cloakingOpen ? (
                <ChevronDown className="h-4 w-4 text-zinc-400" />
              ) : (
                <ChevronRight className="h-4 w-4 text-zinc-400" />
              )}
            </button>

            {cloakingOpen && (
              <div className="space-y-3 border-t border-zinc-800/80 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="flex items-center gap-2.5 text-xs text-zinc-300">
                    <Switch
                      checked={isCloaked}
                      onCheckedChange={setIsCloaked}
                      ariaLabel="Enable iframe cloaking"
                    />
                    <span>
                      Keep short URL in browser bar via fullscreen iframe
                    </span>
                  </label>

                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleCheckFrameCompatibility}
                    disabled={isCheckingFrame || !destinationUrl.trim()}
                  >
                    {isCheckingFrame ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                    ) : (
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                    )}
                    Check Frame Compatibility
                  </Button>
                </div>

                {frameCheckError && (
                  <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-950/35 p-2.5 text-xs text-red-300">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{frameCheckError}</span>
                  </div>
                )}

                {frameCheckResult && (
                  <div
                    className={`space-y-1.5 rounded-xl border p-3 text-xs ${
                      frameCheckResult.embeddable
                        ? "border-emerald-500/30 bg-emerald-950/25 text-emerald-200"
                        : "border-red-500/30 bg-red-950/25 text-red-200"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {frameCheckResult.embeddable ? (
                        <Badge variant="emerald">
                          <ShieldCheck className="h-3 w-3" />
                          Embeddable in iframe
                        </Badge>
                      ) : (
                        <Badge variant="danger">
                          <ShieldAlert className="h-3 w-3" />
                          Blocked from iframe
                        </Badge>
                      )}
                      <span className="truncate font-mono text-[11px] text-zinc-400">
                        {frameCheckResult.url}
                      </span>
                    </div>
                    {frameCheckResult.reason && (
                      <p className="text-[11px] text-red-200">
                        {frameCheckResult.reason}
                      </p>
                    )}
                    {(frameCheckResult.xFrameOptions ||
                      frameCheckResult.frameAncestors) && (
                      <p className="font-mono text-[10px] text-zinc-400">
                        {frameCheckResult.xFrameOptions
                          ? `X-Frame-Options: ${frameCheckResult.xFrameOptions}`
                          : ""}
                        {frameCheckResult.xFrameOptions &&
                        frameCheckResult.frameAncestors
                          ? " · "
                          : ""}
                        {frameCheckResult.frameAncestors
                          ? `CSP frame-ancestors: ${frameCheckResult.frameAncestors}`
                          : ""}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Collapsible Pro Section 4: HUB Theme Override (HUB only) */}
        {type === "HUB" && (
          <div className="rounded-xl border border-zinc-800/90 bg-[#111114]/60">
            <button
              type="button"
              onClick={() => setThemeOpen((prev) => !prev)}
              aria-expanded={themeOpen}
              className="flex w-full cursor-pointer items-center justify-between gap-2 px-3.5 py-2.5 text-left text-xs font-medium text-zinc-200 transition hover:bg-zinc-900/50"
            >
              <span className="flex items-center gap-2">
                <Palette className="h-3.5 w-3.5 text-amber-400" />
                HUB Theme Override
                {(themePreset || themeSurfaceTone || themeGlowIntensity) && (
                  <Badge variant="amber">Custom Override</Badge>
                )}
              </span>
              {themeOpen ? (
                <ChevronDown className="h-4 w-4 text-zinc-400" />
              ) : (
                <ChevronRight className="h-4 w-4 text-zinc-400" />
              )}
            </button>

            {themeOpen && (
              <div className="space-y-3 border-t border-zinc-800/80 p-3.5">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-medium text-zinc-300">
                      Theme Preset Override
                    </label>
                    <select
                      value={themePreset}
                      onChange={(e) =>
                        setThemePreset(
                          e.target.value as ThemePresetId | "custom" | "",
                        )
                      }
                      aria-label="HUB theme preset override"
                      className="mt-1 w-full rounded-xl border border-zinc-800 bg-[#09090b] px-3 py-2 text-xs text-zinc-200 focus:border-emerald-500/60 focus:outline-none"
                    >
                      <option value="">Inherit Global Studio Theme</option>
                      {THEME_PRESET_LIST.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.label} ({preset.accentHex})
                        </option>
                      ))}
                      <option value="custom">Custom Accent HEX</option>
                    </select>
                  </div>

                  {themePreset === "custom" && (
                    <div>
                      <label className="text-xs font-medium text-zinc-300">
                        Custom Accent HEX
                      </label>
                      <div className="mt-1 flex items-center gap-2">
                        <input
                          type="color"
                          value={
                            isValidHexColor(themeAccentHex)
                              ? themeAccentHex
                              : "#10b981"
                          }
                          onChange={(e) => setThemeAccentHex(e.target.value)}
                          aria-label="HUB custom accent color picker"
                          className="h-9 w-11 cursor-pointer rounded-lg border border-zinc-800 bg-[#09090b] p-1"
                        />
                        <Input
                          value={themeAccentHex}
                          onChange={(e) => setThemeAccentHex(e.target.value)}
                          placeholder="#10b981"
                          aria-label="HUB custom accent HEX"
                          className="font-mono text-xs"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-medium text-zinc-300">
                      Surface Tone Override
                    </label>
                    <select
                      value={themeSurfaceTone}
                      onChange={(e) =>
                        setThemeSurfaceTone(e.target.value as SurfaceTone | "")
                      }
                      aria-label="HUB surface tone override"
                      className="mt-1 w-full rounded-xl border border-zinc-800 bg-[#09090b] px-3 py-2 text-xs capitalize text-zinc-200 focus:border-emerald-500/60 focus:outline-none"
                    >
                      <option value="">Inherit Global Surface</option>
                      {SURFACE_TONES.map((tone) => (
                        <option key={tone} value={tone}>
                          {tone}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-zinc-300">
                      Glow Intensity Override
                    </label>
                    <select
                      value={themeGlowIntensity}
                      onChange={(e) =>
                        setThemeGlowIntensity(
                          e.target.value as GlowIntensity | "",
                        )
                      }
                      aria-label="HUB glow intensity override"
                      className="mt-1 w-full rounded-xl border border-zinc-800 bg-[#09090b] px-3 py-2 text-xs capitalize text-zinc-200 focus:border-emerald-500/60 focus:outline-none"
                    >
                      <option value="">Inherit Global Glow</option>
                      {GLOW_INTENSITIES.map((glow) => (
                        <option key={glow} value={glow}>
                          {glow}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div
                  className="flex items-center justify-between rounded-xl border border-zinc-800 px-3 py-2 text-xs"
                  style={{
                    backgroundColor: previewThemeTokens.cardHex,
                  }}
                >
                  <span className="text-zinc-300">HUB Accent Preview</span>
                  <span
                    className="rounded-lg px-2.5 py-1 font-mono text-[11px] font-semibold"
                    style={{
                      backgroundColor: previewThemeTokens.accentHex,
                      color: previewThemeTokens.accentTextHex,
                    }}
                  >
                    {previewThemeTokens.accentHex}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-zinc-800/80 pt-4">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting || slugStatus.state === "blocked"}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : isEdit ? (
              "Save Changes"
            ) : (
              "Create Link"
            )}
          </Button>
        </div>
      </form>
    </DialogModal>
  );
}
