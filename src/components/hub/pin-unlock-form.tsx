"use client";

import React, { useState } from "react";
import type { HubLinkItem } from "@/lib/validations/link.schema";
import { getCanonicalBaseUrl } from "@/server/og/presentation";
import {
  escapeHtml,
  getPortfolioBaseUrl,
} from "@/server/services/og-render.service";

export interface PinUnlockRenderInput {
  slug: string;
  title: string;
  description: string | null;
}

function getCanonicalHostLabel(): string {
  try {
    return new URL(getCanonicalBaseUrl()).host;
  } catch {
    return "links.cristianarando.dev";
  }
}

function isSafeHttpUrl(url: unknown): url is string {
  return typeof url === "string" && /^https?:\/\//i.test(url);
}

function trackHubSubLinkClick(slug: string, subLinkId: string): void {
  if (!subLinkId || !slug) return;
  const endpoint = `/api/v1/slug/${encodeURIComponent(slug)}/hub-click`;
  const payload = JSON.stringify({ subLinkId });
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.sendBeacon === "function"
  ) {
    navigator.sendBeacon(
      endpoint,
      new Blob([payload], { type: "application/json" }),
    );
    return;
  }
  void fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => undefined);
}

export function renderPinUnlockHtml(input: PinUnlockRenderInput): string {
  const baseUrl = escapeHtml(getPortfolioBaseUrl());
  const canonicalHost = escapeHtml(getCanonicalHostLabel());
  const slug = escapeHtml(input.slug);
  const title = escapeHtml(input.title);
  const description = escapeHtml(
    input.description || "Enter the access PIN to unlock this protected link.",
  );

  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <link rel="icon" href="/brand/logo-qr.svg" type="image/svg+xml" />
  <title>${title} (PIN Protected) — ${canonicalHost}</title>
  <style>
    *{box-sizing:border-box}
    body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at top,rgba(16,185,129,.12) 0%,#09090b 55%);color:#fafafa;font-family:system-ui,-apple-system,sans-serif;padding:16px}
    .card{max-width:440px;width:100%;border:1px solid #27272a;background:rgba(24,24,27,.86);backdrop-filter:blur(12px);border-radius:20px;padding:32px;text-align:center;box-shadow:0 24px 48px rgba(0,0,0,.55)}
    .badge{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;border:1px solid rgba(16,185,129,.35);background:rgba(16,185,129,.1);font-family:ui-monospace,monospace;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#6ee7b7}
    h1{margin:14px 0 8px;font-size:22px;font-weight:600;letter-spacing:-.02em}
    p{margin:0 0 20px;font-size:14px;line-height:1.55;color:#a1a1aa}
    form{display:flex;flex-direction:column;gap:12px}
    input{width:100%;height:44px;border-radius:12px;border:1px solid #3f3f46;background:#09090b;color:#fafafa;padding:0 14px;font-size:15px;text-align:center;letter-spacing:.18em;outline:none;transition:border-color .15s ease,box-shadow .15s ease}
    input:focus{border-color:#10b981;box-shadow:0 0 0 3px rgba(16,185,129,.18)}
    button{height:44px;border-radius:12px;border:none;background:#10b981;color:#052e16;font-size:14px;font-weight:600;cursor:pointer;transition:background .15s ease,transform .1s ease}
    button:hover:not(:disabled){background:#34d399;transform:translateY(-1px)}
    button:disabled{opacity:.55;cursor:not-allowed}
    .error{font-size:13px;color:#fca5a5;min-height:18px}
    .hub-results{display:none;flex-direction:column;gap:10px;margin-top:16px}
    a.hub-btn{display:flex;align-items:center;justify-content:space-between;padding:13px 16px;border-radius:12px;text-decoration:none;font-size:14px;font-weight:500;transition:transform .12s ease,background .15s ease,border-color .15s ease}
    a.hub-btn:hover{transform:translateY(-1px)}
    a.hub-btn.primary{background:#10b981;color:#052e16;font-weight:600}
    a.hub-btn.secondary{background:#27272a;color:#fafafa;border:1px solid #3f3f46}
    a.hub-btn.outline{background:transparent;color:#e4e4e7;border:1px solid #3f3f46}
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
      <button id="pin-submit" type="submit">Unlock link</button>
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
          if (data.type === 'DIRECT' && isSafeUrl(data.destinationUrl)) {
            window.location.assign(data.destinationUrl);
          } else if (data.type === 'HUB' && Array.isArray(data.hubLinks) && hubContainer) {
            form.style.display = 'none';
            hubContainer.textContent = '';
            hubContainer.style.display = 'flex';
            data.hubLinks.forEach(function(item){
              if (!item || !isSafeUrl(item.url)) return;
              var variant = item.variant === 'secondary' ? 'secondary' : item.variant === 'outline' ? 'outline' : 'primary';
              var anchor = document.createElement('a');
              anchor.className = 'hub-btn ' + variant;
              anchor.target = '_blank';
              anchor.rel = 'noopener noreferrer';
              anchor.href = item.url;
              var labelSpan = document.createElement('span');
              labelSpan.textContent = typeof item.label === 'string' && item.label.length > 0 ? item.label : item.url;
              var arrowSpan = document.createElement('span');
              arrowSpan.textContent = '↗';
              arrowSpan.setAttribute('aria-hidden', 'true');
              anchor.appendChild(labelSpan);
              anchor.appendChild(arrowSpan);
              anchor.addEventListener('click', function(){
                if (typeof item.id === 'string' && item.id) {
                  trackHubClick(item.id);
                }
              });
              hubContainer.appendChild(anchor);
            });
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

export function PinUnlockForm({
  slug,
  title,
  description,
}: PinUnlockRenderInput) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [unlockedHubLinks, setUnlockedHubLinks] = useState<
    HubLinkItem[] | null
  >(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const query = typeof window !== "undefined" ? window.location.search : "";
      const response = await fetch(
        `/api/v1/slug/${encodeURIComponent(slug)}/unlock`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin, query }),
        },
      );
      const json = (await response.json()) as {
        data?: {
          type: "DIRECT" | "HUB";
          destinationUrl?: string | null;
          hubLinks?: HubLinkItem[] | null;
        };
        error?: { message: string };
      };
      if (!response.ok || !json.data) {
        setError(json.error?.message ?? "Incorrect PIN");
        return;
      }
      if (
        json.data.type === "DIRECT" &&
        isSafeHttpUrl(json.data.destinationUrl)
      ) {
        window.location.assign(json.data.destinationUrl);
        return;
      }
      if (json.data.type === "HUB" && Array.isArray(json.data.hubLinks)) {
        setUnlockedHubLinks(
          json.data.hubLinks.filter((item) => isSafeHttpUrl(item.url)),
        );
      }
    } catch {
      setError("Could not verify PIN.");
    } finally {
      setSubmitting(false);
    }
  };

  if (unlockedHubLinks) {
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-100">{title}</h2>
        {description ? (
          <p className="text-sm text-zinc-400">{description}</p>
        ) : null}
        <div className="flex flex-col gap-2.5 pt-1">
          {unlockedHubLinks.map((item) => {
            const variantClasses =
              item.variant === "secondary"
                ? "border border-zinc-700 bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                : item.variant === "outline"
                  ? "border border-zinc-700 bg-transparent text-zinc-200 hover:border-emerald-500/60 hover:text-emerald-300"
                  : "bg-emerald-500 font-semibold text-zinc-950 hover:bg-emerald-400";
            return (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackHubSubLinkClick(slug, item.id)}
                className={`flex items-center justify-between rounded-xl px-4 py-3 text-sm font-medium transition ${variantClasses}`}
              >
                <span>{item.label}</span>
                <span aria-hidden="true">↗</span>
              </a>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <h2 className="text-lg font-semibold text-zinc-100">{title}</h2>
      {description ? (
        <p className="text-sm text-zinc-400">{description}</p>
      ) : null}
      <input
        type="password"
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        placeholder="Enter PIN"
        required
        minLength={4}
        maxLength={64}
        className="h-10 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-center text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
      />
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
      <button
        type="submit"
        disabled={submitting}
        className="h-10 w-full rounded-xl bg-emerald-500 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-50"
      >
        {submitting ? "Verifying..." : "Unlock link"}
      </button>
    </form>
  );
}
