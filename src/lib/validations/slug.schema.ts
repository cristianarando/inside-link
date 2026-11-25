import { z } from "zod";
import { isReservedSlug } from "../constants/reserved-slugs";

export function normalizeSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents and diacritics
    .replace(/\s+/g, "-") // spaces to hyphens
    .replace(/[^a-z0-9-_]/g, "") // remove invalid characters
    .replace(/-+/g, "-") // collapse repeated hyphens
    .replace(/^[-_]+|[-_]+$/g, ""); // trim leading/trailing separators
}

export const SlugSchema = z
  .string()
  // Validate raw input BEFORE normalization, since normalizeSlug strips dots ("favicon.ico" -> "faviconico").
  .refine(
    (raw) => !raw.includes("."),
    "Slug cannot contain dots or file extensions",
  )
  .refine((raw) => !isReservedSlug(raw), "Slug matches a reserved system route")
  .transform((val) => normalizeSlug(val))
  .pipe(
    z
      .string()
      .min(3, "Slug must be at least 3 characters")
      .max(100, "Slug cannot exceed 100 characters")
      .regex(
        /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/,
        "Slug may only contain lowercase letters, numbers, hyphens, and underscores, without leading or trailing separators",
      )
      .refine(
        (val) => !val.includes("."),
        "Slug cannot contain dots or file extensions",
      )
      .refine(
        (val) => !isReservedSlug(val),
        "Slug matches a reserved system route",
      ),
  );

export type ValidatedSlug = z.infer<typeof SlugSchema>;

export type SlugClassification =
  | { ok: true; normalized: string }
  | {
      ok: false;
      normalized: string;
      reason: "RESERVED" | "INVALID";
      message: string;
    };

/**
 * Classifies a raw slug, distinguishing "reserved" from "syntactically invalid".
 * Pure helper shared between server (service/API) and client (editor modal).
 */
export function classifySlug(raw: string): SlugClassification {
  const normalized = normalizeSlug(raw);

  if (
    isReservedSlug(raw) ||
    (normalized.length > 0 && isReservedSlug(normalized))
  ) {
    return {
      ok: false,
      normalized,
      reason: "RESERVED",
      message: "Slug matches a reserved system route",
    };
  }

  const result = SlugSchema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      normalized,
      reason: "INVALID",
      message: result.error.issues[0]?.message ?? "Invalid slug",
    };
  }

  return { ok: true, normalized: result.data };
}
