# InsideLink v2 — Security, Operations & Verification Runbook

> **Document ID:** `docs/05-security-and-operations.md`  
> **Production Domain:** `https://links.cristianarando.dev`  
> **Related Specifications:** [`01-product-requirements.md`](01-product-requirements.md) · [`02-system-architecture.md`](02-system-architecture.md) · [`04-api-and-redirect-engine.md`](04-api-and-redirect-engine.md)

---

## 1. Single-Owner Authentication & Zero-API-Key Policy

InsideLink v2 is purpose-built for a single owner (**Cristian Arando**). Public sign-ups and external API tokens are strictly prohibited.

1. **GitHub OAuth Single-Owner Lock (`src/server/auth/config.ts`):**
   - Authentication is handled by **Better-Auth** with GitHub OAuth (`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`).
   - Better-Auth `databaseHooks` verify that the incoming GitHub account's immutable numeric ID matches `ALLOWED_GITHUB_ID` (and, when configured, `ALLOWED_GITHUB_EMAIL`).
   - Any non-matching GitHub login aborts with `403 FORBIDDEN` _before_ writing rows to `user`, `account`, or `session`.
2. **Explicit Exclusion of External Bearer Tokens:**
   - All `/api/v1/*` administrative mutations and analytics reads require an active `HttpOnly` Better-Auth session (`assertAdminApiSession`). Static API keys are omitted by design so leaked CI/CD or client tokens can never compromise redirect destinations.
3. **Fail-Closed Startup Validation (`src/lib/env.ts`):**
   - Missing or malformed `TURSO_DATABASE_URL`, `BETTER_AUTH_SECRET` (`>= 32` chars), `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, or `ALLOWED_GITHUB_ID` throws immediately at server startup.

---

## 2. Redirect, SSRF, Cloaking & PIN Hardening

### 2.1. Open Redirect, Self-Loop & XSS Prevention

- Every `destination_url`, `expired_redirect_url`, `routing_rules[].destinationUrl`, and `hub_links[].url` is validated through `SafeUrlSchema`, allowing exclusively `http:` and `https:` schemes (blocking `javascript:`, `data:`, `vbscript:`, `file:`, and `blob:`).
- Self-referential shortlink loops (`https://links.cristianarando.dev/<same-slug>`) are rejected during validation.
- Server-rendered HTML views (`hub-landing-html.ts`, `pin-unlock-html.ts`, `scheduled-countdown-html.ts`, `cloaked-link-html.ts`) escape all interpolated attributes/text (`escapeHtml`) and construct dynamic client nodes (`iframe`, unlocked HUB cards) via `document.createElement` rather than raw `innerHTML`.

### 2.2. SSRF Protection on Outbound Server Probes (`src/server/services/metadata.service.ts`)

Magic URL Metadata Preview (`/api/v1/links/metadata-preview`), Iframe Cloak Compatibility Checker (`/api/v1/links/frame-check`), and Link Health Scanner (`checkUrlHealth`) all pass target URLs and manual redirect hops through `assertSafeMetadataUrl`:

- Blocks `localhost`, `.local`, `.internal`, loopback (`127.0.0.0/8`, `::1`), RFC1918 private networks (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), CGNAT (`100.64.0.0/10`), link-local / cloud metadata endpoints (`169.254.0.0/16`, `fe80::/10`), and IPv6 ULA (`fc00::/7`).
- Resolves DNS records prior to connecting to prevent DNS-rebinding attacks, enforces strict `AbortSignal.timeout` (`4.0s`–`4.5s`), and cancels response streams immediately once required headers or `<head>` bytes are read.

### 2.3. PIN Cryptography, Signed Unlock Cookies & Atomic Rate Limiting

- **Key Derivation (`src/server/crypto/pin.ts`):** PINs are hashed with `node:crypto` `scrypt` + 16-byte random salt (`v1:<saltHex>:<hashHex>`) and verified via `crypto.timingSafeEqual`.
- **Stateless Unlock Token (`src/server/crypto/pin-token.ts`):** Successful PIN verification issues an `HttpOnly`, `SameSite=Lax` cookie (`il_unlock_<linkId>`, 15-minute TTL) signed via `HMAC-SHA256(BETTER_AUTH_SECRET)` over `${linkId}.${expUnixSec}.${passwordHashPrefix8}`. Changing a link's PIN automatically invalidates outstanding unlock cookies.
- **Atomic SQLite Rate Limiter (`src/server/crypto/rate-limit.ts`):** Caps failed attempts at `5` per `60` seconds per `(UTC_day + IP + linkId)` SHA-256 digest using conflict-free SQLite `ON CONFLICT(key) DO UPDATE` upserts.

