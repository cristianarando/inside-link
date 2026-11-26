import React from "react";
import type { Metadata } from "next";
import { PublicLinkDirectory } from "@/components/public-links/public-link-directory";
import { env, getCanonicalHost, getCanonicalUrl } from "@/lib/env";
import type {
  LinkCategory,
  PaginatedResult,
  PublicLinkDTO,
  SiteSettingsDTO,
} from "@/lib/types/link-dto";
import {
  buildDefaultSiteSettings,
  linkService,
  settingsService,
} from "@/server/services";

export const dynamic = "force-dynamic";

const FALLBACK_TITLE = "Official Links & Projects — Cristian Arando";
const FALLBACK_DESCRIPTION =
  "Public directory of software projects, repositories, social profiles, and technical resources by Cristian Arando.";

const VALID_CATEGORIES = new Set<LinkCategory>([
  "social",
  "project",
  "resource",
  "personal",
  "temporary",
]);

const canonicalHost = getCanonicalHost();

async function getSafeSiteSettings(): Promise<SiteSettingsDTO> {
  try {
    return await settingsService.getSiteSettings();
  } catch {
    return buildDefaultSiteSettings();
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSafeSiteSettings();
  const title =
    settings.displayName && settings.headline
      ? `${settings.displayName} — ${settings.headline}`
      : FALLBACK_TITLE;
  const description = settings.bio?.trim() || FALLBACK_DESCRIPTION;

  return {
    title,
    description,
    alternates: {
      canonical: "/",
    },
    openGraph: {
      type: "website",
      url: "/",
      siteName: canonicalHost,
      title,
      description,
      images: [
        {
          url: "/api/v1/og/default/image.png",
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/api/v1/og/default/image.png"],
    },
  };
}

export interface PublicLinksPageProps {
  searchParams: Promise<{
    q?: string | string[];
    category?: string | string[];
    kind?: string | string[];
    tag?: string | string[];
  }>;
}

function readSingleParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0]?.trim() ?? "";
  return typeof value === "string" ? value.trim() : "";
}

export default async function PublicLinksPage({
  searchParams,
}: PublicLinksPageProps) {
  const resolvedParams = await searchParams;
  const initialQuery = readSingleParam(resolvedParams.q);
  const rawCategory = readSingleParam(resolvedParams.category).toLowerCase();
  const rawKind = readSingleParam(resolvedParams.kind);
  const initialTag = readSingleParam(resolvedParams.tag);

  const resolvedCategory: LinkCategory | "all" = VALID_CATEGORIES.has(
    rawCategory as LinkCategory,
  )
    ? (rawCategory as LinkCategory)
    : VALID_CATEGORIES.has(rawKind.toLowerCase() as LinkCategory)
      ? (rawKind.toLowerCase() as LinkCategory)
      : "all";

  const normalizedKind =
    rawKind.toUpperCase() === "DIRECT" || rawKind.toUpperCase() === "HUB"
      ? rawKind.toUpperCase()
      : "";

  const [siteSettings, initialPage] = await Promise.all([
    getSafeSiteSettings(),
    linkService
      .listPublicLinks({
        limit: initialTag || normalizedKind ? 50 : 12,
        q: initialQuery || undefined,
        category: resolvedCategory !== "all" ? resolvedCategory : undefined,
      })
      .catch(
        (): PaginatedResult<PublicLinkDTO> => ({
          items: [],
          nextCursor: null,
          hasNextPage: false,
        }),
      ),
  ]);

  const portfolioUrl = env.NEXT_PUBLIC_PORTFOLIO_URL.replace(/\/+$/, "");
  const canonicalUrl = getCanonicalUrl();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${siteSettings.displayName} — ${siteSettings.headline}`,
    description: siteSettings.bio || FALLBACK_DESCRIPTION,
    url: canonicalUrl,
    author: {
      "@type": "Person",
      name: siteSettings.displayName,
      url: portfolioUrl,
    },
  };

  return (
    <main className="bg-obsidian-glow min-h-screen text-zinc-50">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:py-16">
        <PublicLinkDirectory
          initialPage={initialPage}
          siteSettings={siteSettings}
          initialQuery={initialQuery}
          initialCategory={resolvedCategory}
          initialKind={normalizedKind || rawKind}
          initialTag={initialTag}
        />
      </div>
    </main>
  );
}
