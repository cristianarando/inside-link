import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { handleSlugGet } from "../../src/app/(public)/[slug]/route";
import { handleHubSubLinkClickPost } from "../../src/app/api/v1/slug/[slug]/hub-click/route";
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
    db,
    linkService: createLinkService(db),
    resolutionService: createResolutionService(db),
  };
}

describe("Project Micro-Landing Mode (type = 'HUB')", () => {
  it("renders title, description, tags, and buttons on GET /[slug] and records sub_link_id on button click", async () => {
    const { client, db, linkService, resolutionService } = await setupEnv();
    try {
      const hub = await linkService.createLink({
        slug: "smart-travel-guide",
        type: "HUB",
        title: "Smart Travel Guide",
        description: "Full-stack platform with interactive maps.",
        tags: ["nextjs", "turso", "tailwind"],
        hubLinks: [
          {
            id: "btn-repo",
            label: "GitHub Repository",
            url: "https://github.com/Crisutf/smart-travel-guide",
            icon: "github",
            variant: "primary",
          },
          {
            id: "btn-demo",
            label: "Live Demo",
            url: "https://guide.cristianarando.dev",
            icon: "globe",
            variant: "secondary",
          },
        ],
      });

      const pageRes = await handleSlugGet(
        new Request("https://cristianarando.dev/smart-travel-guide", {
          headers: { "user-agent": "Mozilla/5.0 Chrome/135.0" },
        }),
        "smart-travel-guide",
        resolutionService,
      );

      expect(pageRes.status).toBe(200);
      const html = await pageRes.text();
      expect(html).toContain("Smart Travel Guide");
      expect(html).toContain("Full-stack platform with interactive maps.");
      expect(html).toContain("#nextjs");
      expect(html).toContain("GitHub Repository");
      expect(html).toContain("Live Demo");

      // Simulate click on the "btn-demo" button
      const clickRes = await handleHubSubLinkClickPost(
        new Request(
          "https://cristianarando.dev/api/v1/slug/smart-travel-guide/hub-click",
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "user-agent": "Mozilla/5.0 Chrome/135.0",
            },
            body: JSON.stringify({ subLinkId: "btn-demo" }),
          },
        ),
        "smart-travel-guide",
        { db, resolution: resolutionService },
      );

      expect(clickRes.status).toBe(200);

      const events = await db
        .select()
        .from(schema.clickEvents)
        .where(eq(schema.clickEvents.linkId, hub.id));
      expect(events.some((e) => e.subLinkId === "btn-demo")).toBe(true);
    } finally {
      client.close();
    }
  });
});
