import { z } from "zod";

export const THEME_PRESET_IDS = [
  "obsidian-emerald",
  "midnight-cyan",
  "cosmic-violet",
  "solar-amber",
  "crimson-oxide",
  "arctic-mono",
] as const;

export type ThemePresetId = (typeof THEME_PRESET_IDS)[number];

export interface ThemePresetDefinition {
  id: ThemePresetId;
  label: string;
  description: string;
  accentHex: string;
  accentTextHex: string;
}

export const THEME_PRESETS: Record<ThemePresetId, ThemePresetDefinition> = {
  "obsidian-emerald": {
    id: "obsidian-emerald",
    label: "Obsidian Emerald",
    description: "Signature precision emerald over deep obsidian.",
    accentHex: "#10b981",
    accentTextHex: "#052e16",
  },
  "midnight-cyan": {
    id: "midnight-cyan",
    label: "Midnight Cyan",
    description: "Electric cyan glow engineered for technical portfolios.",
    accentHex: "#06b6d4",
    accentTextHex: "#083344",
  },
  "cosmic-violet": {
    id: "cosmic-violet",
    label: "Cosmic Violet",
    description: "Rich ultraviolet accent with high-contrast white type.",
    accentHex: "#8b5cf6",
    accentTextHex: "#fafafa",
  },
  "solar-amber": {
    id: "solar-amber",
    label: "Solar Amber",
    description: "Warm golden amber highlight with crisp dark contrast.",
    accentHex: "#f59e0b",
    accentTextHex: "#09090b",
  },
  "crimson-oxide": {
    id: "crimson-oxide",
    label: "Crimson Oxide",
    description: "Bold crimson rose accent over matte charcoal.",
    accentHex: "#f43f5e",
    accentTextHex: "#fafafa",
  },
  "arctic-mono": {
    id: "arctic-mono",
    label: "Arctic Mono",
    description: "Minimalist monochrome zinc-white precision.",
    accentHex: "#f4f4f5",
    accentTextHex: "#09090b",
  },
};

export const THEME_PRESET_LIST: ThemePresetDefinition[] = THEME_PRESET_IDS.map(
  (id) => THEME_PRESETS[id],
);

export const SURFACE_TONES = ["obsidian", "graphite", "midnight"] as const;
export type SurfaceTone = (typeof SURFACE_TONES)[number];

export const SURFACE_PALETTES: Record<
  SurfaceTone,
  { canvasHex: string; cardHex: string; elevatedHex: string }
> = {
  obsidian: {
    canvasHex: "#09090b",
    cardHex: "#18181b",
    elevatedHex: "#27272a",
  },
  graphite: {
    canvasHex: "#0d0d12",
    cardHex: "#16161f",
    elevatedHex: "#232331",
  },
  midnight: {
    canvasHex: "#070a12",
    cardHex: "#0f1626",
    elevatedHex: "#1b253b",
  },
};

export const GLOW_INTENSITIES = ["none", "subtle", "vibrant"] as const;
export type GlowIntensity = (typeof GLOW_INTENSITIES)[number];

export const GLOW_ALPHA_MAP: Record<GlowIntensity, number> = {
  none: 0,
  subtle: 0.14,
  vibrant: 0.26,
};

export const CARD_STYLES = ["glass", "bordered", "minimal"] as const;
export type CardStyle = (typeof CARD_STYLES)[number];

export const DIRECTORY_LAYOUTS = ["bento", "grid", "list"] as const;
export type DirectoryLayout = (typeof DIRECTORY_LAYOUTS)[number];

export const STATUS_COLORS = [
  "emerald",
  "cyan",
  "amber",
  "rose",
  "violet",
  "zinc",
] as const;
export type StatusColor = (typeof STATUS_COLORS)[number];

export const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

export const HexColorSchema = z
  .string()
  .trim()
  .regex(HEX_COLOR_REGEX, "Must be a 6-digit HEX color (e.g. #10b981)")
  .transform((val) => val.toLowerCase());

