"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Save,
} from "lucide-react";
import { BackupStudioSection } from "@/components/admin/settings/backup-studio-section";
import { LiveMiniPreview } from "@/components/admin/settings/live-mini-preview";
import { ProfileEditorSection } from "@/components/admin/settings/profile-editor-section";
import { ThemeStudioSection } from "@/components/admin/settings/theme-studio-section";
import { Button } from "@/components/ui/primitives";
import {
  HEX_COLOR_REGEX,
  resolveThemeTokens,
  themeTokensToCssVars,
  type CardStyle,
  type DirectoryLayout,
  type GlowIntensity,
  type StatusColor,
  type SurfaceTone,
  type ThemePresetId,
} from "@/lib/themes";
import type { SiteSettingsDTO, SocialLinkItem } from "@/lib/types/link-dto";

interface SettingsDraft {
  displayName: string;
  headline: string;
  bio: string;
  avatarUrl: string;
  statusText: string;
  statusColor: StatusColor;
  statusHref: string;
  themePreset: ThemePresetId | "custom";
  customAccentHex: string;
  surfaceTone: SurfaceTone;
  glowIntensity: GlowIntensity;
  cardStyle: CardStyle;
  directoryLayout: DirectoryLayout;
  socialLinks: SocialLinkItem[];
}

function dtoToDraft(dto: SiteSettingsDTO): SettingsDraft {
  return {
    displayName: dto.displayName,
    headline: dto.headline,
    bio: dto.bio,
    avatarUrl: dto.avatarUrl,
    statusText: dto.statusText ?? "",
    statusColor: dto.statusColor,
    statusHref: dto.statusHref ?? "",
    themePreset: dto.themePreset,
    customAccentHex: dto.customAccentHex ?? "",
    surfaceTone: dto.surfaceTone,
    glowIntensity: dto.glowIntensity,
    cardStyle: dto.cardStyle,
    directoryLayout: dto.directoryLayout,
    socialLinks: dto.socialLinks ?? [],
  };
}

function applyThemeToDocument(dto: SiteSettingsDTO) {
  if (typeof document === "undefined") return;
  const tokens = dto.resolvedTheme ?? resolveThemeTokens(dto);
  const vars = themeTokensToCssVars(tokens);
  const rootStyle = document.documentElement.style;
  for (const [key, val] of Object.entries(vars)) {
    rootStyle.setProperty(key, val);
  }
  rootStyle.setProperty("--accent-hex", tokens.accentHex);
  rootStyle.setProperty("--accent-rgb", tokens.accentRgb);
  rootStyle.setProperty("--surface-bg", tokens.canvasHex);
  rootStyle.setProperty("--surface-card", tokens.cardHex);
  rootStyle.setProperty("--surface-elevated", tokens.elevatedHex);
  rootStyle.setProperty("--glow-alpha", String(tokens.glowAlpha));
  document.documentElement.setAttribute("data-card-style", tokens.cardStyle);
}

export interface SettingsStudioProps {
  initialSettings: SiteSettingsDTO;
}

