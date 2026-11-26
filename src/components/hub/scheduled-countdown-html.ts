import {
  resolveThemeTokens,
  themeTokensToInlineStyle,
  type ResolvedThemeTokens,
} from "@/lib/themes";
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

export interface ScheduledCountdownRenderInput {
  link: LinkDTO;
  startsAt: string;
  themeTokens?: ResolvedThemeTokens;
}

export function renderScheduledCountdownHtml(
  input: ScheduledCountdownRenderInput,
): string {
  const tokens =
    input.themeTokens ?? resolveThemeTokens(null, input.link.theme);
  const cssVars = escapeHtml(themeTokensToInlineStyle(tokens));
  const baseUrl = escapeHtml(getPortfolioBaseUrl());
  const canonicalHost = escapeHtml(getCanonicalHostLabel());
  const title = escapeHtml(input.link.title);
  const description = escapeHtml(
    input.link.description ||
      "This short link is scheduled and will unlock automatically when the countdown reaches zero.",
  );
  const startsAtIso = escapeHtml(input.startsAt);
  const launchDate = new Date(input.startsAt);
  const utcLabel = Number.isNaN(launchDate.getTime())
    ? input.startsAt
    : launchDate.toUTCString();

  const cardSurfaceCss =
    tokens.cardStyle === "minimal"
      ? "background:transparent;border:1px solid rgba(255,255,255,.08)"
      : tokens.cardStyle === "bordered"
        ? "background:var(--il-card);border:1px solid rgba(var(--il-accent-rgb),.32)"
        : "background:rgba(24,24,27,.84);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.1)";

  return `<!DOCTYPE html>
<html lang="en" class="dark" style="${cssVars}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <link rel="icon" href="/brand/logo-qr.svg" type="image/svg+xml" />
  <title>${title} (Launching Soon) — ${canonicalHost}</title>
  <meta name="description" content="${description}" />
  ${renderOgMetaTags(input.link)}
  <style>
    *{box-sizing:border-box}
    body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background-color:var(--il-canvas);background-image:radial-gradient(ellipse 80% 45% at 50% -10%,rgba(var(--il-accent-rgb),var(--il-glow-alpha)),transparent 70%);color:#fafafa;font-family:system-ui,-apple-system,sans-serif;padding:20px 16px}
    .card{max-width:480px;width:100%;${cardSurfaceCss};border-radius:22px;padding:32px;text-align:center;box-shadow:0 24px 52px rgba(0,0,0,.58)}
    .badge{display:inline-flex;align-items:center;gap:8px;padding:5px 12px;border-radius:999px;border:1px solid rgba(var(--il-accent-rgb),.35);background:rgba(var(--il-accent-rgb),.1);font-family:ui-monospace,monospace;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--il-accent-muted)}
    .pulse{width:7px;height:7px;border-radius:999px;background:var(--il-accent);box-shadow:0 0 10px var(--il-accent)}
    h1{margin:16px 0 8px;font-size:24px;font-weight:600;letter-spacing:-.02em}
    p.desc{margin:0 0 24px;font-size:14px;line-height:1.6;color:#a1a1aa}
    .grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:18px}
    .unit{border:1px solid rgba(255,255,255,.08);background:var(--il-canvas);border-radius:14px;padding:14px 8px}
    .num{display:block;font-family:ui-monospace,monospace;font-size:26px;font-weight:700;letter-spacing:-.03em;color:#fafafa;line-height:1.1}
    .lbl{display:block;margin-top:6px;font-family:ui-monospace,monospace;font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:#71717a}
    .schedule-note{font-family:ui-monospace,monospace;font-size:11px;color:#a1a1aa;margin-bottom:6px}
    footer{margin-top:24px;padding-top:16px;border-top:1px solid rgba(255,255,255,.08);display:flex;justify-content:space-between;align-items:center;font-size:12px;color:#71717a}
    footer a{color:#a1a1aa;text-decoration:none}
    footer a:hover{color:#fafafa}
  </style>
</head>
<body>
  <main class="card" data-starts-at="${startsAtIso}">
    <span class="badge"><span class="pulse" aria-hidden="true"></span>Scheduled Launch</span>
    <h1>${title}</h1>
    <p class="desc">${description}</p>
    <div class="grid" role="timer" aria-live="polite">
      <div class="unit"><span id="cd-days" class="num">00</span><span class="lbl">Days</span></div>
      <div class="unit"><span id="cd-hours" class="num">00</span><span class="lbl">Hours</span></div>
      <div class="unit"><span id="cd-mins" class="num">00</span><span class="lbl">Minutes</span></div>
      <div class="unit"><span id="cd-secs" class="num">00</span><span class="lbl">Seconds</span></div>
    </div>
    <div id="cd-status" class="schedule-note">Launches ${escapeHtml(utcLabel)}</div>
    <footer>
      <a href="${baseUrl}">cristianarando.dev</a>
      <a href="/">Browse public links →</a>
    </footer>
  </main>
  <script>
    (function(){
      var main = document.querySelector('[data-starts-at]');
      if (!main) return;
      var targetMs = Date.parse(main.getAttribute('data-starts-at') || '');
      if (!isFinite(targetMs)) return;
      var dEl = document.getElementById('cd-days');
      var hEl = document.getElementById('cd-hours');
      var mEl = document.getElementById('cd-mins');
      var sEl = document.getElementById('cd-secs');
      var statusEl = document.getElementById('cd-status');
      function pad(n){ return n < 10 ? '0' + n : String(n); }
      var reloaded = false;
      function tick(){
        var diff = targetMs - Date.now();
        if (diff <= 0) {
          if (dEl) dEl.textContent = '00';
          if (hEl) hEl.textContent = '00';
          if (mEl) mEl.textContent = '00';
          if (sEl) sEl.textContent = '00';
          if (!reloaded) {
            reloaded = true;
            if (statusEl) statusEl.textContent = 'Launching now...';
            window.location.reload();
          }
          return;
        }
        var totalSec = Math.floor(diff / 1000);
        var days = Math.floor(totalSec / 86400);
        var hours = Math.floor((totalSec % 86400) / 3600);
        var mins = Math.floor((totalSec % 3600) / 60);
        var secs = totalSec % 60;
        if (dEl) dEl.textContent = pad(days);
        if (hEl) hEl.textContent = pad(hours);
        if (mEl) mEl.textContent = pad(mins);
        if (sEl) sEl.textContent = pad(secs);
      }
      tick();
      setInterval(tick, 1000);
    })();
  </script>
</body>
</html>`;
}
