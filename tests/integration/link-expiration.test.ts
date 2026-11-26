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

describe("Automatic Expiration Controls (expires_at and max_clicks)", () => {
  it("redirects on the first 2 human clicks when max_clicks = 2 and responds 410 Gone on the 3rd", async () => {
    const { client, linkService, resolutionService } = await setupEnv();
    try {
      await linkService.createLink({
        slug: "vip-pass-2",
        type: "DIRECT",
        destinationUrl: "https://cristianarando.dev/vip",
        title: "VIP Pass (2 uses)",
        maxClicks: 2,
      });

      const makeHumanRequest = () =>
        handleSlugGet(
          new Request("https://cristianarando.dev/vip-pass-2", {
            headers: { "user-agent": "Mozilla/5.0 Chrome/135.0" },
          }),
          "vip-pass-2",
          resolutionService,
        );

      const first = await makeHumanRequest();
      expect(first.status).toBe(307);
      await new Promise((r) => setTimeout(r, 15));

      const second = await makeHumanRequest();
      expect(second.status).toBe(307);
      await new Promise((r) => setTimeout(r, 15));

      const third = await makeHumanRequest();
      expect(third.status).toBe(410);
      expect(third.headers.get("location")).toBeNull();
      const html = await third.text();
      expect(html).toContain("HTTP 410");
      expect(html).toContain("Maximum click limit reached");
    } finally {
      client.close();
    }
  });

  it("responds 410 Gone when expires_at is in the past", async () => {
    const { client, linkService, resolutionService } = await setupEnv();
    try {
      await linkService.createLink({
        slug: "expired-promo",
        type: "DIRECT",
        destinationUrl: "https://cristianarando.dev/promo",
        title: "Expired Promo",
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      });

      const res = await handleSlugGet(
        new Request("https://cristianarando.dev/expired-promo", {
          headers: { "user-agent": "Mozilla/5.0 Chrome/135.0" },
        }),
        "expired-promo",
        resolutionService,
      );
      expect(res.status).toBe(410);
      const html = await res.text();
      expect(html).toContain("This link has expired");
    } finally {
      client.close();
    }
  });
});
