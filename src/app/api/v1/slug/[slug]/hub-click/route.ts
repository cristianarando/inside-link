import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { HubLinkItemSchema } from "@/lib/validations/link.schema";
import { hasValidPinUnlockCookie } from "@/server/crypto/pin-token";
import { db } from "@/server/db";
import { links } from "@/server/db/schema";
import { resolutionService, type AppDatabase } from "@/server/services";
import type { ResolutionService } from "@/server/services/resolution.service";

const HubClickBodySchema = z.object({
  subLinkId: z.string().trim().min(1, "subLinkId is required").max(64),
});

const HubLinksArraySchema = z.array(HubLinkItemSchema);

function parseHubLinks(rawJson: string | null) {
  if (!rawJson) return [];
  try {
    const parsed = HubLinksArraySchema.safeParse(JSON.parse(rawJson));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export async function handleHubSubLinkClickPost(
  request: Request,
  slug: string,
  deps: { db: AppDatabase; resolution: ResolutionService; now?: Date } = {
    db,
    resolution: resolutionService,
  },
): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "Invalid JSON body" } },
      { status: 400 },
    );
  }

  const parsed = HubClickBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "subLinkId is required" } },
      { status: 400 },
    );
  }

  const normalizedSlug = slug.trim().toLowerCase();
  const rows = await deps.db
    .select()
    .from(links)
    .where(eq(links.slug, normalizedSlug))
    .limit(1);
  const row = rows[0];
  const now = deps.now ?? new Date();

  if (
    !row ||
    row.type !== "HUB" ||
    !row.isActive ||
    (row.startsAt && row.startsAt.getTime() > now.getTime()) ||
    (row.expiresAt && row.expiresAt.getTime() <= now.getTime())
  ) {
    return NextResponse.json(
      {
        error: {
          code: "NOT_FOUND",
          message: "Micro-landing not found or inactive",
        },
      },
      { status: 404 },
    );
  }

  if (
    row.passwordHash !== null &&
    !hasValidPinUnlockCookie(request.headers, row.id, row.passwordHash, now)
  ) {
    return NextResponse.json(
      {
        error: {
          code: "PIN_UNLOCK_REQUIRED",
          message: "PIN verification required",
        },
      },
      { status: 401 },
    );
  }

  const hubLinks = parseHubLinks(row.hubLinksJson);
  const hasSubLink = hubLinks.some((item) => item.id === parsed.data.subLinkId);
  if (!hasSubLink) {
    return NextResponse.json(
      { error: { code: "INVALID_SUB_LINK", message: "Invalid HUB sub-link" } },
      { status: 400 },
    );
  }

  const recorded = await deps.resolution.recordClickEvent({
    linkId: row.id,
    subLinkId: parsed.data.subLinkId,
    headers: request.headers,
    now,
  });

  return NextResponse.json({
    data: { recorded, subLinkId: parsed.data.subLinkId },
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const { slug } = await context.params;
  return handleHubSubLinkClickPost(request, slug);
}
