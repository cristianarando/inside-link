import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { LinkDTO } from "@/lib/types/link-dto";
import { assertAdminApiSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { links } from "@/server/db/schema";
import { linkService } from "@/server/services";
import type { AppDatabase, LinkService } from "@/server/services/link.service";
import {
  checkUrlHealth,
  MetadataServiceError,
  type LinkHealthCheckResult,
  type PreviewMetadataDeps,
} from "@/server/services/metadata.service";

const MAX_HEALTH_BATCH = 25;
const HEALTH_CONCURRENCY = 5;

const HealthCheckBodySchema = z
  .object({
    ids: z.array(z.string().trim().min(1)).max(100).optional(),
    all: z.boolean().optional(),
  })
  .superRefine((val, ctx) => {
    const hasIds = Array.isArray(val.ids) && val.ids.length > 0;
    if (!hasIds && val.all !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide either non-empty `ids` or `all: true`.",
      });
    }
  });

export interface LinkHealthScanResult extends LinkHealthCheckResult {
  linkId: string;
  slug: string;
  link?: LinkDTO;
}

export interface HealthCheckRouteDeps extends PreviewMetadataDeps {
  checkAuth?: typeof assertAdminApiSession;
  service?: Pick<LinkService, "updateLinkHealth">;
  database?: AppDatabase;
  healthCheckFn?: typeof checkUrlHealth;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex++;
        results[currentIndex] = await worker(items[currentIndex]!);
      }
    }),
  );

  return results;
}

export async function handleHealthCheckPost(
  request: NextRequest | Request,
  deps: HealthCheckRouteDeps = {},
): Promise<Response> {
  const checkAuth = deps.checkAuth ?? assertAdminApiSession;
  const authResult = await checkAuth(request.headers);
  if (!authResult.authorized) {
    return authResult.response;
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Request body is not valid JSON.",
        },
      },
      { status: 400 },
    );
  }

  const parsed = HealthCheckBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message:
            parsed.error.issues[0]?.message || "Invalid health check payload.",
        },
      },
      { status: 400 },
    );
  }

  const database = deps.database ?? db;
  const service = deps.service ?? linkService;
  const probeUrl = deps.healthCheckFn ?? checkUrlHealth;

  const uniqueIds = parsed.data.ids
    ? Array.from(new Set(parsed.data.ids)).slice(0, MAX_HEALTH_BATCH)
    : [];

  const targetRows =
    uniqueIds.length > 0
      ? await database
          .select({
            id: links.id,
            slug: links.slug,
            destinationUrl: links.destinationUrl,
            isActive: links.isActive,
          })
          .from(links)
          .where(
            and(
              inArray(links.id, uniqueIds),
              eq(links.isActive, true),
              eq(links.type, "DIRECT"),
              isNotNull(links.destinationUrl),
            ),
          )
          .orderBy(desc(links.isPinned), desc(links.id))
          .limit(MAX_HEALTH_BATCH)
      : await database
          .select({
            id: links.id,
            slug: links.slug,
            destinationUrl: links.destinationUrl,
            isActive: links.isActive,
          })
          .from(links)
          .where(
            and(
              eq(links.isActive, true),
              eq(links.type, "DIRECT"),
              isNotNull(links.destinationUrl),
            ),
          )
          .orderBy(desc(links.isPinned), desc(links.id))
          .limit(MAX_HEALTH_BATCH);

  if (targetRows.length === 0) {
    return NextResponse.json({ data: [] }, { status: 200 });
  }

  try {
    const results = await mapWithConcurrency(
      targetRows,
      HEALTH_CONCURRENCY,
      async (row): Promise<LinkHealthScanResult> => {
        try {
          const health = await probeUrl(row.destinationUrl!, deps);
          const updated = await service.updateLinkHealth(row.id, {
            status: health.status,
            statusCode: health.statusCode,
            latencyMs: health.latencyMs,
            checkedAt: health.checkedAt,
          });
          return {
            linkId: row.id,
            slug: row.slug,
            ...health,
            link: updated,
          };
        } catch (err) {
          if (err instanceof MetadataServiceError) {
            if (targetRows.length === 1) {
              throw err;
            }
            const checkedAt = new Date().toISOString();
            const updated = await service.updateLinkHealth(row.id, {
              status: "broken",
              statusCode: null,
              latencyMs: 0,
              checkedAt,
            });
            return {
              linkId: row.id,
              slug: row.slug,
              status: "broken",
              statusCode: null,
              latencyMs: 0,
              checkedAt,
              error: err.message,
              link: updated,
            };
          }
          throw err;
        }
      },
    );

    return NextResponse.json({ data: results }, { status: 200 });
  } catch (err) {
    if (err instanceof MetadataServiceError) {
      return NextResponse.json(
        {
          error: {
            code: err.code,
            message: err.message,
          },
        },
        { status: err.status },
      );
    }

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Internal server error while running link health check.",
        },
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  return handleHealthCheckPost(request);
}
