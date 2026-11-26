import type { LinkDTO } from "@/lib/types/link-dto";
import { getCanonicalBaseUrl } from "@/server/og/presentation";
import {
  escapeHtml,
  renderOgMetaTags,
} from "@/server/services/og-render.service";

function getCanonicalHostLabel(): string {
  try {
    return new URL(getCanonicalBaseUrl()).host;
  } catch {
    return "links.cristianarando.dev";
  }
}

/**
 * Renders a 100% clean full-screen (`100vw x 100dvh`) cloaked iframe document
 * preserving the shortlink's `<title>`, favicon, and Open Graph tags with zero floating bars.
 */
export function renderCloakedLinkHtml(
  link: LinkDTO,
  destinationUrl: string,
): string {
  const canonicalHost = escapeHtml(getCanonicalHostLabel());
  const title = escapeHtml(link.title);
  const description = escapeHtml(
    link.description || `Official link hosted on ${canonicalHost}.`,
  );
  const safeSrc = escapeHtml(destinationUrl);

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
    html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:#09090b}
    iframe{border:0;width:100vw;height:100dvh;display:block;background:#09090b}
  </style>
</head>
<body>
  <iframe
    src="${safeSrc}"
    title="${title}"
    allow="fullscreen; clipboard-write; encrypted-media; picture-in-picture"
    referrerpolicy="strict-origin-when-cross-origin"
  ></iframe>
</body>
</html>`;
}
