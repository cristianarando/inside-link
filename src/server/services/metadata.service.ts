import { lookup as dnsLookup } from "node:dns/promises";
import net from "node:net";
import { SafeUrlSchema } from "@/lib/validations/link.schema";

export type SuggestedLinkIcon =
  | "github"
  | "linkedin"
  | "twitter"
  | "youtube"
  | "book-open"
  | "globe";

export interface MetadataPreviewResult {
  url: string;
  title: string | null;
  description: string | null;
  icon: SuggestedLinkIcon;
}

export type MetadataServiceErrorCode =
  | "VALIDATION_ERROR"
  | "SSRF_BLOCKED"
  | "FETCH_FAILED";

export class MetadataServiceError extends Error {
  readonly code: MetadataServiceErrorCode;
  readonly status: number;

  constructor(code: MetadataServiceErrorCode, message: string, status: number) {
    super(message);
    this.name = "MetadataServiceError";
    this.code = code;
    this.status = status;
  }
}

export type LookupAddressFn = (
  hostname: string,
  options: { all: true },
) => Promise<Array<{ address: string; family: number }>>;

const MAX_HTML_BYTES = 64 * 1024;
const FETCH_TIMEOUT_MS = 4000;
const MAX_REDIRECT_HOPS = 2;

const BLOCKED_HOSTNAMES = new Set(["localhost", "localhost.localdomain"]);
const BLOCKED_HOSTNAME_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".localdomain",
];

function isPublicIpv4Octets(a: number, b: number, c: number): boolean {
  if (a === 0) return false; // 0.0.0.0/8 ("this" network)
  if (a === 10) return false; // 10.0.0.0/8 (RFC1918)
  if (a === 100 && b >= 64 && b <= 127) return false; // 100.64.0.0/10 (CGNAT)
  if (a === 127) return false; // 127.0.0.0/8 (loopback)
  if (a === 169 && b === 254) return false; // 169.254.0.0/16 (link-local / cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return false; // 172.16.0.0/12 (RFC1918)
  if (a === 192 && b === 0 && c === 0) return false; // 192.0.0.0/24 (IETF protocol assignments)
  if (a === 192 && b === 0 && c === 2) return false; // 192.0.2.0/24 (TEST-NET-1)
  if (a === 192 && b === 168) return false; // 192.168.0.0/16 (RFC1918)
  if (a === 198 && (b === 18 || b === 19)) return false; // 198.18.0.0/15 (benchmarking)
  if (a === 198 && b === 51 && c === 100) return false; // 198.51.100.0/24 (TEST-NET-2)
  if (a === 203 && b === 0 && c === 113) return false; // 203.0.113.0/24 (TEST-NET-3)
  if (a >= 224) return false; // 224.0.0.0/4 multicast & 240.0.0.0/4 reserved/broadcast
  return true;
}

function parseIpv6Groups(rawIp: string): number[] | null {
  const clean = rawIp.trim().toLowerCase();
  if (!net.isIPv6(clean)) return null;

  let working = clean;
  let embeddedV4Groups: number[] | null = null;
  const lastColon = working.lastIndexOf(":");
  if (lastColon !== -1 && working.slice(lastColon + 1).includes(".")) {
    const v4Part = working.slice(lastColon + 1);
    if (!net.isIPv4(v4Part)) return null;
    const octets = v4Part.split(".").map(Number);
    embeddedV4Groups = [
      ((octets[0]! << 8) | octets[1]!) >>> 0,
      ((octets[2]! << 8) | octets[3]!) >>> 0,
    ];
    working = working.slice(0, lastColon);
  }

  const targetGroups = embeddedV4Groups ? 6 : 8;
  const doubleColonParts = working.split("::");
  if (doubleColonParts.length > 2) return null;

  const parseSide = (part: string): number[] =>
    part.length === 0 ? [] : part.split(":").map((hex) => parseInt(hex, 16));

  const left = parseSide(doubleColonParts[0] ?? "");
  const right =
    doubleColonParts.length === 2 ? parseSide(doubleColonParts[1] ?? "") : [];

  let groups: number[];
  if (doubleColonParts.length === 2) {
    const missing = targetGroups - (left.length + right.length);
    if (missing < 1) return null;
    groups = [...left, ...new Array<number>(missing).fill(0), ...right];
  } else {
    if (left.length !== targetGroups) return null;
    groups = left;
  }

  if (embeddedV4Groups) {
    groups = [...groups, ...embeddedV4Groups];
  }

  return groups.length === 8 ? groups : null;
}

/**
 * Returns true only when `ip` is a valid, globally routable public IPv4 or IPv6 address.
 */