---

## 3. Privacy-First Telemetry & Proxy Headers

1. **Request Proxy (`src/proxy.ts`):** Applies `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin` across routes, plus `X-Robots-Tag: noindex, nofollow` on `*.vercel.app` preview deployments so search engines index only `https://links.cristianarando.dev`.
2. **Zero-PII Geolocation & Live Stream (`src/lib/geo-headers.ts`):**
   - Extracts `country` (`x-vercel-ip-country` → `cf-ipcountry` → `'XX'`), decoded `city` (`x-vercel-ip-city` → `cf-ipcity` → `null`), normalized `referrer` hostname, and sanitized `?ref=` / `utm_source`.
   - Raw IP addresses (`x-forwarded-for`, `x-real-ip`) are **never** written to `click_events` or exposed in the Analytics 3.0 Live Clicks Stream.

---

## 4. Environment Configuration & Database Operations

### 4.1. Environment Variables (`src/lib/env.ts`)

```ini
# Turso / libSQL Database (use file:local.db for local dev)
TURSO_DATABASE_URL="file:local.db"
TURSO_AUTH_TOKEN=""

# Better-Auth & GitHub Single-Owner OAuth
BETTER_AUTH_SECRET="minimum_32_character_cryptographic_secret"
BETTER_AUTH_URL="https://links.cristianarando.dev"
GITHUB_CLIENT_ID="your_github_oauth_client_id"
GITHUB_CLIENT_SECRET="your_github_oauth_client_secret"
ALLOWED_GITHUB_ID="your_numeric_github_user_id"
ALLOWED_GITHUB_EMAIL="owner@example.com"

# Public Canonical Origins
NEXT_PUBLIC_CANONICAL_URL="https://links.cristianarando.dev"
NEXT_PUBLIC_PORTFOLIO_URL="https://cristianarando.dev"
NEXT_PUBLIC_ASSET_PREFIX=""
```

### 4.2. Safe Database Migration & Seeding Runbook

> [!CAUTION]
> **Remote Wipe Guard:** `src/server/db/seed.ts` aborts immediately (`process.exit(1)`) if `TURSO_DATABASE_URL` starts with `libsql://` or `https://` unless `--allow-remote-wipe` is explicitly passed. Always override `TURSO_DATABASE_URL="file:local.db"` when seeding locally!

```bash
# Apply additive Drizzle SQLite migrations locally
TURSO_DATABASE_URL="file:local.db" pnpm db:migrate

# Seed local SQLite database with English v2 showcase fixtures
TURSO_DATABASE_URL="file:local.db" pnpm db:seed

# Apply additive migrations to production Turso Cloud (non-destructive DDL only)
pnpm db:migrate
```

### 4.3. JSON Backup & Disaster Recovery

- **Export:** Navigate to `/admin/settings` → **Backup & Restore** (or `GET /api/v1/links/backup`) to download a timestamped JSON snapshot of all links, rich HUB blocks, themes, and smart routing rules (`passwordHash` excluded).
- **Dry-Run Restore:** Upload any backup JSON in `/admin/settings` with **Dry Run** enabled (`dryRun: true`) to inspect `toCreate`, `toUpdate`, and `toSkip` counts before committing changes with `conflictStrategy: "skip"` or `"update"`.

---

## 5. Verification & Quality Gates

Every release must pass all static, unit, integration, and build gates prior to deployment:

| Gate                     | Command                          | Verification Scope                                                                                                                                                                                                                                     |
| :----------------------- | :------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Type Safety**          | `pnpm typecheck`                 | Strict TypeScript (`noEmit`, `strict: true`, `noUncheckedIndexedAccess: true`).                                                                                                                                                                        |
| **Linting & Formatting** | `pnpm lint && pnpm format:check` | ESLint 9 (`eslint-config-next` 16.4.3) and Prettier across `src/` and `tests/`.                                                                                                                                                                        |
| **Automated Tests**      | `pnpm test`                      | Vitest unit suites (slugs, themes, smart routing, embeds, cursors, bots, PIN crypto, SSRF) + libSQL `:memory:` integration suites (migrations `0000`–`0003`, resolution engine, Analytics 3.0 `db.batch`, backup dry-run, bulk ops) + E2E route flows. |
| **Production Build**     | `pnpm build`                     | Next.js 16 App Router compilation, `src/proxy.ts` bundle check, and resilient `/sitemap.xml` generation.                                                                                                                                               |
