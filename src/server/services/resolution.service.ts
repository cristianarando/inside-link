import { and, eq, sql } from "drizzle-orm";
import { monotonicFactory } from "ulidx";

import { isPrefetchRequest, isSocialPreviewBot } from "@/lib/bot-detector";
import { isReservedSlug } from "@/lib/constants/reserved-slugs";
import { extractTrafficMetadata } from "@/lib/geo-headers";
import {
  evaluateSmartRouting,
  extractSmartRoutingContext,
} from "@/lib/smart-routing";
import type { LinkThemeOverride } from "@/lib/themes";
import type { LinkDTO } from "@/lib/types/link-dto";
import { hasValidPinUnlockCookie } from "../crypto/pin-token";
import { clickEvents, links, type Link } from "../db/schema";
import { toLinkDTO, type AppDatabase } from "./link.service";

const nextEventId = monotonicFactory();

export type InactiveReason = "INACTIVE" | "EXPIRED" | "MAX_CLICKS_REACHED";

export type SlugResolutionResult =
  | {
      kind: "NOT_FOUND";
      status: 404;
      slug: string;
      shouldTrackClick: false;
    }
  | {
      kind: "INACTIVE_OR_EXPIRED";
      status: 410;
      reason: InactiveReason;
      slug: string;
      title: string;
      theme: LinkThemeOverride | null;
      shouldTrackClick: false;
    }
  | {
      kind: "SOCIAL_BOT_OG";
      status: 200;
      link: LinkDTO;
      shouldTrackClick: false;
    }
  | {
      kind: "SCHEDULED_COUNTDOWN";
      status: 200;
      linkId: string;
      link: LinkDTO;
      startsAt: string;
      shouldTrackClick: false;
    }
  | {
      kind: "PIN_REQUIRED";
      status: 200;
      linkId: string;
      slug: string;
      title: string;
      description: string | null;
      icon: string;
      theme: LinkThemeOverride | null;
      shouldTrackClick: false;
    }
  | {
      kind: "HUB_VIEW";
      status: 200;
      linkId: string;
      link: LinkDTO;
      shouldTrackClick: boolean;
    }
  | {
      kind: "CLOAKED_VIEW";
      status: 200;
      linkId: string;
      link: LinkDTO;
      destinationUrl: string;
      shouldTrackClick: boolean;
    }
  | {
      kind: "REDIRECT";
      status: 301 | 302 | 307 | 308;
      linkId: string;
      location: string;
      shouldTrackClick: boolean;
    };

export interface ResolveSlugOptions {
  headers?: Headers | Record<string, string | string[] | undefined>;
  searchParams?: URLSearchParams | Record<string, string | undefined>;
  now?: Date;
}

export interface RecordClickInput {
  linkId: string;
  subLinkId?: string | null;
  headers?: Headers | Record<string, string | string[] | undefined>;
  searchParams?: URLSearchParams | Record<string, string | undefined>;
  now?: Date;
}

const SLUG_FAST_REGEX = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

function readHeader(
  headers: Headers | Record<string, string | string[] | undefined> | undefined,
  name: string,
): string | null {
  if (!headers) return null;
  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name);
  }
  const value = (headers as Record<string, string | string[] | undefined>)[
    name.toLowerCase()
  ];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function toUrlSearchParams(
  input: URLSearchParams | Record<string, string | undefined> | undefined,
): URLSearchParams {
  if (!input) return new URLSearchParams();
  if (input instanceof URLSearchParams) return input;
  const params = new URLSearchParams();
  for (const [key, val] of Object.entries(input)) {
    if (typeof val === "string") params.append(key, val);
  }
  return params;
}

/**
 * Safely merges incoming query parameters into the destination URL without
 * allowing protocol/host/path tampering or overwriting parameters already set on the target.
 */
export function buildDestinationUrl(
  baseDestination: string,
  incomingParams: URLSearchParams,
  forwardQueryParams: boolean,
): string {
  const target = new URL(baseDestination);
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new Error("Destination protocol not allowed");
  }

  if (forwardQueryParams) {
    incomingParams.forEach((value, key) => {
      if (!target.searchParams.has(key)) {
        target.searchParams.set(key, value);
      }
    });
  }

  return target.toString();
}