export const ThemePresetSelectionSchema = z.enum([
  ...THEME_PRESET_IDS,
  "custom",
]);
export type ThemePresetSelection = z.infer<typeof ThemePresetSelectionSchema>;

export const SurfaceToneSchema = z.enum(SURFACE_TONES);
export const GlowIntensitySchema = z.enum(GLOW_INTENSITIES);
export const CardStyleSchema = z.enum(CARD_STYLES);
export const DirectoryLayoutSchema = z.enum(DIRECTORY_LAYOUTS);
export const StatusColorSchema = z.enum(STATUS_COLORS);

export const LinkThemeOverrideSchema = z.object({
  preset: ThemePresetSelectionSchema.optional(),
  accentHex: HexColorSchema.optional().nullable(),
  surfaceTone: SurfaceToneSchema.optional(),
  glowIntensity: GlowIntensitySchema.optional(),
});

export interface LinkThemeOverride {
  preset?: ThemePresetId | "custom";
  accentHex?: string | null;
  surfaceTone?: SurfaceTone;
  glowIntensity?: GlowIntensity;
}

export interface ThemeSettingsInput {
  themePreset?: string | null;
  customAccentHex?: string | null;
  surfaceTone?: string | null;
  glowIntensity?: string | null;
  cardStyle?: string | null;
}

export interface ResolvedThemeTokens {
  accentHex: string;
  accentRgb: string;
  accentTextHex: string;
  accentHoverHex: string;
  accentMutedHex: string;
  canvasHex: string;
  cardHex: string;
  elevatedHex: string;
  glowAlpha: number;
  cardStyle: CardStyle;
}

export function isValidHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_COLOR_REGEX.test(value.trim());
}

export function isThemePresetId(value: unknown): value is ThemePresetId {
  return (
    typeof value === "string" &&
    (THEME_PRESET_IDS as readonly string[]).includes(value)
  );
}

export function isSurfaceTone(value: unknown): value is SurfaceTone {
  return (
    typeof value === "string" &&
    (SURFACE_TONES as readonly string[]).includes(value)
  );
}

export function isGlowIntensity(value: unknown): value is GlowIntensity {
  return (
    typeof value === "string" &&
    (GLOW_INTENSITIES as readonly string[]).includes(value)
  );
}

export function isCardStyle(value: unknown): value is CardStyle {
  return (
    typeof value === "string" &&
    (CARD_STYLES as readonly string[]).includes(value)
  );
}

export function isDirectoryLayout(value: unknown): value is DirectoryLayout {
  return (
    typeof value === "string" &&
    (DIRECTORY_LAYOUTS as readonly string[]).includes(value)
  );
}

function hexToRgbTuple(hex: string): [number, number, number] {
  const clean = hex.replace(/^#/, "");
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return [16, 185, 129];
  }
  return [r, g, b];
}

function rgbTupleToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    "#" +
    [clamp(r), clamp(g), clamp(b)]
      .map((c) => c.toString(16).padStart(2, "0"))
      .join("")
  );
}

function mixWithWhite(hex: string, weightWhite: number): string {
  const [r, g, b] = hexToRgbTuple(hex);
  const w = Math.max(0, Math.min(1, weightWhite));
  return rgbTupleToHex(r + (255 - r) * w, g + (255 - g) * w, b + (255 - b) * w);
}

