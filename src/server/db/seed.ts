import fs from "node:fs";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { ulid } from "ulidx";
import { hashPin } from "../crypto/pin";
import * as schema from "./schema";

if (fs.existsSync(".env")) {
  process.loadEnvFile?.(".env");
}

async function runSeed() {
  if (
    process.env.NODE_ENV === "production" &&
    !process.argv.includes("--force")
  ) {
    console.error(
      "ERROR: Refusing to seed database in production without --force flag.",
    );
    process.exit(1);
  }

  const url = process.env.TURSO_DATABASE_URL || "file:local.db";
  const authToken = process.env.TURSO_AUTH_TOKEN || undefined;

  if (
    (url.startsWith("libsql://") || url.startsWith("https://")) &&
    !process.argv.includes("--allow-remote-wipe")
  ) {
    console.error(
      `ERROR: Refusing to wipe/seed remote database (${url}) without --allow-remote-wipe flag.`,
    );
    process.exit(1);
  }

  console.log(`Connecting to database at ${url}...`);
  const client = createClient({ url, authToken });
  await client.execute("PRAGMA foreign_keys = ON;");
  const db = drizzle(client, { schema });

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  console.log("Cleaning existing demo data...");
  await client.execute("DELETE FROM pin_attempts;");
  await client.execute("DELETE FROM click_events;");
  await client.execute("DELETE FROM links;");
  await client.execute("DELETE FROM site_settings;");

  console.log("Seeding default Bento site settings...");
  await db.insert(schema.siteSettings).values({
    id: "default",
    displayName: "Cristian Arando",
    headline: "Full-Stack & Systems Engineer",
    bio: "Curated directory of full-stack projects, interactive micro-landings, open-source repositories, and verified social profiles.",
    avatarUrl: "/brand/author-avatar.png",
    statusText: "Building distributed web platforms & AI tools",
    statusColor: "emerald",
    statusHref: "https://cristianarando.dev",
    themePreset: "obsidian-emerald",
    customAccentHex: null,
    surfaceTone: "obsidian",
    glowIntensity: "subtle",
    cardStyle: "glass",
    directoryLayout: "bento",
    socialLinksJson: JSON.stringify([
      {
        id: "github",
        platform: "github",
        label: "GitHub",
        url: "https://github.com/cristianarando",
        icon: "github",
      },
      {
        id: "linkedin",
        platform: "linkedin",
        label: "LinkedIn",
        url: "https://linkedin.com/in/cristianarando",
        icon: "linkedin",
      },
      {
        id: "x",
        platform: "twitter",
        label: "X / Twitter",
        url: "https://x.com/cristianarando",
        icon: "twitter",
      },
      {
        id: "portfolio",
        platform: "website",
        label: "Portfolio",
        url: "https://cristianarando.dev",
        icon: "globe",
      },
    ]),
    updatedAt: new Date(now),
  });

  console.log("Inserting 19 realistic v2 showcase links...");

  const seedLinks: schema.NewLink[] = [
    {
      id: ulid(),
      slug: "github",
      type: "DIRECT",
      destinationUrl: "https://github.com/cristianarando",
      redirectStatus: 307,
      forwardQueryParams: true,
      title: "GitHub Profile",
      description:
        "Open-source repositories, software architecture, and code contributions.",
      category: "social",
      tagsJson: JSON.stringify(["github", "code", "opensource"]),
      icon: "github",
      isActive: true,
      isPublic: true,
      isPinned: true,
      clicksCount: 42,
      healthStatus: "healthy",
      healthStatusCode: 200,
      healthLatencyMs: 145,
      healthCheckedAt: new Date(now - 3600_000),
      createdAt: new Date(now - 30 * dayMs),
      updatedAt: new Date(now - 10 * dayMs),
    },
    {
      id: ulid(),
      slug: "linkedin",
      type: "DIRECT",
      destinationUrl: "https://linkedin.com/in/cristianarando",
      redirectStatus: 307,
      forwardQueryParams: true,
      title: "LinkedIn Profile",
      description:
        "Professional background, engineering experience, and network.",
      category: "social",
      tagsJson: JSON.stringify(["linkedin", "career", "network"]),
      icon: "linkedin",
      isActive: true,
      isPublic: true,
      isPinned: true,
      clicksCount: 38,
      healthStatus: "healthy",
      healthStatusCode: 200,
      healthLatencyMs: 182,
      healthCheckedAt: new Date(now - 3600_000),
      createdAt: new Date(now - 28 * dayMs),
      updatedAt: new Date(now - 8 * dayMs),
    },
    {
      id: ulid(),
      slug: "proyecto-guia-turistica",
      type: "HUB",
      destinationUrl: null,
      redirectStatus: 307,
      forwardQueryParams: true,
      themeJson: JSON.stringify({
        preset: "midnight-cyan",
        surfaceTone: "midnight",
        glowIntensity: "vibrant",
      }),
      hubLinksJson: JSON.stringify([
        {
          id: "repo",
          kind: "github-repo",
          label: "Smart Travel Guide Repository",
          sublabel:
            "Offline-first Next.js & React Native travel discovery monorepo.",
          url: "https://github.com/cristianarando/guia-turistica",
          icon: "github",
          variant: "primary",
        },
        {
          id: "demo",
          kind: "button",
          label: "Try Live Demo",
          sublabel: "Interactive map explorer with curated local routes",
          url: "https://guia-turistica.cristianarando.dev",
          icon: "external-link",
          variant: "primary",
        },
        {
          id: "walkthrough",
          kind: "youtube",
          label: "Architecture & Offline Sync Walkthrough",
          sublabel: "3-minute engineering overview · Privacy-enhanced player",
          url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          icon: "youtube",
          variant: "secondary",
        },
        {
          id: "demo-creds",
          kind: "callout",
          label: "Sandbox Demo Credentials",
          sublabel:
            "Reviewer Email: demo@cristianarando.dev · Access Passcode: DEMO-2026",
          calloutTone: "tip",
          icon: "sparkles",
          variant: "secondary",
        },
        {
          id: "quickstart",
          kind: "code",
          label: "Run Locally with Docker",
          codeLanguage: "bash",
          codeText:
            "git clone https://github.com/cristianarando/guia-turistica.git\ncd guia-turistica && pnpm install && pnpm dev",
          icon: "code-2",
          variant: "outline",
        },
        {
          id: "docs",
          kind: "button",
          label: "Architecture & Documentation",
          url: "https://github.com/cristianarando/guia-turistica/tree/main/docs",
          icon: "book-open",
          variant: "outline",
        },
      ]),
      title: "Smart Travel Guide App",
      description:
        "Mobile and web platform for travel discovery with offline recommendations.",
      category: "project",
      tagsJson: JSON.stringify(["travel", "react-native", "nextjs", "offline"]),
      icon: "map-pin",
      isActive: true,
      isPublic: true,
      isPinned: true,
      clicksCount: 25,
      createdAt: new Date(now - 25 * dayMs),
      updatedAt: new Date(now - 5 * dayMs),
    },
    {
      id: ulid(),
      slug: "mi-cv",
      type: "DIRECT",
      destinationUrl: "https://cristianarando.dev/cv",
      redirectStatus: 307,
      forwardQueryParams: true,
      routingRulesJson: JSON.stringify([
        {
          id: "rule-es",
          label: "Spanish locale resume",
          destinationUrl: "https://cristianarando.dev/es/cv",
          languages: ["es"],
        },
        {
          id: "rule-mobile",
          label: "Mobile-optimized interactive CV",
          destinationUrl: "https://cristianarando.dev/cv?view=mobile",
          devices: ["mobile"],
        },
      ]),
      title: "Curriculum Vitae (Smart Routed)",
      description:
        "Locale-aware engineering resume routed automatically by language and device.",
      category: "resource",
      tagsJson: JSON.stringify(["cv", "resume", "smart-routing"]),
      icon: "file-text",
      isActive: true,
      isPublic: true,
      isPinned: false,
      clicksCount: 19,
      healthStatus: "healthy",
      healthStatusCode: 200,
      healthLatencyMs: 112,
      healthCheckedAt: new Date(now - 3600_000),
      createdAt: new Date(now - 20 * dayMs),
      updatedAt: new Date(now - 2 * dayMs),
    },
    {
      id: ulid(),
      slug: "inside-link",
      type: "HUB",
      destinationUrl: null,
      redirectStatus: 307,
      forwardQueryParams: true,
      hubLinksJson: JSON.stringify([
        {
          id: "repo",
          kind: "github-repo",
          label: "InsideLink v2 Source Repository",
          sublabel:
            "Next.js 16.4, Turso libSQL, Drizzle ORM, Smart Routing & Theme Studio.",
          url: "https://github.com/cristianarando/inside-link",
          icon: "github",
          variant: "primary",
        },
        {
          id: "docs",
          kind: "button",
          label: "System Architecture Documentation",
          sublabel:
            "Redirect state machine, security model, and data invariants",
          url: "https://cristianarando.dev/docs/inside-link",
          icon: "book-open",
          variant: "secondary",
        },
      ]),
      title: "InsideLink Platform",
      description:
        "Custom URL shortener, project micro-landings, and link hub built with Turso & Next.js.",
      category: "project",
      tagsJson: JSON.stringify(["nextjs", "turso", "drizzle", "system-design"]),
      icon: "link",
      isActive: true,
      isPublic: true,
      isPinned: false,
      clicksCount: 15,
      createdAt: new Date(now - 15 * dayMs),
      updatedAt: new Date(now - 1 * dayMs),
    },
    {
      id: ulid(),
      slug: "v2-launch-keynote",
      type: "HUB",
      destinationUrl: null,
      redirectStatus: 307,
      forwardQueryParams: true,
      startsAt: new Date(now + 3 * dayMs),
      themeJson: JSON.stringify({
        preset: "cosmic-violet",
        surfaceTone: "midnight",
        glowIntensity: "vibrant",
      }),
      hubLinksJson: JSON.stringify([
        {
          id: "slides",
          kind: "button",
          label: "Keynote Slides & Live Demo",
          url: "https://cristianarando.dev/talks/v2-launch",
          icon: "external-link",
          variant: "primary",
        },
      ]),
      title: "Distributed Systems Live Workshop",
      description:
        "Upcoming live engineering session on edge SQLite, zero-latency routing, and observability.",
      category: "project",
      tagsJson: JSON.stringify(["workshop", "edge", "turso"]),
      icon: "globe",
      isActive: true,
      isPublic: true,
      isPinned: false,
      clicksCount: 0,
      createdAt: new Date(now - 2 * dayMs),
      updatedAt: new Date(now - 1 * dayMs),
    },
    {
      id: ulid(),
      slug: "presupuesto-confidencial",
      type: "DIRECT",
      destinationUrl:
        "https://drive.google.com/file/d/demo-presupuesto-hash/view",
      redirectStatus: 307,
      forwardQueryParams: false,
      title: "Project Proposal & Quote (Protected)",
      description:
        "Confidential commercial proposal with detailed breakdown (Demo PIN: 1234).",
      category: "personal",
      tagsJson: JSON.stringify(["commercial", "private"]),
      icon: "lock",
      isActive: true,
      isPublic: false,
      isPinned: false,
      passwordHash: hashPin("1234"),
      clicksCount: 4,
      createdAt: new Date(now - 7 * dayMs),
      updatedAt: new Date(now - 1 * dayMs),
    },
    {
      id: ulid(),
      slug: "enlace-expirado",
      type: "DIRECT",
      destinationUrl: "https://meet.google.com/xyz-demo",
      redirectStatus: 307,
      forwardQueryParams: false,
      title: "Sync Meeting Link (Expired)",
      description: "Temporary link for an engineering coordination call.",
      category: "temporary",
      tagsJson: JSON.stringify(["meet", "temporary"]),
      icon: "clock",
      isActive: true,
      isPublic: false,
      isPinned: false,
      expiresAt: new Date(now - 2 * dayMs),
      clicksCount: 3,
      createdAt: new Date(now - 5 * dayMs),
      updatedAt: new Date(now - 2 * dayMs),
    },
    {
      id: ulid(),
      slug: "tiendanext",
      type: "HUB",
      destinationUrl: null,
      redirectStatus: 307,
      forwardQueryParams: true,
      hubLinksJson: JSON.stringify([
        {
          id: "repo",
          kind: "github-repo",
          label: "Source Code on GitHub",
          url: "https://github.com/cristianarando/tiendanext",
          icon: "github",
          variant: "primary",
        },
      ]),
      title: "TiendaNext E-Commerce",
      description:
        "Conversational commerce platform powered by WhatsApp and NestJS.",
      category: "project",
      tagsJson: JSON.stringify(["ecommerce", "whatsapp", "nestjs"]),
      icon: "shopping-bag",
      isActive: true,
      isPublic: true,
      isPinned: false,
      clicksCount: 12,
      createdAt: new Date(now - 14 * dayMs),
      updatedAt: new Date(now - 4 * dayMs),
    },
    {
      id: ulid(),
      slug: "whatsapp",
      type: "DIRECT",
      destinationUrl: "https://wa.me/59170000000",
      redirectStatus: 307,
      forwardQueryParams: false,
      title: "Direct WhatsApp Chat",
      description:
        "Direct messaging channel for quick inquiries and collaboration.",
      category: "social",
      tagsJson: JSON.stringify(["whatsapp", "contact"]),
      icon: "message-circle",
      isActive: true,
      isPublic: true,
      isPinned: false,
      clicksCount: 11,
      createdAt: new Date(now - 12 * dayMs),
      updatedAt: new Date(now - 2 * dayMs),
    },
    {
      id: ulid(),
      slug: "reunion-meet",
      type: "DIRECT",
      destinationUrl: "https://meet.google.com/abc-demo",
      redirectStatus: 307,
      forwardQueryParams: false,
      title: "Video Call Room (Max 5 Clicks)",
      description: "Temporary meeting link with a maximum click cap.",
      category: "temporary",
      tagsJson: JSON.stringify(["meet", "temporary"]),
      icon: "video",
      isActive: true,
      isPublic: false,
      isPinned: false,
      maxClicks: 5,
      clicksCount: 2,
      createdAt: new Date(now - 3 * dayMs),
      updatedAt: new Date(now - 1 * dayMs),
    },
    {
      id: ulid(),
      slug: "sistema-solar-3d",
      type: "DIRECT",
      destinationUrl: "https://solarsystem.cristianarando.dev",
      redirectStatus: 307,
      forwardQueryParams: true,
      isCloaked: true,
      title: "3D Solar System in Three.js",
      description:
        "Interactive 3D solar system simulator built with WebGL and Three.js.",
      category: "project",
      tagsJson: JSON.stringify(["threejs", "webgl", "canvas"]),
      icon: "globe",
      isActive: true,
      isPublic: true,
      isPinned: false,
      clicksCount: 8,
      createdAt: new Date(now - 18 * dayMs),
      updatedAt: new Date(now - 5 * dayMs),
    },
    {
      id: ulid(),
      slug: "bolivia-tech",
      type: "DIRECT",
      destinationUrl: "https://github.com/bolivia-tech/comunidad",
      redirectStatus: 307,
      forwardQueryParams: true,
      title: "Bolivia Tech Community",
      description:
        "Open directory of tech communities, events, and developer resources.",
      category: "resource",
      tagsJson: JSON.stringify(["community", "bolivia", "tech"]),
      icon: "users",
      isActive: true,
      isPublic: true,
      isPinned: false,
      clicksCount: 9,
      createdAt: new Date(now - 16 * dayMs),
      updatedAt: new Date(now - 3 * dayMs),
    },
    {
      id: ulid(),
      slug: "podcast-ia",
      type: "DIRECT",
      destinationUrl: "https://open.spotify.com/show/2MAi0BvDc6GTFvKFPXnkCL",
      redirectStatus: 307,
      forwardQueryParams: true,
      title: "AI Engineering Podcast Episodes",
      description:
        "Deep-dive discussions on autonomous agents, LLMs, and distributed systems.",
      category: "resource",
      tagsJson: JSON.stringify(["podcast", "ai", "audio"]),
      icon: "headphones",
      isActive: true,
      isPublic: true,
      isPinned: false,
      clicksCount: 6,
      createdAt: new Date(now - 11 * dayMs),
      updatedAt: new Date(now - 1 * dayMs),
    },
    {
      id: ulid(),
      slug: "notas-personales",
      type: "DIRECT",
      destinationUrl: "https://notion.so/cristianarando/demo-notes",
      redirectStatus: 307,
      forwardQueryParams: false,
      title: "Private Engineering Notes",
      description: "Personal engineering logbook and architecture drafts.",
      category: "personal",
      tagsJson: JSON.stringify(["notion", "notes"]),
      icon: "book",
      isActive: true,
      isPublic: false,
      isPinned: false,
      clicksCount: 2,
      createdAt: new Date(now - 9 * dayMs),
      updatedAt: new Date(now - 1 * dayMs),
    },
    {
      id: ulid(),
      slug: "design-system",
      type: "DIRECT",
      destinationUrl: "https://www.figma.com/@cristianarando",
      redirectStatus: 307,
      forwardQueryParams: true,
      title: "Figma Design Tokens & UI Kit",
      description:
        "Reusable UI components and visual design system guidelines.",
      category: "resource",
      tagsJson: JSON.stringify(["figma", "ui", "design"]),
      icon: "palette",
      isActive: true,
      isPublic: true,
      isPinned: false,
      clicksCount: 7,
      createdAt: new Date(now - 8 * dayMs),
      updatedAt: new Date(now - 2 * dayMs),
    },
    {
      id: ulid(),
      slug: "twitter",
      type: "DIRECT",
      destinationUrl: "https://x.com/cristianarando",
      redirectStatus: 307,
      forwardQueryParams: true,
      title: "X / Twitter",
      description:
        "Short thoughts on software engineering, web performance, and AI.",
      category: "social",
      tagsJson: JSON.stringify(["twitter", "x"]),
      icon: "twitter",
      isActive: true,
      isPublic: true,
      isPinned: false,
      clicksCount: 14,
      createdAt: new Date(now - 22 * dayMs),
      updatedAt: new Date(now - 6 * dayMs),
    },
    {
      id: ulid(),
      slug: "youtube",
      type: "DIRECT",
      destinationUrl: "https://youtube.com/@cristianarando",
      redirectStatus: 307,
      forwardQueryParams: true,
      title: "YouTube Channel",
      description:
        "Programming tutorials, system design walkthroughs, and live coding.",
      category: "social",
      tagsJson: JSON.stringify(["youtube", "video", "tutorials"]),
      icon: "youtube",
      isActive: true,
      isPublic: true,
      isPinned: false,
      clicksCount: 18,
      createdAt: new Date(now - 24 * dayMs),
      updatedAt: new Date(now - 4 * dayMs),
    },
    {
      id: ulid(),
      slug: "enlace-pausado",
      type: "DIRECT",
      destinationUrl: "https://example.com/demo",
      redirectStatus: 307,
      forwardQueryParams: false,
      title: "Temporarily Paused Link",
      description: "Link currently under maintenance.",
      category: "temporary",
      tagsJson: JSON.stringify(["demo"]),
      icon: "pause-circle",
      isActive: false,
      isPublic: false,
      isPinned: false,
      clicksCount: 1,
      createdAt: new Date(now - 6 * dayMs),
      updatedAt: new Date(now - 1 * dayMs),
    },
  ];

  await db.insert(schema.links).values(seedLinks);
  console.log(`Inserted ${seedLinks.length} links successfully.`);

  console.log(
    "Generating 140 click events distributed across the last 30 days...",
  );
  const locations = [
    { country: "BO", city: "La Paz" },
    { country: "BO", city: "Santa Cruz" },
    { country: "BO", city: "Cochabamba" },
    { country: "ES", city: "Madrid" },
    { country: "ES", city: "Barcelona" },
    { country: "US", city: "San Francisco" },
    { country: "AR", city: "Buenos Aires" },
    { country: "MX", city: "Mexico City" },
    { country: "PE", city: "Lima" },
    { country: "CL", city: "Santiago" },
  ] as const;
  const devices = ["desktop", "mobile", "mobile", "tablet"] as const;
  const osList = ["Windows", "macOS", "Android", "iOS", "Linux"] as const;
  const browsers = ["Chrome", "Safari", "Firefox", "Edge"] as const;
  const referrers = [
    "linkedin.com",
    "github.com",
    "t.co",
    "Direct",
    "Direct",
    "wa.me",
  ];

  const seedEvents: schema.NewClickEvent[] = [];
  const activeVisitedLinks = seedLinks.filter((l) => (l.clicksCount ?? 0) > 0);

  for (let i = 0; i < 140; i++) {
    const link = activeVisitedLinks[i % activeVisitedLinks.length]!;
    const offsetMs = Math.floor(Math.random() * 30 * dayMs);
    const eventTime = new Date(now - offsetMs);
    const loc =
      locations[Math.floor(Math.random() * locations.length)] ?? locations[0];

    seedEvents.push({
      id: ulid(),
      linkId: link.id,
      country: loc.country,
      city: loc.city,
      device: devices[Math.floor(Math.random() * devices.length)] || "desktop",
      os: osList[Math.floor(Math.random() * osList.length)] || "Windows",
      browser:
        browsers[Math.floor(Math.random() * browsers.length)] || "Chrome",
      referrer:
        referrers[Math.floor(Math.random() * referrers.length)] || "Direct",
      queryParamRef: i % 4 === 0 ? "cv_profile" : null,
      clickedAt: eventTime,
    });
  }

  for (let i = 0; i < seedEvents.length; i += 50) {
    const chunk = seedEvents.slice(i, i + 50);
    await db.insert(schema.clickEvents).values(chunk);
  }

  console.log(`Inserted ${seedEvents.length} click events successfully.`);
  console.log("Database seed completed cleanly.");
}

runSeed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed error:", err);
    process.exit(1);
  });