function classifyInactiveReason(
  row: Link,
  nowMs: number,
): InactiveReason | null {
  if (!row.isActive) return "INACTIVE";
  if (row.expiresAt && row.expiresAt.getTime() <= nowMs) return "EXPIRED";
  if (row.maxClicks !== null && row.clicksCount >= row.maxClicks)
    return "MAX_CLICKS_REACHED";
  return null;
}

function resolveDirectLocation(
  row: Link,
  dto: LinkDTO,
  options: ResolveSlugOptions,
): string | null {
  const routedUrl = evaluateSmartRouting(
    dto.routingRules,
    extractSmartRoutingContext(options.headers),
  );
  const baseDestination = routedUrl ?? row.destinationUrl;
  if (!baseDestination) return null;

  try {
    return buildDestinationUrl(
      baseDestination,
      toUrlSearchParams(options.searchParams),
      row.forwardQueryParams,
    );
  } catch {
    return null;
  }
}

export function createResolutionService(db: AppDatabase) {
  async function resolveSlugRequest(
    rawSlug: string,
    options: ResolveSlugOptions = {},
  ): Promise<SlugResolutionResult> {
    const normalized = rawSlug.trim().toLowerCase();

    // Fast in-memory guard: avoids querying Turso for static assets, reserved routes, or malformed slugs.
    if (
      normalized.length < 3 ||
      normalized.length > 100 ||
      normalized.includes(".") ||
      !SLUG_FAST_REGEX.test(normalized) ||
      isReservedSlug(normalized)
    ) {
      return {
        kind: "NOT_FOUND",
        status: 404,
        slug: normalized,
        shouldTrackClick: false,
      };
    }

    const rows = await db
      .select()
      .from(links)
      .where(eq(links.slug, normalized))
      .limit(1);
    const row = rows[0];
    if (!row) {
      return {
        kind: "NOT_FOUND",
        status: 404,
        slug: normalized,
        shouldTrackClick: false,
      };
    }

    const now = options.now ?? new Date();
    const nowMs = now.getTime();
    const dto = toLinkDTO(row, now);
    const inactiveReason = classifyInactiveReason(row, nowMs);

    if (inactiveReason) {
      if (
        (inactiveReason === "EXPIRED" ||
          inactiveReason === "MAX_CLICKS_REACHED") &&
        row.expiredRedirectUrl
      ) {
        try {
          const fallbackLocation = buildDestinationUrl(
            row.expiredRedirectUrl,
            new URLSearchParams(),
            false,
          );
          return {
            kind: "REDIRECT",
            status: 307,
            linkId: row.id,
            location: fallbackLocation,
            shouldTrackClick: false,
          };
        } catch {
          // Fall through to HTTP 410 view if expiredRedirectUrl is malformed.
        }
      }

      return {
        kind: "INACTIVE_OR_EXPIRED",
        status: 410,
        reason: inactiveReason,
        slug: row.slug,
        title: row.title,
        theme: dto.theme,
        shouldTrackClick: false,
      };
    }

    const userAgent = readHeader(options.headers, "user-agent");
    if (isSocialPreviewBot(userAgent)) {
      return {
        kind: "SOCIAL_BOT_OG",
        status: 200,
        link: dto,
        shouldTrackClick: false,
      };
    }

    if (row.startsAt && row.startsAt.getTime() > nowMs) {
      return {
        kind: "SCHEDULED_COUNTDOWN",
        status: 200,
        linkId: row.id,
        link: dto,
        startsAt: row.startsAt.toISOString(),
        shouldTrackClick: false,
      };
    }

    if (row.passwordHash !== null) {
      const hasUnlockCookie = hasValidPinUnlockCookie(
        options.headers,
        row.id,
        row.passwordHash,
        now,
      );
      if (hasUnlockCookie && row.type === "HUB") {
        return {
          kind: "HUB_VIEW",
          status: 200,
          linkId: row.id,
          link: dto,
          shouldTrackClick: false,
        };
      }
      if (hasUnlockCookie && row.type === "DIRECT" && row.isCloaked) {
        const unlockedCloakedUrl = resolveDirectLocation(row, dto, options);
        if (!unlockedCloakedUrl) {
          return {
            kind: "NOT_FOUND",
            status: 404,
            slug: normalized,
            shouldTrackClick: false,
          };
        }
        return {
          kind: "CLOAKED_VIEW",
          status: 200,
          linkId: row.id,
          link: dto,
          destinationUrl: unlockedCloakedUrl,
          shouldTrackClick: false,
        };
      }
      return {
        kind: "PIN_REQUIRED",
        status: 200,
        linkId: row.id,
        slug: row.slug,
        title: row.title,
        description: row.description,
        icon: row.icon,
        theme: dto.theme,
        shouldTrackClick: false,
      };
    }

    const isPrefetch = options.headers
      ? isPrefetchRequest(options.headers)
      : false;

    if (row.type === "HUB") {
      return {
        kind: "HUB_VIEW",
        status: 200,
        linkId: row.id,
        link: dto,
        shouldTrackClick: !isPrefetch,
      };
    }

    const location = resolveDirectLocation(row, dto, options);
    if (!location) {
      return {
        kind: "NOT_FOUND",
        status: 404,
        slug: normalized,
        shouldTrackClick: false,
      };
    }

    if (row.isCloaked) {
      return {
        kind: "CLOAKED_VIEW",
        status: 200,
        linkId: row.id,
        link: dto,
        destinationUrl: location,
        shouldTrackClick: !isPrefetch,
      };
    }

    const status = (
      row.redirectStatus === 301 ||
      row.redirectStatus === 302 ||
      row.redirectStatus === 307 ||
      row.redirectStatus === 308
        ? row.redirectStatus
        : 307
    ) as 301 | 302 | 307 | 308;

    return {
      kind: "REDIRECT",
      status,
      linkId: row.id,
      location,
      shouldTrackClick: !isPrefetch,
    };
  }

  /**
   * Atomically increments `clicks_count` for primary visits and inserts a `click_events` row.
   * For HUB sub-link clicks (`subLinkId` provided), validates active status and time expiration
   * without incrementing `clicks_count` or blocking on `max_clicks`.
   * Never updates `links.updatedAt` and never throws to callers.
   */
  async function recordClickEvent(input: RecordClickInput): Promise<boolean> {
    try {
      const userAgent = readHeader(input.headers, "user-agent");
      if (isSocialPreviewBot(userAgent)) return false;
      if (input.headers && isPrefetchRequest(input.headers)) return false;

      const now = input.now ?? new Date();
      const nowMs = now.getTime();

      if (input.subLinkId) {
        const activeHub = await db
          .select({ id: links.id })
          .from(links)
          .where(
            and(
              eq(links.id, input.linkId),
              eq(links.type, "HUB"),
              eq(links.isActive, true),
              sql`(${links.startsAt} IS NULL OR ${links.startsAt} <= ${nowMs})`,
              sql`(${links.expiresAt} IS NULL OR ${links.expiresAt} > ${nowMs})`,
            ),
          )
          .limit(1);

        if (!activeHub[0]) {
          return false;
        }
      } else {
        const updateResult = await db
          .update(links)
          .set({
            clicksCount: sql`${links.clicksCount} + 1`,
          })
          .where(
            and(
              eq(links.id, input.linkId),
              eq(links.isActive, true),
              sql`(${links.startsAt} IS NULL OR ${links.startsAt} <= ${nowMs})`,
              sql`(${links.expiresAt} IS NULL OR ${links.expiresAt} > ${nowMs})`,
              sql`(${links.maxClicks} IS NULL OR ${links.clicksCount} < ${links.maxClicks})`,
            ),
          );

        if (updateResult.rowsAffected === 0) {
          return false;
        }
      }

      const meta = extractTrafficMetadata(
        input.headers ?? {},
        input.searchParams,
      );
      await db.insert(clickEvents).values({
        id: nextEventId(),
        linkId: input.linkId,
        subLinkId: input.subLinkId ?? null,
        country: meta.country,
        city: meta.city,
        device: meta.device,
        os: meta.os,
        browser: meta.browser,
        referrer: meta.referrer,
        queryParamRef: meta.queryParamRef,
        clickedAt: now,
      });

      return true;
    } catch {
      return false;
    }
  }

  return {
    resolveSlugRequest,
    recordClickEvent,
  };
}

export type ResolutionService = ReturnType<typeof createResolutionService>;
