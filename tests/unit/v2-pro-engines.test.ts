import { describe, expect, it } from "vitest";
import {
  parseGitHubRepoUrl,
  parseSpotifyEmbed,
  parseYouTubeEmbed,
} from "@/lib/embed-parsers";
import {
  evaluateSmartRouting,
  extractPreferredLanguageCandidates,
  extractSmartRoutingContext,
  type RoutingRule,
} from "@/lib/smart-routing";
import {
  resolveThemeTokens,
  THEME_PRESET_IDS,
  THEME_PRESETS,
  themeTokensToCssVars,
  themeTokensToInlineStyle,
} from "@/lib/themes";
import {
  checkUrlFrameCompatibility,
  checkUrlHealth,
  MetadataServiceError,
  type LookupAddressFn,
} from "@/server/services/metadata.service";

const publicLookup: LookupAddressFn = async () => [
  { address: "93.184.216.34", family: 4 },
];

const privateLookup: LookupAddressFn = async () => [
  { address: "192.168.1.50", family: 4 },
];

describe("Theme Engine — resolveThemeTokens", () => {
  it("resolves all 6 curated dark presets with expected accent tokens", () => {
    expect(THEME_PRESET_IDS).toHaveLength(6);

    for (const presetId of THEME_PRESET_IDS) {
      const preset = THEME_PRESETS[presetId];
      const tokens = resolveThemeTokens({
        themePreset: presetId,
        surfaceTone: "obsidian",
        glowIntensity: "subtle",
        cardStyle: "glass",
      });

      expect(tokens.accentHex).toBe(preset.accentHex);
      expect(tokens.accentTextHex).toBe(preset.accentTextHex);
      expect(tokens.canvasHex).toBe("#09090b");
      expect(tokens.glowAlpha).toBe(0.14);
      expect(tokens.cardStyle).toBe("glass");

      const vars = themeTokensToCssVars(tokens);
      expect(vars["--il-accent"]).toBe(preset.accentHex);
      expect(themeTokensToInlineStyle(tokens)).toContain(
        `--il-accent:${preset.accentHex}`,
      );
    }
  });

  it("applies valid custom HEX overrides and safely falls back on invalid HEX values", () => {
    const validCustom = resolveThemeTokens({
      themePreset: "custom",
      customAccentHex: "  #38BDF8  ",
      surfaceTone: "graphite",
      glowIntensity: "vibrant",
      cardStyle: "bordered",
    });

    expect(validCustom.accentHex).toBe("#38bdf8");
    expect(validCustom.accentRgb).toBe("56, 189, 248");
    expect(validCustom.canvasHex).toBe("#0d0d12");
    expect(validCustom.glowAlpha).toBe(0.26);
    expect(validCustom.cardStyle).toBe("bordered");

    const invalidCustom = resolveThemeTokens({
      themePreset: "custom",
      customAccentHex: "not-a-hex",
      surfaceTone: "unknown-tone",
      glowIntensity: "extreme",
      cardStyle: "neon",
    });

    expect(invalidCustom.accentHex).toBe(
      THEME_PRESETS["obsidian-emerald"].accentHex,
    );
    expect(invalidCustom.canvasHex).toBe("#09090b");
    expect(invalidCustom.glowAlpha).toBe(0.14);
    expect(invalidCustom.cardStyle).toBe("glass");
  });

  it("applies per-HUB theme overrides over global theme settings", () => {
    const globalSettings = {
      themePreset: "obsidian-emerald",
      surfaceTone: "obsidian",
      glowIntensity: "subtle",
      cardStyle: "minimal",
    };

    const overriddenPreset = resolveThemeTokens(globalSettings, {
      preset: "cosmic-violet",
      surfaceTone: "midnight",
      glowIntensity: "none",
    });

    expect(overriddenPreset.accentHex).toBe(
      THEME_PRESETS["cosmic-violet"].accentHex,
    );
    expect(overriddenPreset.canvasHex).toBe("#070a12");
    expect(overriddenPreset.glowAlpha).toBe(0);
    expect(overriddenPreset.cardStyle).toBe("minimal");

    const overriddenCustom = resolveThemeTokens(globalSettings, {
      preset: "custom",
      accentHex: "#FF5500",
    });
    expect(overriddenCustom.accentHex).toBe("#ff5500");
    expect(overriddenCustom.canvasHex).toBe("#09090b");

    const invalidOverride = resolveThemeTokens(globalSettings, {
      preset: "custom",
      accentHex: "#bad",
    });
    expect(invalidOverride.accentHex).toBe(
      THEME_PRESETS["obsidian-emerald"].accentHex,
    );
  });
});

