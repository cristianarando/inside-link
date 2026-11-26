import {
  resolveThemeTokens,
  themeTokensToInlineStyle,
  type ResolvedThemeTokens,
} from "@/lib/themes";
import { getCanonicalBaseUrl } from "@/server/og/presentation";
import {
  escapeHtml,
  getPortfolioBaseUrl,
} from "@/server/services/og-render.service";

export interface PinUnlockRenderInput {
  slug: string;
  title: string;
  description: string | null;
  themeTokens?: ResolvedThemeTokens;
}

function getCanonicalHostLabel(): string {
  try {
    return new URL(getCanonicalBaseUrl()).host;
  } catch {
    return "links.cristianarando.dev";
  }
}

export function renderPinUnlockHtml(input: PinUnlockRenderInput): string {
  const tokens = input.themeTokens ?? resolveThemeTokens();
  const cssVars = escapeHtml(themeTokensToInlineStyle(tokens));
  const baseUrl = escapeHtml(getPortfolioBaseUrl());
  const canonicalHost = escapeHtml(getCanonicalHostLabel());
  const slug = escapeHtml(input.slug);
  const title = escapeHtml(input.title);
  const description = escapeHtml(
    input.description || "Enter the access PIN to unlock this protected link.",
  );

  const cardSurfaceCss =
    tokens.cardStyle === "minimal"
      ? "background:rgba(9,9,11,.6);border:1px solid rgba(255,255,255,.08)"
      : tokens.cardStyle === "bordered"
        ? "background:var(--il-card);border:1px solid rgba(var(--il-accent-rgb),.32)"
        : "background:rgba(24,24,27,.86);backdrop-filter:blur(12px);border:1px solid #27272a";

  return `<!DOCTYPE html>
<html lang="en" class="dark" style="${cssVars}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <link rel="icon" href="/brand/logo-qr.svg" type="image/svg+xml" />
  <title>${title} (PIN Protected) — ${canonicalHost}</title>
  <style>
    *{box-sizing:border-box}
    body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background-color:var(--il-canvas);background-image:radial-gradient(ellipse 80% 45% at 50% -10%,rgba(var(--il-accent-rgb),var(--il-glow-alpha)),transparent 70%);color:#fafafa;font-family:system-ui,-apple-system,sans-serif;padding:16px}
    .card{max-width:460px;width:100%;${cardSurfaceCss};border-radius:20px;padding:32px;text-align:center;box-shadow:0 24px 48px rgba(0,0,0,.55)}
    .badge{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;border:1px solid rgba(var(--il-accent-rgb),.35);background:rgba(var(--il-accent-rgb),.1);font-family:ui-monospace,monospace;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--il-accent-muted)}
    h1{margin:14px 0 8px;font-size:22px;font-weight:600;letter-spacing:-.02em}
    p{margin:0 0 20px;font-size:14px;line-height:1.55;color:#a1a1aa}
    form{display:flex;flex-direction:column;gap:12px}
    input{width:100%;height:44px;border-radius:12px;border:1px solid #3f3f46;background:var(--il-canvas);color:#fafafa;padding:0 14px;font-size:15px;text-align:center;letter-spacing:.18em;outline:none;transition:border-color .15s ease,box-shadow .15s ease}
    input:focus{border-color:var(--il-accent);box-shadow:0 0 0 3px rgba(var(--il-accent-rgb),.2)}
    button.primary-submit{height:44px;border-radius:12px;border:none;background:var(--il-accent);color:var(--il-accent-text);font-size:14px;font-weight:600;cursor:pointer;transition:background .15s ease,transform .1s ease}
    button.primary-submit:hover:not(:disabled){background:var(--il-accent-hover);transform:translateY(-1px)}
    button.primary-submit:disabled{opacity:.55;cursor:not-allowed}
    .error{font-size:13px;color:#fca5a5;min-height:18px}
    .hub-results{display:none;flex-direction:column;gap:10px;margin-top:16px;text-align:left}
    a.hub-btn{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 16px;border-radius:12px;text-decoration:none;font-size:14px;font-weight:500;transition:transform .12s ease,background .15s ease,border-color .15s ease}
    a.hub-btn:hover{transform:translateY(-1px)}
    a.hub-btn.primary{background:var(--il-accent);color:var(--il-accent-text);font-weight:600}
    a.hub-btn.secondary{background:var(--il-elevated);color:#fafafa;border:1px solid #3f3f46}
    a.hub-btn.outline{background:transparent;color:#e4e4e7;border:1px solid #3f3f46}
    .hub-btn-copy{display:flex;flex-direction:column;gap:2px}
    .hub-sub{font-size:12px;font-weight:400;opacity:.8}
    .hub-code{border:1px solid #27272a;background:#070709;border-radius:12px;overflow:hidden}
    .hub-code-head{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #1f1f23;background:#0e0e12;font-size:12px;color:#e4e4e7}
    .hub-code-btn{padding:3px 8px;border-radius:6px;border:1px solid #27272a;background:#18181b;color:#d4d4d8;font-family:ui-monospace,monospace;font-size:11px;cursor:pointer}
    .hub-code-pre{margin:0;padding:12px;overflow-x:auto;font-family:ui-monospace,monospace;font-size:12px;color:#e4e4e7}
    .hub-callout{border:1px solid rgba(var(--il-accent-rgb),.32);background:rgba(var(--il-accent-rgb),.08);border-radius:12px;padding:12px 14px}
    .hub-callout-title{font-size:13px;font-weight:600;color:var(--il-accent-muted);margin-bottom:4px}
    .hub-callout-body{margin:0;font-size:12.5px;color:#d4d4d8;white-space:pre-line}
    .hub-facade{width:100%;border:1px solid #27272a;border-radius:12px;background:#0c0c10;color:#fafafa;padding:14px;display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:pointer;text-align:left}
    .hub-play-pill{padding:6px 12px;border-radius:999px;background:var(--il-accent);color:var(--il-accent-text);font-size:12px;font-weight:600;flex-shrink:0}
    footer{margin-top:22px;padding-top:16px;border-top:1px solid #27272a;display:flex;justify-content:space-between;align-items:center;font-size:12px;color:#71717a}
    footer a{color:#a1a1aa;text-decoration:none}
    footer a:hover{color:#fafafa}
  </style>
</head>
<body>
  <main class="card" data-pin-slug="${slug}">
    <span class="badge">PIN Protected Link</span>
    <h1>${title}</h1>
    <p>${description}</p>
    <form id="pin-form">
      <input
        id="pin-input"
        type="password"
        name="pin"
        placeholder="••••"
        autocomplete="off"
        required
        minlength="4"
        maxlength="64"
        aria-label="Access PIN code"
      />
      <button id="pin-submit" class="primary-submit" type="submit">Unlock link</button>
      <div id="pin-error" class="error" role="alert"></div>
    </form>
    <div id="hub-container" class="hub-results"></div>
    <footer>
      <a href="${baseUrl}">cristianarando.dev</a>
      <a href="/">Browse public links →</a>
    </footer>
  </main>
  <script>
    (function(){
      var main = document.querySelector('[data-pin-slug]');
      var form = document.getElementById('pin-form');
      var input = document.getElementById('pin-input');
      var submit = document.getElementById('pin-submit');
      var errorEl = document.getElementById('pin-error');
      var hubContainer = document.getElementById('hub-container');
      if (!main || !form || !input || !submit || !errorEl) return;
      var slug = main.getAttribute('data-pin-slug') || '';

      function isSafeUrl(u) {
        return typeof u === 'string' && /^https?:\\/\\//i.test(u);
      }

      function parseYoutubeEmbedUrl(rawUrl) {
        try {
          var u = new URL(rawUrl);
          var host = u.hostname.toLowerCase();
          var segs = u.pathname.split('/').filter(Boolean);
          var id = null;
          if (host === 'youtu.be' || host === 'www.youtu.be') id = segs[0];
          else if (host === 'youtube.com' || host === 'www.youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com' || host === 'www.youtube-nocookie.com') {
            if (segs[0] === 'watch') id = u.searchParams.get('v');
            else if (segs[0] === 'embed' || segs[0] === 'shorts' || segs[0] === 'live') id = segs[1];
          }
          if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) {
            return 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0';
          }
        } catch (e) {}
        return null;
      }

      function parseSpotifyEmbedUrl(rawUrl) {
        try {
          var u = new URL(rawUrl);
          var host = u.hostname.toLowerCase();
          if (host !== 'open.spotify.com' && host !== 'play.spotify.com') return null;
          var segs = u.pathname.split('/').filter(Boolean);
          var idx = 0;
          if (segs[idx] && segs[idx].toLowerCase().indexOf('intl-') === 0) idx++;
          if (segs[idx] && segs[idx].toLowerCase() === 'embed') idx++;
          var t = (segs[idx] || '').toLowerCase();
          var id = segs[idx + 1] || '';
          var validTypes = ['track', 'album', 'playlist', 'episode', 'show', 'artist'];
          if (validTypes.indexOf(t) !== -1 && /^[A-Za-z0-9]{10,64}$/.test(id)) {
            return {
              src: 'https://open.spotify.com/embed/' + t + '/' + id + '?utm_source=generator&theme=0',
              height: (t === 'track' || t === 'episode') ? '152px' : '352px'
            };
          }
        } catch (e) {}
        return null;
      }

      function trackHubClick(subLinkId) {
        if (!subLinkId || !slug) return;
        var url = '/api/v1/slug/' + encodeURIComponent(slug) + '/hub-click';
        var payload = JSON.stringify({ subLinkId: String(subLinkId) });
        if (navigator.sendBeacon) {
          navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
        } else {
          fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(function(){});
        }
      }

      function renderUnlockedHubItem(item) {
        if (!item || !hubContainer) return;
        var kind = typeof item.kind === 'string' ? item.kind : 'button';

        if (kind === 'code' && typeof item.codeText === 'string' && item.codeText.length > 0) {
          var codeWrap = document.createElement('div');
          codeWrap.className = 'hub-code';
          var head = document.createElement('div');
          head.className = 'hub-code-head';
          var titleSpan = document.createElement('span');
          titleSpan.textContent = item.label || (item.codeLanguage || 'shell');
          var copyBtn = document.createElement('button');
          copyBtn.type = 'button';
          copyBtn.className = 'hub-code-btn';
          copyBtn.textContent = 'Copy';
          copyBtn.addEventListener('click', function(){
            if (item.id) trackHubClick(item.id);
            if (navigator.clipboard) {
              navigator.clipboard.writeText(item.codeText).then(function(){
                copyBtn.textContent = 'Copied!';
                setTimeout(function(){ copyBtn.textContent = 'Copy'; }, 1800);
              }).catch(function(){});
            }
          });
          head.appendChild(titleSpan);
          head.appendChild(copyBtn);
          var pre = document.createElement('pre');
          pre.className = 'hub-code-pre';
          var codeEl = document.createElement('code');
          codeEl.textContent = item.codeText;
          pre.appendChild(codeEl);
          codeWrap.appendChild(head);
          codeWrap.appendChild(pre);
          hubContainer.appendChild(codeWrap);
          return;
        }

        if (kind === 'callout' && typeof item.sublabel === 'string' && item.sublabel.length > 0) {
          var callout = document.createElement('div');
          callout.className = 'hub-callout';
          var cTitle = document.createElement('div');
          cTitle.className = 'hub-callout-title';
          cTitle.textContent = item.label || 'Note';
          var cBody = document.createElement('p');
          cBody.className = 'hub-callout-body';
          cBody.textContent = item.sublabel;
          callout.appendChild(cTitle);
          callout.appendChild(cBody);
          hubContainer.appendChild(callout);
          return;
        }

        if ((kind === 'youtube' || kind === 'spotify') && isSafeUrl(item.url)) {
          var ytSrc = kind === 'youtube' ? parseYoutubeEmbedUrl(item.url) : null;
          var spInfo = kind === 'spotify' ? parseSpotifyEmbedUrl(item.url) : null;
          if (ytSrc || spInfo) {
            var slot = document.createElement('div');
            var facadeBtn = document.createElement('button');
            facadeBtn.type = 'button';
            facadeBtn.className = 'hub-facade';
            var copyDiv = document.createElement('div');
            copyDiv.className = 'hub-btn-copy';
            var lbl = document.createElement('span');
            lbl.textContent = item.label || (kind === 'youtube' ? 'YouTube Video' : 'Spotify Audio');
            copyDiv.appendChild(lbl);
            if (typeof item.sublabel === 'string' && item.sublabel.length > 0) {
              var sub = document.createElement('span');
              sub.className = 'hub-sub';
              sub.textContent = item.sublabel;
              copyDiv.appendChild(sub);
            }
            var pill = document.createElement('span');
            pill.className = 'hub-play-pill';
            pill.textContent = kind === 'youtube' ? 'Play' : 'Listen';
            facadeBtn.appendChild(copyDiv);
            facadeBtn.appendChild(pill);
            facadeBtn.addEventListener('click', function(){
              if (item.id) trackHubClick(item.id);
              var iframe = document.createElement('iframe');
              iframe.title = item.label || 'Embedded media';
              iframe.style.width = '100%';
              iframe.style.border = '0';
              iframe.style.borderRadius = '12px';
              if (ytSrc) {
                iframe.src = ytSrc;
                iframe.style.aspectRatio = '16 / 9';
                iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen';
                iframe.allowFullscreen = true;
              } else if (spInfo) {
                iframe.src = spInfo.src;
                iframe.style.height = spInfo.height;
                iframe.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
              }
              slot.textContent = '';
              slot.appendChild(iframe);
            });
            slot.appendChild(facadeBtn);
            hubContainer.appendChild(slot);
            return;
          }
        }

        if (!isSafeUrl(item.url)) return;
        var variant = item.variant === 'secondary' ? 'secondary' : item.variant === 'outline' ? 'outline' : 'primary';
        var anchor = document.createElement('a');
        anchor.className = 'hub-btn ' + variant;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.href = item.url;
        var textGroup = document.createElement('span');
        textGroup.className = 'hub-btn-copy';
        var labelSpan = document.createElement('span');
        labelSpan.textContent = typeof item.label === 'string' && item.label.length > 0 ? item.label : item.url;
        textGroup.appendChild(labelSpan);
        if (typeof item.sublabel === 'string' && item.sublabel.length > 0) {
          var subSpan = document.createElement('span');
          subSpan.className = 'hub-sub';
          subSpan.textContent = item.sublabel;
          textGroup.appendChild(subSpan);
        }
        var arrowSpan = document.createElement('span');
        arrowSpan.textContent = '↗';
        arrowSpan.setAttribute('aria-hidden', 'true');
        anchor.appendChild(textGroup);
        anchor.appendChild(arrowSpan);
        anchor.addEventListener('click', function(){
          if (typeof item.id === 'string' && item.id) {
            trackHubClick(item.id);
          }
        });
        hubContainer.appendChild(anchor);
      }

      form.addEventListener('submit', function(e){
        e.preventDefault();
        errorEl.textContent = '';
        submit.disabled = true;
        fetch('/api/v1/slug/' + encodeURIComponent(slug) + '/unlock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: input.value, query: window.location.search })
        }).then(function(res){
          return res.json().then(function(payload){ return { status: res.status, payload: payload }; });
        }).then(function(result){
          submit.disabled = false;
          if (result.status !== 200 || !result.payload || !result.payload.data) {
            errorEl.textContent = (result.payload && result.payload.error && result.payload.error.message) || 'Incorrect PIN';
            return;
          }
          var data = result.payload.data;
          if (data.type === 'DIRECT') {
            if (data.isCloaked === true) {
              window.location.reload();
              return;
            }
            if (isSafeUrl(data.destinationUrl)) {
              window.location.assign(data.destinationUrl);
              return;
            }
          }
          if (data.type === 'HUB' && Array.isArray(data.hubLinks) && hubContainer) {
            form.style.display = 'none';
            hubContainer.textContent = '';
            hubContainer.style.display = 'flex';
            data.hubLinks.forEach(renderUnlockedHubItem);
          }
        }).catch(function(){
          submit.disabled = false;
          errorEl.textContent = 'Network error while verifying PIN.';
        });
      });
    })();
  </script>
</body>
</html>`;
}
