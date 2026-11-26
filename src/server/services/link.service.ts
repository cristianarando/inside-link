import { randomInt } from "node:crypto";
import { and, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { monotonicFactory } from "ulidx";
import { z } from "zod";

import { decodeLinkCursor, encodeLinkCursor } from "@/lib/cursor";
import { RoutingRuleSchema, type RoutingRule } from "@/lib/smart-routing";
import { LinkThemeOverrideSchema, type LinkThemeOverride } from "@/lib/themes";
import type {
  BackupConflictStrategy,
  BackupSlugPreviewItem,
  BulkActionResult,
  ImportLinksBackupResult,
  LinkBackupItem,
  LinkCategory,
  LinkDTO,
  LinkHealthStatus,
  LinksBackupPayload,
  LinkStatusFilter,
  PaginatedResult,
  PublicLinkDTO,
  SlugAvailability,
} from "@/lib/types/link-dto";
import {
  BaseLinkSchema,
  CreateLinkSchema,
  HubLinkItemSchema,
  LinkCategorySchema,
  type HubLinkItem,
} from "@/lib/validations/link.schema";
import { classifySlug } from "@/lib/validations/slug.schema";
import { hashPin } from "../crypto/pin";
import * as schema from "../db/schema";
import { clickEvents, links, type Link, type NewLink } from "../db/schema";

export type AppDatabase = LibSQLDatabase<typeof schema>;

// ---------------------------------------------------------------------------
// Domain Errors
// ---------------------------------------------------------------------------

export type LinkServiceErrorCode =
  | "NOT_FOUND"
  | "SLUG_RESERVED"
  | "SLUG_ALREADY_EXISTS"
  | "VALIDATION_ERROR"
  | "SLUG_GENERATION_FAILED";

export class LinkServiceError extends Error {
  readonly code: LinkServiceErrorCode;
  readonly details?: Record<string, string[]>;

  constructor(
    code: LinkServiceErrorCode,
    message: string,
    details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "LinkServiceError";
    this.code = code;
    this.details = details;
  }
}

/** Canonical mapping from domain error codes to HTTP status codes for Route Handlers. */
export function httpStatusForLinkError(code: LinkServiceErrorCode): number {
  switch (code) {
    case "NOT_FOUND":
      return 404;
    case "SLUG_RESERVED":
      return 422;
    case "SLUG_ALREADY_EXISTS":
      return 409;
    case "VALIDATION_ERROR":
      return 400;
    case "SLUG_GENERATION_FAILED":
      return 500;
  }
}

// ---------------------------------------------------------------------------
// Internal Constants & Utilities
// ---------------------------------------------------------------------------

export const DEFAULT_PAGE_SIZE = 12;
export const MAX_PAGE_SIZE = 50;
const MAX_SEARCH_LENGTH = 100;
const RANDOM_SLUG_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const RANDOM_SLUG_MAX_ATTEMPTS = 10;

const LinkStatusFilterSchema = z.enum([
  "all",
  "active",
  "inactive",
  "expired",
  "pinned",
]);
const TagsSchema = z.array(z.string());
const HubLinksSchema = z.array(HubLinkItemSchema);
const RoutingRulesArraySchema = z.array(RoutingRuleSchema);
const LinkHealthStatusSchema = z.enum([
  "healthy",
  "redirect",
  "broken",
  "timeout",
]);

export const BulkLinkActionSchema = z
  .object({
    ids: z
      .array(z.string().trim().min(1))
      .min(1, "At least one link ID is required")
      .max(100, "Cannot process more than 100 links at once"),
    action: z.enum([
      "activate",
      "pause",
      "makePublic",
      "makePrivate",
      "setCategory",
      "delete",
    ]),
    category: LinkCategorySchema.optional(),
  })
  .superRefine((val, ctx) => {
    if (val.action === "setCategory" && !val.category) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["category"],
        message: "Category is required when action is setCategory",
      });
    }
  });

const ImportBackupPayloadSchema = z.object({
  links: z
    .array(z.record(z.unknown()))
    .min(1, "Backup must contain at least one link")
    .max(500, "Backup import is capped at 500 links per request"),
  conflictStrategy: z.enum(["skip", "update"]).default("skip"),
  dryRun: z.boolean().default(false),
});

/** Monotonic ULID generator: guarantees strict lexicographic ordering within the same millisecond. */
const nextId = monotonicFactory();

function canonicalBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_CANONICAL_URL || "https://links.cristianarando.dev"
  ).replace(/\/+$/, "");
}

function zodDetails(error: z.ZodError): Record<string, string[]> {
  const flat = error.flatten();
  const details: Record<string, string[]> = {};
  for (const [key, messages] of Object.entries(flat.fieldErrors)) {
    if (Array.isArray(messages) && messages.length > 0) details[key] = messages;
  }
  if (flat.formErrors.length > 0) details["_form"] = flat.formErrors;
  return details;
}

function asRecord(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new LinkServiceError(
      "VALIDATION_ERROR",
      "Request body must be a JSON object",
    );
  }
  return input as Record<string, unknown>;
}

