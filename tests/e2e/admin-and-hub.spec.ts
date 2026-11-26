import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { NextRequest } from "next/server";
import { handleSlugGet } from "../../src/app/(public)/[slug]/route";
import { GET as listAdminLinksAnonymousGet } from "../../src/app/api/v1/links/route";
import { handleHubSubLinkClickPost } from "../../src/app/api/v1/slug/[slug]/hub-click/route";
import { handlePinUnlockPost } from "../../src/app/api/v1/slug/[slug]/unlock/route";
import * as schema from "../../src/server/db/schema";
import { createAnalyticsService } from "../../src/server/services/analytics.service";
import { createLinkService } from "../../src/server/services/link.service";
import { createResolutionService } from "../../src/server/services/resolution.service";

async function setupE2EEnv() {
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
    analyticsService: createAnalyticsService(db),
  };
}

describe("E2E (Admin, HUB, PIN & Security/Accessibility Audit)", () => {
  it("protects /api/v1/links without session, runs HUB + PIN unlock flow, and audits semantic/a11y attributes", async () => {
    const { client, db, linkService, resolutionService, analyticsService } =
      await setupE2EEnv();
    try {
      // 1. Anonymous request to /api/v1/links must be rejected with 401
      const anonRes = await listAdminLinksAnonymousGet(
        new NextRequest("https://cristianarando.dev/api/v1/links"),
      );
      expect(anonRes.status).toBe(401);

      // 2. Create PIN-protected HUB micro-landing
      const hub = await linkService.createLink({
        slug: "private-architecture",
        type: "HUB",
        title: "Internal Architecture 2026",
        description: "PIN-protected technical documentation.",
        pin: "9876",
        hubLinks: [
          {
            id: "doc-rfc",
            label: "View Design RFC",
            url: "https://docs.cristianarando.dev/rfc-2026",
            icon: "file-text",
            variant: "primary",
          },
        ],
      });

      // 3. Visiting /private-architecture renders accessible PIN view (role="alert", aria-label) without leaking URLs
      const lockedPage = await handleSlugGet(
        new Request("https://cristianarando.dev/private-architecture", {
          headers: { "user-agent": "Mozilla/5.0 Chrome/135.0" },
        }),
        "private-architecture",
        resolutionService,
      );
      expect(lockedPage.status).toBe(200);
      const lockedHtml = await lockedPage.text();
      expect(lockedHtml).toContain('aria-label="Access PIN code"');
      expect(lockedHtml).toContain('role="alert"');
      expect(lockedHtml).not.toContain("rfc-2026");

      // 4. Wrong PIN attempt -> 401, followed by correct PIN -> 200 OK with hubLinks
      const failedUnlock = await handlePinUnlockPost(
        new Request(
          "https://cristianarando.dev/api/v1/slug/private-architecture/unlock",
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-forwarded-for": "192.0.2.55",
            },
            body: JSON.stringify({ pin: "0000" }),
          },
        ),
        "private-architecture",
        { db, resolution: resolutionService },
      );
      expect(failedUnlock.status).toBe(401);

      const okUnlock = await handlePinUnlockPost(
        new Request(
          "https://cristianarando.dev/api/v1/slug/private-architecture/unlock",
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-forwarded-for": "192.0.2.55",
              "user-agent": "Mozilla/5.0 Chrome/135.0",
              "x-vercel-ip-country": "BO",
            },
            body: JSON.stringify({ pin: "9876" }),
          },
        ),
        "private-architecture",
        { db, resolution: resolutionService },
      );
      expect(okUnlock.status).toBe(200);
      const unlockBody = (await okUnlock.json()) as {
        data: { type: string; hubLinks: { id: string; url: string }[] };
      };
      expect(unlockBody.data.type).toBe("HUB");
      expect(unlockBody.data.hubLinks[0]?.url).toBe(
        "https://docs.cristianarando.dev/rfc-2026",
      );

      // 5. Reject HUB sub-link click without signed PIN unlock cookie (401)
      const unauthSubClick = await handleHubSubLinkClickPost(
        new Request(
          "https://links.cristianarando.dev/api/v1/slug/private-architecture/hub-click",
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "user-agent": "Mozilla/5.0 Chrome/135.0",
            },
            body: JSON.stringify({ subLinkId: "doc-rfc" }),
          },
        ),
        "private-architecture",
        { db, resolution: resolutionService },
      );
      expect(unauthSubClick.status).toBe(401);

      // 6. Extract Set-Cookie from okUnlock, pass Cookie header to hub-click (200 OK), and verify analytics
      const setCookieHeader = okUnlock.headers.get("set-cookie");
      expect(setCookieHeader).toBeTruthy();
      expect(setCookieHeader).toContain("il_unlock_");
      const unlockCookiePair = setCookieHeader!.split(";")[0]!;

      const subClick = await handleHubSubLinkClickPost(
        new Request(
          "https://links.cristianarando.dev/api/v1/slug/private-architecture/hub-click",
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              cookie: unlockCookiePair,
              "user-agent": "Mozilla/5.0 Chrome/135.0",
              "x-vercel-ip-country": "BO",
            },
            body: JSON.stringify({ subLinkId: "doc-rfc" }),
          },
        ),
        "private-architecture",
        { db, resolution: resolutionService },
      );
      expect(subClick.status).toBe(200);

      const summary = await analyticsService.getAnalyticsSummary({
        linkId: hub.id,
        range: "7d",
      });
      expect(summary?.totalClicksInRange).toBe(1); // Primary unlock visit only (sub-link click does not inflate totalClicksInRange)
      expect(summary?.hubSubLinkClicks).toBe(1);
      expect(summary?.subLinks[0]?.subLinkId).toBe("doc-rfc");
    } finally {
      client.close();
    }
  });
});
