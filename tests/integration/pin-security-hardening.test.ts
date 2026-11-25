import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { handleSlugGet } from "@/app/(public)/[slug]/route";
import { handleHubSubLinkClickPost } from "@/app/api/v1/slug/[slug]/hub-click/route";
import { handlePinUnlockPost } from "@/app/api/v1/slug/[slug]/unlock/route";
import { renderPinUnlockHtml } from "@/components/hub/pin-unlock-form";
import {
  checkPinRateLimit,
  computePinAttemptKey,
  PIN_MAX_ATTEMPTS,
  PIN_WINDOW_MS,
  recordFailedPinAttempt,
} from "@/server/crypto/rate-limit";
import * as schema from "@/server/db/schema";
import { createLinkService } from "@/server/services/link.service";
import { createResolutionService } from "@/server/services/resolution.service";

async function setupEnv() {
  const client = createClient({ url: ":memory:" });
  await client.execute("PRAGMA foreign_keys = ON;");
  const db = drizzle(client, { schema });
  await migrate(db, {
    migrationsFolder: path.resolve(process.cwd(), "src/server/db/migrations"),
  });
  return {
    client,
    db,
    linkService: createLinkService(db),
    resolutionService: createResolutionService(db),
  };
}

describe("PIN Security Hardening, Unlock Tokens & HUB Click Tracking", () => {
  it("escapes HTML/attribute XSS payloads in renderPinUnlockHtml and avoids innerHTML", () => {
    const html = renderPinUnlockHtml({
      slug: 'bad" onload="alert(1)',
      title: '<script>alert(1)</script>Secret "Title"',
      description: '" onload="alert(1)<script>alert(1)</script>',
    });

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain('" onload="alert(1)');
    expect(html).not.toContain("innerHTML");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&quot; onload=&quot;alert(1)");
    expect(html).toContain('data-pin-slug="bad&quot; onload=&quot;alert(1)"');
  });

  it("preserves forwardQueryParams, records queryParamRef, enforces maxClicks atomically, and sets HttpOnly unlock cookie", async () => {
    const { client, db, linkService, resolutionService } = await setupEnv();
    try {
      const link = await linkService.createLink({
        slug: "one-time-secret",
        type: "DIRECT",
        destinationUrl: "https://cristianarando.dev/brief?existing=1",
        title: "One-Time Brief",
        pin: "4321",
        forwardQueryParams: true,
        maxClicks: 1,
      });

      const makeUnlockRequest = () =>
        handlePinUnlockPost(
          new Request(
            "https://links.cristianarando.dev/api/v1/slug/one-time-secret/unlock",
            {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-forwarded-for": "198.51.100.12",
                "user-agent": "Mozilla/5.0 Chrome/135.0",
              },
              body: JSON.stringify({
                pin: "4321",
                query: "?utm_source=linkedin&ref=cv&existing=ignored",
              }),
            },
          ),
          "one-time-secret",
          { db, resolution: resolutionService },
        );

      // Concurrent unlock attempts on a maxClicks: 1 link: only one succeeds (200), the other returns 410
      const responses = await Promise.all([
        makeUnlockRequest(),
        makeUnlockRequest(),
      ]);
      const statuses = responses.map((r) => r.status).sort((a, b) => a - b);
      expect(statuses).toEqual([200, 410]);

      const successRes = responses.find((r) => r.status === 200)!;
      const body = (await successRes.json()) as {
        data: { destinationUrl: string; type: string };
      };
      const targetUrl = new URL(body.data.destinationUrl);
      expect(targetUrl.searchParams.get("existing")).toBe("1");
      expect(targetUrl.searchParams.get("utm_source")).toBe("linkedin");
      expect(targetUrl.searchParams.get("ref")).toBe("cv");

      const setCookie = successRes.headers.get("set-cookie");
      expect(setCookie).toBeTruthy();
      expect(setCookie).toContain(`il_unlock_${link.id}=`);
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("SameSite=Lax");
      expect(setCookie).toContain("Max-Age=900");

      const updated = await linkService.getLinkById(link.id);
      expect(updated?.clicksCount).toBe(1);

      const events = await db
        .select()
        .from(schema.clickEvents)
        .where(eq(schema.clickEvents.linkId, link.id));
      expect(events).toHaveLength(1);
      expect(events[0]?.queryParamRef).toBe("cv");

      // Subsequent unlock attempt after exhaustion must return 410 Gone
      const exhaustedRes = await makeUnlockRequest();
      expect(exhaustedRes.status).toBe(410);
    } finally {
      client.close();
    }
  });

  it("rejects missing/invalid subLinkId (400) and unauthenticated PIN-protected HUB clicks (401)", async () => {
    const { client, db, linkService, resolutionService } = await setupEnv();
    try {
      const hub = await linkService.createLink({
        slug: "locked-hub",
        type: "HUB",
        title: "Locked Hub",
        pin: "7788",
        hubLinks: [
          {
            id: "repo",
            label: "GitHub Repo",
            url: "https://github.com/cristianarando/inside-link",
            icon: "github",
            variant: "primary",
          },
        ],
      });

      const missingSubLinkRes = await handleHubSubLinkClickPost(
        new Request(
          "https://links.cristianarando.dev/api/v1/slug/locked-hub/hub-click",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ subLinkId: "   " }),
          },
        ),
        "locked-hub",
        { db, resolution: resolutionService },
      );
      expect(missingSubLinkRes.status).toBe(400);

      const noCookieRes = await handleHubSubLinkClickPost(
        new Request(
          "https://links.cristianarando.dev/api/v1/slug/locked-hub/hub-click",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ subLinkId: "repo" }),
          },
        ),
        "locked-hub",
        { db, resolution: resolutionService },
      );
      expect(noCookieRes.status).toBe(401);

      const tamperedCookieRes = await handleHubSubLinkClickPost(
        new Request(
          "https://links.cristianarando.dev/api/v1/slug/locked-hub/hub-click",
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              cookie: `il_unlock_${hub.id}=${hub.id}.9999999999.deadbeef.${"0".repeat(64)}`,
            },
            body: JSON.stringify({ subLinkId: "repo" }),
          },
        ),
        "locked-hub",
        { db, resolution: resolutionService },
      );
      expect(tamperedCookieRes.status).toBe(401);

      // Unlock to obtain valid cookie, then verify unknown subLinkId returns 400
      const unlockRes = await handlePinUnlockPost(
        new Request(
          "https://links.cristianarando.dev/api/v1/slug/locked-hub/unlock",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ pin: "7788" }),
          },
        ),
        "locked-hub",
        { db, resolution: resolutionService },
      );
      expect(unlockRes.status).toBe(200);
      const unlockCookie = unlockRes.headers.get("set-cookie")!.split(";")[0]!;

      const unknownSubLinkRes = await handleHubSubLinkClickPost(
        new Request(
          "https://links.cristianarando.dev/api/v1/slug/locked-hub/hub-click",
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              cookie: unlockCookie,
            },
            body: JSON.stringify({ subLinkId: "does-not-exist" }),
          },
        ),
        "locked-hub",
        { db, resolution: resolutionService },
      );
      expect(unknownSubLinkRes.status).toBe(400);
    } finally {
      client.close();
    }
  });

  it("allows opening a maxClicks: 1 HUB once and clicking sub-buttons afterwards without inflating clicksCount", async () => {
    const { client, db, linkService, resolutionService } = await setupEnv();
    try {
      const hub = await linkService.createLink({
        slug: "single-visit-hub",
        type: "HUB",
        title: "Single Visit Hub",
        maxClicks: 1,
        hubLinks: [
          {
            id: "btn-docs",
            label: "Read Docs",
            url: "https://links.cristianarando.dev",
            icon: "book-open",
            variant: "primary",
          },
        ],
      });

      const visitRes = await handleSlugGet(
        new Request("https://links.cristianarando.dev/single-visit-hub", {
          headers: { "user-agent": "Mozilla/5.0 Chrome/135.0" },
        }),
        "single-visit-hub",
        resolutionService,
      );
      expect(visitRes.status).toBe(200);

      // Wait for async click tracking fallback outside Next.js request scope
      await new Promise((r) => setTimeout(r, 25));

      expect((await linkService.getLinkById(hub.id))?.clicksCount).toBe(1);

      const subClickRes = await handleHubSubLinkClickPost(
        new Request(
          "https://links.cristianarando.dev/api/v1/slug/single-visit-hub/hub-click",
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "user-agent": "Mozilla/5.0 Chrome/135.0",
            },
            body: JSON.stringify({ subLinkId: "btn-docs" }),
          },
        ),
        "single-visit-hub",
        { db, resolution: resolutionService },
      );
      expect(subClickRes.status).toBe(200);
      const subPayload = (await subClickRes.json()) as {
        data: { recorded: boolean; subLinkId: string };
      };
      expect(subPayload.data).toEqual({
        recorded: true,
        subLinkId: "btn-docs",
      });

      // clicksCount must remain 1 (no double-counting)
      expect((await linkService.getLinkById(hub.id))?.clicksCount).toBe(1);

      // A second primary visit to the HUB is blocked with 410 Gone because maxClicks = 1 was reached
      const secondVisitRes = await handleSlugGet(
        new Request("https://links.cristianarando.dev/single-visit-hub", {
          headers: { "user-agent": "Mozilla/5.0 Chrome/135.0" },
        }),
        "single-visit-hub",
        resolutionService,
      );
      expect(secondVisitRes.status).toBe(410);
    } finally {
      client.close();
    }
  });

  it("handles concurrent Promise.all recordFailedPinAttempt calls atomically without UNIQUE errors and enforces PIN_MAX_ATTEMPTS", async () => {
    const { client, db, linkService } = await setupEnv();
    try {
      const link = await linkService.createLink({
        slug: "rate-limit-atomic",
        type: "DIRECT",
        destinationUrl: "https://cristianarando.dev",
        title: "Atomic Rate Limit",
        pin: "9999",
      });

      const now = new Date("2026-11-24T12:00:00.000Z");
      const nextDay = new Date("2026-11-25T12:00:00.000Z");
      expect(computePinAttemptKey(link.id, "203.0.113.77", now)).not.toBe(
        computePinAttemptKey(link.id, "203.0.113.77", nextDay),
      );

      const results = await Promise.all(
        Array.from({ length: PIN_MAX_ATTEMPTS + 1 }, () =>
          recordFailedPinAttempt(db, link.id, "203.0.113.77", now),
        ),
      );

      const maxRecorded = Math.max(...results.map((r) => r.attemptsCount));
      expect(maxRecorded).toBe(PIN_MAX_ATTEMPTS + 1);

      const status = await checkPinRateLimit(db, link.id, "203.0.113.77", now);
      expect(status.allowed).toBe(false);
      expect(status.attemptsCount).toBe(PIN_MAX_ATTEMPTS + 1);
      expect(status.remainingAttempts).toBe(0);
      expect(status.retryAfterSeconds).toBeGreaterThan(0);

      // After the window expires, the next failed attempt resets the counter to 1
      const afterWindow = new Date(now.getTime() + PIN_WINDOW_MS + 1000);
      const resetAttempt = await recordFailedPinAttempt(
        db,
        link.id,
        "203.0.113.77",
        afterWindow,
      );
      expect(resetAttempt.attemptsCount).toBe(1);
      expect(resetAttempt.remainingAttempts).toBe(PIN_MAX_ATTEMPTS - 1);
    } finally {
      client.close();
    }
  });
});