export function isPublicIpAddress(ip: string): boolean {
  let clean = ip.trim();
  if (clean.startsWith("[") && clean.endsWith("]")) {
    clean = clean.slice(1, -1);
  }
  const zoneIndex = clean.indexOf("%");
  if (zoneIndex !== -1) {
    // Zone-scoped addresses (e.g. fe80::1%eth0) are link-local/non-public
    return false;
  }

  if (net.isIPv4(clean)) {
    const [a, b, c] = clean.split(".").map(Number);
    return isPublicIpv4Octets(a!, b!, c!);
  }

  const groups = parseIpv6Groups(clean);
  if (!groups) return false;

  const isAllZeroPrefix = (count: number) =>
    groups.slice(0, count).every((g) => g === 0);

  // Unspecified (::) and Loopback (::1)
  if (isAllZeroPrefix(7) && (groups[7] === 0 || groups[7] === 1)) {
    return false;
  }

  // IPv4-mapped IPv6 (::ffff:0:0/96) or IPv4-compatible (::/96)
  if ((isAllZeroPrefix(5) && groups[5] === 0xffff) || isAllZeroPrefix(6)) {
    const a = (groups[6]! >> 8) & 0xff;
    const b = groups[6]! & 0xff;
    const c = (groups[7]! >> 8) & 0xff;
    return isPublicIpv4Octets(a, b, c);
  }

  // Unique Local Address (fc00::/7)
  if ((groups[0]! & 0xfe00) === 0xfc00) return false;
  // Link-local (fe80::/10)
  if ((groups[0]! & 0xffc0) === 0xfe80) return false;
  // Multicast (ff00::/8)
  if ((groups[0]! & 0xff00) === 0xff00) return false;
  // Documentation (2001:db8::/32)
  if (groups[0] === 0x2001 && groups[1] === 0x0db8) return false;

  return true;
}

function normalizeHostname(rawHostname: string): string {
  const lower = rawHostname.trim().toLowerCase().replace(/\.+$/, "");
  return lower.startsWith("[") && lower.endsWith("]")
    ? lower.slice(1, -1)
    : lower;
}

/**
 * Validates that a URL uses http/https, does not target blocked internal hostnames,
 * and resolves solely to globally routable public IP addresses.
 */
export async function assertSafeMetadataUrl(
  rawUrl: string,
  lookupFn: LookupAddressFn = dnsLookup,
): Promise<URL> {
  const parsedSchema = SafeUrlSchema.safeParse(rawUrl);
  if (!parsedSchema.success) {
    throw new MetadataServiceError(
      "VALIDATION_ERROR",
      parsedSchema.error.issues[0]?.message ||
        "Must be a valid http:// or https:// URL",
      400,
    );
  }

  const parsedUrl = new URL(parsedSchema.data);
  if (parsedUrl.username || parsedUrl.password) {
    throw new MetadataServiceError(
      "VALIDATION_ERROR",
      "URLs with embedded credentials are not allowed",
      400,
    );
  }

  const hostname = normalizeHostname(parsedUrl.hostname);
  if (
    !hostname ||
    BLOCKED_HOSTNAMES.has(hostname) ||
    BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  ) {
    throw new MetadataServiceError(
      "SSRF_BLOCKED",
      "Target hostname is restricted and cannot be previewed",
      400,
    );
  }

  if (net.isIP(hostname) !== 0) {
    if (!isPublicIpAddress(hostname)) {
      throw new MetadataServiceError(
        "SSRF_BLOCKED",
        "Private, loopback, and link-local IP addresses are not allowed",
        400,
      );
    }
    return parsedUrl;
  }

  let resolved: Array<{ address: string; family: number }>;
  try {
    resolved = await lookupFn(hostname, { all: true });
  } catch {
    throw new MetadataServiceError(
      "FETCH_FAILED",
      "Unable to resolve target hostname",
      422,
    );
  }

  if (!resolved || resolved.length === 0) {
    throw new MetadataServiceError(
      "FETCH_FAILED",
      "Target hostname resolved to no addresses",
      422,
    );
  }

  for (const record of resolved) {
    if (!isPublicIpAddress(record.address)) {
      throw new MetadataServiceError(
        "SSRF_BLOCKED",
        "Target hostname resolves to a non-public IP address",
        400,
      );
    }
  }

  return parsedUrl;
}

function decodeHtmlEntities(input: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };

  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : _;
    })
    .replace(/&#([0-9]+);/g, (_, dec: string) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : _;
    })
    .replace(
      /&([a-z]+);/gi,
      (full, name: string) => named[name.toLowerCase()] ?? full,
    );
}

function cleanText(
  raw: string | null | undefined,
  maxLength: number,
): string | null {
  if (!raw) return null;
  const decoded = decodeHtmlEntities(raw).replace(/\s+/g, " ").trim();
  if (!decoded) return null;
  return decoded.length > maxLength
    ? decoded.slice(0, maxLength).trimEnd()
    : decoded;
}