function computeRelativeLuminance(r: number, g: number, b: number): number {
  const toLinear = (channel: number): number => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function computePrimaryButtonTextHex(accentHex: string): string {
  const normalized = accentHex.toLowerCase();
  for (const preset of THEME_PRESET_LIST) {
    if (preset.accentHex.toLowerCase() === normalized) {
      return preset.accentTextHex;
    }
  }
  const [r, g, b] = hexToRgbTuple(normalized);
  const luminance = computeRelativeLuminance(r, g, b);
  return luminance >= 0.3 ? "#09090b" : "#fafafa";
}

function resolveAccentHex(
  globalSettings?: ThemeSettingsInput | null,
  linkOverride?: LinkThemeOverride | null,
): string {
  if (linkOverride) {
    if (
      linkOverride.preset === "custom" &&
      isValidHexColor(linkOverride.accentHex)
    ) {
      return linkOverride.accentHex.trim().toLowerCase();
    }
    if (isThemePresetId(linkOverride.preset)) {
      return THEME_PRESETS[linkOverride.preset].accentHex;
    }
    if (isValidHexColor(linkOverride.accentHex)) {
      return linkOverride.accentHex.trim().toLowerCase();
    }
  }

  if (globalSettings) {
    if (
      globalSettings.themePreset === "custom" &&
      isValidHexColor(globalSettings.customAccentHex)
    ) {
      return globalSettings.customAccentHex.trim().toLowerCase();
    }
    if (isThemePresetId(globalSettings.themePreset)) {
      return THEME_PRESETS[globalSettings.themePreset].accentHex;
    }
    if (isValidHexColor(globalSettings.customAccentHex)) {
      return globalSettings.customAccentHex.trim().toLowerCase();
    }
  }

  return THEME_PRESETS["obsidian-emerald"].accentHex;
}

export function resolveThemeTokens(
  globalSettings?: ThemeSettingsInput | null,
  linkOverride?: LinkThemeOverride | null,
): ResolvedThemeTokens {
  const accentHex = resolveAccentHex(globalSettings, linkOverride);
  const [r, g, b] = hexToRgbTuple(accentHex);

  const surfaceTone: SurfaceTone = isSurfaceTone(linkOverride?.surfaceTone)
    ? linkOverride.surfaceTone
    : isSurfaceTone(globalSettings?.surfaceTone)
      ? globalSettings.surfaceTone
      : "obsidian";

  const glowIntensity: GlowIntensity = isGlowIntensity(
    linkOverride?.glowIntensity,
  )
    ? linkOverride.glowIntensity
    : isGlowIntensity(globalSettings?.glowIntensity)
      ? globalSettings.glowIntensity
      : "subtle";

  const cardStyle: CardStyle = isCardStyle(globalSettings?.cardStyle)
    ? globalSettings.cardStyle
    : "glass";

  const surface = SURFACE_PALETTES[surfaceTone];
  const accentTextHex = computePrimaryButtonTextHex(accentHex);
  const accentHoverHex = mixWithWhite(accentHex, 0.16);
  const accentMutedHex = mixWithWhite(accentHex, 0.45);

  return {
    accentHex,
    accentRgb: `${r}, ${g}, ${b}`,
    accentTextHex,
    accentHoverHex,
    accentMutedHex,
    canvasHex: surface.canvasHex,
    cardHex: surface.cardHex,
    elevatedHex: surface.elevatedHex,
    glowAlpha: GLOW_ALPHA_MAP[glowIntensity],
    cardStyle,
  };
}

export function themeTokensToCssVars(
  tokens: ResolvedThemeTokens,
): Record<string, string> {
  return {
    "--il-accent": tokens.accentHex,
    "--il-accent-rgb": tokens.accentRgb,
    "--il-accent-text": tokens.accentTextHex,
    "--il-accent-hover": tokens.accentHoverHex,
    "--il-accent-muted": tokens.accentMutedHex,
    "--il-canvas": tokens.canvasHex,
    "--il-card": tokens.cardHex,
    "--il-elevated": tokens.elevatedHex,
    "--il-glow-alpha": String(tokens.glowAlpha),
  };
}

export function themeTokensToInlineStyle(tokens: ResolvedThemeTokens): string {
  const vars = themeTokensToCssVars(tokens);
  return Object.entries(vars)
    .map(([key, val]) => `${key}:${val}`)
    .join(";");
}
