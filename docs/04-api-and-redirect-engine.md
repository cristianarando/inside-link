# InsideLink v2 — API Contracts & Smart Redirect Engine

> **Document ID:** `docs/04-api-and-redirect-engine.md`  
> **Resolution Entrypoint:** `src/app/(public)/[slug]/route.ts` & `src/server/services/resolution.service.ts`  
> **Related Specifications:** [`01-product-requirements.md`](01-product-requirements.md) · [`03-data-model-and-invariants.md`](03-data-model-and-invariants.md) · [`05-security-and-operations.md`](05-security-and-operations.md)

---

## 1. Slug Normalization & Anti-Collision Pipeline

Every candidate slug passes through a deterministic 3-stage validation pipeline (`src/lib/validations/slug.schema.ts` & `src/lib/constants/reserved-slugs.ts`):

1. **Normalization (`normalizeSlug`):** `input.trim().toLowerCase()`, collapsing whitespace runs (`\s+`) into `-` and deduplicating consecutive hyphens (`--+` → `-`).
2. **Syntactic Guard:** Length strictly `3..100` characters matching `^[a-z0-9]+(?:[-_][a-z0-9]+)*$`. Any path containing a dot with a forbidden static file extension (`.ico`, `.xml`, `.txt`, `.json`, `.webmanifest`, `.png`, `.jpg`, `.jpeg`, `.svg`, `.webp`, `.gif`, `.js`, `.mjs`, `.css`, `.map`, `.woff`, `.woff2`, `.ttf`, `.eot`, `.pdf`, `.html`, `.htm`, `.php`, `.asp`) short-circuits immediately without hitting Turso.
3. **System Reserved Blacklist (`RESERVED_SLUGS`):** Blocks internal InsideLink routes (`admin`, `dashboard`, `login`, `logout`, `signin`, `signout`, `api`, `auth`, `links`, `hub`, `unlock`, `qr`, `analytics`, `settings`) and technical Next.js/platform prefixes (`_next`, `_il`, `_vercel`, `assets`, `public`, `static`, `images`, `fonts`, `og`, `favicon`, `robots`, `sitemap`, `manifest`, `404`, `500`, `error`, `health`, `ping`).

> [!NOTE]
> Because InsideLink v2 runs standalone on `https://links.cristianarando.dev` (rather than reverse-proxying under `cristianarando.dev`), portfolio slugs such as `/cv`, `/projects`, `/uses`, `/blog`, and `/work` are freely available as custom shortlinks.

---

## 2. `GET /[slug]` Smart Resolution State Machine

### 2.1. End-to-End Resolution Sequence

```mermaid
sequenceDiagram
    autonumber
    actor Client as Visitor / Social Crawler
    participant Proxy as src/proxy.ts
    participant Handler as GET /[slug]
    participant DB as Turso (libSQL)
    participant After as Next.js after()

    Client->>Proxy: GET https://links.cristianarando.dev/my-slug?ref=linkedin
    Proxy->>Handler: Request + Geo / UA / Cookie Headers
    Handler->>Handler: Fast syntax & extension guard
    Handler->>DB: SELECT * FROM links WHERE slug = 'my-slug' LIMIT 1

    alt Missing or is_active = false
        Handler-->>Client: 404 Not Found (Themed Dark View)
    else Expired (expires_at <= now) or clicks_count >= max_clicks
        alt expired_redirect_url is configured
            Handler-->>Client: 307 Temporary Redirect -> expired_redirect_url (No click tracked)
        else No fallback URL
            Handler-->>Client: 410 Gone (Themed Expired Link View)
        end
    else Social Preview Crawler (WhatsApp, Twitterbot, LinkedInBot, Discordbot...)
        Handler-->>Client: 200 OK Dynamic Open Graph HTML (Protected OG if PIN-locked; no click tracked)
    else Scheduled Future Launch (starts_at > now)
        Handler-->>Client: 200 OK Themed Live Countdown Page (dd:hh:mm:ss; no click tracked)
    else PIN-Protected (password_hash != null) without valid il_unlock_<id> HMAC cookie
        Handler-->>Client: 200 OK Private No-Store PIN Unlock Interstitial
    else Type = 'HUB' (Rich Micro-Landing)
        Handler->>Handler: Resolve theme tokens + cached GitHub repo previews (if any)
        Handler-->>Client: 200 OK Rich HUB HTML (Buttons, GitHub Cards, Click-to-Play Facades, Code, Callouts)
        Handler-)After: Record primary HUB visit (unless prefetch)
        After->>DB: Atomic clicks_count + 1 & INSERT click_events (sub_link_id = NULL)
    else Type = 'DIRECT'
        Handler->>Handler: Evaluate Smart Routing (Country / Language / Device / OS) + merge query params
        alt is_cloaked = true
            Handler-->>Client: 200 OK Clean Fullscreen 100vw x 100dvh Cloaked Iframe
        else Standard Redirect
            Handler-->>Client: 307 / 301 / 302 / 308 -> Location: resolvedDestinationUrl (<50ms)
        end
        Handler-)After: Record primary visit (unless prefetch)
        After->>DB: Atomic clicks_count + 1 & INSERT click_events
    end
```

