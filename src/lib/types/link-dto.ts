/**
 * Link Data Transfer Object (DTO) contracts.
 * Pure client-safe TypeScript interfaces. Never expose `password_hash` or sensitive DB fields.
 */
import type { RoutingRule } from "../smart-routing";
import type {
  CardStyle,
  DirectoryLayout,
  GlowIntensity,
  LinkThemeOverride,
  ResolvedThemeTokens,
  StatusColor,
  SurfaceTone,
  ThemePresetId,
} from "../themes";
import type { HubLinkItem } from "../validations/link.schema";

export type OgMode = "auto" | "custom" | "minimal";

export type LinkType = "DIRECT" | "HUB";
export type LinkCategory =
  | "social"
  | "project"
  | "resource"
  | "personal"
  | "temporary";
export type LinkStatusFilter =
  | "all"
  | "active"
  | "inactive"
  | "expired"
  | "pinned";

export type LinkHealthStatus = "healthy" | "redirect" | "broken" | "timeout";

/** Complete link representation for the `/admin` dashboard. */
export interface LinkDTO {
  id: string;
  slug: string;
  shortUrl: string;
  type: LinkType;
  destinationUrl: string | null;
  redirectStatus: number;
  forwardQueryParams: boolean;
  hubLinks: HubLinkItem[] | null;
  title: string;
  description: string | null;
  ogImageUrl: string | null;
  ogMode: OgMode;
  category: LinkCategory;
  tags: string[];
  icon: string;
  isActive: boolean;
  isPublic: boolean;
  isPinned: boolean;
  hasPin: boolean;
  isScheduled: boolean;
  startsAt: string | null;
  isExpired: boolean;
  expiresAt: string | null;
  expiredRedirectUrl: string | null;
  maxClicks: number | null;
  clicksCount: number;
  isCloaked: boolean;
  theme: LinkThemeOverride | null;
  routingRules: RoutingRule[];
  healthStatus: LinkHealthStatus | null;
  healthStatusCode: number | null;
  healthLatencyMs: number | null;
  healthCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Reduced link representation for the public `/` directory (omits private destinations, caps, and metrics). */
export interface PublicLinkDTO {
  id: string;
  slug: string;
  shortUrl: string;
  type: LinkType;
  title: string;
  description: string | null;
  category: LinkCategory;
  tags: string[];
  icon: string;
  isPinned: boolean;
  hasPin: boolean;
  isScheduled: boolean;
  startsAt: string | null;
  theme: LinkThemeOverride | null;
}

export interface SocialLinkItem {
  id: string;
  platform: string;
  label: string;
  url: string;
  icon?: string;
}

export interface SiteSettingsDTO {
  id: "default";
  displayName: string;
  headline: string;
  bio: string;
  avatarUrl: string;
  statusText: string | null;
  statusColor: StatusColor;
  statusHref: string | null;
  themePreset: ThemePresetId | "custom";
  customAccentHex: string | null;
  surfaceTone: SurfaceTone;
  glowIntensity: GlowIntensity;
  cardStyle: CardStyle;
  directoryLayout: DirectoryLayout;
  socialLinks: SocialLinkItem[];
  resolvedTheme: ResolvedThemeTokens;
  updatedAt: string;
}

export type BulkLinkAction =
  | "activate"
  | "pause"
  | "makePublic"
  | "makePrivate"
  | "setCategory"
  | "delete";

export interface BulkActionResult {
  action: BulkLinkAction;
  requestedCount: number;
  affectedCount: number;
}

export interface LinkBackupItem {
  slug: string;
  type: LinkType;
  destinationUrl: string | null;
  redirectStatus: number;
  forwardQueryParams: boolean;
  hubLinks: HubLinkItem[] | null;
  title: string;
  description: string | null;
  ogImageUrl: string | null;
  ogMode: OgMode;
  category: LinkCategory;
  tags: string[];
  icon: string;
  isActive: boolean;
  isPublic: boolean;
  isPinned: boolean;
  hasPin?: boolean;
  startsAt: string | null;
  expiresAt: string | null;
  expiredRedirectUrl: string | null;
  maxClicks: number | null;
  isCloaked: boolean;
  theme: LinkThemeOverride | null;
  routingRules: RoutingRule[];
  createdAt?: string;
  updatedAt?: string;
}

export interface LinksBackupPayload {
  version: "2.0";
  exportedAt: string;
  count: number;
  links: LinkBackupItem[];
}

export type BackupConflictStrategy = "skip" | "update";

export interface BackupSlugPreviewItem {
  slug: string;
  title: string;
  operation: "create" | "update" | "skip";
}

export interface ImportLinksBackupResult {
  dryRun: boolean;
  totalIncoming: number;
  toCreate: number;
  toUpdate: number;
  toSkip: number;
  created: number;
  updated: number;
  skipped: number;
  slugsPreview: BackupSlugPreviewItem[];
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasNextPage: boolean;
}

export interface SlugAvailability {
  available: boolean;
  normalizedSlug: string;
  reason?: "RESERVED" | "INVALID" | "TAKEN";
  message?: string;
}
