"use client";

import React from "react";
import {
  Check,
  Grid2x2,
  LayoutGrid,
  List,
  Palette,
  RotateCcw,
} from "lucide-react";
import { Input } from "@/components/ui/primitives";
import {
  CARD_STYLES,
  DIRECTORY_LAYOUTS,
  GLOW_INTENSITIES,
  HEX_COLOR_REGEX,
  SURFACE_PALETTES,
  SURFACE_TONES,
  THEME_PRESETS,
  THEME_PRESET_LIST,
  type CardStyle,
  type DirectoryLayout,
  type GlowIntensity,
  type SurfaceTone,
  type ThemePresetId,
} from "@/lib/themes";
import { cn } from "@/lib/utils";

const SURFACE_LABELS: Record<SurfaceTone, { label: string; note: string }> = {
  obsidian: { label: "Obsidian", note: "Deep neutral #09090b" },
  graphite: { label: "Graphite", note: "Cool slate-indigo #0d0d12" },
  midnight: { label: "Midnight", note: "Abyssal navy #070a12" },
};

const GLOW_LABELS: Record<GlowIntensity, { label: string; note: string }> = {
  none: { label: "None", note: "Flat matte canvas" },
  subtle: { label: "Subtle", note: "Soft top ambient halo" },
  vibrant: { label: "Vibrant", note: "High-contrast accent aura" },
};

const CARD_STYLE_LABELS: Record<CardStyle, { label: string; note: string }> = {
  glass: { label: "Glass", note: "Translucent backdrop blur" },
  bordered: { label: "Bordered", note: "Crisp accent-tinted edges" },
  minimal: { label: "Minimal", note: "Ultra-clean hairline surface" },
};

const LAYOUT_LABELS: Record<
  DirectoryLayout,
  { label: string; note: string; icon: React.ReactNode }
> = {
  bento: {
    label: "Bento Mosaic",
    note: "Pinned cards span 2 columns",
    icon: <LayoutGrid className="h-4 w-4" />,
  },
  grid: {
    label: "Uniform Grid",
    note: "Balanced 2-column cards",
    icon: <Grid2x2 className="h-4 w-4" />,
  },
  list: {
    label: "Compact List",
    note: "Single-column horizontal rows",
    icon: <List className="h-4 w-4" />,
  },
};

export interface ThemeStudioSectionProps {
  themePreset: ThemePresetId | "custom";
  customAccentHex: string;
  surfaceTone: SurfaceTone;
  glowIntensity: GlowIntensity;
  cardStyle: CardStyle;
  directoryLayout: DirectoryLayout;
  customHexError?: string;
  onSelectPreset: (preset: ThemePresetId) => void;
  onCustomHexChange: (hex: string) => void;
  onResetAccent: () => void;
  onSurfaceToneChange: (tone: SurfaceTone) => void;
  onGlowIntensityChange: (glow: GlowIntensity) => void;
  onCardStyleChange: (style: CardStyle) => void;
  onDirectoryLayoutChange: (layout: DirectoryLayout) => void;
}

