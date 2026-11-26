import { eq } from "drizzle-orm";
import { z } from "zod";

import {
  CardStyleSchema,
  DirectoryLayoutSchema,
  GlowIntensitySchema,
  HexColorSchema,
  isCardStyle,
  isDirectoryLayout,
  isGlowIntensity,
  isSurfaceTone,
  isThemePresetId,
  isValidHexColor,
  resolveThemeTokens,
  STATUS_COLORS,
  StatusColorSchema,
  SurfaceToneSchema,
  ThemePresetSelectionSchema,
  type StatusColor,
  type ThemePresetId,
} from "@/lib/themes";
import type { SiteSettingsDTO, SocialLinkItem } from "@/lib/types/link-dto";
import { siteSettings, type SiteSettings } from "../db/schema";
import type { AppDatabase } from "./link.service";

export const DEFAULT_SETTINGS_ID = "default" as const;

const SafeHrefOrPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine((val) => {
    if (val.startsWith("/") && !val.startsWith("//")) return true;
    try {
      const parsed = new URL(val);
      return (
        parsed.protocol === "http:" ||
        parsed.protocol === "https:" ||
        parsed.protocol === "mailto:"
      );
    } catch {
      return false;
    }
  }, "Must be a valid relative path (/...) or http(s)/mailto URL");

export const SocialLinkItemSchema = z.object({
  id: z.string().trim().min(1).max(32),
  platform: z.string().trim().min(1).max(32),
  label: z.string().trim().min(1).max(64),
  url: SafeHrefOrPathSchema,
  icon: z.string().trim().max(32).optional(),
});

const SocialLinksArraySchema = z.array(SocialLinkItemSchema);

export const UpdateSiteSettingsSchema = z.object({
  displayName: z.string().trim().min(1, "Display name is required").max(80),
  headline: z.string().trim().min(1, "Headline is required").max(120),
  bio: z.string().trim().max(400),
  avatarUrl: SafeHrefOrPathSchema,
  statusText: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().trim().max(80).nullable(),
  ),
  statusColor: StatusColorSchema,
  statusHref: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    SafeHrefOrPathSchema.nullable(),
  ),
  themePreset: ThemePresetSelectionSchema,
  customAccentHex: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    HexColorSchema.nullable(),
  ),
  surfaceTone: SurfaceToneSchema,
  glowIntensity: GlowIntensitySchema,
  cardStyle: CardStyleSchema,
  directoryLayout: DirectoryLayoutSchema,
  socialLinks: z.array(SocialLinkItemSchema).max(12),
});

export class SettingsServiceError extends Error {
  readonly code: "VALIDATION_ERROR";
  readonly details?: Record<string, string[]>;

  constructor(message: string, details?: Record<string, string[]>) {
    super(message);
    this.name = "SettingsServiceError";
    this.code = "VALIDATION_ERROR";
    this.details = details;
  }
}

function isStatusColor(value: unknown): value is StatusColor {
  return (
    typeof value === "string" &&
    (STATUS_COLORS as readonly string[]).includes(value)
  );
}

