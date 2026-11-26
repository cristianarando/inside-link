import type { Metadata } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";
import { env, getCanonicalHost, getCanonicalUrl } from "@/lib/env";
import { resolveThemeTokens, themeTokensToCssVars } from "@/lib/themes";
import type { SiteSettingsDTO } from "@/lib/types/link-dto";
import { buildDefaultSiteSettings, settingsService } from "@/server/services";
import "./globals.css";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

const canonicalUrl = getCanonicalUrl();
const canonicalHost = getCanonicalHost();
const portfolioUrl = env.NEXT_PUBLIC_PORTFOLIO_URL.replace(/\/+$/, "");

const FALLBACK_TITLE = "Cristian Arando — Links & Projects";
const FALLBACK_DESCRIPTION =
  "Curated directory of full-stack software projects, interactive micro-landings, open-source repositories, and verified profiles by Cristian Arando.";

async function getSafeSiteSettings(): Promise<SiteSettingsDTO> {
  try {
    return await settingsService.getSiteSettings();
  } catch {
    return buildDefaultSiteSettings();
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSafeSiteSettings();
  const title =
    settings.displayName && settings.headline
      ? `${settings.displayName} — ${settings.headline}`
      : FALLBACK_TITLE;
  const description = settings.bio?.trim() || FALLBACK_DESCRIPTION;

  return {
    metadataBase: new URL(canonicalUrl),
    title: {
      default: title,
      template: "%s | InsideLink",
    },
    description,
    applicationName: "InsideLink",
    authors: [
      { name: settings.displayName || "Cristian Arando", url: portfolioUrl },
    ],
    creator: settings.displayName || "Cristian Arando",
    keywords: [
      settings.displayName || "Cristian Arando",
      "Software Engineer",
      "Full-Stack",
      "Open Source",
      "Projects",
      "Links",
      "InsideLink",
    ],
    openGraph: {
      type: "website",
      locale: "en_US",
      url: "/",
      siteName: canonicalHost,
      title,
      description,
      images: [
        {
          url: "/api/v1/og/default/image.png",
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/api/v1/og/default/image.png"],
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const settings = await getSafeSiteSettings();
  const tokens = settings.resolvedTheme ?? resolveThemeTokens(settings);
  const cssVars = themeTokensToCssVars(tokens);

  const htmlThemeStyle = {
    ...cssVars,
    "--accent-hex": tokens.accentHex,
    "--accent-rgb": tokens.accentRgb,
    "--surface-bg": tokens.canvasHex,
    "--surface-card": tokens.cardHex,
    "--surface-elevated": tokens.elevatedHex,
    "--glow-alpha": String(tokens.glowAlpha),
  } as React.CSSProperties;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${jetbrainsMono.variable} dark`}
      style={htmlThemeStyle}
      data-card-style={tokens.cardStyle}
    >
      <body className="min-h-screen bg-[var(--il-canvas)] font-sans text-zinc-50 antialiased selection:bg-[rgba(var(--il-accent-rgb),0.25)] selection:text-white">
        {children}
      </body>
    </html>
  );
}
