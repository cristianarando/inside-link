# Architecture Decision Record — Locked Stack & Dependency Versions

> **Record ID:** `docs/decisions/stack-versions.md`  
> **Status:** Approved & Locked in `package.json` and `pnpm-lock.yaml`  
> **Platform Baseline:** InsideLink v2 (`https://links.cristianarando.dev`)

---

## 1. Context & Decision

To guarantee deterministic builds, sub-50ms serverless cold/warm starts, strict TypeScript inference, and zero native binary incompatibilities across local Windows/Linux development and Vercel production deployments, **InsideLink v2** pins its core runtime and package graph in `package.json` and `pnpm-lock.yaml`.

---

## 2. Locked Stack Registry

| Component             | Locked Version                   | Architectural Rationale                                                                                                                |
| :-------------------- | :------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------- |
| **Node.js**           | `v24.11.1` LTS                   | Native ESM, built-in `node:crypto` (`scrypt`, `createHmac`, `timingSafeEqual`), and Next.js 16 support.                                |
| **pnpm**              | `12.11.2`                        | Content-addressable deterministic lockfile with strict supply-chain verification.                                                      |
| **Next.js**           | `16.4.3` (App Router)            | Native `src/proxy.ts` request proxy, async `params`/`searchParams`, `after()` background telemetry, and `ImageResponse` OG generation. |
| **React & React DOM** | `19.3.0`                         | Server Components and concurrent client transitions aligned with Next.js 16.4.                                                         |
| **libSQL Client**     | `0.15.15` (`@libsql/client`)     | Official Turso driver supporting both local `file:local.db` / `:memory:` SQLite and remote HTTPS/WebSocket replicas.                   |
| **Drizzle ORM**       | `0.45.4` (`drizzle-orm`)         | Lightweight zero-Rust-binary SQL builder with `sqlite-core` schema typing and single-roundtrip `db.batch([...])` execution.            |
| **Drizzle Kit**       | `0.31.11` (`drizzle-kit`)        | Versioned additive SQLite DDL migration generation (`src/server/db/migrations`).                                                       |
| **Better-Auth**       | `1.7.13` (`better-auth`)         | Session-based GitHub OAuth 2.0 authentication with Drizzle SQLite adapter and `databaseHooks` owner lockdown (`ALLOWED_GITHUB_ID`).    |
| **Zod**               | `3.25.76`                        | Shared runtime validation for API payloads, structured JSON columns, URLs, and startup environment variables.                          |
| **ulidx**             | `2.4.1`                          | 26-character monotonic ULID generator enabling `O(1)` compound keyset cursor pagination `(is_pinned, id)`.                             |
| **Tailwind CSS**      | `4.3.3` (`@tailwindcss/postcss`) | High-speed CSS engine powering the dark-only _Obsidian & Emerald_ design system and CSS custom property themes.                        |
| **Lucide React**      | `1.61.0`                         | Crisp vector iconography paired with custom SVG brand marks.                                                                           |
| **qrcode**            | `1.5.4`                          | Deterministic SVG and `1024×1024px` PNG QR matrix generation with Level `H` (30%) error correction.                                    |
| **TypeScript**        | `5.9.3`                          | Strict static verification (`strict: true`, `noUncheckedIndexedAccess: true`, zero `any`).                                             |
| **Vitest**            | `3.2.7`                          | Fast ESM test runner for unit, `:memory:` SQLite integration, and E2E route verification.                                              |
| **ESLint & Prettier** | `9.39.5` / `3.8.3`               | Flat-config Next.js 16 linting (`eslint-config-next@16.4.3`) and consistent code formatting.                                           |
| **Puppeteer Core**    | `25.16.0`                        | Automated high-DPI screenshot capture scripts in `scripts/`.                                                                           |