### 2.2. Smart Conditional Routing Evaluation (`src/lib/smart-routing.ts`)

When `links.routing_rules_json` contains one or more `RoutingRule` entries, `evaluateSmartRouting(rules, context)` inspects the incoming request metadata in rule order:

- **Dimensions Extracted:** `country` (`x-vercel-ip-country` / `cf-ipcountry`), primary `language` (`Accept-Language`), `device` (`mobile` | `desktop` | `tablet`), and `os` (`iOS` | `Android` | `Windows` | `macOS` | `Linux`).
- **Matching Semantics:** Case-insensitive **OR** within each specified array (e.g., `countries: ["BO", "AR"]`) and **AND** across all non-empty dimensions on the rule (e.g., `devices: ["mobile"]` AND `os: ["iOS"]`).
- **Fallback:** The first rule where all non-empty criteria match supplies its `destinationUrl`; if no rule matches, resolution falls back to `link.destinationUrl`. Both direct hits and post-PIN `unlock` responses run identical Smart Routing evaluation.

### 2.3. Rich HUB Block Rendering & Zero-Tracker Facades

`renderHubLandingHtml` (and the post-unlock DOM builder in `pin-unlock-html.ts`) renders 6 polymorphic block kinds styled by `resolveThemeTokens(siteSettings, link.theme)`:

1. **`button`:** Branded icon, primary label, optional muted `sublabel`, and outbound arrow (`rel="noopener noreferrer"`).
2. **`github-repo`:** Server-side fetched via `fetchGitHubRepoPreview` (`2.5s` timeout, `15m` in-memory cache, graceful static fallback on rate-limit/offline) displaying `owner/repo`, description, language dot, `★ stars`, and `⑂ forks`.
3. **`youtube` & `spotify` (Click-to-Play Facades):** Renders a zero-cookie dark cover card with platform badge, title, thumbnail/accent, and themed Play trigger. Clicking mounts a sandboxed `https://www.youtube-nocookie.com/embed/<id>?autoplay=1&rel=0` or `https://open.spotify.com/embed/<type>/<id>` iframe via `document.createElement("iframe")` (never unsafe `innerHTML`) while dispatching a `hub-click` beacon.
4. **`code`:** Monospace terminal snippet with language header (`shell`, `bash`, `ts`, etc.) and one-click Copy button that triggers a `hub-click` beacon.
5. **`callout`:** Contextual `info`, `tip`, or `warning` card ideal for demo credentials, version notes, or event instructions.

---

## 3. REST API Reference (`/api/v1/*`)

### 3.1. Response & Error Envelopes

```typescript
// Cursor-paginated collection envelope
export interface PaginatedResponse<T> {
  items: T[];
  nextCursor: string | null;
  hasNextPage: boolean;
}

// Standardized error envelope
export interface ApiErrorResponse {
  error: {
    code:
      | "UNAUTHORIZED"
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "SLUG_RESERVED"
      | "SLUG_ALREADY_EXISTS"
      | "VALIDATION_ERROR"
      | "INVALID_PIN"
      | "RATE_LIMITED"
      | "LINK_EXPIRED"
      | "INTERNAL_ERROR";
    message: string;
    details?: Record<string, string[]>;
  };
}
```

### 3.2. Endpoint Matrix

> [!IMPORTANT]
> All **Admin** routes enforce Better-Auth session verification (`assertAdminApiSession`) tied to `ALLOWED_GITHUB_ID`. External API keys / Bearer tokens are intentionally unsupported.

