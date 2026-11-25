import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import path from "node:path";
import { describe, expect, it } from "vitest";

import * as schema from "../../src/server/db/schema";
import { createAnalyticsService } from "../../src/server/services/analytics.service";
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
    analyticsService: createAnalyticsService(db),
  };
}

describe("AnalyticsService — SQLite Aggregations & Telemetry Privacy", () => {
  it("computes daily series, countries, devices, OS, and referrers matching recorded events without storing IPs", async () => {
    const { client, db, linkService, resolutionService, analyticsService } =
      await setupEnv();
    try {
      const now = new Date("2026-10-28T15:00:00.000Z");
      const link = await linkService.createLink({
        slug: "github-cris",
        type: "DIRECT",
        destinationUrl: "https://github.com/Crisutf",
        title: "GitHub Cristian",
      });

      await resolutionService.recordClickEvent({
        linkId: link.id,
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/135.0.0.0 Safari/537.36",
          "x-vercel-ip-country": "BO",
          referer: "https://www.linkedin.com/feed/",
          "x-forwarded-for": "203.0.113.10",
        },
        searchParams: { ref: "linkedin_post" },
        now,
      });

      await resolutionService.recordClickEvent({
        linkId: link.id,
        headers: {
          "user-agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1",
          "x-vercel-ip-country": "BO",
          referer: "https://cristianarando.dev/es",
          "x-forwarded-for": "203.0.113.11",
        },
        searchParams: { ref: "portfolio_hero" },
        now,
      });

      await resolutionService.recordClickEvent({
        linkId: link.id,
        headers: {
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 Chrome/135.0.0.0 Safari/537.36",
          "x-vercel-ip-country": "US",
          "x-forwarded-for": "203.0.113.12",
        },
        now,
      });

      const summary = await analyticsService.getAnalyticsSummary({
        linkId: link.id,
        range: "7d",
        now,
      });

      expect(summary).not.toBeNull();
      expect(summary?.totalClicksInRange).toBe(3);
      expect(summary?.previousPeriodClicks).toBe(0);
      expect(summary?.deltaPercentage).toBeNull();
      expect(summary?.allTimeClicks).toBe(3);
      expect(summary?.dailySeries).toHaveLength(7);

      const sumDaily = summary!.dailySeries.reduce(
        (acc, item) => acc + item.clicks,
        0,
      );
      const sumCountries = summary!.countries.reduce(
        (acc, item) => acc + item.count,
        0,
      );
      const sumDevices = summary!.devices.reduce(
        (acc, item) => acc + item.count,
        0,
      );

      expect(sumDaily).toBe(3);
      expect(sumCountries).toBe(3);
      expect(sumDevices).toBe(3);

      expect(summary!.countries[0]).toMatchObject({ key: "BO", count: 2 });
      expect(summary!.countries[1]).toMatchObject({ key: "US", count: 1 });

      const rawEvents = await db.select().from(schema.clickEvents);
      const serialized = JSON.stringify(rawEvents);
      expect(serialized).not.toContain("203.0.113.");
    } finally {
      client.close();
    }
  });

  it("aggregates previousPeriodClicks, deltaPercentage, browsers, queryRefs, HUB subLinks, and overview topLinks without inflating totalClicksInRange", async () => {
    const { client, linkService, resolutionService, analyticsService } =
      await setupEnv();
    try {
      const now = new Date("2026-10-28T15:00:00.000Z");
      const prevWindowDate = new Date("2026-10-18T12:00:00.000Z"); // within [Oct 15, Oct 22) for 7d window ending Oct 29
      const currentWindowDay1 = new Date("2026-10-26T10:00:00.000Z");
      const currentWindowDay2 = new Date("2026-10-28T10:00:00.000Z");

      const hub = await linkService.createLink({
        slug: "eng-hub",
        type: "HUB",
        title: "Engineering Hub",
        hubLinks: [
          {
            id: "repo-btn",
            label: "GitHub Repository",
            url: "https://github.com/cristianarando/inside-link",
            icon: "github",
            variant: "primary",
          },
          {
            id: "demo-btn",
            label: "Live Demo",
            url: "https://links.cristianarando.dev",
            icon: "globe",
            variant: "secondary",
          },
        ],
      });

      const direct = await linkService.createLink({
        slug: "cv-direct",
        type: "DIRECT",
        destinationUrl: "https://cristianarando.dev/cv",
        title: "Curriculum Vitae",
      });

      const chromeHeaders = {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/135.0.0.0 Safari/537.36",
        "x-vercel-ip-country": "BO",
      };
      const safariHeaders = {
        "user-agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1",
        "x-vercel-ip-country": "ES",
      };

      // Previous 7d window: 2 primary visits on hub
      await resolutionService.recordClickEvent({
        linkId: hub.id,
        headers: chromeHeaders,
        now: prevWindowDate,
      });
      await resolutionService.recordClickEvent({
        linkId: hub.id,
        headers: chromeHeaders,
        now: prevWindowDate,
      });

      // Current 7d window: 4 primary visits on hub (2 Chrome + 2 Safari, with ?ref=)
      await resolutionService.recordClickEvent({
        linkId: hub.id,
        headers: chromeHeaders,
        searchParams: { ref: "linkedin" },
        now: currentWindowDay1,
      });
      await resolutionService.recordClickEvent({
        linkId: hub.id,
        headers: chromeHeaders,
        searchParams: { ref: "linkedin" },
        now: currentWindowDay1,
      });
      await resolutionService.recordClickEvent({
        linkId: hub.id,
        headers: safariHeaders,
        searchParams: { ref: "cv" },
        now: currentWindowDay2,
      });
      await resolutionService.recordClickEvent({
        linkId: hub.id,
        headers: safariHeaders,
        now: currentWindowDay2,
      });

      // Outbound HUB sub-link clicks (sub_link_id IS NOT NULL) must NOT inflate totalClicksInRange
      await resolutionService.recordClickEvent({
        linkId: hub.id,
        subLinkId: "repo-btn",
        headers: chromeHeaders,
        now: currentWindowDay2,
      });
      await resolutionService.recordClickEvent({
        linkId: hub.id,
        subLinkId: "repo-btn",
        headers: chromeHeaders,
        now: currentWindowDay2,
      });
      await resolutionService.recordClickEvent({
        linkId: hub.id,
        subLinkId: "demo-btn",
        headers: safariHeaders,
        now: currentWindowDay2,
      });

      // Primary visit on direct link in current window
      await resolutionService.recordClickEvent({
        linkId: direct.id,
        headers: chromeHeaders,
        searchParams: { ref: "qr" },
        now: currentWindowDay2,
      });

      const hubSummary = await analyticsService.getAnalyticsSummary({
        linkId: hub.id,
        range: "7d",
        now,
      });

      expect(hubSummary).not.toBeNull();
      expect(hubSummary?.totalClicksInRange).toBe(4);
      expect(hubSummary?.previousPeriodClicks).toBe(2);
      expect(hubSummary?.deltaPercentage).toBe(100);
      expect(hubSummary?.hubSubLinkClicks).toBe(3);
      expect(hubSummary?.allTimeClicks).toBe(6);

      expect(hubSummary?.subLinks).toEqual([
        {
          subLinkId: "repo-btn",
          label: "GitHub Repository",
          count: 2,
          percentage: 66.7,
        },
        {
          subLinkId: "demo-btn",
          label: "Live Demo",
          count: 1,
          percentage: 33.3,
        },
      ]);

      expect(hubSummary?.browsers).toEqual([
        { key: "Chrome", count: 2, percentage: 50 },
        { key: "Safari", count: 2, percentage: 50 },
      ]);

      expect(hubSummary?.queryRefs).toEqual([
        { key: "linkedin", count: 2, percentage: 50 },
        { key: "cv", count: 1, percentage: 25 },
      ]);

      const overview = await analyticsService.getAnalyticsSummary({
        linkId: "overview",
        range: "7d",
        now,
      });

      expect(overview).not.toBeNull();
      expect(overview?.scope).toBe("overview");
      expect(overview?.totalClicksInRange).toBe(5);
      expect(overview?.previousPeriodClicks).toBe(2);
      expect(overview?.deltaPercentage).toBe(150);
      expect(overview?.hubSubLinkClicks).toBe(3);
      expect(overview?.allTimeClicks).toBe(7);
      expect(overview?.topLinks).toHaveLength(2);
      expect(overview?.topLinks?.[0]).toEqual({
        id: hub.id,
        slug: "eng-hub",
        title: "Engineering Hub",
        clicksInRange: 4,
        allTimeClicks: 6,
      });
      expect(overview?.topLinks?.[1]).toEqual({
        id: direct.id,
        slug: "cv-direct",
        title: "Curriculum Vitae",
        clicksInRange: 1,
        allTimeClicks: 1,
      });
    } finally {
      client.close();
    }
  });
});