describe("Smart Conditional Routing Engine — evaluateSmartRouting", () => {
  const rules: RoutingRule[] = [
    {
      id: "rule-ios-latam",
      label: "iOS Spanish LATAM",
      destinationUrl: "https://apps.apple.com/bo/app/demo",
      countries: ["BO", "AR"],
      languages: ["es"],
      devices: ["mobile"],
      os: ["iOS"],
    },
    {
      id: "rule-android",
      label: "Android Global",
      destinationUrl: "https://play.google.com/store/apps/details?id=dev.demo",
      devices: ["mobile"],
      os: ["Android"],
    },
    {
      id: "rule-us-desktop",
      label: "US Desktop",
      destinationUrl: "https://example.com/us-desktop",
      countries: ["US"],
      devices: ["desktop"],
    },
  ];

  it("evaluates rules in priority order using case-insensitive matching", () => {
    const prioritizedRules: RoutingRule[] = [
      {
        id: "specific",
        destinationUrl: "https://example.com/specific",
        countries: ["BO"],
        languages: ["es"],
      },
      {
        id: "broad",
        destinationUrl: "https://example.com/broad",
        countries: ["BO"],
      },
    ];

    expect(
      evaluateSmartRouting(prioritizedRules, {
        country: "bo",
        acceptLanguage: "es-BO,es;q=0.9,en;q=0.8",
      }),
    ).toBe("https://example.com/specific");

    expect(
      evaluateSmartRouting(prioritizedRules, {
        country: "bo",
        acceptLanguage: "en-US,en;q=0.9",
      }),
    ).toBe("https://example.com/broad");
  });

  it("matches country, Accept-Language q-weights, device, and OS case-insensitively", () => {
    expect(
      evaluateSmartRouting(rules, {
        country: "bo",
        acceptLanguage: "fr;q=0.5, es-419;q=0.9",
        device: "MOBILE",
        os: "ios",
      }),
    ).toBe("https://apps.apple.com/bo/app/demo");

    const ctxFromHeaders = extractSmartRoutingContext({
      "x-vercel-ip-country": "us",
      "accept-language": "en-US,en;q=0.9",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/135.0",
    });

    expect(evaluateSmartRouting(rules, ctxFromHeaders)).toBe(
      "https://example.com/us-desktop",
    );
    expect(
      extractPreferredLanguageCandidates("en-GB;q=0.7, es-BO;q=0.95"),
    ).toEqual(["es-bo", "es"]);
  });

  it("returns null when no rule matches or when context/rules are empty", () => {
    expect(evaluateSmartRouting([], { country: "US" })).toBeNull();
    expect(evaluateSmartRouting(null, { country: "US" })).toBeNull();
    expect(
      evaluateSmartRouting(rules, {
        country: "XX",
        acceptLanguage: "de-DE",
        device: "desktop",
        os: "Linux",
      }),
    ).toBeNull();
  });
});

describe("Rich HUB Embed Parsers", () => {
  it("parses valid YouTube URLs into privacy-enhanced nocookie embeds and rejects invalid URLs", () => {
    expect(
      parseYouTubeEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=12s"),
    ).toEqual({
      videoId: "dQw4w9WgXcQ",
      embedUrl:
        "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0",
      thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    });

    expect(parseYouTubeEmbed("https://youtu.be/dQw4w9WgXcQ")).toMatchObject({
      videoId: "dQw4w9WgXcQ",
    });
    expect(
      parseYouTubeEmbed("https://youtube.com/shorts/abcDEF12345"),
    ).toMatchObject({
      videoId: "abcDEF12345",
    });

    expect(parseYouTubeEmbed("https://vimeo.com/123456789")).toBeNull();
    expect(parseYouTubeEmbed("https://youtube.com/watch?v=short")).toBeNull();
    expect(parseYouTubeEmbed("javascript:alert(1)")).toBeNull();
  });

  it("parses valid Spotify URLs (including intl prefixes) and rejects non-Spotify URLs", () => {
    expect(
      parseSpotifyEmbed(
        "https://open.spotify.com/intl-es/track/4cOdK2wGLETKBW3PvgPWqT?si=abc",
      ),
    ).toEqual({
      entityType: "track",
      entityId: "4cOdK2wGLETKBW3PvgPWqT",
      embedUrl:
        "https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT?utm_source=generator&theme=0",
    });

    expect(
      parseSpotifyEmbed(
        "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
      ),
    ).toMatchObject({
      entityType: "playlist",
      entityId: "37i9dQZF1DXcBWIGoYBM5M",
    });

    expect(parseSpotifyEmbed("https://open.spotify.com/user/demo")).toBeNull();
    expect(parseSpotifyEmbed("https://music.apple.com/track/123")).toBeNull();
  });

  it("parses valid GitHub repository URLs and rejects reserved roots or invalid URLs", () => {
    expect(
      parseGitHubRepoUrl("https://github.com/cristianarando/inside-link.git"),
    ).toEqual({
      owner: "cristianarando",
      repo: "inside-link",
      fullName: "cristianarando/inside-link",
    });

    expect(
      parseGitHubRepoUrl("https://www.github.com/vercel/next.js/issues"),
    ).toEqual({
      owner: "vercel",
      repo: "next.js",
      fullName: "vercel/next.js",
    });

    expect(
      parseGitHubRepoUrl("https://github.com/settings/profile"),
    ).toBeNull();
    expect(parseGitHubRepoUrl("https://github.com/onlyowner")).toBeNull();
    expect(parseGitHubRepoUrl("https://gitlab.com/org/repo")).toBeNull();
  });
});

