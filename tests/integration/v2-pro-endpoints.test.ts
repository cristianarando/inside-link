import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { handleSlugGet } from "@/app/(public)/[slug]/route";
import {
  handleExportLinksBackupGet,
  handleImportLinksBackupPost,
} from "@/app/api/v1/links/backup/route";
import { handleBulkActionLinksPost } from "@/app/api/v1/links/bulk/route";
import { handleResetLinkClicksPost } from "@/app/api/v1/links/[id]/reset-clicks/route";
import type { AdminApiDeps } from "@/app/api/v1/links/route";
import {
  handleGetSettings,
  handleUpdateSettings,
} from "@/app/api/v1/settings/route";
import { handlePinUnlockPost } from "@/app/api/v1/slug/[slug]/unlock/route";
import * as schema from "@/server/db/schema";
import { createAnalyticsService } from "@/server/services/analytics.service";
import { createLinkService } from "@/server/services/link.service";
import { createResolutionService } from "@/server/services/resolution.service";
import {
  createSettingsService,
  SettingsServiceError,
} from "@/server/services/settings.service";

async function setupEnv() {
  const client = createClient({ url: ":memory:" });
  await client.execute("PRAGMA foreign_keys = ON;");
  const db = drizzle(client, { schema });
  await migrate(db, {
    migrationsFolder: path.resolve(process.cwd(), "src/server/db/migrations"),
  });

  const linkService = createLinkService(db);
  const settingsService = createSettingsService(db);
  const resolutionService = createResolutionService(db);
  const analyticsService = createAnalyticsService(db);

  const authorizedAdminDeps: AdminApiDeps = {
    service: linkService,
    checkAuth: async () => ({
      authorized: true as const,
      session: {
        user: {
          id: "usr_owner",
          name: "Cristian Arando",
          email: "cristian@example.com",
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        session: {
          id: "sess_owner",
          userId: "usr_owner",
          token: "tok_owner",
          expiresAt: new Date(Date.now() + 3600_000),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
    }),
  };

  return {
    client,
    db,
    linkService,
    settingsService,
    resolutionService,
    analyticsService,
    authorizedAdminDeps,
  };
}

describe("InsideLink v2 Pro Integration Suite (0003 Schema)", () => {
  it("SettingsService: reads default settings and round-trips profile, theme, layout, status, and social links", async () => {
    const { client, settingsService, authorizedAdminDeps } = await setupEnv();
    try {
      const defaults = await settingsService.getSiteSettings();
      expect(defaults.id).toBe("default");
      expect(defaults.themePreset).toBe("obsidian-emerald");
      expect(defaults.directoryLayout).toBe("bento");
      expect(defaults.resolvedTheme.accentHex).toBe("#10b981");

      await expect(
        settingsService.updateSiteSettings({
          themePreset: "custom",
          customAccentHex: null,
        }),
      ).rejects.toBeInstanceOf(SettingsServiceError);

      const updatedRes = await handleUpdateSettings(
        new Request("https://links.cristianarando.dev/api/v1/settings", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            displayName: "Cristian Arando v2",
            headline: "Systems & Product Engineering",
            bio: "Building precision dark-mode developer tools.",
            avatarUrl: "/brand/author-avatar.png",
            statusText: "Open to Staff Roles",
            statusColor: "cyan",
            statusHref: "https://cristianarando.dev/contact",
            themePreset: "custom",
            customAccentHex: "#38BDF8",
            surfaceTone: "midnight",
            glowIntensity: "vibrant",
            cardStyle: "bordered",
            directoryLayout: "grid",
            socialLinks: [
              {
                id: "gh",
                platform: "github",
                label: "GitHub",
                url: "https://github.com/cristianarando",
                icon: "github",
              },
            ],
          }),
        }),
        {
          service: settingsService,
          checkAuth: authorizedAdminDeps.checkAuth,
        },
      );
      expect(updatedRes.status).toBe(200);

      const fetchedRes = await handleGetSettings({ service: settingsService });
      expect(fetchedRes.status).toBe(200);
      const { data } = (await fetchedRes.json()) as {
        data: Awaited<ReturnType<typeof settingsService.getSiteSettings>>;
      };

      expect(data.displayName).toBe("Cristian Arando v2");
      expect(data.statusText).toBe("Open to Staff Roles");
      expect(data.statusColor).toBe("cyan");
      expect(data.themePreset).toBe("custom");
      expect(data.customAccentHex).toBe("#38bdf8");
      expect(data.surfaceTone).toBe("midnight");
      expect(data.glowIntensity).toBe("vibrant");
      expect(data.cardStyle).toBe("bordered");
      expect(data.directoryLayout).toBe("grid");
      expect(data.resolvedTheme.accentHex).toBe("#38bdf8");
      expect(data.socialLinks).toHaveLength(1);
      expect(data.socialLinks[0]?.platform).toBe("github");
    } finally {
      client.close();
    }
  });

  it("Resolution v2: handles SCHEDULED_COUNTDOWN, expiredRedirectUrl fallback, Smart Routing, and CLOAKED_VIEW", async () => {
    const { client, db, linkService, resolutionService, settingsService } =
      await setupEnv();
    try {
      const futureLaunch = new Date(Date.now() + 3_600_000);
      const scheduled = await linkService.createLink({
        slug: "launch-countdown",
        type: "DIRECT",
        destinationUrl: "https://example.com/product-launch",
        title: "Product Launch v2",
        startsAt: futureLaunch,
      });

      const scheduledRes = await handleSlugGet(
        new Request("https://links.cristianarando.dev/launch-countdown", {
          headers: { "user-agent": "Mozilla/5.0 Chrome/135.0" },
        }),
        "launch-countdown",
        resolutionService,
        settingsService,
      );
      expect(scheduledRes.status).toBe(200);
      const scheduledHtml = await scheduledRes.text();
      expect(scheduledHtml).toContain("Product Launch v2");
      expect(scheduledHtml).toContain(futureLaunch.toISOString());
      expect((await linkService.getLinkById(scheduled.id))?.clicksCount).toBe(
        0,
      );

      const expiredWithFallback = await linkService.createLink({
        slug: "limited-offer",
        type: "DIRECT",
        destinationUrl: "https://example.com/offer",
        title: "Limited Offer",
        expiresAt: new Date(Date.now() - 60_000),
        expiredRedirectUrl: "https://example.com/waitlist",
      });

      const fallbackRes = await handleSlugGet(
        new Request("https://links.cristianarando.dev/limited-offer", {
          headers: { "user-agent": "Mozilla/5.0 Chrome/135.0" },
        }),
        "limited-offer",
        resolutionService,
        settingsService,
      );
      expect(fallbackRes.status).toBe(307);
      expect(fallbackRes.headers.get("location")).toBe(
        "https://example.com/waitlist",
      );
      await new Promise((r) => setTimeout(r, 25));
      expect(
        (await linkService.getLinkById(expiredWithFallback.id))?.clicksCount,
      ).toBe(0);

      await linkService.createLink({
        slug: "smart-app",
        type: "DIRECT",
        destinationUrl: "https://example.com/web-fallback",
        title: "Smart App Download",
        forwardQueryParams: true,
        routingRules: [
          {
            id: "ios-es",
            label: "iOS Spanish",
            destinationUrl: "https://apps.apple.com/es/app/insidelink",
            countries: ["BO"],
            languages: ["es"],
            devices: ["mobile"],
            os: ["iOS"],
          },
        ],
      });

      const smartMatched = await handleSlugGet(
        new Request("https://links.cristianarando.dev/smart-app?ref=bio", {
          headers: {
            "user-agent":
              "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1",
            "x-vercel-ip-country": "BO",
            "accept-language": "es-BO,es;q=0.9",
          },
        }),
        "smart-app",
        resolutionService,
        settingsService,
      );
      expect(smartMatched.status).toBe(307);
      expect(smartMatched.headers.get("location")).toBe(
        "https://apps.apple.com/es/app/insidelink?ref=bio",
      );

      const smartFallback = await handleSlugGet(
        new Request("https://links.cristianarando.dev/smart-app", {
          headers: {
            "user-agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/135.0",
            "x-vercel-ip-country": "DE",
          },
        }),
        "smart-app",
        resolutionService,
        settingsService,
      );
      expect(smartFallback.status).toBe(307);
      expect(smartFallback.headers.get("location")).toBe(
        "https://example.com/web-fallback",
      );

      const cloaked = await linkService.createLink({
        slug: "cloaked-docs",
        type: "DIRECT",
        destinationUrl: "https://docs.example.com/embed-friendly",
        title: "Cloaked Documentation",
        isCloaked: true,
      });

      const cloakedResolution =
        await resolutionService.resolveSlugRequest("cloaked-docs");
      expect(cloakedResolution.kind).toBe("CLOAKED_VIEW");

      const cloakedHttp = await handleSlugGet(
        new Request("https://links.cristianarando.dev/cloaked-docs", {
          headers: { "user-agent": "Mozilla/5.0 Chrome/135.0" },
        }),
        "cloaked-docs",
        resolutionService,
        settingsService,
      );
      expect(cloakedHttp.status).toBe(200);
      const cloakedHtml = await cloakedHttp.text();
      expect(cloakedHtml).toContain("<iframe");
      expect(cloakedHtml).toContain("https://docs.example.com/embed-friendly");

      // Verify PIN-protected smart-routed cloaked link unlocks cleanly
      await linkService.createLink({
        slug: "pin-smart-cloak",
        type: "DIRECT",
        destinationUrl: "https://docs.example.com/default",
        title: "Protected Smart Cloak",
        pin: "5678",
        isCloaked: true,
        routingRules: [
          {
            id: "mac-rule",
            destinationUrl: "https://docs.example.com/macos",
            os: ["macOS"],
          },
        ],
      });

      const unlockRes = await handlePinUnlockPost(
        new Request(
          "https://links.cristianarando.dev/api/v1/slug/pin-smart-cloak/unlock",
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "user-agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) Chrome/135.0",
            },
            body: JSON.stringify({ pin: "5678" }),
          },
        ),
        "pin-smart-cloak",
        { db, resolution: resolutionService },
      );
      expect(unlockRes.status).toBe(200);
      const unlockPayload = (await unlockRes.json()) as {
        data: { isCloaked: boolean; destinationUrl: string };
      };
      expect(unlockPayload.data.isCloaked).toBe(true);
      expect(unlockPayload.data.destinationUrl).toBe(
        "https://docs.example.com/macos",
      );

      expect(cloaked.id).toBeTruthy();
    } finally {
      client.close();
    }
  });

  it("Link Admin Ops: resetLinkClicks, bulkActionLinks (plus pin/unpin), and export/import backup (dryRun + skip vs update)", async () => {
    const { client, db, linkService, resolutionService, authorizedAdminDeps } =
      await setupEnv();
    try {
      const linkA = await linkService.createLink({
        slug: "alpha-link",
        type: "DIRECT",
        destinationUrl: "https://example.com/alpha",
        title: "Alpha Link",
        pin: "1234",
        category: "project",
        theme: { preset: "midnight-cyan" },
      });
      const linkB = await linkService.createLink({
        slug: "beta-link",
        type: "DIRECT",
        destinationUrl: "https://example.com/beta",
        title: "Beta Link",
        category: "resource",
      });

      // Record clicks on both links
      await resolutionService.recordClickEvent({ linkId: linkA.id });
      await resolutionService.recordClickEvent({ linkId: linkA.id });
      await resolutionService.recordClickEvent({ linkId: linkB.id });

      expect((await linkService.getLinkById(linkA.id))?.clicksCount).toBe(2);

      // Reset clicks on linkA -> zeroes clicksCount and deletes linkA click_events only
      const resetRes = await handleResetLinkClicksPost(
        new Request(
          `https://links.cristianarando.dev/api/v1/links/${linkA.id}/reset-clicks`,
          { method: "POST" },
        ),
        linkA.id,
        authorizedAdminDeps,
      );
      expect(resetRes.status).toBe(200);
      const resetBody = (await resetRes.json()) as {
        data: { clicksCount: number };
      };
      expect(resetBody.data.clicksCount).toBe(0);

      const eventsA = await db
        .select()
        .from(schema.clickEvents)
        .where(eq(schema.clickEvents.linkId, linkA.id));
      const eventsB = await db
        .select()
        .from(schema.clickEvents)
        .where(eq(schema.clickEvents.linkId, linkB.id));
      expect(eventsA).toHaveLength(0);
      expect(eventsB).toHaveLength(1);

      // Pin/unpin via toggleLinkFlags
      const pinned = await linkService.toggleLinkFlags(linkA.id, {
        isPinned: true,
      });
      expect(pinned.isPinned).toBe(true);
      const unpinned = await linkService.toggleLinkFlags(linkA.id, {
        isPinned: false,
      });
      expect(unpinned.isPinned).toBe(false);

      // Bulk actions: pause -> activate -> makePublic -> makePrivate -> setCategory -> delete
      const bulkPause = await handleBulkActionLinksPost(
        new Request("https://links.cristianarando.dev/api/v1/links/bulk", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ids: [linkA.id, linkB.id],
            action: "pause",
          }),
        }),
        authorizedAdminDeps,
      );
      expect(bulkPause.status).toBe(200);
      expect((await linkService.getLinkById(linkA.id))?.isActive).toBe(false);
      expect((await linkService.getLinkById(linkB.id))?.isActive).toBe(false);

      await linkService.bulkActionLinks({
        ids: [linkA.id],
        action: "activate",
      });
      await linkService.bulkActionLinks({
        ids: [linkA.id],
        action: "makePublic",
      });
      await linkService.bulkActionLinks({
        ids: [linkB.id],
        action: "setCategory",
        category: "personal",
      });
      expect((await linkService.getLinkById(linkA.id))?.isActive).toBe(true);
      expect((await linkService.getLinkById(linkA.id))?.isPublic).toBe(true);
      expect((await linkService.getLinkById(linkB.id))?.category).toBe(
        "personal",
      );

      await linkService.bulkActionLinks({
        ids: [linkA.id],
        action: "makePrivate",
      });
      expect((await linkService.getLinkById(linkA.id))?.isPublic).toBe(false);

      // Export backup (verifies passwordHash is omitted)
      const exportRes = await handleExportLinksBackupGet(
        new Request(
          "https://links.cristianarando.dev/api/v1/links/backup?download=1",
        ),
        authorizedAdminDeps,
      );
      expect(exportRes.status).toBe(200);
      expect(exportRes.headers.get("content-disposition")).toContain(
        "insidelink-backup-",
      );
      const exportJson = (await exportRes.json()) as {
        data: Awaited<ReturnType<typeof linkService.exportLinksBackup>>;
      };
      expect(exportJson.data.version).toBe("2.0");
      expect(exportJson.data.count).toBe(2);
      expect(JSON.stringify(exportJson.data)).not.toContain("passwordHash");
      const alphaBackup = exportJson.data.links.find(
        (item) => item.slug === "alpha-link",
      );
      expect(alphaBackup?.hasPin).toBe(true);
      expect(alphaBackup?.theme).toEqual({ preset: "midnight-cyan" });

      // Dry-run import must preview without mutating DB
      const dryRunRes = await handleImportLinksBackupPost(
        new Request("https://links.cristianarando.dev/api/v1/links/backup", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            dryRun: true,
            conflictStrategy: "update",
            links: [
              {
                slug: "alpha-link",
                type: "DIRECT",
                destinationUrl: "https://example.com/alpha-v2",
                title: "Alpha Updated",
              },
              {
                slug: "gamma-new",
                type: "DIRECT",
                destinationUrl: "https://example.com/gamma",
                title: "Gamma New",
              },
            ],
          }),
        }),
        authorizedAdminDeps,
      );
      expect(dryRunRes.status).toBe(200);
      const dryRunPayload = (await dryRunRes.json()) as {
        data: Awaited<ReturnType<typeof linkService.importLinksBackup>>;
      };
      expect(dryRunPayload.data).toMatchObject({
        dryRun: true,
        totalIncoming: 2,
        toCreate: 1,
        toUpdate: 1,
        toSkip: 0,
        created: 0,
        updated: 0,
      });
      expect(await linkService.getLinkBySlug("gamma-new")).toBeNull();
      expect((await linkService.getLinkBySlug("alpha-link"))?.title).toBe(
        "Alpha Link",
      );

      // Apply with conflictStrategy: "skip" -> creates gamma-new, skips alpha-link
      const skipResult = await linkService.importLinksBackup({
        dryRun: false,
        conflictStrategy: "skip",
        links: [
          {
            slug: "alpha-link",
            type: "DIRECT",
            destinationUrl: "https://example.com/alpha-v2",
            title: "Alpha Should Be Skipped",
          },
          {
            slug: "gamma-new",
            type: "DIRECT",
            destinationUrl: "https://example.com/gamma",
            title: "Gamma New",
          },
        ],
      });
      expect(skipResult).toMatchObject({
        dryRun: false,
        created: 1,
        updated: 0,
        skipped: 1,
      });
      expect((await linkService.getLinkBySlug("alpha-link"))?.title).toBe(
        "Alpha Link",
      );
      expect((await linkService.getLinkBySlug("gamma-new"))?.title).toBe(
        "Gamma New",
      );

      // Apply with conflictStrategy: "update" -> updates alpha-link
      const updateResult = await linkService.importLinksBackup({
        dryRun: false,
        conflictStrategy: "update",
        links: [
          {
            slug: "alpha-link",
            type: "DIRECT",
            destinationUrl: "https://example.com/alpha-v2",
            title: "Alpha Updated",
          },
        ],
      });
      expect(updateResult).toMatchObject({
        dryRun: false,
        created: 0,
        updated: 1,
        skipped: 0,
      });
      expect((await linkService.getLinkBySlug("alpha-link"))?.title).toBe(
        "Alpha Updated",
      );

      // Bulk delete cleans up selected links
      const gamma = await linkService.getLinkBySlug("gamma-new");
      const bulkDel = await linkService.bulkActionLinks({
        ids: [linkB.id, gamma!.id],
        action: "delete",
      });
      expect(bulkDel.affectedCount).toBe(2);
      expect(await linkService.getLinkById(linkB.id)).toBeNull();
      expect(await linkService.getLinkBySlug("gamma-new")).toBeNull();
    } finally {
      client.close();
    }
  });

  it("AnalyticsService v2: computes Top Cities, 24h UTC hourlyDistribution, 90d heatmap90d, and zero-PII recentEvents", async () => {
    const { client, linkService, resolutionService, analyticsService } =
      await setupEnv();
    try {
      const now = new Date("2026-11-20T18:30:00.000Z");
      const oldDayInHeatmap = new Date("2026-09-10T04:15:00.000Z");

      const link = await linkService.createLink({
        slug: "analytics-v2",
        type: "DIRECT",
        destinationUrl: "https://example.com/analytics-v2",
        title: "Analytics v2 Target",
      });

      await resolutionService.recordClickEvent({
        linkId: link.id,
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/135.0.0.0",
          "x-vercel-ip-country": "BO",
          "x-vercel-ip-city": "Cochabamba",
          "x-forwarded-for": "198.51.100.10",
          "x-real-ip": "198.51.100.10",
        },
        searchParams: { ref: "github_readme" },
        now: new Date("2026-11-20T09:10:00.000Z"),
      });

      await resolutionService.recordClickEvent({
        linkId: link.id,
        headers: {
          "user-agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1",
          "x-vercel-ip-country": "BO",
          "x-vercel-ip-city": "Cochabamba",
          "x-forwarded-for": "198.51.100.11",
        },
        now: new Date("2026-11-20T09:45:00.000Z"),
      });

      await resolutionService.recordClickEvent({
        linkId: link.id,
        headers: {
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) Chrome/135.0.0.0",
          "cf-ipcountry": "US",
          "cf-ipcity": "San%20Francisco",
          "x-forwarded-for": "198.51.100.12",
        },
        now: new Date("2026-11-20T18:05:00.000Z"),
      });

      // Click outside 7d range but inside 90d heatmap window
      await resolutionService.recordClickEvent({
        linkId: link.id,
        headers: {
          "user-agent": "Mozilla/5.0 (X11; Linux x86_64) Firefox/132.0",
          "x-vercel-ip-country": "ES",
          "x-vercel-ip-city": "Madrid",
          "x-forwarded-for": "198.51.100.13",
        },
        now: oldDayInHeatmap,
      });

      const summary = await analyticsService.getAnalyticsSummary({
        linkId: link.id,
        range: "7d",
        now,
      });

      expect(summary).not.toBeNull();
      expect(summary?.totalClicksInRange).toBe(3);
      expect(summary?.allTimeClicks).toBe(4);

      expect(summary?.cities).toEqual([
        { key: "Cochabamba (BO)", count: 2, percentage: 66.7 },
        { key: "San Francisco (US)", count: 1, percentage: 33.3 },
      ]);

      expect(summary?.hourlyDistribution).toHaveLength(24);
      expect(summary?.hourlyDistribution[0]?.hour).toBe(0);
      expect(summary?.hourlyDistribution[23]?.hour).toBe(23);
      expect(summary?.hourlyDistribution[9]).toEqual({ hour: 9, clicks: 2 });
      expect(summary?.hourlyDistribution[18]).toEqual({ hour: 18, clicks: 1 });
      const totalHourly = summary!.hourlyDistribution.reduce(
        (acc, pt) => acc + pt.clicks,
        0,
      );
      expect(totalHourly).toBe(3);

      expect(summary?.heatmap90d).toHaveLength(90);
      const oldDayPoint = summary!.heatmap90d.find(
        (pt) => pt.date === "2026-09-10",
      );
      const todayPoint = summary!.heatmap90d.find(
        (pt) => pt.date === "2026-11-20",
      );
      expect(oldDayPoint?.clicks).toBe(1);
      expect(todayPoint?.clicks).toBe(3);

      expect(summary?.recentEvents).toHaveLength(4);
      expect(summary?.recentEvents[0]).toMatchObject({
        slug: "analytics-v2",
        country: "US",
        city: "San Francisco",
      });
      const serializedEvents = JSON.stringify(summary!.recentEvents);
      expect(serializedEvents).not.toContain("198.51.100");
      expect(serializedEvents).not.toContain("ipAddress");
    } finally {
      client.close();
    }
  });
});
