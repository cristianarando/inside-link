import React from "react";
import type { Metadata } from "next";
import { ArrowUpRight, Globe } from "lucide-react";
import { PublicLinkDirectory } from "@/components/public-links/public-link-directory";
import { env, getCanonicalHost, getCanonicalUrl } from "@/lib/env";
import { linkService } from "@/server/services";

export const dynamic = "force-dynamic";

const PAGE_TITLE = "Official Links & Projects — Cristian Arando";
const PAGE_DESCRIPTION =
  "Public directory of software projects, repositories, social profiles, and technical resources by Cristian Arando.";

const canonicalHost = getCanonicalHost();

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: canonicalHost,
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    images: [
      {
        url: "/api/v1/og/default/image.png",
        width: 1200,
        height: 630,
        alt: PAGE_TITLE,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    images: ["/api/v1/og/default/image.png"],
  },
};

export default async function PublicLinksPage() {
  const initialPage = await linkService.listPublicLinks({ limit: 12 });
  const portfolioUrl = env.NEXT_PUBLIC_PORTFOLIO_URL.replace(/\/+$/, "");
  const canonicalUrl = getCanonicalUrl();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: canonicalUrl,
    author: {
      "@type": "Person",
      name: "Cristian Arando",
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
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:py-16">
        <header className="obsidian-surface mb-10 flex flex-col justify-between gap-6 rounded-2xl border border-zinc-800/80 p-6 sm:flex-row sm:items-center sm:p-7">
          <div className="flex items-start gap-4 sm:items-center">
            <img
              src="/brand/author-avatar.png"
              alt="Cristian Arando"
              width={64}
              height={64}
              className="h-14 w-14 shrink-0 rounded-2xl border border-emerald-500/30 bg-zinc-950 object-cover shadow-lg shadow-emerald-950/40 sm:h-16 sm:w-16"
            />
            <div className="min-w-0 space-y-1.5">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-0.5 font-mono text-[11px] text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {canonicalHost}
              </div>
              <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
                Cristian Arando — Links &amp; Projects
              </h1>
              <p className="max-w-xl text-sm leading-relaxed text-zinc-400">
                Curated directory of full-stack projects, interactive
                micro-landings, open-source repositories, and verified social
                profiles.
              </p>
            </div>
          </div>

          <a
            href={portfolioUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-xl border border-zinc-800 bg-[#16161b] px-4 py-2.5 text-xs font-medium text-zinc-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition hover:border-emerald-500/40 hover:bg-zinc-800/80 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 sm:self-center"
          >
            <Globe className="h-4 w-4 text-emerald-400" />
            Main Portfolio
            <ArrowUpRight className="h-3.5 w-3.5 text-zinc-400" />
          </a>
        </header>

        <PublicLinkDirectory initialPage={initialPage} />
      </div>
    </main>
  );
}
