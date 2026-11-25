import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { isPrefetchRequest, isSocialPreviewBot } from "@/lib/bot-detector";
import { verifyPin } from "@/server/crypto/pin";
import { createPinUnlockCookieHeader } from "@/server/crypto/pin-token";
import {
  checkPinRateLimit,
  extractClientIdentifier,
  recordFailedPinAttempt,
  resetPinAttempts,
} from "@/server/crypto/rate-limit";
import { db } from "@/server/db";
import { links } from "@/server/db/schema";
import { resolutionService, toLinkDTO, type AppDatabase } from "@/server/services";
import {
  buildDestinationUrl,
  type ResolutionService,
} from "@/server/services/resolution.service";

const UnlockBodySchema = z.object({
  pin: z.string().trim().min(1, "PIN is required").max(64),
  query: z.string().max(2048).optional(),
});

export async function handlePinUnlockPost(
  request: Request,
  slug: string,
  deps: {
    db: AppDatabase;
    resolution: ResolutionService;
    now?: Date;
  } = {
    db,
    resolution: resolutionService,
  }
): Promise<NextResponse> {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "Invalid JSON body" } },
      { status: 400 }
    );
  }

  const parsed = UnlockBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "PIN is required" } },
      { status: 400 }
    );
  }

  const normalizedSlug = slug.trim().toLowerCase();
  const rows = await deps.db
    .select()
    .from(links)
    .where(eq(links.slug, normalizedSlug))
    .limit(1);
  const row = rows[0];

  if (!row) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Short link not found" } },
      { status: 404 }
    );
  }

  const now = deps.now ?? new Date();
  if (
    !row.isActive ||
    (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) ||
    (row.maxClicks !== null && row.clicksCount >= row.maxClicks)
  ) {
    return NextResponse.json(
      { error: { code: "LINK_INACTIVE_OR_EXPIRED", message: "This link is no longer active" } },
      { status: 410 }
    );
  }

  if (!row.passwordHash) {
    return NextResponse.json(
      { error: { code: "PIN_NOT_CONFIGURED", message: "This link does not require a PIN" } },
      { status: 400 }
    );
  }

  const clientIp = extractClientIdentifier(request.headers);
  const rateLimit = await checkPinRateLimit(deps.db, row.id, clientIp, now);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: `Too many failed attempts. Try again in ${rateLimit.retryAfterSeconds}s.`,
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        },
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
          "Cache-Control": "private, no-store",
        },
      }
    );
  }

  const isPinValid = verifyPin(parsed.data.pin, row.passwordHash);
  if (!isPinValid) {
    const failed = await recordFailedPinAttempt(deps.db, row.id, clientIp, now);
    return NextResponse.json(
      {
        error: {
          code: "INVALID_PIN",
          message: "Incorrect PIN",
          remainingAttempts: failed.remainingAttempts,
        },
      },
      {
        status: 401,
        headers: { "Cache-Control": "private, no-store" },
      }
    );
  }

  const rawQuery = parsed.data.query?.replace(/^\?/, "") ?? "";
  const incomingParams = rawQuery
    ? new URLSearchParams(rawQuery)
    : new URL(request.url).searchParams;

  let finalDestination: string | null = null;
  if (row.type === "DIRECT") {
    if (!row.destinationUrl) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Short link not found" } },
        { status: 404 }
      );
    }
    try {
      finalDestination = buildDestinationUrl(
        row.destinationUrl,
        incomingParams,
        row.forwardQueryParams
      );
    } catch {
      return NextResponse.json(
        { error: { code: "INVALID_DESTINATION", message: "Invalid destination URL" } },
        { status: 400 }
      );
    }
  }

  // Valid PIN: clear failed attempt counters and record the visit atomically.
  await resetPinAttempts(deps.db, row.id, clientIp, now);
  const recorded = await deps.resolution.recordClickEvent({
    linkId: row.id,
    headers: request.headers,
    searchParams: incomingParams,
    now,
  });

  const ua = request.headers.get("user-agent");
  if (!isSocialPreviewBot(ua) && !isPrefetchRequest(request.headers) && !recorded) {
    return NextResponse.json(
      { error: { code: "LINK_INACTIVE_OR_EXPIRED", message: "This link is no longer active" } },
      { status: 410, headers: { "Cache-Control": "private, no-store" } }
    );
  }

  const dto = toLinkDTO(row, now);
  return NextResponse.json(
    {
      data: {
        slug: dto.slug,
        type: dto.type,
        destinationUrl: dto.type === "DIRECT" ? finalDestination : null,
        hubLinks: dto.type === "HUB" ? dto.hubLinks : null,
      },
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store",
        "Set-Cookie": createPinUnlockCookieHeader(row.id, row.passwordHash, now),
      },
    }
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
  const { slug } = await context.params;
  return handlePinUnlockPost(request, slug);
}