export function ThemeStudioSection({
  themePreset,
  customAccentHex,
  surfaceTone,
  glowIntensity,
  cardStyle,
  directoryLayout,
  customHexError,
  onSelectPreset,
  onCustomHexChange,
  onResetAccent,
  onSurfaceToneChange,
  onGlowIntensityChange,
  onCardStyleChange,
  onDirectoryLayoutChange,
}: ThemeStudioSectionProps) {
  const effectivePickerHex = HEX_COLOR_REGEX.test(customAccentHex.trim())
    ? customAccentHex.trim().toLowerCase()
    : themePreset !== "custom"
      ? THEME_PRESETS[themePreset].accentHex
      : "#10b981";

  return (
    <section
      id="theme-studio"
      className="obsidian-surface space-y-6 rounded-2xl border border-zinc-800/90 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
        <div className="flex items-center gap-2.5">
          <span className="il-accent-pill flex h-9 w-9 items-center justify-center rounded-xl border">
            <Palette className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-white">Theme Studio</h2>
            <p className="text-xs text-zinc-400">
              Dark-only Obsidian presets, free custom HEX accent, surfaces, and
              directory layout.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onResetAccent}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-800 bg-[var(--il-canvas)] px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-zinc-700 hover:text-white"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset accent
        </button>
      </div>

      {/* Presets */}
      <div className="space-y-2.5">
        <label className="block text-xs font-medium text-zinc-300">
          Curated Dark Presets
        </label>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {THEME_PRESET_LIST.map((preset) => {
            const active = themePreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onSelectPreset(preset.id)}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-left transition",
                  active
                    ? "border-[rgba(var(--il-accent-rgb),0.55)] bg-[var(--il-elevated)]/70"
                    : "border-zinc-800/90 bg-[var(--il-canvas)]/70 hover:border-zinc-700",
                )}
              >
                <span
                  className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/15"
                  style={{ backgroundColor: preset.accentHex }}
                >
                  {active ? (
                    <Check
                      className="h-3.5 w-3.5"
                      style={{ color: preset.accentTextHex }}
                    />
                  ) : null}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-white">
                      {preset.label}
                    </span>
                    <span className="font-mono text-[10px] text-zinc-500">
                      {preset.accentHex}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-snug text-zinc-400">
                    {preset.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom Accent HEX */}
      <div className="space-y-2 rounded-xl border border-zinc-800/80 bg-[var(--il-canvas)]/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <label
              htmlFor="custom-accent-hex"
              className="text-xs font-medium text-zinc-200"
            >
              Custom Accent HEX
            </label>
            <p className="text-[11px] text-zinc-500">
              Pick any 6-digit HEX color to activate Custom Theme Mode.
            </p>
          </div>
          {themePreset === "custom" ? (
            <span className="il-accent-pill rounded-md border px-2 py-0.5 font-mono text-[10px] uppercase">
              Custom Active
            </span>
          ) : null}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2.5">
          <input
            type="color"
            aria-label="Custom accent color picker"
            value={effectivePickerHex}
            onChange={(e) => onCustomHexChange(e.target.value)}
            className="h-10 w-12 shrink-0 cursor-pointer rounded-xl border border-zinc-700 bg-transparent p-1"
          />
          <div className="min-w-[150px] flex-1">
            <Input
              id="custom-accent-hex"
              value={customAccentHex}
              onChange={(e) => onCustomHexChange(e.target.value)}
              placeholder="#10b981"
              maxLength={7}
              className="font-mono text-xs"
            />
          </div>
          <button
            type="button"
            onClick={onResetAccent}
            className="cursor-pointer rounded-xl border border-zinc-800 bg-[var(--il-card)] px-3 py-2 text-xs font-medium text-zinc-300 transition hover:border-zinc-700 hover:text-white"
          >
            Reset
          </button>
        </div>
        {customHexError ? (
          <p className="text-xs text-red-400">{customHexError}</p>
        ) : null}
      </div>

      {/* Surface Tone & Glow Intensity */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <span className="block text-xs font-medium text-zinc-300">
            Surface Tone
          </span>
          <div className="space-y-2">
            {SURFACE_TONES.map((tone) => {
              const active = surfaceTone === tone;
              const palette = SURFACE_PALETTES[tone];
              const meta = SURFACE_LABELS[tone];
              return (
                <button
                  key={tone}
                  type="button"
                  onClick={() => onSurfaceToneChange(tone)}
                  className={cn(
                    "flex w-full cursor-pointer items-center justify-between rounded-xl border px-3 py-2.5 text-left transition",
                    active
                      ? "border-[rgba(var(--il-accent-rgb),0.55)] bg-[var(--il-elevated)]/70"
                      : "border-zinc-800 bg-[var(--il-canvas)]/70 hover:border-zinc-700",
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="h-5 w-5 rounded-md border border-zinc-700"
                      style={{ backgroundColor: palette.canvasHex }}
                    />
                    <div>
                      <p className="text-xs font-medium text-white">
                        {meta.label}
                      </p>
                      <p className="text-[10px] text-zinc-500">{meta.note}</p>
                    </div>
                  </div>
                  {active ? (
                    <Check className="h-3.5 w-3.5 text-[var(--il-accent)]" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <span className="block text-xs font-medium text-zinc-300">
            Glow Intensity
          </span>
          <div className="space-y-2">
            {GLOW_INTENSITIES.map((glow) => {
              const active = glowIntensity === glow;
              const meta = GLOW_LABELS[glow];
              return (
                <button
                  key={glow}
                  type="button"
                  onClick={() => onGlowIntensityChange(glow)}
                  className={cn(
                    "flex w-full cursor-pointer items-center justify-between rounded-xl border px-3 py-2.5 text-left transition",
                    active
                      ? "border-[rgba(var(--il-accent-rgb),0.55)] bg-[var(--il-elevated)]/70"
                      : "border-zinc-800 bg-[var(--il-canvas)]/70 hover:border-zinc-700",
                  )}
                >
                  <div>
                    <p className="text-xs font-medium text-white">
                      {meta.label}
                    </p>
                    <p className="text-[10px] text-zinc-500">{meta.note}</p>
                  </div>
                  {active ? (
                    <Check className="h-3.5 w-3.5 text-[var(--il-accent)]" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Card Style & Directory Layout */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <span className="block text-xs font-medium text-zinc-300">
            Card Style
          </span>
          <div className="space-y-2">
            {CARD_STYLES.map((style) => {
              const active = cardStyle === style;
              const meta = CARD_STYLE_LABELS[style];
              return (
                <button
                  key={style}
                  type="button"
                  onClick={() => onCardStyleChange(style)}
                  className={cn(
                    "flex w-full cursor-pointer items-center justify-between rounded-xl border px-3 py-2.5 text-left transition",
                    active
                      ? "border-[rgba(var(--il-accent-rgb),0.55)] bg-[var(--il-elevated)]/70"
                      : "border-zinc-800 bg-[var(--il-canvas)]/70 hover:border-zinc-700",
                  )}
                >
                  <div>
                    <p className="text-xs font-medium text-white">
                      {meta.label}
                    </p>
                    <p className="text-[10px] text-zinc-500">{meta.note}</p>
                  </div>
                  {active ? (
                    <Check className="h-3.5 w-3.5 text-[var(--il-accent)]" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <span className="block text-xs font-medium text-zinc-300">
            Public Directory Layout
          </span>
          <div className="space-y-2">
            {DIRECTORY_LAYOUTS.map((layout) => {
              const active = directoryLayout === layout;
              const meta = LAYOUT_LABELS[layout];
              return (
                <button
                  key={layout}
                  type="button"
                  onClick={() => onDirectoryLayoutChange(layout)}
                  className={cn(
                    "flex w-full cursor-pointer items-center justify-between rounded-xl border px-3 py-2.5 text-left transition",
                    active
                      ? "border-[rgba(var(--il-accent-rgb),0.55)] bg-[var(--il-elevated)]/70"
                      : "border-zinc-800 bg-[var(--il-canvas)]/70 hover:border-zinc-700",
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-[var(--il-accent)]">{meta.icon}</span>
                    <div>
                      <p className="text-xs font-medium text-white">
                        {meta.label}
                      </p>
                      <p className="text-[10px] text-zinc-500">{meta.note}</p>
                    </div>
                  </div>
                  {active ? (
                    <Check className="h-3.5 w-3.5 text-[var(--il-accent)]" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