function safeJsonArray<T>(
  raw: string | null,
  parser: z.ZodType<T[], z.ZodTypeDef, unknown>,
): T[] | null {
  if (!raw) return null;
  try {
    const result = parser.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function safeParseTheme(raw: string | null): LinkThemeOverride | null {
  if (!raw) return null;
  try {
    const parsed = LinkThemeOverrideSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    const data = parsed.data;
    if (
      !data.preset &&
      !data.accentHex &&
      !data.surfaceTone &&
      !data.glowIntensity
    ) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function safeParseHealthStatus(raw: string | null): LinkHealthStatus | null {
  if (!raw) return null;
  const parsed = LinkHealthStatusSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function toCategory(value: string): LinkCategory {
  const parsed = LinkCategorySchema.safeParse(value);
  return parsed.success ? parsed.data : "project";
}

function isUniqueSlugViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; current && depth < 5; depth++) {
    if (
      current instanceof Error &&
      /UNIQUE constraint failed: links\.slug/i.test(current.message)
    ) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export function isLinkExpired(
  row: Pick<Link, "expiresAt" | "maxClicks" | "clicksCount">,
  now: Date = new Date(),
): boolean {
  if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) return true;
  if (row.maxClicks !== null && row.clicksCount >= row.maxClicks) return true;
  return false;
}

export function isLinkScheduled(
  row: Pick<Link, "startsAt">,
  now: Date = new Date(),
): boolean {
  return Boolean(row.startsAt && row.startsAt.getTime() > now.getTime());
}

// ---------------------------------------------------------------------------
// Row -> DTO Mappers (never expose `password_hash`)
// ---------------------------------------------------------------------------

export function toLinkDTO(row: Link, now: Date = new Date()): LinkDTO {
  return {
    id: row.id,
    slug: row.slug,
    shortUrl: `${canonicalBaseUrl()}/${row.slug}`,
    type: row.type,
    destinationUrl: row.destinationUrl,
    redirectStatus: row.redirectStatus,
    forwardQueryParams: row.forwardQueryParams,
    hubLinks: safeJsonArray<HubLinkItem>(row.hubLinksJson, HubLinksSchema),
    title: row.title,
    description: row.description,
    ogImageUrl: row.ogImageUrl,
    ogMode: row.ogMode,
    category: toCategory(row.category),
    tags: safeJsonArray<string>(row.tagsJson, TagsSchema) ?? [],
    icon: row.icon,
    isActive: row.isActive,
    isPublic: row.isPublic,
    isPinned: row.isPinned,
    hasPin: row.passwordHash !== null,
    isScheduled: isLinkScheduled(row, now),
    startsAt: row.startsAt ? row.startsAt.toISOString() : null,
    isExpired: isLinkExpired(row, now),
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    expiredRedirectUrl: row.expiredRedirectUrl ?? null,
    maxClicks: row.maxClicks,
    clicksCount: row.clicksCount,
    isCloaked: row.isCloaked,
    theme: safeParseTheme(row.themeJson),
    routingRules:
      safeJsonArray<RoutingRule>(
        row.routingRulesJson,
        RoutingRulesArraySchema,
      ) ?? [],
    healthStatus: safeParseHealthStatus(row.healthStatus),
    healthStatusCode: row.healthStatusCode ?? null,
    healthLatencyMs: row.healthLatencyMs ?? null,
    healthCheckedAt: row.healthCheckedAt
      ? row.healthCheckedAt.toISOString()
      : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toPublicLinkDTO(
  row: Link,
  now: Date = new Date(),
): PublicLinkDTO {
  return {
    id: row.id,
    slug: row.slug,
    shortUrl: `${canonicalBaseUrl()}/${row.slug}`,
    type: row.type,
    title: row.title,
    description: row.description,
    category: toCategory(row.category),
    tags: safeJsonArray<string>(row.tagsJson, TagsSchema) ?? [],
    icon: row.icon,
    isPinned: row.isPinned,
    hasPin: row.passwordHash !== null,
    isScheduled: isLinkScheduled(row, now),
    startsAt: row.startsAt ? row.startsAt.toISOString() : null,
    theme: safeParseTheme(row.themeJson),
  };
}

function toLinkBackupItem(row: Link): LinkBackupItem {
  return {
    slug: row.slug,
    type: row.type,
    destinationUrl: row.destinationUrl,
    redirectStatus: row.redirectStatus,
    forwardQueryParams: row.forwardQueryParams,
    hubLinks: safeJsonArray<HubLinkItem>(row.hubLinksJson, HubLinksSchema),
    title: row.title,
    description: row.description,
    ogImageUrl: row.ogImageUrl,
    ogMode: row.ogMode,
    category: toCategory(row.category),
    tags: safeJsonArray<string>(row.tagsJson, TagsSchema) ?? [],
    icon: row.icon,
    isActive: row.isActive,
    isPublic: row.isPublic,
    isPinned: row.isPinned,
    hasPin: row.passwordHash !== null,
    startsAt: row.startsAt ? row.startsAt.toISOString() : null,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    expiredRedirectUrl: row.expiredRedirectUrl ?? null,
    maxClicks: row.maxClicks,
    isCloaked: row.isCloaked,
    theme: safeParseTheme(row.themeJson),
    routingRules:
      safeJsonArray<RoutingRule>(
        row.routingRulesJson,
        RoutingRulesArraySchema,
      ) ?? [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Reusable SQL Fragments
// ---------------------------------------------------------------------------

function notExpiredSql(nowMs: number): SQL {
  return sql`((${links.expiresAt} IS NULL OR ${links.expiresAt} > ${nowMs}) AND (${links.maxClicks} IS NULL OR ${links.clicksCount} < ${links.maxClicks}))`;
}

function expiredSql(nowMs: number): SQL {
  return sql`((${links.expiresAt} IS NOT NULL AND ${links.expiresAt} <= ${nowMs}) OR (${links.maxClicks} IS NOT NULL AND ${links.clicksCount} >= ${links.maxClicks}))`;
}

function searchSql(term: string): SQL {
  // Escape SQLite LIKE wildcards so searches match literal characters safely.
  const escaped = term.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  const pattern = `%${escaped}%`;
  return sql`(${links.slug} LIKE ${pattern} ESCAPE '\\' OR ${links.title} LIKE ${pattern} ESCAPE '\\' OR ${links.description} LIKE ${pattern} ESCAPE '\\' OR ${links.destinationUrl} LIKE ${pattern} ESCAPE '\\')`;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface ListLinksParams {
  cursor?: string | null;
  limit?: number | string | null;
  q?: string | null;
  category?: string | null;
  status?: string | null;
  now?: Date;
}

export interface LinkFlagsPatch {
  isActive?: boolean;
  isPinned?: boolean;
  isPublic?: boolean;
}

export interface LinkHealthPatch {
  status: LinkHealthStatus;
  statusCode: number | null;
  latencyMs: number;
  checkedAt?: Date | string;
}

function validateOgMode(mode: Link["ogMode"], imageUrl: string | null): void {
  if (mode === "custom" && !imageUrl) {
    throw new LinkServiceError(
      "VALIDATION_ERROR",
      "Custom OG mode requires an image URL",
      {
        ogImageUrl: ["Enter an image URL for custom mode."],
      },
    );
  }
}

export function createLinkService(db: AppDatabase) {
  async function findRowById(id: string): Promise<Link | null> {
    const rows = await db.select().from(links).where(eq(links.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async function findRowBySlug(slug: string): Promise<Link | null> {
    const rows = await db
      .select()
      .from(links)
      .where(eq(links.slug, slug))
      .limit(1);
    return rows[0] ?? null;
  }

  /** Validates a raw slug and returns its normalized form, or throws a domain error. */
  function assertValidSlug(raw: string): string {
    const result = classifySlug(raw);
    if (!result.ok) {
      throw new LinkServiceError(
        result.reason === "RESERVED" ? "SLUG_RESERVED" : "VALIDATION_ERROR",
        result.message,
        { slug: [result.message] },
      );
    }
    return result.normalized;
  }

  async function assertSlugFree(
    slug: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await findRowBySlug(slug);
    if (existing && existing.id !== excludeId) {
      throw new LinkServiceError(
        "SLUG_ALREADY_EXISTS",
        `Slug "${slug}" is already in use`,
        {
          slug: [`Slug "${slug}" is already in use`],
        },
      );
    }
  }

  async function checkSlugAvailability(
    rawSlug: string,
    excludeId?: string,
  ): Promise<SlugAvailability> {
    const result = classifySlug(rawSlug);
    if (!result.ok) {
      return {
        available: false,
        normalizedSlug: result.normalized,
        reason: result.reason,
        message: result.message,
      };
    }

    const existing = await findRowBySlug(result.normalized);
    if (existing && existing.id !== excludeId) {
      return {
        available: false,
        normalizedSlug: result.normalized,
        reason: "TAKEN",
        message: `Slug "${result.normalized}" is already in use`,
      };
    }

    return { available: true, normalizedSlug: result.normalized };
  }

  async function generateUniqueRandomSlug(length = 6): Promise<string> {
    const size = Math.min(Math.max(Math.trunc(length), 4), 32);
    for (let attempt = 0; attempt < RANDOM_SLUG_MAX_ATTEMPTS; attempt++) {
      let candidate = "";
      for (let i = 0; i < size; i++) {
        candidate += RANDOM_SLUG_ALPHABET.charAt(
          randomInt(RANDOM_SLUG_ALPHABET.length),
        );
      }
      if (!classifySlug(candidate).ok) continue;
      if (!(await findRowBySlug(candidate))) return candidate;
    }
    throw new LinkServiceError(
      "SLUG_GENERATION_FAILED",
      "Failed to generate a unique random slug after multiple attempts",
    );
  }

  async function getLinkById(id: string): Promise<LinkDTO | null> {
    const row = await findRowById(id);
    return row ? toLinkDTO(row) : null;
  }

  async function createLink(rawInput: unknown): Promise<LinkDTO> {
    const input = asRecord(rawInput);
    const rawSlug = typeof input.slug === "string" ? input.slug.trim() : "";

    let slug: string | null = null;
    if (rawSlug.length > 0) {
      slug = assertValidSlug(rawSlug);
      await assertSlugFree(slug);
    }

    const parsed = CreateLinkSchema.safeParse({
      ...input,
      slug:
        slug ??
        (input.slug == null || input.slug === "" ? undefined : input.slug),
    });
    if (!parsed.success) {
      throw new LinkServiceError(
        "VALIDATION_ERROR",
        "Invalid link data",
        zodDetails(parsed.error),
      );
    }
    const data = parsed.data;
    const ogMode = data.ogMode ?? (data.ogImageUrl ? "custom" : "auto");
    validateOgMode(ogMode, data.ogImageUrl ?? null);
    const finalSlug = slug ?? (await generateUniqueRandomSlug());
    const now = new Date();
    const id = nextId();

    const values: NewLink = {
      id,
      slug: finalSlug,
      type: data.type,
      destinationUrl:
        data.type === "DIRECT" ? (data.destinationUrl ?? null) : null,
      redirectStatus: data.redirectStatus,
      forwardQueryParams: data.forwardQueryParams,
      hubLinksJson:
        data.type === "HUB" && data.hubLinks
          ? JSON.stringify(data.hubLinks)
          : null,
      title: data.title.trim(),
      description: data.description?.trim() || null,
      ogImageUrl: data.ogImageUrl ?? null,
      ogMode,
      category: data.category,
      tagsJson: JSON.stringify(Array.from(new Set(data.tags))),
      icon: data.icon,
      isActive: data.isActive,
      isPublic: data.isPublic,
      isPinned: data.isPinned,
      passwordHash: data.pin ? hashPin(data.pin) : null,
      startsAt: data.startsAt ?? null,
      expiresAt: data.expiresAt ?? null,
      expiredRedirectUrl: data.expiredRedirectUrl ?? null,
      maxClicks: data.maxClicks ?? null,
      clicksCount: 0,
      isCloaked: data.type === "DIRECT" ? data.isCloaked : false,
      themeJson: data.theme ? JSON.stringify(data.theme) : null,
      routingRulesJson:
        data.type === "DIRECT" &&
        data.routingRules &&
        data.routingRules.length > 0
          ? JSON.stringify(data.routingRules)
          : null,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await db.insert(links).values(values);
    } catch (err) {
      // Race condition between pre-check and INSERT: the UNIQUE index is the final guard.
      if (isUniqueSlugViolation(err)) {
        throw new LinkServiceError(
          "SLUG_ALREADY_EXISTS",
          `Slug "${finalSlug}" is already in use`,
          {
            slug: [`Slug "${finalSlug}" is already in use`],
          },
        );
      }
      throw err;
    }

    const created = await findRowById(id);
    if (!created)
      throw new Error("Invariant violated: newly created link does not exist");
    return toLinkDTO(created);
  }

  async function updateLink(id: string, rawPatch: unknown): Promise<LinkDTO> {
    const existing = await findRowById(id);
    if (!existing) throw new LinkServiceError("NOT_FOUND", "Link not found");

    const patch = asRecord(rawPatch);

    let newSlug: string | undefined;
    if (patch.slug !== undefined) {
      if (typeof patch.slug !== "string" || patch.slug.trim().length === 0) {
        throw new LinkServiceError("VALIDATION_ERROR", "Slug cannot be empty", {
          slug: ["Slug cannot be empty"],
        });
      }
      newSlug = assertValidSlug(patch.slug);
      if (newSlug !== existing.slug) await assertSlugFree(newSlug, id);
    }

    // Slug was already validated above; validate remaining fields as a partial patch.
    const parsed = BaseLinkSchema.partial().safeParse({
      ...patch,
      slug: undefined,
    });
    if (!parsed.success) {
      throw new LinkServiceError(
        "VALIDATION_ERROR",
        "Invalid link data",
        zodDetails(parsed.error),
      );
    }
    const data = parsed.data;

    // Polymorphic invariant evaluated against the FINAL state (existing + patch).
    const finalType = data.type ?? existing.type;
    const finalDestination =
      data.destinationUrl !== undefined
        ? data.destinationUrl
        : existing.destinationUrl;
    const finalHubLinks =
      data.hubLinks !== undefined
        ? data.hubLinks
        : safeJsonArray(existing.hubLinksJson, HubLinksSchema);
    const finalStartsAt =
      data.startsAt !== undefined ? data.startsAt : existing.startsAt;
    const finalExpiresAt =
      data.expiresAt !== undefined ? data.expiresAt : existing.expiresAt;

    if (finalType === "DIRECT" && !finalDestination) {
      throw new LinkServiceError(
        "VALIDATION_ERROR",
        "Destination URL is required for DIRECT links",
        {
          destinationUrl: ["Destination URL is required for DIRECT links"],
        },
      );
    }
    if (finalType === "HUB" && (!finalHubLinks || finalHubLinks.length === 0)) {
      throw new LinkServiceError(
        "VALIDATION_ERROR",
        "HUB mode requires at least one sub-link",
        {
          hubLinks: ["HUB mode requires at least one sub-link"],
        },
      );
    }
    if (
      finalStartsAt &&
      finalExpiresAt &&
      finalStartsAt.getTime() >= finalExpiresAt.getTime()
    ) {
      throw new LinkServiceError(
        "VALIDATION_ERROR",
        "Expiration date must be after scheduled launch date",
        {
          expiresAt: ["Expiration date must be after scheduled launch date"],
        },
      );
    }

    const updates: Partial<NewLink> = { updatedAt: new Date() };
    if (newSlug !== undefined) updates.slug = newSlug;
    if (data.type !== undefined) updates.type = data.type;
    if (data.redirectStatus !== undefined)
      updates.redirectStatus = data.redirectStatus;
    if (data.forwardQueryParams !== undefined)
      updates.forwardQueryParams = data.forwardQueryParams;
    if (data.title !== undefined) updates.title = data.title.trim();
    if (data.description !== undefined)
      updates.description = data.description?.trim() || null;
    if (data.ogMode !== undefined || data.ogImageUrl !== undefined) {
      const imageUrl =
        data.ogImageUrl !== undefined ? data.ogImageUrl : existing.ogImageUrl;
      const inferredMode = imageUrl ? "custom" : "auto";
      const mode =
        data.ogMode ??
        (data.ogImageUrl !== undefined ? inferredMode : existing.ogMode);
      validateOgMode(mode, imageUrl);
      if (data.ogImageUrl !== undefined) updates.ogImageUrl = imageUrl;
      updates.ogMode = mode;
    }
    if (data.category !== undefined) updates.category = data.category;
    if (data.tags !== undefined)
      updates.tagsJson = JSON.stringify(Array.from(new Set(data.tags)));
    if (data.icon !== undefined) updates.icon = data.icon;
    if (data.isActive !== undefined) updates.isActive = data.isActive;
    if (data.isPublic !== undefined) updates.isPublic = data.isPublic;
    if (data.isPinned !== undefined) updates.isPinned = data.isPinned;
    if (data.startsAt !== undefined) updates.startsAt = data.startsAt;
    if (data.expiresAt !== undefined) updates.expiresAt = data.expiresAt;
    if (data.expiredRedirectUrl !== undefined)
      updates.expiredRedirectUrl = data.expiredRedirectUrl;
    if (data.maxClicks !== undefined) updates.maxClicks = data.maxClicks;
    if (data.theme !== undefined) {
      updates.themeJson = data.theme ? JSON.stringify(data.theme) : null;
    }
    // pin: string => set/rotate PIN; null => clear PIN protection; undefined => leave unchanged.
    if (data.pin !== undefined)
      updates.passwordHash = data.pin ? hashPin(data.pin) : null;

    // Keep row columns consistent with its resolved link type.
    if (finalType === "DIRECT") {
      updates.destinationUrl = finalDestination ?? null;
      updates.hubLinksJson = null;
      if (data.isCloaked !== undefined) {
        updates.isCloaked = data.isCloaked;
      }
      if (data.routingRules !== undefined) {
        updates.routingRulesJson =
          data.routingRules && data.routingRules.length > 0
            ? JSON.stringify(data.routingRules)
            : null;
      }
    } else {
      updates.destinationUrl = null;
      updates.hubLinksJson = JSON.stringify(finalHubLinks);
      updates.isCloaked = false;
      updates.routingRulesJson = null;
    }

    try {
      await db.update(links).set(updates).where(eq(links.id, id));
    } catch (err) {
      if (isUniqueSlugViolation(err)) {
        throw new LinkServiceError(
          "SLUG_ALREADY_EXISTS",
          `Slug "${newSlug}" is already in use`,
          {
            slug: [`Slug "${newSlug}" is already in use`],
          },
        );
      }
      throw err;
    }

    const updated = await findRowById(id);
    if (!updated) throw new LinkServiceError("NOT_FOUND", "Link not found");
    return toLinkDTO(updated);
  }

  async function toggleLinkFlags(
    id: string,
    flags: LinkFlagsPatch,
  ): Promise<LinkDTO> {
    const patch: LinkFlagsPatch = {};
    if (typeof flags.isActive === "boolean") patch.isActive = flags.isActive;
    if (typeof flags.isPinned === "boolean") patch.isPinned = flags.isPinned;
    if (typeof flags.isPublic === "boolean") patch.isPublic = flags.isPublic;
    return updateLink(id, patch);
  }

  async function updateLinkHealth(
    id: string,
    health: LinkHealthPatch,
  ): Promise<LinkDTO> {
    const existing = await findRowById(id);
    if (!existing) throw new LinkServiceError("NOT_FOUND", "Link not found");

    const checkedAt =
      health.checkedAt instanceof Date
        ? health.checkedAt
        : health.checkedAt
          ? new Date(health.checkedAt)
          : new Date();

    await db
      .update(links)
      .set({
        healthStatus: health.status,
        healthStatusCode: health.statusCode,
        healthLatencyMs: Math.max(0, Math.trunc(health.latencyMs)),
        healthCheckedAt: checkedAt,
      })
      .where(eq(links.id, id));

    const updated = await findRowById(id);
    if (!updated) throw new LinkServiceError("NOT_FOUND", "Link not found");
    return toLinkDTO(updated);
  }

  async function resetLinkClicks(id: string): Promise<LinkDTO> {
    const existing = await findRowById(id);
    if (!existing) throw new LinkServiceError("NOT_FOUND", "Link not found");

    await db.delete(clickEvents).where(eq(clickEvents.linkId, id));
    await db.update(links).set({ clicksCount: 0 }).where(eq(links.id, id));

    const updated = await findRowById(id);
    if (!updated) throw new LinkServiceError("NOT_FOUND", "Link not found");
    return toLinkDTO(updated);
  }

  async function bulkActionLinks(rawInput: unknown): Promise<BulkActionResult> {
    const record = asRecord(rawInput);
    const parsed = BulkLinkActionSchema.safeParse(record);
    if (!parsed.success) {
      throw new LinkServiceError(
        "VALIDATION_ERROR",
        "Invalid bulk action payload",
        zodDetails(parsed.error),
      );
    }

    const { action, category } = parsed.data;
    const uniqueIds = Array.from(new Set(parsed.data.ids));
    const now = new Date();

    if (action === "delete") {
      const res = await db.delete(links).where(inArray(links.id, uniqueIds));
      return {
        action,
        requestedCount: uniqueIds.length,
        affectedCount: res.rowsAffected ?? 0,
      };
    }

    const updates: Partial<NewLink> = { updatedAt: now };
    if (action === "activate") updates.isActive = true;
    else if (action === "pause") updates.isActive = false;
    else if (action === "makePublic") updates.isPublic = true;
    else if (action === "makePrivate") updates.isPublic = false;
    else if (action === "setCategory" && category) updates.category = category;

    const res = await db
      .update(links)
      .set(updates)
      .where(inArray(links.id, uniqueIds));

    return {
      action,
      requestedCount: uniqueIds.length,
      affectedCount: res.rowsAffected ?? 0,
    };
  }

  async function exportLinksBackup(): Promise<LinksBackupPayload> {
    const rows = await db
      .select()
      .from(links)
      .orderBy(desc(links.isPinned), desc(links.id));

    const items = rows.map(toLinkBackupItem);
    return {
      version: "2.0",
      exportedAt: new Date().toISOString(),
      count: items.length,
      links: items,
    };
  }

  async function importLinksBackup(
    rawInput: unknown,
  ): Promise<ImportLinksBackupResult> {
    const topRecord = asRecord(rawInput);

    // Support both direct `{ links: [...], conflictStrategy, dryRun }` and wrapped `{ data: { links: [...] } }`.
    const candidateLinks = Array.isArray(topRecord.links)
      ? topRecord.links
      : typeof topRecord.data === "object" &&
          topRecord.data !== null &&
          Array.isArray((topRecord.data as { links?: unknown }).links)
        ? (topRecord.data as { links: unknown[] }).links
        : topRecord.links;

    const parsedEnvelope = ImportBackupPayloadSchema.safeParse({
      links: candidateLinks,
      conflictStrategy: topRecord.conflictStrategy,
      dryRun: topRecord.dryRun,
    });

    if (!parsedEnvelope.success) {
      throw new LinkServiceError(
        "VALIDATION_ERROR",
        "Invalid backup import payload",
        zodDetails(parsedEnvelope.error),
      );
    }

    const {
      links: incomingRaw,
      conflictStrategy,
      dryRun,
    }: {
      links: Record<string, unknown>[];
      conflictStrategy: BackupConflictStrategy;
      dryRun: boolean;
    } = parsedEnvelope.data;

    const validatedEntries: Array<{
      slug: string;
      data: z.infer<typeof CreateLinkSchema>;
    }> = [];
    const seenIncomingSlugs = new Set<string>();

    for (let index = 0; index < incomingRaw.length; index++) {
      const rawEntry = incomingRaw[index]!;
      const rawSlug =
        typeof rawEntry.slug === "string" ? rawEntry.slug.trim() : "";
      if (!rawSlug) {
        throw new LinkServiceError(
          "VALIDATION_ERROR",
          `Backup item #${index + 1} is missing a slug`,
          { links: [`Item #${index + 1} is missing a valid slug`] },
        );
      }

      const normalizedSlug = assertValidSlug(rawSlug);
      if (seenIncomingSlugs.has(normalizedSlug)) {
        throw new LinkServiceError(
          "VALIDATION_ERROR",
          `Duplicate slug "${normalizedSlug}" inside backup payload`,
          { links: [`Duplicate slug "${normalizedSlug}" in backup file`] },
        );
      }
      seenIncomingSlugs.add(normalizedSlug);

      const itemParsed = CreateLinkSchema.safeParse({
        ...rawEntry,
        slug: normalizedSlug,
        // Never import raw password hashes or PINs from backup snapshots unless explicitly provided as `pin`.
        pin: typeof rawEntry.pin === "string" ? rawEntry.pin : undefined,
      });

      if (!itemParsed.success) {
        throw new LinkServiceError(
          "VALIDATION_ERROR",
          `Invalid link "${normalizedSlug}" at index ${index + 1}`,
          zodDetails(itemParsed.error),
        );
      }

      const ogMode =
        itemParsed.data.ogMode ??
        (itemParsed.data.ogImageUrl ? "custom" : "auto");
      validateOgMode(ogMode, itemParsed.data.ogImageUrl ?? null);

      validatedEntries.push({
        slug: normalizedSlug,
        data: {
          ...itemParsed.data,
          ogMode,
        },
      });
    }

    const existingRows = await db
      .select({ id: links.id, slug: links.slug })
      .from(links)
      .where(
        inArray(
          links.slug,
          validatedEntries.map((e) => e.slug),
        ),
      );
    const existingBySlug = new Map(existingRows.map((r) => [r.slug, r.id]));

    let toCreate = 0;
    let toUpdate = 0;
    let toSkip = 0;
    const slugsPreview: BackupSlugPreviewItem[] = [];

    for (const entry of validatedEntries) {
      const existingId = existingBySlug.get(entry.slug);
      if (!existingId) {
        toCreate++;
        slugsPreview.push({
          slug: entry.slug,
          title: entry.data.title,
          operation: "create",
        });
      } else if (conflictStrategy === "update") {
        toUpdate++;
        slugsPreview.push({
          slug: entry.slug,
          title: entry.data.title,
          operation: "update",
        });
      } else {
        toSkip++;
        slugsPreview.push({
          slug: entry.slug,
          title: entry.data.title,
          operation: "skip",
        });
      }
    }

    if (dryRun) {
      return {
        dryRun: true,
        totalIncoming: validatedEntries.length,
        toCreate,
        toUpdate,
        toSkip,
        created: 0,
        updated: 0,
        skipped: 0,
        slugsPreview,
      };
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const now = new Date();

    for (const entry of validatedEntries) {
      const existingId = existingBySlug.get(entry.slug);
      const item = entry.data;
      const ogMode = item.ogMode ?? (item.ogImageUrl ? "custom" : "auto");

      if (!existingId) {
        const values: NewLink = {
          id: nextId(),
          slug: entry.slug,
          type: item.type,
          destinationUrl:
            item.type === "DIRECT" ? (item.destinationUrl ?? null) : null,
          redirectStatus: item.redirectStatus,
          forwardQueryParams: item.forwardQueryParams,
          hubLinksJson:
            item.type === "HUB" && item.hubLinks
              ? JSON.stringify(item.hubLinks)
              : null,
          title: item.title.trim(),
          description: item.description?.trim() || null,
          ogImageUrl: item.ogImageUrl ?? null,
          ogMode,
          category: item.category,
          tagsJson: JSON.stringify(Array.from(new Set(item.tags))),
          icon: item.icon,
          isActive: item.isActive,
          isPublic: item.isPublic,
          isPinned: item.isPinned,
          passwordHash: item.pin ? hashPin(item.pin) : null,
          startsAt: item.startsAt ?? null,
          expiresAt: item.expiresAt ?? null,
          expiredRedirectUrl: item.expiredRedirectUrl ?? null,
          maxClicks: item.maxClicks ?? null,
          clicksCount: 0,
          isCloaked: item.type === "DIRECT" ? item.isCloaked : false,
          themeJson: item.theme ? JSON.stringify(item.theme) : null,
          routingRulesJson:
            item.type === "DIRECT" &&
            item.routingRules &&
            item.routingRules.length > 0
              ? JSON.stringify(item.routingRules)
              : null,
          createdAt: now,
          updatedAt: now,
        };
        await db.insert(links).values(values);
        created++;
      } else if (conflictStrategy === "update") {
        const updates: Partial<NewLink> = {
          type: item.type,
          destinationUrl:
            item.type === "DIRECT" ? (item.destinationUrl ?? null) : null,
          redirectStatus: item.redirectStatus,
          forwardQueryParams: item.forwardQueryParams,
          hubLinksJson:
            item.type === "HUB" && item.hubLinks
              ? JSON.stringify(item.hubLinks)
              : null,
          title: item.title.trim(),
          description: item.description?.trim() || null,
          ogImageUrl: item.ogImageUrl ?? null,
          ogMode,
          category: item.category,
          tagsJson: JSON.stringify(Array.from(new Set(item.tags))),
          icon: item.icon,
          isActive: item.isActive,
          isPublic: item.isPublic,
          isPinned: item.isPinned,
          startsAt: item.startsAt ?? null,
          expiresAt: item.expiresAt ?? null,
          expiredRedirectUrl: item.expiredRedirectUrl ?? null,
          maxClicks: item.maxClicks ?? null,
          isCloaked: item.type === "DIRECT" ? item.isCloaked : false,
          themeJson: item.theme ? JSON.stringify(item.theme) : null,
          routingRulesJson:
            item.type === "DIRECT" &&
            item.routingRules &&
            item.routingRules.length > 0
              ? JSON.stringify(item.routingRules)
              : null,
          updatedAt: now,
        };
        if (item.pin) {
          updates.passwordHash = hashPin(item.pin);
        }
        await db.update(links).set(updates).where(eq(links.id, existingId));
        updated++;
      } else {
        skipped++;
      }
    }

    return {
      dryRun: false,
      totalIncoming: validatedEntries.length,
      toCreate,
      toUpdate,
      toSkip,
      created,
      updated,
      skipped,
      slugsPreview,
    };
  }

  async function listSitemapHubLinks(
    now: Date = new Date(),
  ): Promise<Array<{ slug: string; updatedAt: Date }>> {
    const nowMs = now.getTime();
    return db
      .select({
        slug: links.slug,
        updatedAt: links.updatedAt,
      })
      .from(links)
      .where(
        and(
          eq(links.type, "HUB"),
          eq(links.isPublic, true),
          eq(links.isActive, true),
          isNull(links.passwordHash),
          notExpiredSql(nowMs),
          sql`(${links.startsAt} IS NULL OR ${links.startsAt} <= ${nowMs})`,
        ),
      )
      .orderBy(desc(links.isPinned), desc(links.id))
      .limit(200);
  }

  async function deleteLink(id: string): Promise<void> {
    const result = await db.delete(links).where(eq(links.id, id));
    if (result.rowsAffected === 0)
      throw new LinkServiceError("NOT_FOUND", "Link not found");
  }

  /** Keyset pagination query over (is_pinned DESC, id DESC) shared by `/admin` and `/`. */
  async function queryPage(params: ListLinksParams, scope: "admin" | "public") {
    const now = params.now ?? new Date();
    const nowMs = now.getTime();

    let limit = DEFAULT_PAGE_SIZE;
    if (
      params.limit !== undefined &&
      params.limit !== null &&
      params.limit !== ""
    ) {
      const parsedLimit = Number(params.limit);
      if (!Number.isFinite(parsedLimit)) {
        throw new LinkServiceError(
          "VALIDATION_ERROR",
          "The limit parameter must be numeric",
          {
            limit: ["Must be a number between 1 and 50"],
          },
        );
      }
      limit = Math.min(Math.max(Math.trunc(parsedLimit), 1), MAX_PAGE_SIZE);
    }

    const conditions: SQL[] = [];

    if (params.cursor) {
      const cursor = decodeLinkCursor(params.cursor);
      if (!cursor) {
        throw new LinkServiceError(
          "VALIDATION_ERROR",
          "Invalid pagination cursor",
          {
            cursor: ["Invalid or corrupted cursor"],
          },
        );
      }
      conditions.push(
        sql`(${links.isPinned} < ${cursor.p} OR (${links.isPinned} = ${cursor.p} AND ${links.id} < ${cursor.id}))`,
      );
    }

    if (params.category) {
      const category = LinkCategorySchema.safeParse(params.category);
      if (!category.success) {
        throw new LinkServiceError("VALIDATION_ERROR", "Invalid category", {
          category: ["Unrecognized category"],
        });
      }
      conditions.push(eq(links.category, category.data));
    }

    const term = params.q?.trim().slice(0, MAX_SEARCH_LENGTH);
    if (term) conditions.push(searchSql(term));

    if (scope === "public") {
      // Strict isolation: enforced on the server, never dependent on client parameters.
      // Scheduled links remain visible in `/` with `isScheduled = true` so the directory can display a "Launching soon" badge.
      conditions.push(
        eq(links.isPublic, true),
        eq(links.isActive, true),
        notExpiredSql(nowMs),
      );
    } else {
      const statusResult = LinkStatusFilterSchema.safeParse(
        params.status || "all",
      );
      if (!statusResult.success) {
        throw new LinkServiceError(
          "VALIDATION_ERROR",
          "Invalid status filter",
          {
            status: ["Allowed values: all, active, inactive, expired, pinned"],
          },
        );
      }
      const status: LinkStatusFilter = statusResult.data;
      if (status === "active")
        conditions.push(eq(links.isActive, true), notExpiredSql(nowMs));
      if (status === "inactive") conditions.push(eq(links.isActive, false));
      if (status === "expired") conditions.push(expiredSql(nowMs));
      if (status === "pinned") conditions.push(eq(links.isPinned, true));
    }

    const rows = await db
      .select()
      .from(links)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(links.isPinned), desc(links.id))
      .limit(limit + 1);

    const hasNextPage = rows.length > limit;
    const pageRows = hasNextPage ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];
    const nextCursor =
      hasNextPage && last
        ? encodeLinkCursor({ p: last.isPinned ? 1 : 0, id: last.id })
        : null;

    return { rows: pageRows, nextCursor, hasNextPage, now };
  }

  async function listLinksPaginated(
    params: ListLinksParams = {},
  ): Promise<PaginatedResult<LinkDTO>> {
    const page = await queryPage(params, "admin");
    return {
      items: page.rows.map((row) => toLinkDTO(row, page.now)),
      nextCursor: page.nextCursor,
      hasNextPage: page.hasNextPage,
    };
  }

  async function listPublicLinksPaginated(
    params: Omit<ListLinksParams, "status"> = {},
  ): Promise<PaginatedResult<PublicLinkDTO>> {
    const page = await queryPage(params, "public");
    return {
      items: page.rows.map((row) => toPublicLinkDTO(row, page.now)),
      nextCursor: page.nextCursor,
      hasNextPage: page.hasNextPage,
    };
  }

  async function getLinkBySlug(slug: string): Promise<LinkDTO | null> {
    const row = await findRowBySlug(slug);
    return row ? toLinkDTO(row) : null;
  }

  return {
    findRowById,
    findRowBySlug,
    getLinkById,
    getLinkBySlug,
    checkSlugAvailability,
    generateUniqueRandomSlug,
    createLink,
    updateLink,
    toggleLinkFlags,
    updateLinkHealth,
    resetLinkClicks,
    bulkActionLinks,
    exportLinksBackup,
    importLinksBackup,
    listSitemapHubLinks,
    deleteLink,
    listLinksPaginated,
    listPublicLinksPaginated,
    listPublicLinks: listPublicLinksPaginated,
  };
}

export type LinkService = ReturnType<typeof createLinkService>;
