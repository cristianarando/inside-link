"use client";

import React, { useState } from "react";
import type { LinkDTO } from "@/lib/types/link-dto";
import { getCanonicalBaseUrl } from "@/server/og/presentation";
import {
  escapeHtml,
  getPortfolioBaseUrl,
  renderOgMetaTags,
} from "@/server/services/og-render.service";

function getCanonicalHostLabel(): string {
  try {
    return new URL(getCanonicalBaseUrl()).host;
  } catch {
    return "links.cristianarando.dev";
  }
}

function isSafeHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function getHubIconPaths(icon: string): string {
  switch (icon.trim().toLowerCase()) {
    case "github":
      return '<path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/>';
    case "linkedin":
      return '<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect width="4" height="12" x="2" y="9"/><circle cx="4" cy="4" r="2"/>';
    case "twitter":
      return '<path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"/>';
    case "youtube":
      return '<path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17"/><path d="m10 15 5-3-5-3z"/>';
    case "globe":
      return '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>';
    case "book-open":
      return '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>';
    case "file-text":
      return '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>';
    case "code-2":
      return '<path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/>';
    case "play":
      return '<polygon points="6 3 20 12 6 21 6 3"/>';
    case "link":
      return '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>';
    case "external-link":
    default:
      return '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>';
  }
}

