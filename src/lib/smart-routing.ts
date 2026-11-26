import { z } from "zod";
import { extractTrafficMetadata } from "./geo-headers";

const SafeHttpUrlSchema = z
  .string()
  .trim()
  .url("Must be a valid URL")
  .refine((url) => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }, "Only http:// or https:// URLs are allowed");

export const ROUTING_DEVICES = ["mobile", "desktop", "tablet"] as const;
export type RoutingDevice = (typeof ROUTING_DEVICES)[number];

export const ROUTING_OS_LIST = [
  "iOS",
  "Android",
  "Windows",
  "macOS",
  "Linux",
] as const;
export type RoutingOs = (typeof ROUTING_OS_LIST)[number];

export const RoutingRuleSchema = z.object({
  id: z.string().trim().min(1).max(64),
  label: z.string().trim().max(80).optional().nullable(),
  destinationUrl: SafeHttpUrlSchema,
  countries: z
    .array(
      z
        .string()
        .trim()
        .min(2)
        .max(2)
        .transform((code) => code.toUpperCase()),
    )
    .max(50)
    .optional(),
  languages: z
    .array(
      z
        .string()
        .trim()
        .min(2)
        .max(16)
        .transform((lang) => lang.toLowerCase()),
    )
    .max(25)
    .optional(),
  devices: z.array(z.enum(ROUTING_DEVICES)).max(3).optional(),
  os: z.array(z.enum(ROUTING_OS_LIST)).max(5).optional(),
});

export type RoutingRule = z.infer<typeof RoutingRuleSchema>;

export interface SmartRoutingContext {
  country?: string | null;
  acceptLanguage?: string | null;
  language?: string | null;
  device?: string | null;
  os?: string | null;
}

function isSafeDestinationUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function readHeaderValue(
  headers: Headers | Record<string, string | string[] | undefined> | undefined,
  name: string,
): string | null {
  if (!headers) return null;
  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name);
  }
  const raw = (headers as Record<string, string | string[] | undefined>)[
    name.toLowerCase()
  ];
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw ?? null;
}

/**
 * Extracts the top-priority language tags (full tag + primary language subtag)
 * from an HTTP `Accept-Language` header or explicit language code.
 */
export function extractPreferredLanguageCandidates(
  acceptLanguage?: string | null,
  explicitLanguage?: string | null,
): string[] {
  const candidates = new Set<string>();

  if (explicitLanguage && explicitLanguage.trim().length > 0) {
    const clean = explicitLanguage.trim().toLowerCase();
    candidates.add(clean);
    const primary = clean.split("-")[0];
    if (primary) candidates.add(primary);
  }

  if (acceptLanguage && acceptLanguage.trim().length > 0) {
    const parsedEntries = acceptLanguage
      .split(",")
      .map((part, index) => {
        const segments = part.trim().split(";");
        const tag = (segments[0] ?? "").trim().toLowerCase();
        let q = 1;
        for (let i = 1; i < segments.length; i++) {
          const param = segments[i]?.trim() ?? "";
          if (param.startsWith("q=")) {
            const parsedQ = Number.parseFloat(param.slice(2));
            if (Number.isFinite(parsedQ)) {
              q = Math.max(0, Math.min(1, parsedQ));
            }
          }
        }
        return { tag, q, index };
      })
      .filter(
        (entry) => entry.tag.length >= 2 && entry.tag !== "*" && entry.q > 0,
      )
      .sort((a, b) => (b.q !== a.q ? b.q - a.q : a.index - b.index));

    const best = parsedEntries[0];
    if (best) {
      candidates.add(best.tag);
      const primary = best.tag.split("-")[0];
      if (primary) candidates.add(primary);
    }
  }

  return Array.from(candidates);
}

/**
 * Builds a `SmartRoutingContext` directly from incoming HTTP request headers.
 */
export function extractSmartRoutingContext(
  headers?: Headers | Record<string, string | string[] | undefined>,
): SmartRoutingContext {
  const traffic = extractTrafficMetadata(headers ?? {});
  return {
    country: traffic.country,
    acceptLanguage: readHeaderValue(headers, "accept-language"),
    device: traffic.device,
    os: traffic.os,
  };
}

/**
 * Evaluates ordered conditional routing rules against request context.
 * Within a rule, all non-empty dimension arrays must match (AND across dimensions,
 * OR within each dimension array). Case-insensitive across all dimensions.
 * Returns the first matching rule's `destinationUrl` or `null`.
 */
export function evaluateSmartRouting(
  rules: readonly RoutingRule[] | null | undefined,
  context: SmartRoutingContext,
): string | null {
  if (!rules || rules.length === 0) return null;

  const countryNorm = context.country?.trim().toLowerCase() ?? "";
  const deviceNorm = context.device?.trim().toLowerCase() ?? "";
  const osNorm = context.os?.trim().toLowerCase() ?? "";
  const langCandidates = extractPreferredLanguageCandidates(
    context.acceptLanguage,
    context.language,
  );

  for (const rule of rules) {
    if (!rule || !isSafeDestinationUrl(rule.destinationUrl)) continue;

    const countries = (rule.countries ?? [])
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean);
    const languages = (rule.languages ?? [])
      .map((l) => l.trim().toLowerCase())
      .filter(Boolean);
    const devices = (rule.devices ?? [])
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);
    const osList = (rule.os ?? [])
      .map((o) => o.trim().toLowerCase())
      .filter(Boolean);

    const hasCondition =
      countries.length > 0 ||
      languages.length > 0 ||
      devices.length > 0 ||
      osList.length > 0;

    if (!hasCondition) continue;

    if (countries.length > 0) {
      if (
        !countryNorm ||
        countryNorm === "xx" ||
        !countries.includes(countryNorm)
      ) {
        continue;
      }
    }

    if (languages.length > 0) {
      const langMatched = languages.some((ruleLang) =>
        langCandidates.includes(ruleLang),
      );
      if (!langMatched) continue;
    }

    if (devices.length > 0) {
      if (!deviceNorm || !devices.includes(deviceNorm)) continue;
    }

    if (osList.length > 0) {
      if (!osNorm || !osList.includes(osNorm)) continue;
    }

    return rule.destinationUrl;
  }

  return null;
}
