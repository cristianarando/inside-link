import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { handleSlugGet } from "../../src/app/(public)/[slug]/route";
import { handleListPublicLinksGet } from "../../src/app/api/v1/links/public/route";
import type {
  PaginatedResult,
  PublicLinkDTO,
} from "../../src/lib/types/link-dto";
import * as schema from "../../src/server/db/schema";
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
    linkService: createLinkService(db),
    resolutionService: createResolutionService(db),
  };
}

describe("E2E (Public Directory & Redirects): /[slug], Open Graph & Cursor Infinite Scroll", () => {
  it("executes direct redirect with query param forwarding, WhatsApp OG preview, and public cursor pagination", async () => {
    const { client, linkService, resolutionService } = await setupE2EEnv();
    try {
      // 1. Seed 15 public links to test cursor-based Infinite Scroll
      for (let i = 1; i <= 15; i++) {
        await linkService.createLink({
          slug: `dev-resource-${String(i).padStart(2, "0")}`,
          type: "DIRECT",
          destinationUrl: `https://cristianarando.dev/blog/post-${i}?lang=es`,
          title: `Engineering Resource #${i}`,
          description: `Technical guide #${i}`,
          category: i <= 8 ? "project" : "resource",
          isPublic: true,
          isPinned: i === 15,
          forwardQueryParams: true,
        });
      }

      // 2. Direct redirect preserving incoming query params without overwriting lang=es
      const redirectRes = await handleSlugGet(
        new Request(
          "https://cristianarando.dev/dev-resource-01?utm_source=linkedin&lang=en",
          { headers: { "user-agent": "Mozilla/5.0 Chrome/135.0" } },
        ),
        "dev-resource-01",
        resolutionService,
      );
      expect(redirectRes.status).toBe(307);
      expect(redirectRes.headers.get("location")).toBe(
        "https://cristianarando.dev/blog/post-1?lang=es&utm_source=linkedin",
      );

      // 3. WhatsApp/2.0 crawler simulation -> 200 OK with Open Graph tags
      const botRes = await handleSlugGet(
        new Request("https://cristianarando.dev/dev-resource-02", {
          headers: { "user-agent": "WhatsApp/2.24.1 A" },
        }),
        "dev-resource-02",
        resolutionService,
      );
      expect(botRes.status).toBe(200);
      const ogHtml = await botRes.text();
      expect(ogHtml).toContain('property="og:title"');
      expect(ogHtml).toContain("Engineering Resource #2");

      // 4. Public directory pagination: initial batch (12 items) + next cursor page (3 items)
      const firstPageRes = await handleListPublicLinksGet(
        new Request("https://cristianarando.dev/api/v1/links/public?limit=12"),
        linkService,
      );
      const firstPage =
        (await firstPageRes.json()) as PaginatedResult<PublicLinkDTO>;
      expect(firstPage.items).toHaveLength(12);
      expect(firstPage.items[0]?.slug).toBe("dev-resource-15"); // pinned first
      expect(firstPage.hasNextPage).toBe(true);
      expect(firstPage.nextCursor).toBeTruthy();

      const secondPageRes = await handleListPublicLinksGet(
        new Request(
          `https://cristianarando.dev/api/v1/links/public?limit=12&cursor=${encodeURIComponent(
            firstPage.nextCursor!,
          )}`,
        ),
        linkService,
      );
      const secondPage =
        (await secondPageRes.json()) as PaginatedResult<PublicLinkDTO>;
      expect(secondPage.items).toHaveLength(3);
      expect(secondPage.hasNextPage).toBe(false);
    } finally {
      client.close();
    }
  });
});
