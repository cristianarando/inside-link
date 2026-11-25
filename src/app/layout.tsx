import type { Metadata } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";
import { env, getCanonicalHost, getCanonicalUrl } from "@/lib/env";
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

const SITE_TITLE = "Cristian Arando — Links & Projects";
const SITE_DESCRIPTION =
  "Curated directory of full-stack software projects, interactive micro-landings, open-source repositories, and verified profiles by Cristian Arando.";

export const metadata: Metadata = {
  metadataBase: new URL(canonicalUrl),
  title: {
    default: SITE_TITLE,
    template: "%s | InsideLink",
  },
  description: SITE_DESCRIPTION,
  applicationName: "InsideLink",
  authors: [{ name: "Cristian Arando", url: portfolioUrl }],
  creator: "Cristian Arando",
  keywords: [
    "Cristian Arando",
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
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/api/v1/og/default/image.png",
        width: 1200,
        height: 630,
        alt: SITE_TITLE,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/api/v1/og/default/image.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${jetbrainsMono.variable} dark`}
    >
      <body className="min-h-screen bg-[#09090b] font-sans text-zinc-50 antialiased selection:bg-emerald-500/25 selection:text-emerald-200">
        {children}
      </body>
    </html>
  );
}
