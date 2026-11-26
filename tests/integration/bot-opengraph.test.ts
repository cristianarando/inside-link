import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { handleSlugGet } from "../../src/app/(public)/[slug]/route";
import * as schema from "../../src/server/db/schema";
import { createLinkService } from "../../src/server/services/link.service";
import { createResolutionService } from "../../src/server/services/resolution.service";

async function setupEnv() {
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

describe("Dynamic Open Graph Injection for Social Preview Crawlers", () => {
  it("returns 200 OK with Open Graph meta tags for WhatsApp/LinkedInBot without consuming max_clicks", async () => {
    const { client, linkService, resolutionService } = await setupEnv();
    try {
      await linkService.createLink({
        slug: "exclusive-talk",
        type: "DIRECT",
        destinationUrl: "https://example.com/secret-stream",
        title: "Edge Architecture Talk",
        description: "Live session on Next.js 16 and Turso",
        ogImageUrl: "https://cristianarando.dev/og/talk.png",
        maxClicks: 1,
      });

      // 1. WhatsApp Bot request
      const whatsappRes = await handleSlugGet(
        new Request("https://cristianarando.dev/exclusive-talk", {
          headers: { "user-agent": "WhatsApp/2.24.1 i" },
        }),
        "exclusive-talk",
        resolutionService,
      );

      expect(whatsappRes.status).toBe(200);
      expect(whatsappRes.headers.get("content-type")).toContain("text/html");
      const html = await whatsappRes.text();
      expect(html).toContain(
        'property="og:title" content="Edge Architecture Talk"',
      );
      expect(html).toContain(
        'property="og:description" content="Live session on Next.js 16 and Turso"',
      );
      expect(html).toContain(
        'property="og:image" content="https://cristianarando.dev/og/talk.png"',
      );
      expect(html).toContain(
        'name="twitter:card" content="summary_large_image"',
      );

      // 2. LinkedInBot request
      const linkedinRes = await handleSlugGet(
        new Request("https://cristianarando.dev/exclusive-talk", {
          headers: {
            "user-agent": "LinkedInBot/1.0 (compatible; Mozilla/5.0)",
          },
        }),
        "exclusive-talk",
        resolutionService,
      );
      expect(linkedinRes.status).toBe(200);

      // Verify clicks_count remains 0 and the human visitor can still claim the single allowed click
      const beforeHuman = await linkService.getLinkBySlug("exclusive-talk");
      expect(beforeHuman?.clicksCount).toBe(0);

      const humanRes = await handleSlugGet(
        new Request("https://cristianarando.dev/exclusive-talk", {
          headers: { "user-agent": "Mozilla/5.0 Chrome/135.0" },
        }),
        "exclusive-talk",
        resolutionService,
      );
      expect(humanRes.status).toBe(307);
      expect(humanRes.headers.get("location")).toBe(
        "https://example.com/secret-stream",
      );
    } finally {
      client.close();
    }
  });
});
