"use client";

import React, { useState } from "react";
import {
  parseGitHubRepoUrl,
  parseSpotifyEmbed,
  parseYouTubeEmbed,
} from "@/lib/embed-parsers";
import { resolveThemeTokens, themeTokensToCssVars } from "@/lib/themes";
import type { LinkDTO } from "@/lib/types/link-dto";
import type { HubLinkItem } from "@/lib/validations/link.schema";
import { getCanonicalBaseUrl } from "@/server/og/presentation";
import { getPortfolioBaseUrl } from "@/server/services/og-render.service";
import { isSafeHttpUrl } from "./hub-landing-html";

function HubLinkIcon({ icon }: { icon: string }) {
  switch (icon.trim().toLowerCase()) {
    case "github":
      return (
        <svg
          className="h-4 w-4 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
          <path d="M9 18c-4.51 2-5-2-7-2" />
        </svg>
      );
    case "youtube":
      return (
        <svg
          className="h-4 w-4 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
          <path d="m10 15 5-3-5-3z" />
        </svg>
      );
    case "code-2":
      return (
        <svg
          className="h-4 w-4 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m18 16 4-4-4-4" />
          <path d="m6 8-4 4 4 4" />
          <path d="m14.5 4-5 16" />
        </svg>
      );
    case "play":
      return (
        <svg
          className="h-4 w-4 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polygon points="6 3 20 12 6 21 6 3" />
        </svg>
      );
    case "globe":
      return (
        <svg
          className="h-4 w-4 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
          <path d="M2 12h20" />
        </svg>
      );
    case "book-open":
      return (
        <svg
          className="h-4 w-4 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 7v14" />
          <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
        </svg>
      );
    case "external-link":
    default:
      return (
        <svg
          className="h-4 w-4 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M15 3h6v6" />
          <path d="M10 14 21 3" />
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        </svg>
      );
  }
}