function parseSocialLinks(
  rawJson: string | null | undefined,
): SocialLinkItem[] {
  if (!rawJson) return [];
  try {
    const parsed = SocialLinksArraySchema.safeParse(JSON.parse(rawJson));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function buildDefaultSiteSettings(
  now: Date = new Date(),
): SiteSettingsDTO {
  const base = {
    id: DEFAULT_SETTINGS_ID,
    displayName: "Cristian Arando",
    headline: "Links & Projects",
    bio: "Curated directory of full-stack projects, interactive micro-landings, open-source repositories, and verified social profiles.",
    avatarUrl: "/brand/author-avatar.png",
    statusText: null,
    statusColor: "emerald" as const,
    statusHref: null,
    themePreset: "obsidian-emerald" as const,
    customAccentHex: null,
    surfaceTone: "obsidian" as const,
    glowIntensity: "subtle" as const,
    cardStyle: "glass" as const,
    directoryLayout: "bento" as const,
    socialLinks: [] as SocialLinkItem[],
    updatedAt: now.toISOString(),
  };

  return {
    ...base,
    resolvedTheme: resolveThemeTokens(base),
  };
}

export function toSiteSettingsDTO(row: SiteSettings): SiteSettingsDTO {
  const themePreset: ThemePresetId | "custom" =
    row.themePreset === "custom"
      ? "custom"
      : isThemePresetId(row.themePreset)
        ? row.themePreset
        : "obsidian-emerald";

  const customAccentHex = isValidHexColor(row.customAccentHex)
    ? row.customAccentHex.trim().toLowerCase()
    : null;

  const surfaceTone = isSurfaceTone(row.surfaceTone)
    ? row.surfaceTone
    : "obsidian";
  const glowIntensity = isGlowIntensity(row.glowIntensity)
    ? row.glowIntensity
    : "subtle";
  const cardStyle = isCardStyle(row.cardStyle) ? row.cardStyle : "glass";
  const directoryLayout = isDirectoryLayout(row.directoryLayout)
    ? row.directoryLayout
    : "bento";
  const statusColor = isStatusColor(row.statusColor)
    ? row.statusColor
    : "emerald";

  const resolvedTheme = resolveThemeTokens({
    themePreset,
    customAccentHex,
    surfaceTone,
    glowIntensity,
    cardStyle,
  });

  return {
    id: DEFAULT_SETTINGS_ID,
    displayName: row.displayName,
    headline: row.headline,
    bio: row.bio,
    avatarUrl: row.avatarUrl,
    statusText: row.statusText || null,
    statusColor,
    statusHref: row.statusHref || null,
    themePreset,
    customAccentHex,
    surfaceTone,
    glowIntensity,
    cardStyle,
    directoryLayout,
    socialLinks: parseSocialLinks(row.socialLinksJson),
    resolvedTheme,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function zodErrorToDetails(error: z.ZodError): Record<string, string[]> {
  const flat = error.flatten();
  const details: Record<string, string[]> = {};
  for (const [key, msgs] of Object.entries(flat.fieldErrors)) {
    if (Array.isArray(msgs) && msgs.length > 0) details[key] = msgs;
  }
  if (flat.formErrors.length > 0) details["_form"] = flat.formErrors;
  return details;
}

export function createSettingsService(db: AppDatabase) {
  async function getSiteSettings(): Promise<SiteSettingsDTO> {
    try {
      const rows = await db
        .select()
        .from(siteSettings)
        .where(eq(siteSettings.id, DEFAULT_SETTINGS_ID))
        .limit(1);
      const row = rows[0];
      return row ? toSiteSettingsDTO(row) : buildDefaultSiteSettings();
    } catch {
      return buildDefaultSiteSettings();
    }
  }

  async function updateSiteSettings(
    rawPatch: unknown,
  ): Promise<SiteSettingsDTO> {
    if (
      typeof rawPatch !== "object" ||
      rawPatch === null ||
      Array.isArray(rawPatch)
    ) {
      throw new SettingsServiceError("Request body must be a JSON object");
    }

    const parsed = UpdateSiteSettingsSchema.partial().safeParse(rawPatch);
    if (!parsed.success) {
      throw new SettingsServiceError(
        "Invalid site settings payload",
        zodErrorToDetails(parsed.error),
      );
    }

    const current = await getSiteSettings();
    const patch = parsed.data;
    const finalPreset = patch.themePreset ?? current.themePreset;
    const finalCustomHex =
      patch.customAccentHex !== undefined
        ? patch.customAccentHex
        : current.customAccentHex;

    if (finalPreset === "custom" && !finalCustomHex) {
      throw new SettingsServiceError(
        "Custom theme preset requires a valid 6-digit accent HEX color",
        {
          customAccentHex: [
            "Enter a 6-digit HEX color (e.g. #10b981) for custom theme mode.",
          ],
        },
      );
    }

    const now = new Date();
    const nextValues = {
      id: DEFAULT_SETTINGS_ID,
      displayName: patch.displayName ?? current.displayName,
      headline: patch.headline ?? current.headline,
      bio: patch.bio ?? current.bio,
      avatarUrl: patch.avatarUrl ?? current.avatarUrl,
      statusText:
        patch.statusText !== undefined ? patch.statusText : current.statusText,
      statusColor: patch.statusColor ?? current.statusColor,
      statusHref:
        patch.statusHref !== undefined ? patch.statusHref : current.statusHref,
      themePreset: finalPreset,
      customAccentHex: finalCustomHex,
      surfaceTone: patch.surfaceTone ?? current.surfaceTone,
      glowIntensity: patch.glowIntensity ?? current.glowIntensity,
      cardStyle: patch.cardStyle ?? current.cardStyle,
      directoryLayout: patch.directoryLayout ?? current.directoryLayout,
      socialLinksJson: JSON.stringify(
        patch.socialLinks !== undefined
          ? patch.socialLinks
          : current.socialLinks,
      ),
      updatedAt: now,
    };

    await db
      .insert(siteSettings)
      .values(nextValues)
      .onConflictDoUpdate({
        target: siteSettings.id,
        set: {
          displayName: nextValues.displayName,
          headline: nextValues.headline,
          bio: nextValues.bio,
          avatarUrl: nextValues.avatarUrl,
          statusText: nextValues.statusText,
          statusColor: nextValues.statusColor,
          statusHref: nextValues.statusHref,
          themePreset: nextValues.themePreset,
          customAccentHex: nextValues.customAccentHex,
          surfaceTone: nextValues.surfaceTone,
          glowIntensity: nextValues.glowIntensity,
          cardStyle: nextValues.cardStyle,
          directoryLayout: nextValues.directoryLayout,
          socialLinksJson: nextValues.socialLinksJson,
          updatedAt: nextValues.updatedAt,
        },
      });

    const rows = await db
      .select()
      .from(siteSettings)
      .where(eq(siteSettings.id, DEFAULT_SETTINGS_ID))
      .limit(1);
    return rows[0] ? toSiteSettingsDTO(rows[0]) : buildDefaultSiteSettings(now);
  }

  return {
    getSiteSettings,
    updateSiteSettings,
  };
}

export type SettingsService = ReturnType<typeof createSettingsService>;