| Method & Route                         | Auth                           | Purpose & Key Payload / Query Parameters                                                                                                                                                                                                                                      |
| :------------------------------------- | :----------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/links`                    | Admin                          | Cursor-paginated admin links feed (`cursor?`, `limit=12`, `q?`, `category?`, `status?`).                                                                                                                                                                                      |
| `POST /api/v1/links`                   | Admin                          | Create `DIRECT` or `HUB` link (`CreateLinkSchema`, including `theme`, `startsAt`, `expiredRedirectUrl`, `isCloaked`, `routingRules`, `pin`).                                                                                                                                  |
| `PATCH /api/v1/links/[id]`             | Admin                          | Partial update (`UpdateLinkSchema`) including quick toggles (`isActive`, `isPinned`, `isPublic`) and PIN set/clear.                                                                                                                                                           |
| `DELETE /api/v1/links/[id]`            | Admin                          | Delete link and cascade-remove `click_events` + `pin_attempts`.                                                                                                                                                                                                               |
| `POST /api/v1/links/[id]/reset-clicks` | Admin                          | Reset `clicks_count = 0` and purge `click_events` for link `[id]`.                                                                                                                                                                                                            |
| `POST /api/v1/links/bulk`              | Admin                          | Batch operations across selected IDs: `activate`, `pause`, `makePublic`, `makePrivate`, `setCategory`, `delete`.                                                                                                                                                              |
| `GET /api/v1/links/backup`             | Admin                          | Export full JSON backup of links (`passwordHash` stripped for security).                                                                                                                                                                                                      |
| `POST /api/v1/links/backup`            | Admin                          | Non-destructive JSON import (`{ links, conflictStrategy: "skip" \| "update", dryRun: boolean }`) returning preview/execution counts.                                                                                                                                          |
| `GET /api/v1/links/check-slug`         | Admin                          | Real-time slug syntax, blacklist, and uniqueness validation (`?slug=...&excludeId=...`).                                                                                                                                                                                      |
| `POST /api/v1/links/metadata-preview`  | Admin                          | SSRF-safe destination URL scraper returning `{ title, description, suggestedIcon, ogImage }`.                                                                                                                                                                                 |
| `POST /api/v1/links/frame-check`       | Admin                          | SSRF-safe cloak compatibility check inspecting `X-Frame-Options` & CSP `frame-ancestors` (`{ embeddable, reason, xFrameOptions, frameAncestors }`).                                                                                                                           |
| `POST /api/v1/links/[id]/health`       | Admin                          | Probe link destination reachability (`healthy` \| `redirect` \| `broken` \| `timeout`, HTTP status, `latencyMs`) and persist on `links`.                                                                                                                                      |
| `GET /api/v1/links/[id]/analytics`     | Admin                          | `O(1)` SQL Analytics 3.0 for `'overview'` or a single link (`?range=7d\|30d\|90d`): KPIs, deltas, daily series, `heatmap90d`, `hourlyDistribution`, `cities`, `countries`, `devices`, `os`, `browsers`, `referrers`, `queryRefs`, `subLinks`, `topLinks`, and `recentEvents`. |
| `GET /api/v1/settings`                 | Public / Admin                 | Retrieve global `site_settings` (profile, status badge, theme preset/HEX, Bento/Grid/List layout, social links).                                                                                                                                                              |
| `PUT /api/v1/settings`                 | Admin                          | Update global profile identity, status indicator, theme tokens, card style, and directory layout.                                                                                                                                                                             |
| `GET /api/v1/links/public`             | Public                         | Cursor-paginated feed of active, non-expired `is_public = true` links for `/`.                                                                                                                                                                                                |
| `POST /api/v1/slug/[slug]/unlock`      | Public (Rate-limited)          | Verify PIN (`5` attempts / `60s`), issue signed `il_unlock_<linkId>` cookie (`15m` TTL), evaluate Smart Routing, and return destination or `HUB` blocks.                                                                                                                      |
| `POST /api/v1/slug/[slug]/hub-click`   | Public (Cookie-checked if PIN) | Record asynchronous `sub_link_id` engagement beacon for HUB buttons, Click-to-Play embeds, and copied code blocks.                                                                                                                                                            |
| `GET /api/v1/og/...`                   | Public                         | Dynamic Edge PNG Open Graph image generation (`default`, `protected`, `preview`, and revision-cached `[id]/[revision]/image.png`).                                                                                                                                            |
