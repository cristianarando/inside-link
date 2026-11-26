import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { handleListPublicLinksGet } from "../../src/app/api/v1/links/public/route";
import type {
  PaginatedResult,
  PublicLinkDTO,
} from "../../src/lib/types/link-dto";
import * as schema from "../../src/server/db/schema";
import { createLinkService } from "../../src/server/services/link.service";

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
  };
}

describe("Public Directory (/) & Private/Inactive Link Isolation", () => {
  it("returns only public, active, non-expired links without exposing private fields", async () => {
    const { client, linkService } = await setupEnv();
    try {
      await linkService.createLink({
        slug: "public-project",
        type: "DIRECT",
        destinationUrl: "https://github.com/Crisutf/public-repo",
        title: "Public Project",
        category: "project",
        isPublic: true,
        isActive: true,
      });

      await linkService.createLink({
        slug: "private-link",
        type: "DIRECT",
        destinationUrl: "https://docs.cristianarando.dev/secret",
        title: "Private Link",
        category: "project",
        isPublic: false,
        isActive: true,
      });

      await linkService.createLink({
        slug: "paused-link",
        type: "DIRECT",
        destinationUrl: "https://github.com/Crisutf/paused",
        title: "Paused Link",
        category: "project",
        isPublic: true,
        isActive: false,
      });

      await linkService.createLink({
        slug: "expired-link",
        type: "DIRECT",
        destinationUrl: "https://github.com/Crisutf/expired",
        title: "Expired Link",
        category: "project",
        isPublic: true,
        isActive: true,
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      });

      const res = await handleListPublicLinksGet(
        new Request(
          "https://cristianarando.dev/api/v1/links/public?category=project",
        ),
        linkService,
      );

      expect(res.status).toBe(200);
      const page = (await res.json()) as PaginatedResult<PublicLinkDTO>;
      expect(page.items).toHaveLength(1);
      expect(page.items[0]?.slug).toBe("public-project");

      // Ensure no sensitive administrative fields leak into the public JSON payload
      const rawJson = JSON.stringify(page.items[0]);
      expect(rawJson).not.toContain("passwordHash");
      expect(rawJson).not.toContain("maxClicks");
    } finally {
      client.close();
    }
  });
});
