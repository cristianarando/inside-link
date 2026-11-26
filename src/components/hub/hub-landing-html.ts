import {
  parseGitHubRepoUrl,
  parseSpotifyEmbed,
  parseYouTubeEmbed,
} from "@/lib/embed-parsers";
import {
  resolveThemeTokens,
  themeTokensToInlineStyle,
  type ResolvedThemeTokens,
} from "@/lib/themes";
import type { LinkDTO } from "@/lib/types/link-dto";
import type { HubLinkItem } from "@/lib/validations/link.schema";
import { getCanonicalBaseUrl } from "@/server/og/presentation";
import type { GitHubRepoPreview } from "@/server/services/github-repo.service";
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

export function isSafeHttpUrl(url: string | null | undefined): url is string {
  return typeof url === "string" && /^https?:\/\//i.test(url);
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
    case "spotify":
    case "headphones":
      return '<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>';
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
    case "info":
      return '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>';
    case "alert-triangle":
      return '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>';
    case "sparkles":
      return '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>';
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

function formatCompactMetric(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

export interface HubLandingRenderOptions {
  themeTokens?: ResolvedThemeTokens;
  repoPreviews?: Record<string, GitHubRepoPreview>;
}

function renderHubBlockHtml(
  item: HubLinkItem,
  repoPreviews: Record<string, GitHubRepoPreview>,
): string {
  const kind = item.kind ?? "button";
  const subId = escapeHtml(item.id);
  const label = escapeHtml(item.label);
  const sublabel = item.sublabel ? escapeHtml(item.sublabel) : "";

  if (kind === "github-repo") {
    if (!isSafeHttpUrl(item.url)) return "";
    const parsed = parseGitHubRepoUrl(item.url);
    const preview = repoPreviews[item.id];
    const fullName = escapeHtml(
      preview?.fullName || parsed?.fullName || item.label,
    );
    const repoDesc = escapeHtml(preview?.description || item.sublabel || "");
    const lang = preview?.language ? escapeHtml(preview.language) : "";
    const langColor = escapeHtml(preview?.languageColor || "#10b981");
    const stars =
      typeof preview?.stars === "number"
        ? formatCompactMetric(preview.stars)
        : null;
    const forks =
      typeof preview?.forks === "number"
        ? formatCompactMetric(preview.forks)
        : null;

    const metaParts: string[] = [];
    if (lang) {
      metaParts.push(
        `<span class="repo-stat"><span class="lang-dot" style="background:${langColor}"></span>${lang}</span>`,
      );
    }
    if (stars !== null) {
      metaParts.push(
        `<span class="repo-stat" aria-label="${escapeHtml(stars)} stars">★ ${escapeHtml(stars)}</span>`,
      );
    }
    if (forks !== null) {
      metaParts.push(
        `<span class="repo-stat" aria-label="${escapeHtml(forks)} forks">⑂ ${escapeHtml(forks)}</span>`,
      );
    }
    if (metaParts.length === 0) {
      metaParts.push(`<span class="repo-stat">GitHub Repository</span>`);
    }

    return `<a
      class="repo-card"
      href="${escapeHtml(item.url)}"
      data-sub-link-id="${subId}"
      target="_blank"
      rel="noopener noreferrer"
    >
      <div class="repo-top">
        <span class="repo-name">${renderHubIconSvg("github")}<span>${fullName}</span></span>
        <span class="arrow" aria-hidden="true">↗</span>
      </div>
      ${item.label && item.label !== (preview?.fullName || parsed?.fullName) ? `<div class="repo-label">${label}</div>` : ""}
      ${repoDesc ? `<p class="repo-desc">${repoDesc}</p>` : ""}
      <div class="repo-meta">${metaParts.join("")}</div>
    </a>`;
  }

  if (kind === "youtube") {
    if (!isSafeHttpUrl(item.url)) return "";
    const yt = parseYouTubeEmbed(item.url);
    if (!yt) return "";
    const thumbStyle = `background-image:linear-gradient(180deg,rgba(9,9,11,.45),rgba(9,9,11,.92)),url('${escapeHtml(yt.thumbnailUrl)}')`;

    return `<div class="embed-slot" data-embed-slot>
      <button
        type="button"
        class="embed-facade embed-youtube"
        style="${thumbStyle}"
        data-embed-facade
        data-sub-link-id="${subId}"
        data-embed-kind="youtube"
        data-embed-src="${escapeHtml(yt.embedUrl)}"
        data-embed-title="${label}"
        aria-label="Play YouTube video: ${label}"
      >
        <span class="embed-badge">${renderHubIconSvg("youtube")}<span>YouTube · Click to Play</span></span>
        <div class="embed-bottom">
          <div class="embed-copy">
            <span class="embed-title">${label}</span>
            ${sublabel ? `<span class="embed-sub">${sublabel}</span>` : ""}
          </div>
          <span class="play-pill" aria-hidden="true">${renderHubIconSvg("play")}<span>Play</span></span>
        </div>
      </button>
    </div>`;
  }

  if (kind === "spotify") {
    if (!isSafeHttpUrl(item.url)) return "";
    const sp = parseSpotifyEmbed(item.url);
    if (!sp) return "";
    const compact =
      sp.entityType === "track" || sp.entityType === "episode" ? "152" : "352";

    return `<div class="embed-slot" data-embed-slot>
      <button
        type="button"
        class="embed-facade embed-spotify"
        data-embed-facade
        data-sub-link-id="${subId}"
        data-embed-kind="spotify"
        data-embed-height="${compact}"
        data-embed-src="${escapeHtml(sp.embedUrl)}"
        data-embed-title="${label}"
        aria-label="Play on Spotify: ${label}"
      >
        <span class="embed-badge">${renderHubIconSvg("spotify")}<span>Spotify ${escapeHtml(sp.entityType.toUpperCase())} · Click to Play</span></span>
        <div class="embed-bottom">
          <div class="embed-copy">
            <span class="embed-title">${label}</span>
            ${sublabel ? `<span class="embed-sub">${sublabel}</span>` : ""}
          </div>
          <span class="play-pill" aria-hidden="true">${renderHubIconSvg("play")}<span>Listen</span></span>
        </div>
      </button>
    </div>`;
  }

  if (kind === "code") {
    const codeText = item.codeText ?? "";
    if (!codeText.trim()) return "";
    const codeLang = escapeHtml((item.codeLanguage || "shell").trim());

    return `<div class="code-card">
      <div class="code-header">
        <span class="code-meta">${renderHubIconSvg("code-2")}<span>${label}</span><span class="code-lang">${codeLang}</span></span>
        <button
          type="button"
          class="code-copy-btn"
          data-copy-code
          data-sub-link-id="${subId}"
          aria-label="Copy code snippet"
        >Copy</button>
      </div>
      <pre class="code-pre"><code>${escapeHtml(codeText)}</code></pre>
    </div>`;
  }

  if (kind === "callout") {
    const bodyText = item.sublabel ?? "";
    if (!bodyText.trim()) return "";
    const tone =
      item.calloutTone === "warning"
        ? "warning"
        : item.calloutTone === "tip"
          ? "tip"
          : "info";
    const toneIcon =
      tone === "warning"
        ? "alert-triangle"
        : tone === "tip"
          ? "sparkles"
          : "info";

    return `<div class="callout-card callout-${tone}" data-callout-id="${subId}">
      <div class="callout-head">${renderHubIconSvg(toneIcon)}<span>${label}</span></div>
      <p class="callout-body">${escapeHtml(bodyText)}</p>
    </div>`;
  }

  if (!isSafeHttpUrl(item.url)) return "";
  const variantClass =
    item.variant === "primary"
      ? "btn primary"
      : item.variant === "secondary"
        ? "btn secondary"
        : "btn outline";

  return `<a
    class="${variantClass}"
    href="${escapeHtml(item.url)}"
    data-sub-link-id="${subId}"
    target="_blank"
    rel="noopener noreferrer"
  >
    <span class="btn-label">
      ${renderHubIconSvg(item.icon)}
      <span class="btn-text-group">
        <span class="btn-title">${label}</span>
        ${sublabel ? `<span class="btn-sublabel">${sublabel}</span>` : ""}
      </span>
    </span>
    <span class="arrow" aria-hidden="true">↗</span>
  </a>`;
}

export function renderHubLandingHtml(
  link: LinkDTO,
  options: HubLandingRenderOptions = {},
): string {
  const tokens = options.themeTokens ?? resolveThemeTokens(null, link.theme);
  const repoPreviews = options.repoPreviews ?? {};
  const cssVars = escapeHtml(themeTokensToInlineStyle(tokens));
  const baseUrl = escapeHtml(getPortfolioBaseUrl());
  const canonicalHost = escapeHtml(getCanonicalHostLabel());
  const shortUrl = escapeHtml(
    link.shortUrl || `${getCanonicalBaseUrl()}/${link.slug}`,
  );
  const title = escapeHtml(link.title);
  const description = escapeHtml(
    link.description || "Official project links and resources.",
  );
  const slug = escapeHtml(link.slug);

  const cardSurfaceCss =
    tokens.cardStyle === "minimal"
      ? "background:rgba(9,9,11,.6);border:1px solid rgba(255,255,255,.08)"
      : tokens.cardStyle === "bordered"
        ? "background:var(--il-card);border:1px solid rgba(var(--il-accent-rgb),.32)"
        : "background:rgba(24,24,27,.84);backdrop-filter:blur(14px);border:1px solid #27272a";

  const tagsHtml =
    link.tags.length > 0
      ? `<div class="tags">${link.tags
          .map((tag) => `<span class="tag">#${escapeHtml(tag)}</span>`)
          .join("")}</div>`
      : "";

  const blocksHtml = (link.hubLinks ?? [])
    .map((item) => renderHubBlockHtml(item, repoPreviews))
    .filter(Boolean)
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en" class="dark" style="${cssVars}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="icon" href="/brand/logo-qr.svg" type="image/svg+xml" />
  <title>${title} — ${canonicalHost}</title>
  <meta name="description" content="${description}" />
  ${renderOgMetaTags(link)}
  <style>
    *{box-sizing:border-box}
    body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background-color:var(--il-canvas);background-image:radial-gradient(ellipse 80% 45% at 50% -10%,rgba(var(--il-accent-rgb),var(--il-glow-alpha)),transparent 70%);color:#fafafa;font-family:system-ui,-apple-system,sans-serif;padding:24px 16px}
    .card{max-width:520px;width:100%;${cardSurfaceCss};border-radius:22px;padding:32px;box-shadow:0 24px 52px rgba(0,0,0,.58)}
    .header-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
    .eyebrow{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;border:1px solid rgba(var(--il-accent-rgb),.35);background:rgba(var(--il-accent-rgb),.1);color:var(--il-accent-muted);font-family:ui-monospace,monospace;font-size:11px;text-transform:uppercase;letter-spacing:.08em}
    .copy-btn{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;border:1px solid #27272a;background:var(--il-canvas);color:#a1a1aa;font-family:ui-monospace,monospace;font-size:11px;cursor:pointer;transition:border-color .15s ease,color .15s ease}
    .copy-btn:hover{border-color:rgba(var(--il-accent-rgb),.5);color:var(--il-accent-muted)}
    h1{margin:16px 0 8px;font-size:24px;font-weight:600;letter-spacing:-.02em}
    p.desc{margin:0 0 16px;font-size:14px;line-height:1.6;color:#a1a1aa}
    .tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:22px}
    .tag{padding:3px 9px;border-radius:8px;background:var(--il-canvas);border:1px solid #27272a;font-family:ui-monospace,monospace;font-size:11px;color:#a1a1aa}
    .links{display:flex;flex-direction:column;gap:11px}
    a.btn{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 16px;border-radius:13px;font-size:14px;font-weight:500;text-decoration:none;transition:transform .12s ease,background .15s ease,border-color .15s ease}
    a.btn:hover{transform:translateY(-1px)}
    .btn-label{display:inline-flex;align-items:center;gap:11px;min-width:0}
    .btn-text-group{display:flex;flex-direction:column;gap:2px;min-width:0}
    .btn-title{line-height:1.25}
    .btn-sublabel{font-size:12px;font-weight:400;opacity:.78;line-height:1.35}
    .hub-icon{flex-shrink:0}
    a.primary{background:var(--il-accent);color:var(--il-accent-text);font-weight:600}
    a.primary:hover{background:var(--il-accent-hover)}
    a.secondary{background:var(--il-elevated);color:#fafafa;border:1px solid #3f3f46}
    a.secondary:hover{border-color:rgba(var(--il-accent-rgb),.5)}
    a.outline{background:transparent;color:#e4e4e7;border:1px solid #3f3f46}
    a.outline:hover{border-color:rgba(var(--il-accent-rgb),.55);color:var(--il-accent-muted)}
    .arrow{font-size:13px;opacity:.75;flex-shrink:0}
    .repo-card{display:flex;flex-direction:column;gap:8px;padding:15px 16px;border-radius:14px;background:var(--il-canvas);border:1px solid #27272a;color:#fafafa;text-decoration:none;transition:transform .12s ease,border-color .15s ease}
    .repo-card:hover{transform:translateY(-1px);border-color:rgba(var(--il-accent-rgb),.5)}
    .repo-top{display:flex;align-items:center;justify-content:space-between;gap:10px}
    .repo-name{display:inline-flex;align-items:center;gap:8px;font-family:ui-monospace,monospace;font-size:13px;font-weight:600;color:#fafafa}
    .repo-label{font-size:13px;font-weight:500;color:#e4e4e7}
    .repo-desc{margin:0;font-size:12.5px;line-height:1.5;color:#a1a1aa}
    .repo-meta{display:flex;flex-wrap:wrap;align-items:center;gap:12px;font-family:ui-monospace,monospace;font-size:11px;color:#a1a1aa;margin-top:2px}
    .repo-stat{display:inline-flex;align-items:center;gap:5px}
    .lang-dot{width:8px;height:8px;border-radius:999px;display:inline-block}
    .embed-slot{border-radius:14px;overflow:hidden;border:1px solid #27272a;background:var(--il-canvas)}
    .embed-facade{width:100%;border:0;cursor:pointer;display:flex;flex-direction:column;justify-content:space-between;text-align:left;padding:16px;color:#fafafa;background-size:cover;background-position:center;transition:border-color .15s ease,transform .12s ease}
    .embed-youtube{min-height:186px;background-color:#0c0c10}
    .embed-spotify{min-height:126px;background:radial-gradient(circle at 90% 10%,rgba(var(--il-accent-rgb),.22),transparent 60%),linear-gradient(135deg,#0d1117,#09090b)}
    .embed-badge{display:inline-flex;align-items:center;gap:6px;align-self:flex-start;padding:4px 9px;border-radius:999px;background:rgba(9,9,11,.78);border:1px solid rgba(255,255,255,.12);font-family:ui-monospace,monospace;font-size:10.5px;letter-spacing:.05em;color:#e4e4e7}
    .embed-bottom{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-top:24px}
    .embed-copy{display:flex;flex-direction:column;gap:3px;min-width:0}
    .embed-title{font-size:14.5px;font-weight:600;color:#fafafa;line-height:1.3}
    .embed-sub{font-size:12px;color:#d4d4d8;opacity:.85;line-height:1.35}
    .play-pill{display:inline-flex;align-items:center;gap:6px;padding:8px 13px;border-radius:999px;background:var(--il-accent);color:var(--il-accent-text);font-size:12.5px;font-weight:600;flex-shrink:0;box-shadow:0 8px 20px rgba(0,0,0,.4)}
    .embed-iframe-yt{width:100%;aspect-ratio:16/9;border:0;display:block;background:#000}
    .embed-iframe-sp{width:100%;border:0;display:block;background:#09090b}
    .code-card{border-radius:14px;border:1px solid #27272a;background:#070709;overflow:hidden}
    .code-header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 12px;border-bottom:1px solid #1f1f23;background:#0e0e12}
    .code-meta{display:inline-flex;align-items:center;gap:8px;font-size:12px;font-weight:500;color:#e4e4e7}
    .code-lang{padding:2px 6px;border-radius:6px;background:#18181b;border:1px solid #27272a;font-family:ui-monospace,monospace;font-size:10px;text-transform:uppercase;color:#a1a1aa}
    .code-copy-btn{padding:4px 9px;border-radius:7px;border:1px solid #27272a;background:#18181b;color:#d4d4d8;font-family:ui-monospace,monospace;font-size:11px;cursor:pointer}
    .code-copy-btn:hover{border-color:rgba(var(--il-accent-rgb),.5);color:var(--il-accent-muted)}
    .code-pre{margin:0;padding:13px 14px;overflow-x:auto;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;line-height:1.55;color:#e4e4e7}
    .callout-card{border-radius:14px;padding:13px 15px;border:1px solid rgba(var(--il-accent-rgb),.3);background:rgba(var(--il-accent-rgb),.07)}
    .callout-warning{border-color:rgba(245,158,11,.38);background:rgba(245,158,11,.08)}
    .callout-warning .callout-head{color:#fcd34d}
    .callout-tip{border-color:rgba(var(--il-accent-rgb),.4);background:rgba(var(--il-accent-rgb),.09)}
    .callout-tip .callout-head{color:var(--il-accent-muted)}
    .callout-info .callout-head{color:var(--il-accent-muted)}
    .callout-head{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;margin-bottom:5px}
    .callout-body{margin:0;font-size:12.5px;line-height:1.55;color:#d4d4d8;white-space:pre-line}
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
      ${blocksHtml}
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

      function sendHubBeacon(subLinkId) {
        if (!subLinkId || !slug) return;
        var url = '/api/v1/slug/' + encodeURIComponent(slug) + '/hub-click';
        var payload = JSON.stringify({ subLinkId: subLinkId });
        if (navigator.sendBeacon) {
          var blob = new Blob([payload], { type: 'application/json' });
          navigator.sendBeacon(url, blob);
        } else {
          fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(function(){});
        }
      }

      var copyBtn = document.getElementById('copy-hub-link');
      if (copyBtn && navigator.clipboard) {
        copyBtn.addEventListener('click', function(){
          navigator.clipboard.writeText(shortUrl).then(function(){
            copyBtn.textContent = 'Copied!';
            setTimeout(function(){ copyBtn.textContent = 'Copy link'; }, 1800);
          }).catch(function(){});
        });
      }

      var anchors = main.querySelectorAll('a[data-sub-link-id]');
      anchors.forEach(function(anchor){
        anchor.addEventListener('click', function(){
          sendHubBeacon(anchor.getAttribute('data-sub-link-id'));
        });
      });

      var facades = main.querySelectorAll('button[data-embed-facade]');
      facades.forEach(function(btn){
        btn.addEventListener('click', function(){
          var src = btn.getAttribute('data-embed-src') || '';
          var kind = btn.getAttribute('data-embed-kind') || '';
          var subLinkId = btn.getAttribute('data-sub-link-id') || '';
          var embedTitle = btn.getAttribute('data-embed-title') || 'Embedded media';
          var isAllowedYoutube = kind === 'youtube' && src.indexOf('https://www.youtube-nocookie.com/embed/') === 0;
          var isAllowedSpotify = kind === 'spotify' && src.indexOf('https://open.spotify.com/embed/') === 0;
          if (!isAllowedYoutube && !isAllowedSpotify) return;

          sendHubBeacon(subLinkId);

          var iframe = document.createElement('iframe');
          iframe.src = src;
          iframe.title = embedTitle;
          iframe.loading = 'lazy';
          iframe.referrerPolicy = 'strict-origin-when-cross-origin';
          if (isAllowedYoutube) {
            iframe.className = 'embed-iframe-yt';
            iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen';
            iframe.allowFullscreen = true;
          } else {
            iframe.className = 'embed-iframe-sp';
            iframe.style.height = (btn.getAttribute('data-embed-height') || '152') + 'px';
            iframe.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
          }

          var slot = btn.closest('[data-embed-slot]');
          if (slot) {
            slot.textContent = '';
            slot.appendChild(iframe);
          }
        });
      });

      var codeButtons = main.querySelectorAll('button[data-copy-code]');
      codeButtons.forEach(function(btn){
        btn.addEventListener('click', function(){
          var subLinkId = btn.getAttribute('data-sub-link-id');
          sendHubBeacon(subLinkId);
          var card = btn.closest('.code-card');
          var codeEl = card ? card.querySelector('code') : null;
          var text = codeEl ? (codeEl.textContent || '') : '';
          if (text && navigator.clipboard) {
            navigator.clipboard.writeText(text).then(function(){
              btn.textContent = 'Copied!';
              setTimeout(function(){ btn.textContent = 'Copy'; }, 1800);
            }).catch(function(){});
          }
        });
      });
    })();
  </script>
</body>
</html>`;
}