export function renderHubIconSvg(icon: string, className = "hub-icon"): string {
  const paths = getHubIconPaths(icon);
  return `<svg class="${escapeHtml(className)}" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

export function renderHubLandingHtml(link: LinkDTO): string {
  const baseUrl = escapeHtml(getPortfolioBaseUrl());
  const canonicalHost = escapeHtml(getCanonicalHostLabel());
  const shortUrl = escapeHtml(link.shortUrl || `${getCanonicalBaseUrl()}/${link.slug}`);
  const title = escapeHtml(link.title);
  const description = escapeHtml(
    link.description || "Official project links and resources."
  );
  const slug = escapeHtml(link.slug);

  const tagsHtml =
    link.tags.length > 0
      ? `<div class="tags">${link.tags
          .map((tag) => `<span class="tag">#${escapeHtml(tag)}</span>`)
          .join("")}</div>`
      : "";

  const buttonsHtml = (link.hubLinks ?? [])
    .filter((item) => isSafeHttpUrl(item.url))
    .map((item) => {
      const variantClass =
        item.variant === "primary"
          ? "btn primary"
          : item.variant === "secondary"
            ? "btn secondary"
            : "btn outline";
      return `<a
        class="${variantClass}"
        href="${escapeHtml(item.url)}"
        data-sub-link-id="${escapeHtml(item.id)}"
        target="_blank"
        rel="noopener noreferrer"
      >
        <span class="btn-label">${renderHubIconSvg(item.icon)}<span>${escapeHtml(item.label)}</span></span>
        <span class="arrow" aria-hidden="true">↗</span>
      </a>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="icon" href="/brand/logo-qr.svg" type="image/svg+xml" />
  <title>${title} — ${canonicalHost}</title>
  <meta name="description" content="${description}" />
  ${renderOgMetaTags(link)}
  <style>
    *{box-sizing:border-box}
    body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:radial-gradient(circle at top,rgba(16,185,129,.12) 0%,#09090b 60%);color:#fafafa;font-family:system-ui,-apple-system,sans-serif;padding:24px 16px}
    .card{max-width:480px;width:100%;border:1px solid #27272a;background:rgba(24,24,27,.84);backdrop-filter:blur(12px);border-radius:20px;padding:32px;box-shadow:0 24px 48px rgba(0,0,0,.55)}
    .header-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
    .eyebrow{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;border:1px solid rgba(16,185,129,.32);background:rgba(16,185,129,.1);color:#6ee7b7;font-family:ui-monospace,monospace;font-size:11px;text-transform:uppercase;letter-spacing:.08em}
    .copy-btn{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;border:1px solid #27272a;background:#09090b;color:#a1a1aa;font-family:ui-monospace,monospace;font-size:11px;cursor:pointer;transition:border-color .15s ease,color .15s ease}
    .copy-btn:hover{border-color:rgba(16,185,129,.45);color:#6ee7b7}
    h1{margin:16px 0 8px;font-size:24px;font-weight:600;letter-spacing:-.02em}
    p.desc{margin:0 0 16px;font-size:14px;line-height:1.6;color:#a1a1aa}
    .tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:22px}
    .tag{padding:3px 9px;border-radius:8px;background:#09090b;border:1px solid #27272a;font-family:ui-monospace,monospace;font-size:11px;color:#a1a1aa}
    .links{display:flex;flex-direction:column;gap:10px}
    a.btn{display:flex;align-items:center;justify-content:space-between;padding:13px 16px;border-radius:12px;font-size:14px;font-weight:500;text-decoration:none;transition:transform .12s ease,background .15s ease,border-color .15s ease}
    a.btn:hover{transform:translateY(-1px)}
    .btn-label{display:inline-flex;align-items:center;gap:10px}
    .hub-icon{flex-shrink:0}
    a.primary{background:#10b981;color:#052e16;font-weight:600}
    a.primary:hover{background:#34d399}
    a.secondary{background:#27272a;color:#fafafa;border:1px solid #3f3f46}
    a.secondary:hover{border-color:rgba(16,185,129,.45)}
    a.outline{background:transparent;color:#e4e4e7;border:1px solid #3f3f46}
    a.outline:hover{border-color:rgba(16,185,129,.5);color:#6ee7b7}
    .arrow{font-size:13px;opacity:.75}
    footer{margin-top:24px;padding-top:16px;border-top:1px solid #27272a;display:flex;justify-content:space-between;align-items:center;font-size:12px;color:#71717a}
    footer a{color:#a1a1aa;text-decoration:none}
    footer a:hover{color:#fafafa}
  </style>
</head>
<body>
  <main class="card" data-hub-slug="${slug}" data-short-url="${shortUrl}">
    <div class="header-row">
      <span class="eyebrow">Project · HUB</span>
      <button type="button" id="copy-hub-link" class="copy-btn" aria-label="Copy short link">Copy link</button>
    </div>
    <h1>${title}</h1>
    <p class="desc">${description}</p>
    ${tagsHtml}
    <div class="links">
      ${buttonsHtml}
    </div>
    <footer>
      <a href="${baseUrl}">cristianarando.dev</a>
      <a href="/">Browse public links →</a>
    </footer>
  </main>
  <script>
    (function(){
      var main = document.querySelector('[data-hub-slug]');
      if (!main) return;
      var slug = main.getAttribute('data-hub-slug');
      var shortUrl = main.getAttribute('data-short-url') || window.location.href;
      var copyBtn = document.getElementById('copy-hub-link');
      if (copyBtn && navigator.clipboard) {
        copyBtn.addEventListener('click', function(){
          navigator.clipboard.writeText(shortUrl).then(function(){
            copyBtn.textContent = 'Copied!';
            setTimeout(function(){ copyBtn.textContent = 'Copy link'; }, 1800);
          }).catch(function(){});
        });
      }
      var links = main.querySelectorAll('a[data-sub-link-id]');
      links.forEach(function(anchor){
        anchor.addEventListener('click', function(){
          var subLinkId = anchor.getAttribute('data-sub-link-id');
          if (!subLinkId || !slug) return;
          var url = '/api/v1/slug/' + encodeURIComponent(slug) + '/hub-click';
          var payload = JSON.stringify({ subLinkId: subLinkId });
          if (navigator.sendBeacon) {
            var blob = new Blob([payload], { type: 'application/json' });
            navigator.sendBeacon(url, blob);
          } else {
            fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(function(){});
          }
        });
      });
    })();
  </script>
</body>
</html>`;
}

function HubLinkIcon({ icon }: { icon: string }) {
  switch (icon.trim().toLowerCase()) {
    case "github":
      return (
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
          <path d="M9 18c-4.51 2-5-2-7-2" />
        </svg>
      );
    case "linkedin":
      return (
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
          <rect width="4" height="12" x="2" y="9" />
          <circle cx="4" cy="4" r="2" />
        </svg>
      );
    case "twitter":
      return (
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z" />
        </svg>
      );
    case "youtube":
      return (
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
          <path d="m10 15 5-3-5-3z" />
        </svg>
      );
    case "globe":
      return (
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
          <path d="M2 12h20" />
        </svg>
      );
    case "book-open":
      return (
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 7v14" />
          <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
        </svg>
      );
    case "file-text":
      return (
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
          <path d="M14 2v4a2 2 0 0 0 2 2h4" />
          <path d="M10 9H8" />
          <path d="M16 13H8" />
          <path d="M16 17H8" />
        </svg>
      );
    case "code-2":
      return (
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m18 16 4-4-4-4" />
          <path d="m6 8-4 4 4 4" />
          <path d="m14.5 4-5 16" />
        </svg>
      );
    case "play":
      return (
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="6 3 20 12 6 21 6 3" />
        </svg>
      );
    case "link":
      return (
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      );
    case "external-link":
    default:
      return (
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 3h6v6" />
          <path d="M10 14 21 3" />
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        </svg>
      );
  }
}

export function HubLandingView({ link }: { link: LinkDTO }) {
  const baseUrl = getPortfolioBaseUrl();
  const shortUrl = link.shortUrl || `${getCanonicalBaseUrl()}/${link.slug}`;
  const [copied, setCopied] = useState(false);

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
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
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
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 py-10 text-zinc-50">
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
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">{link.title}</h1>
        {link.description ? (
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">{link.description}</p>
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
          {(link.hubLinks ?? [])
            .filter((item) => isSafeHttpUrl(item.url))
            .map((item) => {
              const variantClass =
                item.variant === "secondary"
                  ? "border border-zinc-700 bg-zinc-800 text-zinc-100 hover:border-emerald-500/45"
                  : item.variant === "outline"
                    ? "border border-zinc-700 bg-transparent text-zinc-200 hover:border-emerald-500/50 hover:text-emerald-300"
                    : "bg-emerald-500 font-semibold text-zinc-950 hover:bg-emerald-400";
              return (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => handleSubLinkClick(item.id)}
                  className={`flex items-center justify-between rounded-xl px-4 py-3 text-sm font-medium transition ${variantClass}`}
                >
                  <span className="inline-flex items-center gap-2.5">
                    <HubLinkIcon icon={item.icon} />
                    <span>{item.label}</span>
                  </span>
                  <span aria-hidden="true">↗</span>
                </a>
              );
            })}
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
