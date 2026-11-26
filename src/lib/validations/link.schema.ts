import { z } from "zod";
import {
  parseGitHubRepoUrl,
  parseSpotifyEmbed,
  parseYouTubeEmbed,
} from "../embed-parsers";
import { RoutingRuleSchema } from "../smart-routing";
import { LinkThemeOverrideSchema } from "../themes";
import { SlugSchema } from "./slug.schema";

export const SafeUrlSchema = z
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

const OptionalNullableSafeUrlSchema = z.preprocess(
  (val) => (typeof val === "string" && val.trim() === "" ? null : val),
  SafeUrlSchema.optional().nullable(),
);

export const HUB_BLOCK_KINDS = [
  "button",
  "github-repo",
  "youtube",
  "spotify",
  "code",
  "callout",
] as const;

export type HubBlockKind = (typeof HUB_BLOCK_KINDS)[number];

export const CALLOUT_TONES = ["info", "tip", "warning"] as const;
export type CalloutTone = (typeof CALLOUT_TONES)[number];

export interface HubLinkItem {
  id: string;
  kind?: HubBlockKind;
  label: string;
  sublabel?: string | null;
  url?: string;
  icon: string;
  variant: "primary" | "secondary" | "outline";
  codeText?: string | null;
  codeLanguage?: string | null;
  calloutTone?: CalloutTone | null;
}

const HubLinkItemBaseSchema = z.object({
  id: z.string().min(1).max(32),
  kind: z.enum(HUB_BLOCK_KINDS).optional(),
  label: z.string().min(1, "Block label is required").max(80),
  sublabel: z.string().max(120).optional().nullable(),
  url: OptionalNullableSafeUrlSchema.transform((val) => val ?? undefined),
  icon: z.string().default("external-link"),
  variant: z.enum(["primary", "secondary", "outline"]).default("primary"),
  codeText: z.string().max(1000).optional().nullable(),
  codeLanguage: z.string().max(24).optional().nullable(),
  calloutTone: z.enum(CALLOUT_TONES).optional().nullable(),
});

export const HubLinkItemSchema = HubLinkItemBaseSchema.superRefine(
  (item, ctx) => {
    const kind = item.kind ?? "button";

    if (
      kind === "button" ||
      kind === "github-repo" ||
      kind === "youtube" ||
      kind === "spotify"
    ) {
      if (!item.url || item.url.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["url"],
          message: `URL is required for ${kind} blocks`,
        });
        return;
      }

      if (kind === "github-repo" && !parseGitHubRepoUrl(item.url)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["url"],
          message:
            "Must be a valid GitHub repository URL (https://github.com/owner/repo)",
        });
      } else if (kind === "youtube" && !parseYouTubeEmbed(item.url)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["url"],
          message: "Must be a valid YouTube video URL",
        });
      } else if (kind === "spotify" && !parseSpotifyEmbed(item.url)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["url"],
          message:
            "Must be a valid Spotify track, album, playlist, episode, show, or artist URL",
        });
      }
    } else if (kind === "code") {
      if (!item.codeText || item.codeText.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["codeText"],
          message: "Code snippet text is required for code blocks",
        });
      }
    } else if (kind === "callout") {
      if (!item.sublabel || item.sublabel.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sublabel"],
          message:
            "Callout body text (sublabel) is required for callout blocks",
        });
      }
    }
  },
);

export const LinkCategorySchema = z.enum([
  "social",
  "project",
  "resource",
  "personal",
  "temporary",
]);

export const BaseLinkSchema = z.object({
  slug: z.string().optional(),
  type: z.enum(["DIRECT", "HUB"]).default("DIRECT"),
  destinationUrl: OptionalNullableSafeUrlSchema,
  redirectStatus: z
    .union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)])
    .default(307),
  forwardQueryParams: z.boolean().default(true),
  hubLinks: z.array(HubLinkItemSchema).max(12).optional().nullable(),
  title: z.string().min(1, "Title is required").max(150),
  description: z.string().max(500).optional().nullable(),
  ogImageUrl: OptionalNullableSafeUrlSchema,
  ogMode: z.enum(["auto", "custom", "minimal"]).optional(),
  category: LinkCategorySchema.default("project"),
  tags: z
    .array(
      z
        .string()
        .min(1)
        .max(30)
        .transform((t) => t.trim().toLowerCase()),
    )
    .max(10)
    .default([]),
  icon: z.string().default("link"),
  isActive: z.boolean().default(true),
  isPublic: z.boolean().default(false),
  isPinned: z.boolean().default(false),
  pin: z
    .string()
    .min(4, "PIN must be at least 4 characters")
    .max(32)
    .optional()
    .nullable(),
  startsAt: z.coerce.date().optional().nullable(),
  expiresAt: z.coerce.date().optional().nullable(),
  expiredRedirectUrl: OptionalNullableSafeUrlSchema,
  maxClicks: z.number().int().positive().optional().nullable(),
  isCloaked: z.boolean().default(false),
  theme: LinkThemeOverrideSchema.optional().nullable(),
  routingRules: z.array(RoutingRuleSchema).max(15).optional().nullable(),
});

function validateLinkInvariants(
  data: Partial<z.infer<typeof BaseLinkSchema>>,
  ctx: z.RefinementCtx,
) {
  if (data.slug && data.slug.trim().length > 0) {
    const parsed = SlugSchema.safeParse(data.slug);
    if (!parsed.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["slug"],
        message: parsed.error.issues[0]?.message || "Invalid slug",
      });
    }
  }

  if (data.type === "DIRECT") {
    if (!data.destinationUrl || data.destinationUrl.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["destinationUrl"],
        message: "Destination URL is required for DIRECT links",
      });
    }
  }

  if (data.type === "HUB") {
    if (!data.hubLinks || data.hubLinks.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["hubLinks"],
        message: "HUB mode requires at least one sub-link",
      });
    }
  }

  if (
    data.startsAt instanceof Date &&
    data.expiresAt instanceof Date &&
    data.startsAt.getTime() >= data.expiresAt.getTime()
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["expiresAt"],
      message: "Expiration date must be after scheduled launch date",
    });
  }
}

export const CreateLinkSchema = BaseLinkSchema.superRefine(
  validateLinkInvariants,
);

export const UpdateLinkSchema = BaseLinkSchema.partial()
  .extend({
    id: z.string().min(1),
  })
  .superRefine(validateLinkInvariants);

export type CreateLinkInput = z.infer<typeof CreateLinkSchema>;
export type UpdateLinkInput = z.infer<typeof UpdateLinkSchema>;