export function HubBlockRenderer({
  item,
  onSubLinkClick,
}: {
  item: HubLinkItem;
  onSubLinkClick: (subLinkId: string) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const kind = item.kind ?? "button";

  if (kind === "github-repo") {
    if (!isSafeHttpUrl(item.url)) return null;
    const repo = parseGitHubRepoUrl(item.url);
    return (
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => onSubLinkClick(item.id)}
        className="flex flex-col gap-1.5 rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-zinc-100 transition hover:-translate-y-0.5 hover:border-zinc-600"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 font-mono text-xs font-semibold">
            <HubLinkIcon icon="github" />
            <span>{repo?.fullName ?? item.label}</span>
          </span>
          <span aria-hidden="true" className="text-xs text-zinc-400">
            ↗
          </span>
        </div>
        {item.sublabel ? (
          <p className="text-xs leading-relaxed text-zinc-400">
            {item.sublabel}
          </p>
        ) : null}
      </a>
    );
  }

  if (kind === "youtube") {
    if (!isSafeHttpUrl(item.url)) return null;
    const yt = parseYouTubeEmbed(item.url);
    if (!yt) return null;
    if (playing) {
      return (
        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-black">
          <iframe
            src={yt.embedUrl}
            title={item.label}
            className="aspect-video w-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
          />
        </div>
      );
    }
    return (
      <button
        type="button"
        onClick={() => {
          onSubLinkClick(item.id);
          setPlaying(true);
        }}
        style={{
          backgroundImage: `linear-gradient(180deg,rgba(9,9,11,.45),rgba(9,9,11,.92)),url('${yt.thumbnailUrl}')`,
        }}
        className="flex min-h-[176px] w-full cursor-pointer flex-col justify-between rounded-xl border border-zinc-800 bg-zinc-950 bg-cover bg-center p-4 text-left text-zinc-100 transition hover:border-zinc-600"
      >
        <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-white/15 bg-zinc-950/80 px-2.5 py-1 font-mono text-[11px] text-zinc-200">
          <HubLinkIcon icon="youtube" />
          <span>YouTube · Click to Play</span>
        </span>
        <div className="mt-6 flex items-end justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">{item.label}</div>
            {item.sublabel ? (
              <div className="mt-0.5 text-xs text-zinc-300">
                {item.sublabel}
              </div>
            ) : null}
          </div>
          <span
            style={{
              backgroundColor: "var(--il-accent, #10b981)",
              color: "var(--il-accent-text, #052e16)",
            }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
          >
            <HubLinkIcon icon="play" />
            <span>Play</span>
          </span>
        </div>
      </button>
    );
  }

  if (kind === "spotify") {
    if (!isSafeHttpUrl(item.url)) return null;
    const sp = parseSpotifyEmbed(item.url);
    if (!sp) return null;
    const height =
      sp.entityType === "track" || sp.entityType === "episode" ? 152 : 352;
    if (playing) {
      return (
        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
          <iframe
            src={sp.embedUrl}
            title={item.label}
            style={{ height }}
            className="w-full border-0"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          />
        </div>
      );
    }
    return (
      <button
        type="button"
        onClick={() => {
          onSubLinkClick(item.id);
          setPlaying(true);
        }}
        className="flex min-h-[120px] w-full cursor-pointer flex-col justify-between rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-left text-zinc-100 transition hover:border-zinc-600"
      >
        <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-white/15 bg-zinc-900 px-2.5 py-1 font-mono text-[11px] text-zinc-200">
          <span>Spotify {sp.entityType.toUpperCase()} · Click to Play</span>
        </span>
        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">{item.label}</div>
            {item.sublabel ? (
              <div className="mt-0.5 text-xs text-zinc-400">
                {item.sublabel}
              </div>
            ) : null}
          </div>
          <span
            style={{
              backgroundColor: "var(--il-accent, #10b981)",
              color: "var(--il-accent-text, #052e16)",
            }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
          >
            <HubLinkIcon icon="play" />
            <span>Listen</span>
          </span>
        </div>
      </button>
    );
  }

  if (kind === "code") {
    if (!item.codeText?.trim()) return null;
    const handleCopyCode = async () => {
      onSubLinkClick(item.id);
      if (typeof navigator === "undefined" || !navigator.clipboard) return;
      try {
        await navigator.clipboard.writeText(item.codeText ?? "");
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 1800);
      } catch {
        // Ignore clipboard errors.
      }
    };
    return (
      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-[#070709]">
        <div className="flex items-center justify-between border-b border-zinc-800/80 bg-zinc-900/70 px-3 py-2 text-xs text-zinc-200">
          <span className="inline-flex items-center gap-2 font-medium">
            <HubLinkIcon icon="code-2" />
            <span>{item.label}</span>
            <span className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] uppercase text-zinc-400">
              {item.codeLanguage || "shell"}
            </span>
          </span>
          <button
            type="button"
            onClick={handleCopyCode}
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 font-mono text-[11px] text-zinc-300 hover:text-white"
          >
            {copiedCode ? "Copied!" : "Copy"}
          </button>
        </div>
        <pre className="overflow-x-auto p-3.5 font-mono text-xs leading-relaxed text-zinc-200">
          <code>{item.codeText}</code>
        </pre>
      </div>
    );
  }

  if (kind === "callout") {
    if (!item.sublabel?.trim()) return null;
    const toneClass =
      item.calloutTone === "warning"
        ? "border-amber-500/35 bg-amber-500/10 text-amber-100"
        : "border-emerald-500/30 bg-emerald-500/10 text-zinc-100";
    return (
      <div className={`rounded-xl border p-3.5 ${toneClass}`}>
        <div className="text-xs font-semibold">{item.label}</div>
        <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-zinc-300">
          {item.sublabel}
        </p>
      </div>
    );
  }

  if (!isSafeHttpUrl(item.url)) return null;
  const isPrimary = item.variant !== "secondary" && item.variant !== "outline";
  const variantClass =
    item.variant === "secondary"
      ? "border border-zinc-700 bg-zinc-800 text-zinc-100 hover:border-zinc-500"
      : item.variant === "outline"
        ? "border border-zinc-700 bg-transparent text-zinc-200 hover:border-zinc-500"
        : "font-semibold";

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => onSubLinkClick(item.id)}
      style={
        isPrimary
          ? {
              backgroundColor: "var(--il-accent, #10b981)",
              color: "var(--il-accent-text, #052e16)",
            }
          : undefined
      }
      className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-medium transition hover:-translate-y-0.5 ${variantClass}`}
    >
      <span className="inline-flex items-center gap-2.5">
        <HubLinkIcon icon={item.icon} />
        <span className="flex flex-col">
          <span>{item.label}</span>
          {item.sublabel ? (
            <span className="text-xs font-normal opacity-80">
              {item.sublabel}
            </span>
          ) : null}
        </span>
      </span>
      <span aria-hidden="true">↗</span>
    </a>
  );
}

export function HubLandingView({ link }: { link: LinkDTO }) {
  const baseUrl = getPortfolioBaseUrl();
  const shortUrl = link.shortUrl || `${getCanonicalBaseUrl()}/${link.slug}`;
  const [copied, setCopied] = useState(false);
  const tokens = resolveThemeTokens(null, link.theme);
  const cssVars = themeTokensToCssVars(tokens) as React.CSSProperties;

  const handleCopy = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(shortUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard permission errors.
    }
  };

  const handleSubLinkClick = (subLinkId: string) => {
    const url = `/api/v1/slug/${encodeURIComponent(link.slug)}/hub-click`;
    const body = JSON.stringify({ subLinkId });
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.sendBeacon === "function"
    ) {
      navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => undefined);
  };

  return (
    <main
      style={cssVars}
      className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 py-10 text-zinc-50"
    >
      <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900/80 p-8 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 font-mono text-xs uppercase tracking-wider text-emerald-300">
            Project · HUB
          </span>
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1 font-mono text-xs text-zinc-400 transition hover:border-emerald-500/40 hover:text-emerald-300"
          >
            {copied ? "Copied!" : "Copy link"}
          </button>
        </div>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">
          {link.title}
        </h1>
        {link.description ? (
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            {link.description}
          </p>
        ) : null}

        {link.tags.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {link.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-0.5 font-mono text-xs text-zinc-400"
              >
                #{tag}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-2.5">
          {(link.hubLinks ?? []).map((item) => (
            <HubBlockRenderer
              key={item.id}
              item={item}
              onSubLinkClick={handleSubLinkClick}
            />
          ))}
        </div>

        <footer className="mt-6 flex items-center justify-between border-t border-zinc-800 pt-4 text-xs text-zinc-500">
          <a href={baseUrl} className="hover:text-zinc-300">
            cristianarando.dev
          </a>
          <a href="/" className="hover:text-zinc-300">
            Browse public links →
          </a>
        </footer>
      </div>
    </main>
  );
}