export function SettingsStudio({ initialSettings }: SettingsStudioProps) {
  const router = useRouter();
  const [savedDto, setSavedDto] = useState<SiteSettingsDTO>(initialSettings);
  const [draft, setDraft] = useState<SettingsDraft>(() =>
    dtoToDraft(initialSettings),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [banner, setBanner] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const isDirty = useMemo(() => {
    return JSON.stringify(draft) !== JSON.stringify(dtoToDraft(savedDto));
  }, [draft, savedDto]);

  const previewTokens = useMemo(() => {
    return resolveThemeTokens({
      themePreset: draft.themePreset,
      customAccentHex: HEX_COLOR_REGEX.test(draft.customAccentHex.trim())
        ? draft.customAccentHex.trim()
        : null,
      surfaceTone: draft.surfaceTone,
      glowIntensity: draft.glowIntensity,
      cardStyle: draft.cardStyle,
    });
  }, [
    draft.themePreset,
    draft.customAccentHex,
    draft.surfaceTone,
    draft.glowIntensity,
    draft.cardStyle,
  ]);

  const handleSave = async () => {
    if (isSaving) return;
    setBanner(null);
    setFieldErrors({});

    if (
      draft.themePreset === "custom" &&
      !HEX_COLOR_REGEX.test(draft.customAccentHex.trim())
    ) {
      setFieldErrors({
        customAccentHex: [
          "Enter a valid 6-digit HEX color (e.g. #10b981) for custom theme mode.",
        ],
      });
      setBanner({
        type: "error",
        message: "Please enter a valid 6-digit custom accent HEX color.",
      });
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        displayName: draft.displayName.trim(),
        headline: draft.headline.trim(),
        bio: draft.bio.trim(),
        avatarUrl: draft.avatarUrl.trim(),
        statusText: draft.statusText.trim() ? draft.statusText.trim() : null,
        statusColor: draft.statusColor,
        statusHref: draft.statusHref.trim() ? draft.statusHref.trim() : null,
        themePreset: draft.themePreset,
        customAccentHex:
          draft.themePreset === "custom"
            ? draft.customAccentHex.trim().toLowerCase()
            : null,
        surfaceTone: draft.surfaceTone,
        glowIntensity: draft.glowIntensity,
        cardStyle: draft.cardStyle,
        directoryLayout: draft.directoryLayout,
        socialLinks: draft.socialLinks.map((item) => ({
          ...item,
          label: item.label.trim(),
          url: item.url.trim(),
        })),
      };

      const res = await fetch("/api/v1/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = (await res.json()) as {
        data?: SiteSettingsDTO;
        error?: { message?: string; details?: Record<string, string[]> };
      };

      if (!res.ok || !json.data) {
        if (json.error?.details) {
          setFieldErrors(json.error.details);
        }
        setBanner({
          type: "error",
          message:
            json.error?.message || "Could not save customization settings.",
        });
        return;
      }

      setSavedDto(json.data);
      setDraft(dtoToDraft(json.data));
      applyThemeToDocument(json.data);
      router.refresh();
      setBanner({
        type: "success",
        message:
          "Customization saved. Your public directory and admin theme have been updated.",
      });
    } catch {
      setBanner({
        type: "error",
        message: "Network error while saving settings.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscard = () => {
    setDraft(dtoToDraft(savedDto));
    setFieldErrors({});
    setBanner(null);
  };

  return (
    <div className="space-y-6">
      {/* Studio Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-zinc-800/80 pb-5 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white">
            Customize &amp; Studio Settings
          </h1>
          <p className="mt-0.5 text-xs text-zinc-400">
            Configure your global dark theme, public profile &amp; live status,
            and portable JSON backups.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isDirty ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDiscard}
              disabled={isSaving}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Discard
            </Button>
          ) : null}

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="il-accent-btn inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold shadow-sm transition disabled:pointer-events-none disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {isSaving ? "Saving..." : "Save Customization"}
          </button>
        </div>
      </div>

      {/* Section anchor links */}
      <nav
        aria-label="Settings sections"
        className="flex flex-wrap items-center gap-2"
      >
        <a
          href="#theme-studio"
          className="rounded-lg border border-zinc-800 bg-[var(--il-card)] px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-[rgba(var(--il-accent-rgb),0.45)] hover:text-white"
        >
          Theme Studio
        </a>
        <a
          href="#profile-editor"
          className="rounded-lg border border-zinc-800 bg-[var(--il-card)] px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-[rgba(var(--il-accent-rgb),0.45)] hover:text-white"
        >
          Profile &amp; Live Status
        </a>
        <a
          href="#backup-studio"
          className="rounded-lg border border-zinc-800 bg-[var(--il-card)] px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-[rgba(var(--il-accent-rgb),0.45)] hover:text-white"
        >
          Backup &amp; Restore
        </a>
      </nav>

      {/* Feedback Banner */}
      {banner ? (
        <div
          role="status"
          className={
            banner.type === "success"
              ? "flex items-center gap-2 rounded-xl border border-emerald-500/35 bg-emerald-950/35 px-4 py-3 text-xs text-emerald-200"
              : "flex items-center gap-2 rounded-xl border border-red-500/35 bg-red-950/35 px-4 py-3 text-xs text-red-200"
          }
        >
          {banner.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          )}
          <span>{banner.message}</span>
        </div>
      ) : null}

      {/* Studio Grid: Editors + Sticky Live Mini Preview */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-7">
          <ThemeStudioSection
            themePreset={draft.themePreset}
            customAccentHex={draft.customAccentHex}
            surfaceTone={draft.surfaceTone}
            glowIntensity={draft.glowIntensity}
            cardStyle={draft.cardStyle}
            directoryLayout={draft.directoryLayout}
            customHexError={fieldErrors.customAccentHex?.[0]}
            onSelectPreset={(preset) =>
              setDraft((prev) => ({
                ...prev,
                themePreset: preset,
                customAccentHex: "",
              }))
            }
            onCustomHexChange={(hex) =>
              setDraft((prev) => ({
                ...prev,
                themePreset: "custom",
                customAccentHex: hex,
              }))
            }
            onResetAccent={() =>
              setDraft((prev) => ({
                ...prev,
                themePreset: "obsidian-emerald",
                customAccentHex: "",
              }))
            }
            onSurfaceToneChange={(surfaceTone) =>
              setDraft((prev) => ({ ...prev, surfaceTone }))
            }
            onGlowIntensityChange={(glowIntensity) =>
              setDraft((prev) => ({ ...prev, glowIntensity }))
            }
            onCardStyleChange={(cardStyle) =>
              setDraft((prev) => ({ ...prev, cardStyle }))
            }
            onDirectoryLayoutChange={(directoryLayout) =>
              setDraft((prev) => ({ ...prev, directoryLayout }))
            }
          />

          <ProfileEditorSection
            displayName={draft.displayName}
            headline={draft.headline}
            bio={draft.bio}
            avatarUrl={draft.avatarUrl}
            statusText={draft.statusText}
            statusColor={draft.statusColor}
            statusHref={draft.statusHref}
            socialLinks={draft.socialLinks}
            fieldErrors={fieldErrors}
            onChangeField={(field, value) =>
              setDraft((prev) => ({ ...prev, [field]: value }))
            }
            onStatusColorChange={(statusColor) =>
              setDraft((prev) => ({ ...prev, statusColor }))
            }
            onSocialLinksChange={(socialLinks) =>
              setDraft((prev) => ({ ...prev, socialLinks }))
            }
          />

          <BackupStudioSection />
        </div>

        <aside className="lg:sticky lg:top-20 lg:col-span-5">
          <LiveMiniPreview
            displayName={draft.displayName}
            headline={draft.headline}
            bio={draft.bio}
            avatarUrl={draft.avatarUrl}
            statusText={draft.statusText}
            statusColor={draft.statusColor}
            directoryLayout={draft.directoryLayout}
            socialLinks={draft.socialLinks}
            tokens={previewTokens}
          />
        </aside>
      </div>
    </div>
  );
}