function extractMetaContent(html: string, keys: string[]): string | null {
  const metaTagRegex = /<meta\b[^>]*>/gi;
  const attrRegex =
    /([a-zA-Z0-9:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;

  let match: RegExpExecArray | null;
  while ((match = metaTagRegex.exec(html)) !== null) {
    const tag = match[0];
    const attrs: Record<string, string> = {};
    let attrMatch: RegExpExecArray | null;
    attrRegex.lastIndex = 0;
    while ((attrMatch = attrRegex.exec(tag)) !== null) {
      const attrName = attrMatch[1]!.toLowerCase();
      const attrVal = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? "";
      attrs[attrName] = attrVal;
    }

    const key = (attrs["property"] ?? attrs["name"] ?? "").trim().toLowerCase();
    if (keys.includes(key) && attrs["content"]) {
      return attrs["content"];
    }
  }
  return null;
}

function extractHtmlTitle(html: string): string | null {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return match ? (match[1] ?? null) : null;
}

export function suggestIconForUrl(url: URL): SuggestedLinkIcon {
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();

  if (host === "github.com" || host.endsWith(".github.com")) return "github";
  if (host === "linkedin.com" || host.endsWith(".linkedin.com"))
    return "linkedin";
  if (
    host === "twitter.com" ||
    host.endsWith(".twitter.com") ||
    host === "x.com" ||
    host.endsWith(".x.com")
  ) {
    return "twitter";
  }
  if (
    host === "youtube.com" ||
    host.endsWith(".youtube.com") ||
    host === "youtu.be"
  ) {
    return "youtube";
  }
  if (
    host.startsWith("docs.") ||
    host.endsWith(".readthedocs.io") ||
    host === "medium.com" ||
    host.endsWith(".medium.com") ||
    host === "dev.to" ||
    host === "substack.com" ||
    host.endsWith(".substack.com") ||
    host === "notion.so" ||
    host.endsWith(".notion.site") ||
    path.startsWith("/docs") ||
    path.startsWith("/blog")
  ) {
    return "book-open";
  }

  return "globe";
}

async function readLimitedHtml(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (totalBytes < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      const remaining = MAX_HTML_BYTES - totalBytes;
      if (value.byteLength > remaining) {
        chunks.push(value.subarray(0, remaining));
        totalBytes += remaining;
        await reader.cancel().catch(() => undefined);
        break;
      }
      chunks.push(value);
      totalBytes += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder("utf-8", { fatal: false }).decode(combined);
}

export interface PreviewMetadataDeps {
  lookup?: LookupAddressFn;
  fetchFn?: typeof fetch;
}

export async function previewUrlMetadata(
  rawUrl: string,
  deps: PreviewMetadataDeps = {},
): Promise<MetadataPreviewResult> {
  const lookupFn = deps.lookup ?? dnsLookup;
  const fetchFn = deps.fetchFn ?? fetch;

  let currentUrl = await assertSafeMetadataUrl(rawUrl, lookupFn);
  let response: Response | null = null;

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    try {
      response = await fetchFn(currentUrl.toString(), {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          "User-Agent": "InsideLink-MetadataPreview/1.0",
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
        },
      });
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === "TimeoutError";
      throw new MetadataServiceError(
        "FETCH_FAILED",
        isTimeout
          ? "Timed out fetching target URL"
          : "Failed to fetch target URL",
        502,
      );
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);

      if (!location) {
        throw new MetadataServiceError(
          "FETCH_FAILED",
          "Redirect missing Location header",
          502,
        );
      }
      if (hop === MAX_REDIRECT_HOPS) {
        throw new MetadataServiceError(
          "FETCH_FAILED",
          "Too many redirects",
          502,
        );
      }

      let nextUrlString: string;
      try {
        nextUrlString = new URL(location, currentUrl).toString();
      } catch {
        throw new MetadataServiceError(
          "FETCH_FAILED",
          "Invalid redirect URL",
          502,
        );
      }

      currentUrl = await assertSafeMetadataUrl(nextUrlString, lookupFn);
      continue;
    }

    break;
  }

  if (!response || !response.ok) {
    await response?.body?.cancel().catch(() => undefined);
    throw new MetadataServiceError(
      "FETCH_FAILED",
      `Target URL responded with status ${response?.status ?? 502}`,
      502,
    );
  }

  const icon = suggestIconForUrl(currentUrl);
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (
    contentType &&
    !contentType.includes("text/html") &&
    !contentType.includes("application/xhtml+xml")
  ) {
    await response.body?.cancel().catch(() => undefined);
    return {
      url: currentUrl.toString(),
      title: null,
      description: null,
      icon,
    };
  }

  const html = await readLimitedHtml(response);
  const rawTitle =
    extractMetaContent(html, ["og:title", "twitter:title"]) ??
    extractHtmlTitle(html);
  const rawDescription = extractMetaContent(html, [
    "og:description",
    "description",
    "twitter:description",
  ]);

  return {
    url: currentUrl.toString(),
    title: cleanText(rawTitle, 150),
    description: cleanText(rawDescription, 500),
    icon,
  };
}
