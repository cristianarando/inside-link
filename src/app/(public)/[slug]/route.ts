import { after, type NextRequest } from "next/server";
import { renderCloakedLinkHtml } from "@/components/hub/cloaked-link-html";
import { renderExpiredLinkHtml } from "@/components/hub/expired-link-view";
import { renderHubLandingHtml } from "@/components/hub/hub-landing-html";
import { renderPinUnlockHtml } from "@/components/hub/pin-unlock-html";
import { renderScheduledCountdownHtml } from "@/components/hub/scheduled-countdown-html";
import { resolveThemeTokens, themeTokensToInlineStyle } from "@/lib/themes";
import { getCanonicalBaseUrl } from "@/server/og/presentation";
import {
  prefetchGitHubReposForHub,
  resolutionService,
  settingsService,
  type SettingsService,
} from "@/server/services";
import {
  escapeHtml,
  getPortfolioBaseUrl,
  renderOpenGraphHtml,
} from "@/server/services/og-render.service";
import type { ResolutionService } from "@/server/services/resolution.service";

function getCanonicalHostLabel(): string {
  try {
    return new URL(getCanonicalBaseUrl()).host;
  } catch {
    return "links.cristianarando.dev";
  }
}

function renderNotFoundHtml(slug: string, cssVars: string): string {
  const baseUrl = escapeHtml(getPortfolioBaseUrl());
  const canonicalHost = escapeHtml(getCanonicalHostLabel());
  return `<!DOCTYPE html>
<html lang="en" class="dark" style="${escapeHtml(cssVars)}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <link rel="icon" href="/brand/logo-qr.svg" type="image/svg+xml" />
  <title>Short link not found — ${canonicalHost}</title>
  <style>
    body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background-color:var(--il-canvas,#09090b);background-image:radial-gradient(ellipse 80% 45% at 50% -10%,rgba(var(--il-accent-rgb,16,185,129),var(--il-glow-alpha,.14)),transparent 70%);color:#fafafa;font-family:system-ui,-apple-system,sans-serif;padding:16px}
    .card{max-width:420px;width:100%;border:1px solid #27272a;background:rgba(24,24,27,.78);backdrop-filter:blur(12px);border-radius:16px;padding:32px;text-align:center;box-shadow:0 24px 48px rgba(0,0,0,.5)}
    .badge{font-family:ui-monospace,monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--il-accent-muted,#6ee7b7)}
    h1{margin:10px 0 12px;font-size:22px;font-weight:600}
    p{margin:0 0 24px;font-size:14px;line-height:1.6;color:#a1a1aa}
    .actions{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
    a.btn{display:inline-flex;align-items:center;padding:10px 16px;border-radius:12px;font-size:14px;font-weight:500;text-decoration:none}
    a.primary{background:var(--il-accent,#10b981);color:var(--il-accent-text,#052e16);font-weight:600}
    a.secondary{border:1px solid #3f3f46;color:#e4e4e7;background:#18181b}
  </style>
</head>
<body>
  <main class="card">
    <div class="badge">HTTP 404 · Not Found</div>
    <h1>This short link does not exist</h1>
    <p>The route /${escapeHtml(slug)} is not registered on ${canonicalHost}.</p>
    <div class="actions">
      <a class="btn primary" href="${baseUrl}">Back to cristianarando.dev</a>
      <a class="btn secondary" href="/">Browse public links</a>
    </div>
  </main>
</body>
</html>`;
}

function scheduleClickTracking(
  service: ResolutionService,
  payload: { linkId: string; headers: Headers; searchParams: URLSearchParams },
) {
  const task = () => service.recordClickEvent(payload);
  try {
    after(task);
  } catch {
    void task();
  }
}

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  Vary: "User-Agent, Accept-Language",
};

export async function handleSlugGet(
  request: NextRequest | Request,
  slug: string,
  service: ResolutionService = resolutionService,
  settingsSvc: SettingsService = settingsService,
): Promise<Response> {
  const url = new URL(request.url);
  const result = await service.resolveSlugRequest(slug, {
    headers: request.headers,
    searchParams: url.searchParams,
  });

  switch (result.kind) {
    case "REDIRECT": {
      if (result.shouldTrackClick) {
        scheduleClickTracking(service, {
          linkId: result.linkId,
          headers: request.headers,
          searchParams: url.searchParams,
        });
      }

      return new Response(null, {
        status: result.status,
        headers: {
          Location: result.location,
          ...NO_STORE_HEADERS,
        },
      });
    }

    case "CLOAKED_VIEW": {
      if (result.shouldTrackClick) {
        scheduleClickTracking(service, {
          linkId: result.linkId,
          headers: request.headers,
          searchParams: url.searchParams,
        });
      }

      const html = renderCloakedLinkHtml(result.link, result.destinationUrl);
      return new Response(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          ...NO_STORE_HEADERS,
        },
      });
    }

    case "NOT_FOUND": {
      const globalSettings = await settingsSvc.getSiteSettings();
      const tokens = resolveThemeTokens(globalSettings);
      const html = renderNotFoundHtml(
        result.slug || slug,
        themeTokensToInlineStyle(tokens),
      );
      return new Response(html, {
        status: 404,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          ...NO_STORE_HEADERS,
        },
      });
    }

    case "INACTIVE_OR_EXPIRED": {
      const globalSettings = await settingsSvc.getSiteSettings();
      const themeTokens = resolveThemeTokens(globalSettings, result.theme);
      const html = renderExpiredLinkHtml({
        reason: result.reason,
        slug: result.slug,
        title: result.title,
        themeTokens,
      });
      return new Response(html, {
        status: 410,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          ...NO_STORE_HEADERS,
        },
      });
    }

    case "SOCIAL_BOT_OG": {
      const html = renderOpenGraphHtml(result.link);
      return new Response(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          ...NO_STORE_HEADERS,
        },
      });
    }

    case "SCHEDULED_COUNTDOWN": {
      const globalSettings = await settingsSvc.getSiteSettings();
      const themeTokens = resolveThemeTokens(globalSettings, result.link.theme);
      const html = renderScheduledCountdownHtml({
        link: result.link,
        startsAt: result.startsAt,
        themeTokens,
      });
      return new Response(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          ...NO_STORE_HEADERS,
        },
      });
    }

    case "PIN_REQUIRED": {
      const globalSettings = await settingsSvc.getSiteSettings();
      const themeTokens = resolveThemeTokens(globalSettings, result.theme);
      const html = renderPinUnlockHtml({
        slug: result.slug,
        title: result.title,
        description: result.description,
        themeTokens,
      });
      return new Response(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          ...NO_STORE_HEADERS,
        },
      });
    }

    case "HUB_VIEW": {
      if (result.shouldTrackClick) {
        scheduleClickTracking(service, {
          linkId: result.linkId,
          headers: request.headers,
          searchParams: url.searchParams,
        });
      }

      const [globalSettings, repoPreviews] = await Promise.all([
        settingsSvc.getSiteSettings(),
        prefetchGitHubReposForHub(result.link.hubLinks),
      ]);
      const themeTokens = resolveThemeTokens(globalSettings, result.link.theme);
      const html = renderHubLandingHtml(result.link, {
        themeTokens,
        repoPreviews,
      });
      return new Response(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          ...NO_STORE_HEADERS,
        },
      });
    }
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await context.params;
  return handleSlugGet(request, slug);
}
