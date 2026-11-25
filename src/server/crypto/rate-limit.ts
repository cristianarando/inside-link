import { createHash } from "node:crypto";
import { eq, lte, sql } from "drizzle-orm";
import { pinAttempts } from "@/server/db/schema";
import type { AppDatabase } from "@/server/services/link.service";

export const PIN_MAX_ATTEMPTS = 5;
export const PIN_WINDOW_MS = 60_000;
const PIN_PURGE_AGE_MS = 86_400_000;

export function extractClientIdentifier(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const firstIp = forwarded.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const cfIp = headers.get("cf-connecting-ip")?.trim();
  if (cfIp) return cfIp;
  return "anonymous-local";
}

/**
 * Computes an irreversible SHA-256 rate-limit key combining UTC day + linkId + ephemeral IP + secret
 * so plaintext IP addresses are never persisted in SQLite.
 */
export function computePinAttemptKey(
  linkId: string,
  clientIp: string,
  now: Date = new Date(),
): string {
  const salt =
    process.env.BETTER_AUTH_SECRET || "insidelink-pin-rate-limit-salt";
  const utcDay = now.toISOString().slice(0, 10);
  return createHash("sha256")
    .update(`${salt}:${utcDay}:${linkId}:${clientIp}`)
    .digest("hex");
}

export interface PinRateLimitStatus {
  allowed: boolean;
  attemptsCount: number;
  remainingAttempts: number;
  retryAfterSeconds: number;
}

export async function checkPinRateLimit(
  db: AppDatabase,
  linkId: string,
  clientIp: string,
  now: Date = new Date(),
): Promise<PinRateLimitStatus> {
  const key = computePinAttemptKey(linkId, clientIp, now);
  const rows = await db
    .select()
    .from(pinAttempts)
    .where(eq(pinAttempts.key, key))
    .limit(1);
  const existing = rows[0];

  if (!existing || existing.windowExpiresAt.getTime() <= now.getTime()) {
    return {
      allowed: true,
      attemptsCount: 0,
      remainingAttempts: PIN_MAX_ATTEMPTS,
      retryAfterSeconds: 0,
    };
  }

  if (existing.attemptsCount >= PIN_MAX_ATTEMPTS) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((existing.windowExpiresAt.getTime() - now.getTime()) / 1000),
    );
    return {
      allowed: false,
      attemptsCount: existing.attemptsCount,
      remainingAttempts: 0,
      retryAfterSeconds,
    };
  }

  return {
    allowed: true,
    attemptsCount: existing.attemptsCount,
    remainingAttempts: Math.max(0, PIN_MAX_ATTEMPTS - existing.attemptsCount),
    retryAfterSeconds: 0,
  };
}

export async function recordFailedPinAttempt(
  db: AppDatabase,
  linkId: string,
  clientIp: string,
  now: Date = new Date(),
): Promise<{ attemptsCount: number; remainingAttempts: number }> {
  const key = computePinAttemptKey(linkId, clientIp, now);
  const windowExpiresAt = new Date(now.getTime() + PIN_WINDOW_MS);

  const upserted = await db
    .insert(pinAttempts)
    .values({
      key,
      linkId,
      attemptsCount: 1,
      windowExpiresAt,
    })
    .onConflictDoUpdate({
      target: pinAttempts.key,
      set: {
        attemptsCount: sql`CASE WHEN ${pinAttempts.windowExpiresAt} <= excluded.window_expires_at - ${PIN_WINDOW_MS} THEN 1 ELSE ${pinAttempts.attemptsCount} + 1 END`,
        windowExpiresAt: sql`CASE WHEN ${pinAttempts.windowExpiresAt} <= excluded.window_expires_at - ${PIN_WINDOW_MS} THEN excluded.window_expires_at ELSE ${pinAttempts.windowExpiresAt} END`,
      },
    })
    .returning({ attemptsCount: pinAttempts.attemptsCount });

  const attemptsCount = upserted[0]?.attemptsCount ?? 1;

  // Opportunistically purge stale attempt rows older than 24 hours.
  const purgeThreshold = new Date(now.getTime() - PIN_PURGE_AGE_MS);
  try {
    await db
      .delete(pinAttempts)
      .where(lte(pinAttempts.windowExpiresAt, purgeThreshold));
  } catch {
    // Best-effort cleanup; ignore non-critical purge failures.
  }

  return {
    attemptsCount,
    remainingAttempts: Math.max(0, PIN_MAX_ATTEMPTS - attemptsCount),
  };
}

export async function resetPinAttempts(
  db: AppDatabase,
  linkId: string,
  clientIp: string,
  now: Date = new Date(),
): Promise<void> {
  const key = computePinAttemptKey(linkId, clientIp, now);
  await db.delete(pinAttempts).where(eq(pinAttempts.key, key));
}
