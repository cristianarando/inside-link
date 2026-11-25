import { createHmac, timingSafeEqual } from "node:crypto";

export const PIN_UNLOCK_TTL_SECONDS = 900;

function getPinTokenSecret(): string {
  return process.env.BETTER_AUTH_SECRET || "insidelink-dev-pin-token-secret";
}

export function getPinUnlockCookieName(linkId: string): string {
  return `il_unlock_${linkId}`;
}

function signPayload(payload: string): string {
  return createHmac("sha256", getPinTokenSecret()).update(payload).digest("hex");
}

function readCookieHeader(
  headers: Headers | Record<string, string | string[] | undefined> | undefined
): string | null {
  if (!headers) return null;
  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get("cookie");
  }
  const record = headers as Record<string, string | string[] | undefined>;
  for (const [key, value] of Object.entries(record)) {
    if (key.toLowerCase() === "cookie") {
      if (Array.isArray(value)) return value[0] ?? null;
      return value ?? null;
    }
  }
  return null;
}

function extractCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const segments = cookieHeader.split(";");
  for (const segment of segments) {
    const eqIndex = segment.indexOf("=");
    if (eqIndex <= 0) continue;
    const cookieName = segment.slice(0, eqIndex).trim();
    if (cookieName !== name) continue;
    const rawValue = segment.slice(eqIndex + 1).trim();
    if (!rawValue) return null;
    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }
  return null;
}

/**
 * Creates a signed stateless `Set-Cookie` header granting temporary access
 * to a PIN-protected link for 15 minutes (`Max-Age=900`).
 */
export function createPinUnlockCookieHeader(
  linkId: string,
  passwordHash: string,
  now: Date = new Date()
): string {
  const expUnixSec = Math.floor(now.getTime() / 1000) + PIN_UNLOCK_TTL_SECONDS;
  const passwordHashPrefix8 = passwordHash.slice(0, 8);
  const payload = `${linkId}.${expUnixSec}.${passwordHashPrefix8}`;
  const hmacHex = signPayload(payload);
  const token = `${payload}.${hmacHex}`;

  const parts = [
    `${getPinUnlockCookieName(linkId)}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${PIN_UNLOCK_TTL_SECONDS}`,
  ];

  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }

  return parts.join("; ");
}

/**
 * Verifies the stateless HMAC-SHA256 unlock cookie for a given link and PIN hash
 * using constant-time comparison.
 */
export function hasValidPinUnlockCookie(
  headers: Headers | Record<string, string | string[] | undefined> | undefined,
  linkId: string,
  passwordHash: string,
  now: Date = new Date()
): boolean {
  try {
    const cookieHeader = readCookieHeader(headers);
    const token = extractCookieValue(cookieHeader, getPinUnlockCookieName(linkId));
    if (!token) return false;

    const parts = token.split(".");
    if (parts.length !== 4) return false;

    const [tokenLinkId, expStr, hashPrefix, hmacHex] = parts;
    if (!tokenLinkId || !expStr || !hashPrefix || !hmacHex) return false;
    if (tokenLinkId !== linkId) return false;
    if (hashPrefix !== passwordHash.slice(0, 8)) return false;
    if (!/^\d+$/.test(expStr)) return false;

    const expUnixSec = Number(expStr);
    const nowUnixSec = Math.floor(now.getTime() / 1000);
    if (!Number.isFinite(expUnixSec) || expUnixSec <= nowUnixSec) {
      return false;
    }

    if (!/^[a-f0-9]{64}$/i.test(hmacHex)) return false;

    const expectedHex = signPayload(`${tokenLinkId}.${expStr}.${hashPrefix}`);
    const actualBuf = Buffer.from(hmacHex.toLowerCase(), "hex");
    const expectedBuf = Buffer.from(expectedHex, "hex");
    if (actualBuf.length !== expectedBuf.length) return false;

    return timingSafeEqual(actualBuf, expectedBuf);
  } catch {
    return false;
  }
}