describe("SSRF-Safe Frame Compatibility & Health Scanners", () => {
  it("blocks loopback, private IPs, and DNS rebinding in checkUrlFrameCompatibility and checkUrlHealth", async () => {
    const blockedTargets = [
      "http://127.0.0.1:3000/secret",
      "http://localhost/admin",
      "http://10.0.0.8/internal",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/",
    ];

    for (const url of blockedTargets) {
      await expect(
        checkUrlFrameCompatibility(url, { lookup: publicLookup }),
      ).rejects.toBeInstanceOf(MetadataServiceError);

      await expect(
        checkUrlHealth(url, { lookup: publicLookup }),
      ).rejects.toMatchObject({ code: "SSRF_BLOCKED" });
    }

    await expect(
      checkUrlFrameCompatibility("https://internal.example.com", {
        lookup: privateLookup,
      }),
    ).rejects.toMatchObject({ code: "SSRF_BLOCKED" });

    await expect(
      checkUrlHealth("https://internal.example.com", {
        lookup: privateLookup,
      }),
    ).rejects.toMatchObject({ code: "SSRF_BLOCKED" });
  });

  it("evaluates X-Frame-Options, CSP frame-ancestors, and HEAD->GET fallback cleanly", async () => {
    const denyResult = await checkUrlFrameCompatibility(
      "https://example.com/deny",
      {
        lookup: publicLookup,
        fetchFn: async () =>
          new Response(null, {
            status: 200,
            headers: { "x-frame-options": "DENY" },
          }),
      },
    );
    expect(denyResult.embeddable).toBe(false);
    expect(denyResult.xFrameOptions).toBe("DENY");
    expect(denyResult.reason).toContain("DENY");

    const cspResult = await checkUrlFrameCompatibility(
      "https://example.com/csp",
      {
        lookup: publicLookup,
        fetchFn: async () =>
          new Response(null, {
            status: 200,
            headers: {
              "content-security-policy":
                "default-src 'self'; frame-ancestors 'self'",
            },
          }),
      },
    );
    expect(cspResult.embeddable).toBe(false);
    expect(cspResult.frameAncestors).toBe("'self'");

    const methods: string[] = [];
    const fallbackAllowed = await checkUrlFrameCompatibility(
      "https://example.com/ok",
      {
        lookup: publicLookup,
        fetchFn: async (_input, init) => {
          const method = init?.method ?? "GET";
          methods.push(method);
          if (method === "HEAD") {
            return new Response(null, { status: 405 });
          }
          return new Response("<html></html>", {
            status: 200,
            headers: {
              "content-security-policy": "frame-ancestors https: *",
            },
          });
        },
      },
    );
    expect(methods).toEqual(["HEAD", "GET"]);
    expect(fallbackAllowed.embeddable).toBe(true);
    expect(fallbackAllowed.reason).toBeNull();
  });

  it("classifies URL health responses into healthy, redirect, broken, and timeout", async () => {
    const healthy = await checkUrlHealth("https://example.com/up", {
      lookup: publicLookup,
      fetchFn: async () => new Response("ok", { status: 200 }),
    });
    expect(healthy.status).toBe("healthy");
    expect(healthy.statusCode).toBe(200);

    const redirect = await checkUrlHealth("https://example.com/moved", {
      lookup: publicLookup,
      fetchFn: async () =>
        new Response(null, {
          status: 301,
          headers: { location: "https://example.com/target" },
        }),
    });
    expect(redirect.status).toBe("redirect");
    expect(redirect.statusCode).toBe(301);

    const broken = await checkUrlHealth("https://example.com/missing", {
      lookup: publicLookup,
      fetchFn: async () => new Response("not found", { status: 404 }),
    });
    expect(broken.status).toBe("broken");
    expect(broken.statusCode).toBe(404);

    const timeout = await checkUrlHealth("https://example.com/slow", {
      lookup: publicLookup,
      fetchFn: async () => {
        const err = new Error("Timed out");
        err.name = "TimeoutError";
        throw err;
      },
    });
    expect(timeout.status).toBe("timeout");
    expect(timeout.statusCode).toBeNull();
  });
});
